import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";
import rateLimit from "express-rate-limit";
import { expressLogger } from "./logger.js";
import { rateLimitsDisabled, staticAssetLimiter } from "./middleware.js";
import { config } from "./config.js";

const isDev = process.env.NODE_ENV === "development";

export function log(message: string, source = "express") {
  expressLogger.info({ source }, message);
}

export async function setupVite(app: Express, server: Server) {
  if (isDev) {
    const { createServer: createViteServer, createLogger } = await import("vite");
    const viteConfig = await import("../vite.config.js");
    const viteLogger = createLogger();

    const serverOptions = {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true as const,
    };

    const vite = await createViteServer({
      ...viteConfig.default,
      configFile: false,
      customLogger: {
        ...viteLogger,
        error: (msg, options) => {
          viteLogger.error(msg, options);
          // Vite also routes browser console.error/warn calls and uncaught
          // client-side exceptions through this same logger (see Vite's
          // built-in forwardConsolePlugin) -- those are problems in the
          // browser tab, not the dev server, and must not take the whole
          // server down. Only exit for genuine server-side Vite errors.
          const isForwardedClientMessage =
            msg.includes("[console.") ||
            msg.includes("[Unhandled error]") ||
            msg.includes("[Unhandled rejection]");
          if (!isForwardedClientMessage) {
            process.exit(1);
          }
        },
      },
      server: serverOptions,
      appType: "custom",
    });

    const developmentRequestLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: "Too many development-server requests, please try again shortly",
      skip: rateLimitsDisabled,
    });
    app.use(developmentRequestLimiter);
    app.use(vite.middlewares);

    app.use(staticAssetLimiter, async (req, res, next) => {
      const url = req.originalUrl;

      try {
        const clientTemplate = path.resolve(import.meta.dirname, "..", "client", "index.html");

        // always reload the index.html file from disk incase it changes
        let template = await fs.promises.readFile(clientTemplate, "utf-8");
        template = template.replace(
          `src="%BASE_URL%src/main.tsx"`,
          `src="%BASE_URL%src/main.tsx?v=${nanoid()}"`
        );
        const page = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // En production, servir les fichiers statiques
    app.use(express.static(path.resolve(import.meta.dirname, "../dist/public")));
  }
}

/**
 * The client is built with relative asset URLs ("./assets/...") so one build serves the app
 * at the root, under QUESTARR_BASE_PATH, or behind a proxy that strips its own prefix. Those
 * resolve against the page's directory, so a direct load or refresh of a nested route such as
 * /activity/imports asked for /activity/assets/..., got index.html back instead of the script
 * and rendered a blank page. A relative <base> that climbs back to the app root fixes that
 * without the server knowing the external prefix.
 *
 * @param appPath - The request path inside the app, without QUESTARR_BASE_PATH or query.
 */
export function relativeBaseHref(appPath: string): string {
  const depth = Math.max(0, (appPath.match(/\//g)?.length ?? 1) - 1);
  return depth === 0 ? "./" : "../".repeat(depth);
}

export function withBaseHref(html: string, href: string): string {
  return html.replace("<head>", `<head>\n    <base href="${href}" />`);
}

export function serveStatic(
  app: Express,
  distPath = path.resolve(import.meta.dirname, "..", "public"),
  basePath: string = config.server.basePath
) {
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // index: false sends "/" through the handler below too, so every page gets the <base>.
  app.use(express.static(distPath, { index: false }));

  // nosemgrep: javascript.lang.security.audit.path-join-resolve-traversal.path-join-resolve-traversal -- distPath is a server-side build directory, never request input.
  const indexHtml = fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8"); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- distPath is a server-side build directory, never request input.

  // fall through to index.html if the file doesn't exist
  app.use(staticAssetLimiter, (req, res) => {
    const pathname = req.originalUrl.split("?")[0] ?? "/";
    // Express matches the mount path case-insensitively, so strip it the same way. The bare
    // mount root ("/Questarr") never gets here: express.static redirects it to "/Questarr/".
    const normalizedBasePath = basePath.replace(/\/+$/, "");
    const lowerPath = pathname.toLowerCase();
    const lowerBasePath = normalizedBasePath.toLowerCase();
    const mounted =
      lowerBasePath && (lowerPath === lowerBasePath || lowerPath.startsWith(`${lowerBasePath}/`));
    const appPath = mounted ? pathname.slice(normalizedBasePath.length) : pathname;
    res.type("html").send(withBaseHref(indexHtml, relativeBaseHref(appPath || "/")));
  });
}
