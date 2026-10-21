import { z } from "zod";
import { configLoader } from "./config-loader.js";
import { parseTrustProxy } from "./trust-proxy.js";
import { isStrongJwtSecret } from "./jwt-secret.js";

/**
 * Environment configuration schema with Zod validation.
 * Validates and provides typed access to required environment variables.
 */
const envSchema = z
  .object({
    // Database configuration. A connection URL never selects Postgres on its own:
    // older SQLite installs may still have a stale DATABASE_URL in their Compose env.
    SQLITE_DB_PATH: z.string().optional(),
    DB_DIALECT: z
      .string()
      .optional()
      .transform((dialect) => dialect?.trim().toLowerCase() || "sqlite")
      .pipe(z.enum(["sqlite", "postgres", "postgresql"])),
    DATABASE_URL: z.string().optional(),
    DATABASE_POOL_MAX: z.string().optional(),

    // CORS configuration
    ALLOWED_ORIGINS: z.string().optional(),

    // JWT configuration
    JWT_SECRET: z
      .string()
      .optional()
      .refine((value) => value === undefined || isStrongJwtSecret(value), {
        message:
          "JWT_SECRET must contain at least 32 bytes and must not be the insecure legacy default. Remove it to auto-generate, or set a strong random value.",
      }),

    // OIDC is configured as a confidential server-side web client. The callback
    // is fixed to the app's auth route and must be registered exactly at the IdP.
    QUESTARR_OIDC_ISSUER_URL: z.string().optional(),
    QUESTARR_OIDC_CLIENT_ID: z.string().optional(),
    QUESTARR_OIDC_CLIENT_SECRET: z.string().optional(),
    QUESTARR_OIDC_REDIRECT_URI: z.string().optional(),
    // Display hint only; OIDC discovery and issuer validation stay generic.
    QUESTARR_OIDC_PROVIDER: z.string().max(80).optional(),
    QUESTARR_OIDC_ALLOWED_EMAILS: z.string().optional(),
    QUESTARR_OIDC_ALLOWED_EMAIL_DOMAINS: z.string().optional(),
    QUESTARR_OIDC_SCOPES: z.string().optional(),
    QUESTARR_OIDC_ALLOW_ANY_VERIFIED_USER: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    QUESTARR_OIDC_ALLOW_PRIVATE_ISSUER: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    // IGDB API configuration (optional, but required for game discovery features)
    IGDB_CLIENT_ID: z.string().optional(),
    IGDB_CLIENT_SECRET: z.string().optional(),

    // NexusMods API configuration (optional)
    NEXUSMODS_API_KEY: z.string().optional(),

    // Steam Web API configuration (optional; required for the achievements
    // section in the game details Journal tab — player wishlist sync does not need it)
    STEAM_API_KEY: z.string().optional(),

    // Encryption key for indexer/downloader credentials at rest (optional;
    // auto-generated and persisted to the DB if unset). Must be a 64-char hex
    // string (32 bytes) when provided, for use as an AES-256 key.
    CREDENTIALS_ENCRYPTION_KEY: z
      .string()
      .optional()
      .refine((value) => !value || /^[0-9a-fA-F]{64}$/.test(value), {
        message:
          "CREDENTIALS_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for AES-256.",
      }),

    // Server configuration
    PORT: z
      .string()
      .default("5000")
      .refine((val) => !Number.isNaN(Number.parseInt(val, 10)) && Number.parseInt(val, 10) > 0, {
        message: "PORT must be a valid positive integer",
      })
      .transform((val) => Number.parseInt(val, 10)),
    HOST: z.string().default("0.0.0.0"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
    DISABLE_HSTS: z
      .string()
      .transform((val) => val === "true")
      .optional(),
    APP_URL: z.string().url().optional(),

    // Reverse proxy trust (see docs/REVERSE_PROXY.md). Off by default: only
    // when set does Express take the client IP and protocol from
    // X-Forwarded-For / X-Forwarded-Proto.
    TRUST_PROXY: z
      .string()
      .optional()
      .refine((value) => parseTrustProxy(value) !== null, {
        message:
          'TRUST_PROXY must be "false", "true", a number of proxy hops from 1 to 10, or a comma-separated list of proxy IPs/subnets (e.g. 172.16.0.0/12, loopback).',
      })
      .transform((value) => parseTrustProxy(value) ?? false),

    // URL base for reverse-proxy subdirectory deployments (e.g. "/Questarr" for
    // https://host/Questarr/). Optional; defaults to serving from the root.
    QUESTARR_BASE_PATH: z
      .string()
      .optional()
      .refine(
        (value) =>
          !value ||
          value === "/" ||
          /^\/?[a-zA-Z0-9](?:[a-zA-Z0-9/_-]*[a-zA-Z0-9])?\/?$/.test(value),
        {
          message:
            "QUESTARR_BASE_PATH must contain only letters, numbers, hyphens, underscores, and slashes (e.g. /Questarr).",
        }
      ),
  })
  .superRefine((env, context) => {
    const oidcValues = [
      env.QUESTARR_OIDC_ISSUER_URL,
      env.QUESTARR_OIDC_CLIENT_ID,
      env.QUESTARR_OIDC_CLIENT_SECRET,
      env.QUESTARR_OIDC_REDIRECT_URI,
    ];
    const oidcConfiguredCount = oidcValues.filter((value) => Boolean(value?.trim())).length;
    if (oidcConfiguredCount > 0 && oidcConfiguredCount !== oidcValues.length) {
      context.addIssue({
        code: "custom",
        path: ["QUESTARR_OIDC_ISSUER_URL"],
        message:
          "QUESTARR_OIDC_ISSUER_URL, CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI must be configured together.",
      });
    }

    if (oidcConfiguredCount === oidcValues.length) {
      try {
        const issuer = new URL(env.QUESTARR_OIDC_ISSUER_URL!.trim());
        const redirect = new URL(env.QUESTARR_OIDC_REDIRECT_URI!.trim());
        const expectedPath = `${normalizeBasePath(env.QUESTARR_BASE_PATH)}/api/auth/oidc/callback` ||
          "/api/auth/oidc/callback";
        if (
          !issuer.host ||
          issuer.username ||
          issuer.password ||
          issuer.search ||
          issuer.hash ||
          !["https:", ...(env.QUESTARR_OIDC_ALLOW_PRIVATE_ISSUER ? ["http:"] : [])].includes(
            issuer.protocol
          )
        ) {
          throw new Error("issuer");
        }
        if (
          !redirect.host ||
          redirect.username ||
          redirect.password ||
          redirect.search ||
          redirect.hash ||
          redirect.protocol !== "https:" ||
          redirect.pathname !== expectedPath
        ) {
          throw new Error("redirect");
        }
      } catch {
        context.addIssue({
          code: "custom",
          path: ["QUESTARR_OIDC_ISSUER_URL"],
          message:
            "OIDC requires an issuer URL (HTTPS unless private HTTP is explicitly enabled) and an HTTPS redirect URI at the app's /api/auth/oidc/callback route.",
        });
      }
    }

    if (env.DB_DIALECT !== "postgres" && env.DB_DIALECT !== "postgresql") return;

    if (!env.DATABASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "DATABASE_URL must be set when DB_DIALECT=postgres.",
      });
    } else {
      try {
        const databaseUrl = new URL(env.DATABASE_URL);
        if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
          context.addIssue({
            code: "custom",
            path: ["DATABASE_URL"],
            message: "DATABASE_URL must use the postgres:// or postgresql:// scheme.",
          });
        }
      } catch {
        context.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: "DATABASE_URL must be a valid Postgres connection URL.",
        });
      }
    }

    if (env.DATABASE_POOL_MAX !== undefined) {
      const poolMax = Number(env.DATABASE_POOL_MAX);
      if (!Number.isSafeInteger(poolMax) || poolMax < 2) {
        context.addIssue({
          code: "custom",
          path: ["DATABASE_POOL_MAX"],
          message: "DATABASE_POOL_MAX must be an integer of at least 2.",
        });
      }
    }
  });

/**
 * Normalizes a configured base path to a form with a leading slash and no
 * trailing slash (e.g. "Questarr/" -> "/Questarr"), or "" for the root.
 */
function normalizeBasePath(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

/**
 * Validate environment variables and fail cleanly with descriptive errors if required variables are missing.
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorMessages = result.error.issues.map((err) => {
      const path = err.path.join(".");
      return `  - ${path}: ${err.message}`;
    });

    console.error("❌ Invalid environment configuration:");
    console.error(errorMessages.join("\n"));
    console.error("\nPlease check your environment variables and try again.");
    process.exit(1);
  }

  return result.data;
}

// Validate and export typed configuration
const env = validateEnv();

// Database path logic
const databaseUrl = env.SQLITE_DB_PATH || "sqlite.db";

/**
 * Typed configuration object for the application.
 */
export const config = {
  database: {
    url: databaseUrl,
    dialect: env.DB_DIALECT,
    connectionString: env.DATABASE_URL,
    poolMax:
      env.DB_DIALECT === "postgres" || env.DB_DIALECT === "postgresql"
        ? Number(env.DATABASE_POOL_MAX ?? 10)
        : 10,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    oidc: {
      issuerUrl: env.QUESTARR_OIDC_ISSUER_URL?.trim(),
      clientId: env.QUESTARR_OIDC_CLIENT_ID?.trim(),
      clientSecret: env.QUESTARR_OIDC_CLIENT_SECRET,
      redirectUri: env.QUESTARR_OIDC_REDIRECT_URI?.trim(),
      provider: env.QUESTARR_OIDC_PROVIDER?.trim() ?? "generic",
      allowedEmails: env.QUESTARR_OIDC_ALLOWED_EMAILS ?? "",
      allowedEmailDomains: env.QUESTARR_OIDC_ALLOWED_EMAIL_DOMAINS ?? "",
      scopes: env.QUESTARR_OIDC_SCOPES ?? "openid profile email",
      allowAnyVerifiedUser: env.QUESTARR_OIDC_ALLOW_ANY_VERIFIED_USER,
      allowPrivateIssuer: env.QUESTARR_OIDC_ALLOW_PRIVATE_ISSUER,
    },
  },
  igdb: {
    clientId: env.IGDB_CLIENT_ID,
    clientSecret: env.IGDB_CLIENT_SECRET,
    isConfigured: !!(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET),
  },
  nexusmods: {
    apiKey: env.NEXUSMODS_API_KEY,
  },
  steam: {
    apiKey: env.STEAM_API_KEY,
    isConfigured: !!env.STEAM_API_KEY,
  },
  credentials: {
    encryptionKey: env.CREDENTIALS_ENCRYPTION_KEY,
  },
  server: {
    port: env.PORT,
    host: env.HOST,
    nodeEnv: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === "development",
    isProduction: env.NODE_ENV === "production",
    isTest: env.NODE_ENV === "test",
    appUrl: env.APP_URL,
    allowedOrigins: env.ALLOWED_ORIGINS
      ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
      : ["http://localhost:port".replace("port", env.PORT.toString())],
    basePath: normalizeBasePath(env.QUESTARR_BASE_PATH),
    trustProxy: env.TRUST_PROXY,
  },
  ssl: configLoader.getSslConfig(),
} as const;

export type AppConfig = typeof config;
