import crypto from "node:crypto";
import express, { type Express, type Request, type Response as ExpressResponse } from "express";
import * as oidc from "openid-client";
import { config } from "./config.js";
import { generateToken } from "./auth.js";
import { getCookie, setAuthCookies } from "./security.js";
import { safeFetch } from "./ssrf.js";
import { storage } from "./storage.js";
import { routesLogger } from "./logger.js";
import { authRateLimiter } from "./middleware.js";

const STATE_COOKIE_PREFIX = "questarr_oidc_state_";
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const MAX_TRANSACTIONS = 16;
const MAX_PROVIDER_RESPONSE_BYTES = 1 << 20;
const OIDC_PASSWORD_MARKER = "!oidc$";

type ActiveOidcSettings = {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  provider: string;
  allowedEmails: Set<string>;
  allowedEmailDomains: Set<string>;
  scopes: string;
  allowAnyVerifiedUser: boolean;
  allowPrivateIssuer: boolean;
};

type OidcTransaction = {
  state: string;
  nonce: string;
  codeVerifier?: string;
  returnTo: string;
  expiresAt: number;
};

const transactions = new Map<string, OidcTransaction>();
let discoveryPromise: Promise<oidc.Configuration> | undefined;

function parseSet(value: string): Set<string> {
  return new Set(
    value
      .split(/[\s,;]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getSettings(): ActiveOidcSettings | undefined {
  const settings = config.auth.oidc;
  if (
    !settings.issuerUrl ||
    !settings.clientId ||
    !settings.clientSecret ||
    !settings.redirectUri
  ) {
    return undefined;
  }

  return {
    issuerUrl: settings.issuerUrl,
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
    redirectUri: settings.redirectUri,
    provider: settings.provider,
    allowedEmails: parseSet(settings.allowedEmails),
    allowedEmailDomains: parseSet(settings.allowedEmailDomains),
    scopes: settings.scopes,
    allowAnyVerifiedUser: settings.allowAnyVerifiedUser,
    allowPrivateIssuer: settings.allowPrivateIssuer,
  };
}

function isAppleIssuer(issuerUrl: string): boolean {
  return issuerUrl.trim() === "https://appleid.apple.com";
}

function cleanExpiredTransactions(now = Date.now()): void {
  for (const [state, transaction] of transactions) {
    if (transaction.expiresAt <= now) transactions.delete(state);
  }
}

async function readBoundedResponse(response: Response): Promise<Response> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("OIDC provider response is too large");
  }

  if (!response.body) {
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("OIDC provider response is too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function oidcFetch(input: string, init: oidc.CustomFetchOptions): Promise<Response> {
  const settings = getSettings();
  if (!settings) throw new Error("OIDC is not configured");

  const bodyLength = oidcRequestBodyLength(init.body);
  if (bodyLength === undefined || bodyLength > 64 * 1024) {
    throw new Error("OIDC provider request body is too large or unbounded");
  }

  const requestInit: RequestInit = {
    method: init.method,
    headers: init.headers,
    redirect: "error",
    ...(init.body !== undefined ? { body: init.body as BodyInit } : {}),
    ...(init.signal !== undefined ? { signal: init.signal } : {}),
  };
  const response = await safeFetch(input, {
    ...requestInit,
    allowPrivate: settings.allowPrivateIssuer,
    requireHttps: !settings.allowPrivateIssuer,
    maxRedirects: 0,
    timeoutMs: 15_000,
  });
  return readBoundedResponse(response);
}

function oidcRequestBodyLength(body: oidc.FetchBody): number | undefined {
  if (body === undefined || body === null) return 0;
  if (typeof body === "string") return Buffer.byteLength(body);
  if (body instanceof URLSearchParams) return Buffer.byteLength(body.toString());
  if (body instanceof ArrayBuffer) return body.byteLength;
  if (ArrayBuffer.isView(body)) return body.byteLength;
  return undefined;
}

async function getOidcClient(): Promise<oidc.Configuration> {
  if (!discoveryPromise) {
    const settings = getSettings();
    if (!settings) throw new Error("OIDC is not configured");
    discoveryPromise = oidc.discovery(
      new URL(settings.issuerUrl),
      settings.clientId,
      settings.clientSecret,
      undefined,
      { [oidc.customFetch]: oidcFetch }
    );
  }
  return discoveryPromise;
}

function safeReturnPath(value: unknown, settings: ActiveOidcSettings): string {
  const basePath = config.server.basePath;
  const fallback = basePath ? `${basePath}/` : "/";
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const origin = new URL(settings.redirectUri).origin;
    const target = new URL(value, origin);
    const requiredPrefix = basePath ? `${basePath}/` : "/";
    if (
      target.origin !== origin ||
      (basePath && target.pathname !== basePath && !target.pathname.startsWith(requiredPrefix))
    ) {
      return fallback;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

function oidcLoginFailurePath(): string {
  const basePath = config.server.basePath;
  return basePath ? `${basePath}/login?oidcFailed=true` : "/login?oidcFailed=true";
}

export function oidcStateCookieName(state: string): string {
  const suffix = crypto.createHash("sha256").update(state).digest("hex").slice(0, 32);
  return `${STATE_COOKIE_PREFIX}${suffix}`;
}

function setTransactionCookie(
  res: ExpressResponse,
  state: string,
  settings: ActiveOidcSettings
): void {
  res.cookie(oidcStateCookieName(state), state, {
    httpOnly: true,
    secure: new URL(settings.redirectUri).protocol === "https:",
    sameSite: isAppleIssuer(settings.issuerUrl) ? "none" : "lax",
    path: new URL(settings.redirectUri).pathname,
    maxAge: TRANSACTION_TTL_MS,
  });
}

function clearTransactionCookie(
  res: ExpressResponse,
  state: string,
  settings: ActiveOidcSettings
): void {
  res.clearCookie(oidcStateCookieName(state), {
    httpOnly: true,
    secure: new URL(settings.redirectUri).protocol === "https:",
    sameSite: isAppleIssuer(settings.issuerUrl) ? "none" : "lax",
    path: new URL(settings.redirectUri).pathname,
  });
}

function isAdmitted(email: string, settings: ActiveOidcSettings): boolean {
  if (settings.allowAnyVerifiedUser) return true;
  if (settings.allowedEmails.has(email)) return true;
  const at = email.lastIndexOf("@");
  return at > 0 && settings.allowedEmailDomains.has(email.slice(at + 1));
}

function identityUsername(issuer: string, subject: string): string {
  const identity = crypto.createHash("sha256").update(`${issuer}\0${subject}`).digest("hex");
  return `oidc_${identity}`;
}

async function findOrCreateOidcUser(issuer: string, subject: string) {
  const username = identityUsername(issuer, subject);
  let user = await storage.getUserByUsername(username);
  if (user) {
    return user.passwordHash.startsWith(OIDC_PASSWORD_MARKER) ? user : undefined;
  }

  try {
    user = await storage.createUser({
      username,
      // An OIDC-only account has no local password credential. The login route
      // recognizes this marker and never passes it to the password verifier.
      passwordHash: `${OIDC_PASSWORD_MARKER}${crypto.randomBytes(32).toString("base64url")}`,
    });
    return user;
  } catch {
    // Two valid callbacks for the same identity may race on the unique username.
    user = await storage.getUserByUsername(username);
    return user?.passwordHash.startsWith(OIDC_PASSWORD_MARKER) ? user : undefined;
  }
}

export function registerOidcAuthRoutes(app: Express): void {
  app.get("/api/auth/oidc/status", (_req, res) => {
    const settings = getSettings();
    res.json({ enabled: Boolean(settings), provider: settings?.provider ?? "generic" });
  });

  app.get("/api/auth/oidc/login", authRateLimiter, async (req, res) => {
    const settings = getSettings();
    if (!settings) return res.status(404).json({ error: "OIDC sign-in is not configured" });

    let pendingState: string | undefined;
    try {
      cleanExpiredTransactions();
      if (transactions.size >= MAX_TRANSACTIONS) {
        return res.status(429).json({ error: "Too many pending sign-ins. Try again shortly." });
      }
      const state = oidc.randomState();
      pendingState = state;
      const nonce = oidc.randomNonce();
      const apple = isAppleIssuer(settings.issuerUrl);
      const codeVerifier = apple ? undefined : oidc.randomPKCECodeVerifier();
      const codeChallenge = codeVerifier
        ? await oidc.calculatePKCECodeChallenge(codeVerifier)
        : undefined;
      transactions.set(state, {
        state,
        nonce,
        ...(codeVerifier ? { codeVerifier } : {}),
        returnTo: safeReturnPath(req.query.returnTo, settings),
        expiresAt: Date.now() + TRANSACTION_TTL_MS,
      });

      const scopes = apple
        ? new Set(["openid", "email"])
        : new Set(settings.scopes.split(/[\s,]+/).filter(Boolean));
      scopes.add("openid");
      scopes.add("email");
      const authorizationUrl = oidc.buildAuthorizationUrl(await getOidcClient(), {
        redirect_uri: settings.redirectUri,
        response_type: "code",
        response_mode: apple ? "form_post" : "query",
        scope: [...scopes].join(" "),
        state,
        nonce,
        ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: "S256" } : {}),
      });
      setTransactionCookie(res, state, settings);
      return res.redirect(302, authorizationUrl.href);
    } catch {
      if (pendingState) transactions.delete(pendingState);
      discoveryPromise = undefined;
      routesLogger.warn("OIDC sign-in could not start (provider_discovery_failed)");
      return res.redirect(303, oidcLoginFailurePath());
    }
  });

  const callbackHandler = async (req: Request, res: ExpressResponse) => {
    const settings = getSettings();
    if (!settings) return res.status(404).json({ error: "OIDC sign-in is not configured" });

    const apple = isAppleIssuer(settings.issuerUrl);
    if (req.method === "POST" && !apple) {
      return res.status(400).json({ error: "Form-post callbacks are reserved for Apple sign-in" });
    }
    const callbackParams =
      req.method === "POST"
        ? (req.body as Record<string, unknown>)
        : Object.fromEntries(new URL(req.originalUrl, settings.redirectUri).searchParams.entries());
    const state = typeof callbackParams?.state === "string" ? callbackParams.state : "";
    const stateCookie = state ? getCookie(req, oidcStateCookieName(state)) : undefined;
    const transaction = transactions.get(state);
    transactions.delete(state);
    if (state) clearTransactionCookie(res, state, settings);
    if (!state || !transaction || transaction.expiresAt <= Date.now() || stateCookie !== state) {
      return res.redirect(303, oidcLoginFailurePath());
    }

    try {
      const callbackUrl = new URL(settings.redirectUri);
      const params = new URLSearchParams();
      for (const key of ["code", "state", "error", "error_description", "iss"]) {
        const value = callbackParams?.[key];
        if (typeof value === "string") params.set(key, value);
      }
      callbackUrl.search = params.toString();
      const tokens = await oidc.authorizationCodeGrant(await getOidcClient(), callbackUrl, {
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        ...(transaction.codeVerifier ? { pkceCodeVerifier: transaction.codeVerifier } : {}),
      });
      const claims = tokens.claims() as Record<string, unknown> | undefined;
      const issuer = typeof claims?.iss === "string" ? claims.iss : "";
      const subject = typeof claims?.sub === "string" ? claims.sub : "";
      const email = typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : "";
      if (
        !issuer ||
        !subject ||
        !email ||
        !(claims?.email_verified === true || claims?.email_verified === "true") ||
        !isAdmitted(email, settings)
      ) {
        routesLogger.warn("OIDC sign-in denied (identity_not_admitted)");
        return res.redirect(303, oidcLoginFailurePath());
      }

      const user = await findOrCreateOidcUser(issuer, subject);
      if (!user) {
        routesLogger.warn("OIDC sign-in denied (identity_collision)");
        return res.redirect(303, oidcLoginFailurePath());
      }
      const token = await generateToken(user);
      setAuthCookies(req, res, token, new URL(settings.redirectUri).protocol === "https:");
      return res.redirect(303, transaction.returnTo);
    } catch {
      routesLogger.warn("OIDC sign-in failed (callback_validation_or_session_failed)");
      return res.redirect(303, oidcLoginFailurePath());
    }
  };

  app.get("/api/auth/oidc/callback", authRateLimiter, callbackHandler);
  app.post(
    "/api/auth/oidc/callback",
    authRateLimiter,
    express.urlencoded({ extended: false, limit: "16kb", parameterLimit: 32 }),
    callbackHandler
  );
}
