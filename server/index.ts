// Force restart trigger
import "dotenv/config";
import https from "https";
import type { RequestListener } from "node:http";
import fs from "fs";

import { createApp } from "./app.js";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";
import { errorHandler } from "./middleware.js";
import { config } from "./config.js";
import { startCronJobs } from "./cron.js";
import { setupSocketIO } from "./socket.js";
import { createHttpsRedirect } from "./https-redirect.js";
import { ensureDatabase } from "./migrate.js";
import { rssService } from "./rss.js";
import { nexusmodsClient } from "./nexusmods.js";
import { appriseClient, readAppriseSettings } from "./apprise.js";
import { storage } from "./storage.js";
import { getCredentialsEncryptionKey } from "./credential-crypto.js";
import { platformMappingService } from "./services/index.js";
import { reportServerError } from "./error-telemetry.js";
import { logger } from "./logger.js";
import {
  DOWNLOADER_DEBUG_LOGGING_CONFIG_KEY,
  setCachedDownloaderDebugLogging,
} from "./downloaders/debug-logging.js";

const app = createApp();

// Best-effort error telemetry for crashes that never reach Express (startup code,
// timers, unawaited promises, etc). Both handlers keep Node's default fatal
// behavior for these events — a bounded window to report the error, then
// process.exit(1) — rather than letting the process linger in a decayed state.
function handleFatalError(source: "uncaughtException" | "unhandledRejection", err: unknown): void {
  const message =
    source === "uncaughtException"
      ? "Uncaught exception — process will exit"
      : "Unhandled promise rejection — process will exit";
  logger.fatal({ err }, message);
  Promise.race([
    reportServerError(err, { source }),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
    .catch(() => {
      // reportServerError already swallows its own errors; this is defensive only.
    })
    .finally(() => {
      process.exit(1);
    });
}

process.on("uncaughtException", (err) => handleFatalError("uncaughtException", err));
process.on("unhandledRejection", (reason) => handleFatalError("unhandledRejection", reason));

void (async () => {
  try {
    // Ensure database is ready before starting server
    await ensureDatabase();
    // Migrate any legacy database-stored credential key before accepting requests.
    // This also fails startup when a shared PostgreSQL deployment lacks its common key.
    await getCredentialsEncryptionKey();
    const recoveredSeerrOperations = await storage.recoverSeerrOperations();
    if (recoveredSeerrOperations > 0) {
      log(
        `Recovered ${recoveredSeerrOperations} interrupted SeerrNG request operation(s); requests without tracked downloads require a queue check before retry.`
      );
    }

    // Seed default platform mappings (must run after migrations create the table)
    try {
      await platformMappingService.initializeDefaults();
    } catch (err) {
      log("Failed to initialize platform mappings: " + String(err));
    }

    // Initialize RSS service (seeding default feeds)
    await rssService.initialize();

    // Load the downloader debug-logging setting from the DB into memory
    try {
      const debugLoggingSetting = await storage.getSystemConfig(
        DOWNLOADER_DEBUG_LOGGING_CONFIG_KEY
      );
      setCachedDownloaderDebugLogging(debugLoggingSetting === "true");
    } catch (err) {
      log(
        "Failed to load downloader debug logging setting; defaulting to disabled: " + String(err)
      );
    }

    // Initialize NexusMods client from DB (env var already applied at module load)
    const dbNexusKey = await storage.getSystemConfig("nexusmods.apiKey");
    if (dbNexusKey && dbNexusKey.length > 0) {
      nexusmodsClient.configure(dbNexusKey);
      log("NexusMods API key loaded from database");
    }

    // Initialize Apprise client from DB config
    const appriseSettings = await readAppriseSettings(storage);
    appriseClient.configure(appriseSettings);
    if (appriseClient.isConfigured()) {
      log(`Apprise client configured from database (${appriseSettings.mode} mode)`);
    }

    // Installed before every route so it can run at all; it stays a no-op until
    // the HTTPS server below is up and ssl.redirectHttp is set.
    let httpsRedirectPort: number | null = null;
    app.use(createHttpsRedirect(() => httpsRedirectPort));

    const server = await registerRoutes(app);
    // Grab the Express handler before Socket.IO wraps the server's request
    // listeners. With QUESTARR_BASE_PATH set it is a root app that mounts `app`
    // under the base path, and the HTTPS server below has to serve that tree.
    const [rootRequestHandler] = server.listeners("request") as RequestListener[];

    setupSocketIO(server);

    // Error handler must handle various error shapes
    // 🛡️ Sentinel: Use standardized error handler to prevent info leaks
    app.use(errorHandler);

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    const { port, host } = config.server;
    const { ssl } = config;

    // When HTTP-to-HTTPS redirect is requested, validate and bind HTTPS before
    // exposing the HTTP listener. A broken certificate or port conflict must
    // not leave the app unexpectedly available over plaintext.
    if (ssl.enabled && ssl.redirectHttp) {
      if (!ssl.certPath || !ssl.keyPath) {
        throw new Error("HTTPS redirect is enabled but certificate/key paths are missing");
      }
      const { createHttpsServerOptions, validateCertFiles } = await import("./ssl.js");
      const { valid, error } = await validateCertFiles(ssl.certPath, ssl.keyPath);
      if (!valid) {
        throw new Error(`HTTPS redirect is enabled but TLS configuration is invalid: ${error}`);
      }

      const httpsOptions = createHttpsServerOptions(
        await fs.promises.readFile(ssl.keyPath),
        await fs.promises.readFile(ssl.certPath)
      );
      const httpsServer = https.createServer(httpsOptions, rootRequestHandler ?? app);
      setupSocketIO(httpsServer);
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        httpsServer.once("error", onError);
        httpsServer.listen(ssl.port, host, () => {
          httpsServer.off("error", onError);
          resolve();
        });
      });
      httpsServer.on("error", (error) => {
        log("HTTPS server error: " + String(error));
      });
      httpsRedirectPort = ssl.port;
      log(`HTTPS server serving on ${host}:${ssl.port}`);
    } else if (ssl.enabled && ssl.certPath && ssl.keyPath) {
      try {
        const { createHttpsServerOptions, validateCertFiles } = await import("./ssl.js");
        const { valid, error } = await validateCertFiles(ssl.certPath, ssl.keyPath);
        if (!valid) {
          log(`SSL Configuration Invalid: ${error}. HTTPS was not started.`);
        } else {
          const httpsOptions = createHttpsServerOptions(
            await fs.promises.readFile(ssl.keyPath),
            await fs.promises.readFile(ssl.certPath)
          );
          const httpsServer = https.createServer(httpsOptions, rootRequestHandler ?? app);
          setupSocketIO(httpsServer);
          httpsServer.on("error", (error) => {
            log("Failed to start HTTPS server: " + String(error));
          });
          httpsServer.listen(ssl.port, host, () => {
            log(`HTTPS server serving on ${host}:${ssl.port}`);
          });
        }
      } catch (error) {
        log("Failed to start HTTPS server: " + String(error));
      }
    }

    server.listen(port, host, () => {
      log(`HTTP server serving on ${host}:${port}`);
    });

    // Log non-sensitive config
    log("Server initialized with configuration:");
    // Log only the operational fields needed to diagnose listener setup. A
    // shallow copy of config can leak newly-added secrets (OIDC, database,
    // credential-encryption keys) whenever the config schema grows.
    const safeConfig = {
      server: {
        host: config.server.host,
        port: config.server.port,
        basePath: config.server.basePath,
      },
      ssl: {
        enabled: config.ssl.enabled,
        port: config.ssl.port,
        redirectHttp: config.ssl.redirectHttp,
      },
      database: { dialect: config.database.dialect },
      integrations: {
        oidcEnabled: Boolean(config.auth.oidc.clientSecret),
        igdbEnabled: Boolean(config.igdb.clientSecret),
      },
    };
    log(JSON.stringify(safeConfig, null, 2));

    if (ssl.enabled && ssl.redirectHttp) {
      log("⚠️ WARNING: HTTP to HTTPS redirection is ENABLED.");
      log(
        "⚠️ If you lose access, you can disable SSL by setting 'enabled: false' in your config.yaml or data/config.yaml file."
      );
    }

    startCronJobs();
  } catch (error) {
    logger.fatal({ error }, "Fatal error during startup");
    await new Promise<void>((resolve) => logger.flush(() => resolve()));
    process.exit(1);
  }
})();
