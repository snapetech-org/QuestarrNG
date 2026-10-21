import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const oidcMocks = vi.hoisted(() => ({
  config: {
    auth: {
      oidc: {
        issuerUrl: "https://issuer.example",
        clientId: "questarr-client",
        clientSecret: "client-secret",
        redirectUri: "https://questarr.example/app/api/auth/oidc/callback",
        provider: "generic",
        allowedEmails: "Member@example.com",
        allowedEmailDomains: "",
        scopes: "profile,groups profile",
        allowAnyVerifiedUser: false,
        allowPrivateIssuer: false,
      },
    },
    server: { basePath: "/app" },
  },
  oidc: {
    customFetch: Symbol("customFetch"),
    discovery: vi.fn(),
    randomState: vi.fn(),
    randomNonce: vi.fn(),
    randomPKCECodeVerifier: vi.fn(),
    calculatePKCECodeChallenge: vi.fn(),
    buildAuthorizationUrl: vi.fn(),
    authorizationCodeGrant: vi.fn(),
  },
  storage: {
    getUserByUsername: vi.fn(),
    createUser: vi.fn(),
  },
  generateToken: vi.fn(),
  getCookie: vi.fn(),
  setAuthCookies: vi.fn(),
  safeFetch: vi.fn(),
  routesLogger: { warn: vi.fn() },
}));

vi.mock("openid-client", () => oidcMocks.oidc);
vi.mock("../config.js", () => ({ config: oidcMocks.config }));
vi.mock("../storage.js", () => ({ storage: oidcMocks.storage }));
vi.mock("../auth.js", () => ({ generateToken: oidcMocks.generateToken }));
vi.mock("../security.js", () => ({
  getCookie: oidcMocks.getCookie,
  setAuthCookies: oidcMocks.setAuthCookies,
}));
vi.mock("../ssrf.js", () => ({ safeFetch: oidcMocks.safeFetch }));
vi.mock("../logger.js", () => ({ routesLogger: oidcMocks.routesLogger }));
vi.mock("../middleware.js", () => ({
  authRateLimiter: (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
}));

const allowedClaims = {
  iss: "https://issuer.example",
  sub: "provider-user-42",
  email: "Member@Example.com",
  email_verified: true,
};

describe("OIDC authentication routes", () => {
  let app: express.Express;
  let oidcAuth: typeof import("../oidc-auth.js");
  let nextState: number;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.useRealTimers();
    oidcMocks.config.auth.oidc = {
      issuerUrl: "https://issuer.example",
      clientId: "questarr-client",
      clientSecret: "client-secret",
      redirectUri: "https://questarr.example/app/api/auth/oidc/callback",
      provider: "generic",
      allowedEmails: "Member@example.com",
      allowedEmailDomains: "",
      scopes: "profile,groups profile",
      allowAnyVerifiedUser: false,
      allowPrivateIssuer: false,
    };
    oidcMocks.config.server.basePath = "/app";
    nextState = 0;
    oidcMocks.oidc.randomState.mockImplementation(() => `state-${++nextState}`);
    oidcMocks.oidc.randomNonce.mockReturnValue("nonce-1");
    oidcMocks.oidc.randomPKCECodeVerifier.mockReturnValue("verifier-1");
    oidcMocks.oidc.calculatePKCECodeChallenge.mockResolvedValue("challenge-1");
    oidcMocks.oidc.discovery.mockResolvedValue({});
    oidcMocks.oidc.buildAuthorizationUrl.mockImplementation((_client, params) => {
      const url = new URL("https://identity.example/authorize");
      for (const [key, value] of Object.entries(params as Record<string, string>)) {
        url.searchParams.set(key, value);
      }
      return url;
    });
    oidcMocks.oidc.authorizationCodeGrant.mockResolvedValue({
      claims: () => allowedClaims,
    });
    oidcMocks.storage.getUserByUsername.mockResolvedValue(undefined);
    oidcMocks.storage.createUser.mockImplementation(async (input) => ({
      id: "oidc-user-1",
      username: input.username,
      passwordHash: input.passwordHash,
    }));
    oidcMocks.generateToken.mockResolvedValue("local-session-token");
    oidcMocks.getCookie.mockImplementation(
      (req: { headers: { cookie?: string } }, name: string) => {
        const value = req.headers.cookie
          ?.split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${name}=`))
          ?.slice(name.length + 1);
        return value ? decodeURIComponent(value) : undefined;
      }
    );
    oidcMocks.setAuthCookies.mockImplementation(
      (_req: unknown, res: { cookie: (...args: unknown[]) => unknown }, token: string) => {
        res.cookie("questarr_auth", token, { httpOnly: true });
      }
    );
    oidcMocks.safeFetch.mockImplementation(async () => new Response("provider response"));

    oidcAuth = await import("../oidc-auth.js");
    app = express();
    oidcAuth.registerOidcAuthRoutes(app);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const stateCookieName = (state: string) => oidcAuth.oidcStateCookieName(state);
  const cookieHeader = (state: string) => `${stateCookieName(state)}=${encodeURIComponent(state)}`;

  async function beginLogin(returnTo?: string) {
    const req = request(app).get("/api/auth/oidc/login");
    if (returnTo !== undefined) req.query({ returnTo });
    return req;
  }

  function finishLogin(state: string, fields: Record<string, string> = {}) {
    return request(app)
      .get("/api/auth/oidc/callback")
      .query({ code: "authorization-code", state, ...fields })
      .set("Cookie", cookieHeader(state));
  }

  async function providerFetch() {
    await beginLogin();
    const options = oidcMocks.oidc.discovery.mock.calls[0][4] as Record<PropertyKey, unknown>;
    return options[oidcMocks.oidc.customFetch] as (
      input: string,
      init: Record<string, unknown>
    ) => Promise<Response>;
  }

  it("reports disabled configuration and rejects sign-in without complete settings", async () => {
    for (const key of ["issuerUrl", "clientId", "clientSecret", "redirectUri"] as const) {
      const configured = { ...oidcMocks.config.auth.oidc };
      oidcMocks.config.auth.oidc = { ...configured, [key]: "" };
      const status = await request(app).get("/api/auth/oidc/status");
      expect(status.body).toEqual({ enabled: false, provider: "generic" });
      expect((await beginLogin()).status).toBe(404);
      expect(
        (await request(app).get("/api/auth/oidc/callback").query({ state: "unused" })).status
      ).toBe(404);
      oidcMocks.config.auth.oidc = configured;
    }

    oidcMocks.config.auth.oidc.provider = "authentik";
    expect((await request(app).get("/api/auth/oidc/status")).body).toEqual({
      enabled: true,
      provider: "authentik",
    });
  });

  it("starts a PKCE flow with normalized required scopes and a same-site state cookie", async () => {
    const response = await beginLogin("/app/settings?tab=security#oidc");

    expect(response.status).toBe(302);
    expect(response.headers.location).toContain("https://identity.example/authorize?");
    expect(response.headers.location).toContain("code_challenge=challenge-1");
    expect(response.headers.location).toContain("code_challenge_method=S256");
    expect(oidcMocks.oidc.buildAuthorizationUrl).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        response_type: "code",
        response_mode: "query",
        scope: "profile groups openid email",
        state: "state-1",
        nonce: "nonce-1",
      })
    );
    const cookie = (response.headers["set-cookie"] as string[]).find((value) =>
      value.startsWith(`${stateCookieName("state-1")}=`)
    );
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/app/api/auth/oidc/callback");
  });

  it("falls back to the app root for unsafe return paths and reports discovery failures", async () => {
    const openRedirect = await beginLogin("//evil.example/path");
    expect(openRedirect.status).toBe(302);

    const callback = await finishLogin("state-1");
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe("/app/");

    vi.resetModules();
    oidcAuth = await import("../oidc-auth.js");
    app = express();
    oidcAuth.registerOidcAuthRoutes(app);
    oidcMocks.oidc.discovery.mockRejectedValueOnce(new Error("provider unavailable"));
    const failure = await beginLogin("/outside-the-app");
    expect(failure.status).toBe(303);
    expect(failure.headers.location).toBe("/app/login?oidcFailed=true");
    expect(oidcMocks.routesLogger.warn).toHaveBeenCalledWith(
      "OIDC sign-in could not start (provider_discovery_failed)"
    );
  });

  it("rejects a callback unless state, transaction, expiry, and cookie all match", async () => {
    const missing = await request(app).get("/api/auth/oidc/callback");
    expect(missing.status).toBe(303);
    expect(missing.headers.location).toBe("/app/login?oidcFailed=true");

    await beginLogin();
    const wrongCookie = await request(app)
      .get("/api/auth/oidc/callback")
      .query({ code: "authorization-code", state: "state-1" })
      .set("Cookie", `${stateCookieName("state-1")}=wrong-state`);
    expect(wrongCookie.status).toBe(303);

    await beginLogin();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    const expired = await finishLogin("state-2");
    expect(expired.status).toBe(303);
    expect(oidcMocks.oidc.authorizationCodeGrant).not.toHaveBeenCalled();
  });

  it("fails closed if OIDC settings disappear during login and handles state-generation errors", async () => {
    oidcMocks.oidc.randomState.mockImplementationOnce(() => {
      oidcMocks.config.auth.oidc.clientSecret = "";
      return "state-1";
    });
    const missingSettings = await beginLogin();
    expect(missingSettings.status).toBe(303);
    expect(missingSettings.headers.location).toBe("/app/login?oidcFailed=true");
    expect(oidcMocks.oidc.discovery).not.toHaveBeenCalled();

    vi.resetModules();
    oidcAuth = await import("../oidc-auth.js");
    app = express();
    oidcAuth.registerOidcAuthRoutes(app);
    oidcMocks.config.auth.oidc.clientSecret = "client-secret";
    oidcMocks.oidc.randomState.mockImplementationOnce(() => {
      throw new Error("secure random source unavailable");
    });
    const stateFailure = await beginLogin();
    expect(stateFailure.status).toBe(303);
    expect(stateFailure.headers.location).toBe("/app/login?oidcFailed=true");
  });

  it("uses root-relative paths when the application has no base path", async () => {
    oidcMocks.config.server.basePath = "";
    await beginLogin("/library?sort=recent");
    const success = await finishLogin("state-1");
    expect(success.headers.location).toBe("/library?sort=recent");

    vi.resetModules();
    oidcAuth = await import("../oidc-auth.js");
    app = express();
    oidcAuth.registerOidcAuthRoutes(app);
    oidcMocks.oidc.discovery.mockRejectedValueOnce(new Error("provider unavailable"));
    const failure = await beginLogin();
    expect(failure.headers.location).toBe("/login?oidcFailed=true");
  });

  it("limits concurrent sign-ins and removes expired transactions before admitting another", async () => {
    for (let index = 0; index < 16; index += 1) {
      expect((await beginLogin()).status).toBe(302);
    }
    const limited = await beginLogin();
    expect(limited.status).toBe(429);
    expect(limited.body.error).toContain("Too many pending sign-ins");

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect((await beginLogin()).status).toBe(302);
  });

  it("creates a local OIDC-only user and issues the existing Questarr session", async () => {
    const started = await beginLogin("/app/library?sort=year#owned");
    expect(started.status).toBe(302);
    const response = await finishLogin("state-1", { iss: "https://issuer.example" });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe("/app/library?sort=year#owned");
    expect(oidcMocks.oidc.authorizationCodeGrant).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        href: expect.stringContaining("code=authorization-code"),
      }),
      expect.objectContaining({
        expectedState: "state-1",
        expectedNonce: "nonce-1",
        pkceCodeVerifier: "verifier-1",
      })
    );
    expect(oidcMocks.storage.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: expect.stringMatching(/^oidc_[0-9a-f]{64}$/),
        passwordHash: expect.stringMatching(/^!oidc\$/),
      })
    );
    expect(oidcMocks.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: "oidc-user-1" })
    );
    expect(oidcMocks.setAuthCookies).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      "local-session-token",
      true
    );
    expect((response.headers["set-cookie"] as string[]).join("\n")).toContain(
      `${stateCookieName("state-1")}=;`
    );
  });

  it("reuses an existing OIDC identity but refuses to take over a local account", async () => {
    await beginLogin();
    oidcMocks.storage.getUserByUsername.mockResolvedValueOnce({
      id: "existing-oidc-user",
      passwordHash: "!oidc$existing",
    });
    const existing = await finishLogin("state-1");
    expect(existing.status).toBe(303);
    expect(existing.headers.location).toBe("/app/");
    expect(oidcMocks.storage.createUser).not.toHaveBeenCalled();

    await beginLogin();
    oidcMocks.storage.getUserByUsername.mockResolvedValueOnce({
      id: "local-user",
      passwordHash: "scrypt$local-password-hash",
    });
    const collision = await finishLogin("state-2");
    expect(collision.status).toBe(303);
    expect(collision.headers.location).toBe("/app/login?oidcFailed=true");
    expect(oidcMocks.generateToken).toHaveBeenCalledTimes(1);
  });

  it("recovers a concurrent account-creation race only when the stored account is OIDC-only", async () => {
    oidcMocks.storage.getUserByUsername
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "raced-oidc-user", passwordHash: "!oidc$raced" });
    oidcMocks.storage.createUser.mockRejectedValueOnce(new Error("unique username"));
    await beginLogin();
    const recovered = await finishLogin("state-1");
    expect(recovered.headers.location).toBe("/app/");
    expect(oidcMocks.generateToken).toHaveBeenCalledWith(
      expect.objectContaining({ id: "raced-oidc-user" })
    );

    oidcMocks.storage.getUserByUsername
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    oidcMocks.storage.createUser.mockRejectedValueOnce(new Error("database unavailable"));
    await beginLogin();
    const unresolved = await finishLogin("state-2");
    expect(unresolved.headers.location).toBe("/app/login?oidcFailed=true");
  });

  it("admits normalized allowlisted addresses and verified users on explicitly allowed domains", async () => {
    oidcMocks.config.auth.oidc.allowedEmails = "other@example.com; MEMBER@example.com";
    await beginLogin();
    const exact = await finishLogin("state-1");
    expect(exact.headers.location).toBe("/app/");

    oidcMocks.config.auth.oidc.allowedEmails = "";
    oidcMocks.config.auth.oidc.allowedEmailDomains = " EXAMPLE.COM, example.net ";
    oidcMocks.oidc.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({ ...allowedClaims, email_verified: "true" }),
    });
    await beginLogin();
    const domain = await finishLogin("state-2");
    expect(domain.headers.location).toBe("/app/");

    oidcMocks.config.auth.oidc.allowAnyVerifiedUser = true;
    oidcMocks.oidc.authorizationCodeGrant.mockResolvedValueOnce({
      claims: () => ({ ...allowedClaims, email: "new-user@unlisted.example" }),
    });
    await beginLogin();
    expect((await finishLogin("state-3")).headers.location).toBe("/app/");
  });

  it("rejects missing identity claims, unverified email, and identities outside the allowlist", async () => {
    const invalidClaims = [
      undefined,
      { sub: allowedClaims.sub, email: allowedClaims.email, email_verified: true },
      { iss: allowedClaims.iss, email: allowedClaims.email, email_verified: true },
      { iss: allowedClaims.iss, sub: allowedClaims.sub, email_verified: true },
      { ...allowedClaims, email: "   " },
      { ...allowedClaims, email_verified: false },
      { ...allowedClaims, email: "intruder@outside.example" },
      { ...allowedClaims, email: "not-an-address" },
    ];

    for (const claims of invalidClaims) {
      oidcMocks.oidc.authorizationCodeGrant.mockResolvedValueOnce({ claims: () => claims });
      await beginLogin();
      const state = `state-${nextState}`;
      const response = await finishLogin(state);
      expect(response.headers.location).toBe("/app/login?oidcFailed=true");
    }
    expect(oidcMocks.storage.getUserByUsername).not.toHaveBeenCalled();
  });

  it("rejects non-Apple form-post callbacks and converts grant failures into a safe redirect", async () => {
    const post = await request(app)
      .post("/api/auth/oidc/callback")
      .type("form")
      .send({ state: "state-1", code: "authorization-code" });
    expect(post.status).toBe(400);

    oidcMocks.oidc.authorizationCodeGrant.mockRejectedValueOnce(new Error("invalid nonce"));
    await beginLogin();
    const failed = await finishLogin("state-1");
    expect(failed.status).toBe(303);
    expect(failed.headers.location).toBe("/app/login?oidcFailed=true");
    expect(oidcMocks.routesLogger.warn).toHaveBeenCalledWith(
      "OIDC sign-in failed (callback_validation_or_session_failed)"
    );
  });

  it("uses Apple's form-post response mode, cross-site cookie, and no PKCE verifier", async () => {
    oidcMocks.config.auth.oidc.issuerUrl = "https://appleid.apple.com";
    oidcMocks.config.auth.oidc.scopes = "profile address";
    const started = await beginLogin("/app/settings");

    expect(started.status).toBe(302);
    expect(oidcMocks.oidc.buildAuthorizationUrl).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        response_mode: "form_post",
        scope: "openid email",
      })
    );
    expect(oidcMocks.oidc.randomPKCECodeVerifier).not.toHaveBeenCalled();
    const cookie = (started.headers["set-cookie"] as string[])[0];
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");

    const callback = await request(app)
      .post("/api/auth/oidc/callback")
      .type("form")
      .send({ state: "state-1", code: "apple-code", iss: "https://appleid.apple.com" })
      .set("Cookie", cookieHeader("state-1"));
    expect(callback.status).toBe(303);
    expect(callback.headers.location).toBe("/app/settings");
    expect(oidcMocks.oidc.authorizationCodeGrant).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ href: expect.stringContaining("apple-code") }),
      expect.objectContaining({ expectedState: "state-1", expectedNonce: "nonce-1" })
    );
    expect(oidcMocks.oidc.authorizationCodeGrant.mock.calls[0][2]).not.toHaveProperty(
      "pkceCodeVerifier"
    );
  });

  it("uses the bounded SSRF-safe custom fetch and supports supported request body forms", async () => {
    const fetch = await providerFetch();
    const signal = new AbortController().signal;
    const bodies = [
      undefined,
      null,
      "payload",
      new URLSearchParams({ token: "value" }),
      new Uint8Array([1, 2, 3]),
      new ArrayBuffer(2),
    ];
    for (const body of bodies) {
      oidcMocks.safeFetch.mockImplementationOnce(
        async () =>
          new Response("provider response", {
            headers: { "content-length": "17", "content-encoding": "identity", "x-idp": "ok" },
          })
      );
      const response = await fetch("https://issuer.example/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal,
      });
      expect(await response.text()).toBe("provider response");
      expect(response.headers.has("content-length")).toBe(false);
      expect(response.headers.has("content-encoding")).toBe(false);
      expect(response.headers.get("x-idp")).toBe("ok");
    }
    expect(oidcMocks.safeFetch).toHaveBeenCalledWith(
      "https://issuer.example/token",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        allowPrivate: false,
        requireHttps: true,
        maxRedirects: 0,
        timeoutMs: 15_000,
        signal,
      })
    );

    oidcMocks.config.auth.oidc.allowPrivateIssuer = true;
    oidcMocks.safeFetch.mockImplementationOnce(async () => new Response(null));
    const empty = await fetch("http://private-issuer/token", { method: "GET" });
    expect(empty.body).toBeNull();
    expect(oidcMocks.safeFetch).toHaveBeenLastCalledWith(
      "http://private-issuer/token",
      expect.objectContaining({ allowPrivate: true, requireHttps: false })
    );
  });

  it("rejects oversized or unbounded provider requests and oversized responses", async () => {
    const fetch = await providerFetch();
    await expect(
      fetch("https://issuer.example/token", { body: "x".repeat(64 * 1024 + 1) })
    ).rejects.toThrow("OIDC provider request body is too large or unbounded");
    await expect(fetch("https://issuer.example/token", { body: new Blob(["x"]) })).rejects.toThrow(
      "OIDC provider request body is too large or unbounded"
    );
    expect(oidcMocks.safeFetch).not.toHaveBeenCalled();

    oidcMocks.safeFetch.mockImplementationOnce(
      async () => new Response("too big", { headers: { "content-length": String((1 << 20) + 1) } })
    );
    await expect(fetch("https://issuer.example/metadata", {})).rejects.toThrow(
      "OIDC provider response is too large"
    );

    oidcMocks.safeFetch.mockImplementationOnce(
      async () => new Response(new Uint8Array((1 << 20) + 1))
    );
    await expect(fetch("https://issuer.example/metadata", {})).rejects.toThrow(
      "OIDC provider response is too large"
    );
  });

  it("refuses custom-fetch calls if the OIDC configuration is removed", async () => {
    const fetch = await providerFetch();
    oidcMocks.config.auth.oidc.issuerUrl = "";
    await expect(fetch("https://issuer.example/userinfo", {})).rejects.toThrow(
      "OIDC is not configured"
    );
  });
});
