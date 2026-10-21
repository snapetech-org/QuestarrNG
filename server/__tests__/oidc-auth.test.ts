import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: {
    server: { basePath: "" },
    auth: {
      oidc: {
        issuerUrl: "",
        clientId: "",
        clientSecret: "",
        redirectUri: "",
        provider: "generic",
        allowedEmails: "",
        allowedEmailDomains: "",
        scopes: "openid profile",
        allowAnyVerifiedUser: false,
        allowPrivateIssuer: false,
      },
    },
  },
  customFetch: Symbol("openid.customFetch"),
  discovery: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  buildAuthorizationUrl: vi.fn<(...args: unknown[]) => URL>(),
  authorizationCodeGrant: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  randomState: vi.fn<() => string>(),
  randomNonce: vi.fn<() => string>(),
  randomPKCECodeVerifier: vi.fn<() => string>(),
  calculatePKCECodeChallenge: vi.fn<(verifier: string) => Promise<string>>(),
  claims: vi.fn<() => Record<string, unknown> | undefined>(),
  getCookie: vi.fn<(req: unknown, name: string) => string | undefined>(),
  setAuthCookies: vi.fn<(...args: unknown[]) => void>(),
  safeFetch: vi.fn<(...args: unknown[]) => Promise<Response>>(),
  getUserByUsername: vi.fn<(username: string) => Promise<OidcUser | undefined>>(),
  createUser: vi.fn<(input: OidcUserInput) => Promise<OidcUser>>(),
  generateToken: vi.fn<(user: OidcUser) => Promise<string>>(),
  warn: vi.fn(),
}));

type OidcUser = { id: string; username: string; passwordHash: string };
type OidcUserInput = { username: string; passwordHash: string };

vi.mock("openid-client", () => ({
  customFetch: mocks.customFetch,
  discovery: mocks.discovery,
  buildAuthorizationUrl: mocks.buildAuthorizationUrl,
  authorizationCodeGrant: mocks.authorizationCodeGrant,
  randomState: mocks.randomState,
  randomNonce: mocks.randomNonce,
  randomPKCECodeVerifier: mocks.randomPKCECodeVerifier,
  calculatePKCECodeChallenge: mocks.calculatePKCECodeChallenge,
}));

vi.mock("../config.js", () => ({ config: mocks.config }));
vi.mock("../auth.js", () => ({ generateToken: mocks.generateToken }));
vi.mock("../security.js", () => ({
  getCookie: mocks.getCookie,
  setAuthCookies: mocks.setAuthCookies,
}));
vi.mock("../ssrf.js", () => ({ safeFetch: mocks.safeFetch }));
vi.mock("../storage.js", () => ({
  storage: {
    getUserByUsername: mocks.getUserByUsername,
    createUser: mocks.createUser,
  },
}));
vi.mock("../logger.js", () => ({ routesLogger: { warn: mocks.warn } }));
vi.mock("../middleware.js", () => ({
  authRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe("OIDC authentication routes", () => {
  let app: express.Express;
  let stateNumber: number;

  function configureOidc(overrides: Partial<typeof mocks.config.auth.oidc> = {}): void {
    Object.assign(mocks.config.auth.oidc, {
      issuerUrl: "https://issuer.example",
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://app.example/api/auth/oidc/callback",
      provider: "generic",
      allowedEmails: "",
      allowedEmailDomains: "",
      scopes: "openid profile",
      allowAnyVerifiedUser: false,
      allowPrivateIssuer: false,
      ...overrides,
    });
  }

  async function startLogin(returnTo?: string) {
    let loginRequest = request(app).get("/api/auth/oidc/login");
    if (returnTo !== undefined) loginRequest = loginRequest.query({ returnTo });
    const response = await loginRequest;
    const authorizationUrl = new URL(response.headers.location);
    return {
      response,
      authorizationUrl,
      state: authorizationUrl.searchParams.get("state") ?? "",
    };
  }

  function completeGetCallback(state: string, params: Record<string, string> = {}) {
    mocks.getCookie.mockReturnValue(state);
    return request(app)
      .get("/api/auth/oidc/callback")
      .query({ ...params, state });
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    stateNumber = 0;
    mocks.config.server.basePath = "";
    Object.assign(mocks.config.auth.oidc, {
      issuerUrl: "",
      clientId: "",
      clientSecret: "",
      redirectUri: "",
      provider: "generic",
      allowedEmails: "",
      allowedEmailDomains: "",
      scopes: "openid profile",
      allowAnyVerifiedUser: false,
      allowPrivateIssuer: false,
    });
    mocks.discovery.mockResolvedValue({});
    mocks.buildAuthorizationUrl.mockImplementation((...args: unknown[]) => {
      const params = args[1] as Record<string, unknown>;
      const url = new URL("https://issuer.example/authorize");
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === "string") url.searchParams.set(key, value);
      }
      return url;
    });
    mocks.authorizationCodeGrant.mockResolvedValue({ claims: mocks.claims });
    mocks.randomState.mockImplementation(() => `state-${++stateNumber}`);
    mocks.randomNonce.mockImplementation(() => `nonce-${stateNumber}`);
    mocks.randomPKCECodeVerifier.mockReturnValue("verifier");
    mocks.calculatePKCECodeChallenge.mockResolvedValue("challenge");
    mocks.claims.mockReturnValue({
      iss: "https://issuer.example",
      sub: "subject-1",
      email: "user@example.com",
      email_verified: true,
    });
    mocks.getCookie.mockReturnValue(undefined);
    mocks.setAuthCookies.mockReset();
    mocks.safeFetch.mockResolvedValue(new Response("provider response"));
    mocks.getUserByUsername.mockResolvedValue(undefined);
    mocks.createUser.mockImplementation(async (input) => ({
      id: "user-1",
      ...input,
    }));
    mocks.generateToken.mockResolvedValue("signed-session-token");
    mocks.warn.mockReset();

    const { registerOidcAuthRoutes } = await import("../oidc-auth.js");
    app = express();
    registerOidcAuthRoutes(app);
  });

  it("reports disabled status until all required settings exist", async () => {
    configureOidc();
    const requiredSettings = ["issuerUrl", "clientId", "clientSecret", "redirectUri"] as const;

    for (const setting of requiredSettings) {
      const original = mocks.config.auth.oidc[setting];
      mocks.config.auth.oidc[setting] = "";
      const response = await request(app).get("/api/auth/oidc/status");
      expect(response.body).toEqual({ enabled: false, provider: "generic" });
      mocks.config.auth.oidc[setting] = original;
    }

    const enabled = await request(app).get("/api/auth/oidc/status");
    expect(enabled.body).toEqual({ enabled: true, provider: "generic" });
    mocks.config.auth.oidc.provider = "apple";
    const apple = await request(app).get("/api/auth/oidc/status");
    expect(apple.body).toEqual({ enabled: true, provider: "apple" });
  });

  it("rejects login while OIDC is not configured", async () => {
    const response = await request(app).get("/api/auth/oidc/login");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "OIDC sign-in is not configured" });
  });

  it("starts a generic login with PKCE, required scopes, a safe return path, and a state cookie", async () => {
    configureOidc({ scopes: "openid profile,offline_access" });
    const { response, authorizationUrl, state } = await startLogin("/games?q=1#owned");

    expect(response.status).toBe(302);
    expect(authorizationUrl.searchParams.get("response_mode")).toBe("query");
    expect(authorizationUrl.searchParams.get("scope")).toBe("openid profile offline_access email");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe("challenge");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("state")).toBe(state);
    expect(response.headers["set-cookie"][0]).toContain(`questarr_oidc_state=${state}`);
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"][0]).toContain("Secure");
    expect(mocks.calculatePKCECodeChallenge).toHaveBeenCalledWith("verifier");
  });

  it("keeps return paths inside the configured base path", async () => {
    mocks.config.server.basePath = "/quest";
    configureOidc({
      redirectUri: "https://app.example/quest/api/auth/oidc/callback",
    });

    const allowed = await startLogin("/quest/games?sort=recent#top");
    expect(allowed.response.status).toBe(302);
    expect(mocks.buildAuthorizationUrl.mock.calls.at(-1)?.[1]).toMatchObject({
      state: allowed.state,
    });

    const blocked = await startLogin("/outside");
    expect(mocks.buildAuthorizationUrl.mock.calls.at(-1)?.[1]).toMatchObject({
      state: blocked.state,
    });
    const callbackState = blocked.state;
    mocks.claims.mockReturnValue({
      iss: "https://issuer.example",
      sub: "subject-1",
      email: "user@example.com",
      email_verified: true,
    });
    mocks.config.auth.oidc.allowAnyVerifiedUser = true;
    mocks.createUser.mockResolvedValue({
      id: "user-1",
      username: "oidc-user",
      passwordHash: "!oidc$generated",
    });
    const response = await completeGetCallback(callbackState, { code: "code" });
    expect(response.headers.location).toBe("/quest/");
  });

  it("rejects protocol-relative and backslash-host return paths", async () => {
    configureOidc();
    const protocolRelative = await startLogin("//evil.example/path");
    const authorization = protocolRelative.authorizationUrl;
    expect(authorization.searchParams.get("state")).toBe(protocolRelative.state);

    const backslashHost = await startLogin("/\\evil.example/path");
    const callbackState = backslashHost.state;
    mocks.config.auth.oidc.allowAnyVerifiedUser = true;
    mocks.createUser.mockResolvedValue({
      id: "user-1",
      username: "oidc-user",
      passwordHash: "!oidc$generated",
    });
    const response = await completeGetCallback(callbackState, { code: "code" });
    expect(response.headers.location).toBe("/");
  });

  it("uses Apple's form-post flow without PKCE and with its required cookie policy", async () => {
    configureOidc({
      issuerUrl: " https://appleid.apple.com ",
      redirectUri: "https://app.example/api/auth/oidc/callback",
      scopes: "profile",
    });
    const { response, authorizationUrl, state } = await startLogin("/games");

    expect(response.status).toBe(302);
    expect(authorizationUrl.searchParams.get("response_mode")).toBe("form_post");
    expect(authorizationUrl.searchParams.get("scope")).toBe("openid email");
    expect(authorizationUrl.searchParams.has("code_challenge")).toBe(false);
    expect(response.headers["set-cookie"][0]).toContain("SameSite=None");
    expect(response.headers["set-cookie"][0]).toContain("Secure");
    expect(state).toBe("state-1");
    expect(mocks.randomPKCECodeVerifier).not.toHaveBeenCalled();
  });

  it("returns to the login page and logs a bounded discovery failure", async () => {
    configureOidc();
    mocks.discovery.mockRejectedValueOnce(new Error("secret provider details"));
    const failed = await request(app).get("/api/auth/oidc/login");
    expect(failed.status).toBe(303);
    expect(failed.headers.location).toBe("/login?oidcFailed=true");
    expect(mocks.warn).toHaveBeenCalledWith(
      "OIDC sign-in could not start (provider_discovery_failed)"
    );

    const retry = await request(app).get("/api/auth/oidc/login");
    expect(retry.status).toBe(302);
    expect(mocks.discovery).toHaveBeenCalledTimes(2);
  });

  it("rejects callbacks when OIDC is disabled or a generic provider posts a form", async () => {
    const disabled = await request(app).get("/api/auth/oidc/callback");
    expect(disabled.status).toBe(404);

    configureOidc();
    const posted = await request(app)
      .post("/api/auth/oidc/callback")
      .type("form")
      .send({ state: "state-1", code: "code" });
    expect(posted.status).toBe(400);
    expect(posted.body).toEqual({
      error: "Form-post callbacks are reserved for Apple sign-in",
    });
  });

  it("rejects missing, unknown, mismatched, and expired transactions", async () => {
    configureOidc();
    const missing = await request(app).get("/api/auth/oidc/callback");
    expect(missing.headers.location).toBe("/login?oidcFailed=true");

    const unknown = await completeGetCallback("unknown", { code: "code" });
    expect(unknown.headers.location).toBe("/login?oidcFailed=true");

    const { state } = await startLogin();
    mocks.getCookie.mockReturnValue("different-state");
    const mismatched = await request(app)
      .get("/api/auth/oidc/callback")
      .query({ state, code: "code" });
    expect(mismatched.headers.location).toBe("/login?oidcFailed=true");

    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const expired = await startLogin();
    clock.mockReturnValue(1_000 + 10 * 60 * 1_000);
    const expiredCallback = await completeGetCallback(expired.state, {
      code: "code",
    });
    expect(expiredCallback.headers.location).toBe("/login?oidcFailed=true");
    clock.mockRestore();
  });

  it("rejects callback identities that are incomplete, unverified, or not admitted", async () => {
    configureOidc({ allowedEmails: "allowed@example.com" });
    const invalidClaims: Record<string, unknown>[] = [
      { sub: "subject", email: "allowed@example.com", email_verified: true },
      { iss: "https://issuer.example", email: "allowed@example.com", email_verified: true },
      {
        iss: "https://issuer.example",
        sub: "subject",
        email: "",
        email_verified: true,
      },
      {
        iss: "https://issuer.example",
        sub: "subject",
        email: "allowed@example.com",
        email_verified: false,
      },
      {
        iss: "https://issuer.example",
        sub: "subject",
        email: "other@example.com",
        email_verified: true,
      },
    ];

    for (const claims of invalidClaims) {
      mocks.claims.mockReturnValue(claims);
      const { state } = await startLogin();
      const response = await completeGetCallback(state, { code: "code" });
      expect(response.headers.location).toBe("/login?oidcFailed=true");
    }

    expect(mocks.getUserByUsername).not.toHaveBeenCalled();
  });

  it("normalizes allowlisted email addresses, creates an OIDC-only user, and sets a secure session", async () => {
    configureOidc({ allowedEmails: " ADMIN@EXAMPLE.COM ; second@example.org " });
    mocks.claims.mockReturnValue({
      iss: "https://issuer.example",
      sub: "subject-1",
      email: " Admin@Example.com ",
      email_verified: "true",
    });
    const { state } = await startLogin("/games?filter=owned#top");
    const response = await completeGetCallback(state, { code: "auth-code" });

    expect(response.status).toBe(303);
    expect(response.headers.location).toBe("/games?filter=owned#top");
    expect(mocks.getUserByUsername).toHaveBeenCalledWith(
      expect.stringMatching(/^oidc_[a-f0-9]{64}$/)
    );
    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: expect.stringMatching(/^oidc_[a-f0-9]{64}$/),
        passwordHash: expect.stringMatching(/^!oidc\$/),
      })
    );
    expect(mocks.generateToken).toHaveBeenCalled();
    expect(mocks.setAuthCookies).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      "signed-session-token",
      true
    );
  });

  it("admits verified users from an allowed email domain or the explicit any-user setting", async () => {
    configureOidc({ allowedEmailDomains: "EXAMPLE.COM;other.org" });
    const domainLogin = await startLogin();
    mocks.claims.mockReturnValue({
      iss: "https://issuer.example",
      sub: "domain-user",
      email: "member@example.com",
      email_verified: true,
    });
    const domainResponse = await completeGetCallback(domainLogin.state, {
      code: "code",
    });
    expect(domainResponse.headers.location).toBe("/");

    configureOidc({ allowAnyVerifiedUser: true });
    const anyUserLogin = await startLogin();
    mocks.claims.mockReturnValue({
      iss: "https://issuer.example",
      sub: "new-user",
      email: "new@unlisted.invalid",
      email_verified: true,
    });
    const anyUserResponse = await completeGetCallback(anyUserLogin.state, {
      code: "code",
    });
    expect(anyUserResponse.headers.location).toBe("/");
  });

  it("rejects a local account collision but reuses an existing OIDC-only account", async () => {
    configureOidc({ allowAnyVerifiedUser: true });
    const { state: localState } = await startLogin();
    mocks.getUserByUsername.mockResolvedValueOnce({
      id: "local-user",
      username: "oidc-local",
      passwordHash: "$2b$local-password-hash",
    });
    const local = await completeGetCallback(localState, { code: "code" });
    expect(local.headers.location).toBe("/login?oidcFailed=true");
    expect(mocks.createUser).not.toHaveBeenCalled();

    const { state: oidcState } = await startLogin();
    mocks.getUserByUsername.mockResolvedValueOnce({
      id: "oidc-user",
      username: "oidc-existing",
      passwordHash: "!oidc$existing",
    });
    const existing = await completeGetCallback(oidcState, { code: "code" });
    expect(existing.headers.location).toBe("/");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("recovers from a concurrent user-creation race and rejects a non-OIDC collision", async () => {
    configureOidc({ allowAnyVerifiedUser: true });
    const { state } = await startLogin();
    mocks.createUser.mockRejectedValueOnce(new Error("unique username race"));
    mocks.getUserByUsername.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      id: "race-user",
      username: "oidc-race",
      passwordHash: "!oidc$existing",
    });
    const response = await completeGetCallback(state, { code: "code" });
    expect(response.headers.location).toBe("/");

    const { state: collisionState } = await startLogin();
    mocks.createUser.mockRejectedValueOnce(new Error("unique username race"));
    mocks.getUserByUsername.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      id: "local-user",
      username: "oidc-collision",
      passwordHash: "$2b$local-password-hash",
    });
    const collision = await completeGetCallback(collisionState, { code: "code" });
    expect(collision.headers.location).toBe("/login?oidcFailed=true");
  });

  it("filters callback parameters and handles provider or session failures safely", async () => {
    configureOidc({ allowAnyVerifiedUser: true });
    const { state } = await startLogin();
    mocks.authorizationCodeGrant.mockRejectedValueOnce(
      new Error("provider supplied sensitive error details")
    );
    const failed = await completeGetCallback(state, {
      code: "bad-code",
      error: "access_denied",
      evil: "unexpected-value",
    });
    expect(failed.headers.location).toBe("/login?oidcFailed=true");
    const callbackUrl = mocks.authorizationCodeGrant.mock.calls[0]?.[1] as URL;
    expect(callbackUrl.searchParams.has("evil")).toBe(false);
    expect(mocks.warn).toHaveBeenCalledWith(
      "OIDC sign-in failed (callback_validation_or_session_failed)"
    );

    const { state: tokenState } = await startLogin();
    mocks.generateToken.mockRejectedValueOnce(new Error("session failure"));
    const tokenFailure = await completeGetCallback(tokenState, { code: "code" });
    expect(tokenFailure.headers.location).toBe("/login?oidcFailed=true");
  });

  it("bounds OIDC request bodies and copies bounded provider responses safely", async () => {
    configureOidc();
    await startLogin();
    const discoveryArgs = mocks.discovery.mock.calls[0] as unknown[];
    const discoveryOptions = discoveryArgs[4] as Record<PropertyKey, unknown>;
    const fetchProvider = discoveryOptions[mocks.customFetch] as (
      url: string,
      init: { method?: string; body?: unknown; headers?: HeadersInit }
    ) => Promise<Response>;

    const bodies: unknown[] = [
      undefined,
      null,
      "text",
      new URLSearchParams({ code: "abc" }),
      new ArrayBuffer(2),
      new Uint8Array([1, 2]),
      new DataView(new ArrayBuffer(2)),
    ];
    for (const body of bodies) {
      mocks.safeFetch.mockResolvedValueOnce(
        new Response("provider response", {
          headers: { "content-length": "17", "content-encoding": "identity" },
        })
      );
      const response = await fetchProvider("https://issuer.example/token", {
        method: "POST",
        body,
      });
      expect(await response.text()).toBe("provider response");
      expect(response.headers.has("content-length")).toBe(false);
      expect(response.headers.has("content-encoding")).toBe(false);
    }

    expect(mocks.safeFetch).toHaveBeenCalledWith(
      "https://issuer.example/token",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        maxRedirects: 0,
        timeoutMs: 15_000,
        requireHttps: true,
        allowPrivate: false,
      })
    );
  });

  it("rejects oversized, unbounded, and private provider requests unless configured", async () => {
    configureOidc();
    await startLogin();
    const discoveryArgs = mocks.discovery.mock.calls[0] as unknown[];
    const discoveryOptions = discoveryArgs[4] as Record<PropertyKey, unknown>;
    const fetchProvider = discoveryOptions[mocks.customFetch] as (
      url: string,
      init: { method?: string; body?: unknown }
    ) => Promise<Response>;

    await expect(
      fetchProvider("https://issuer.example/token", {
        method: "POST",
        body: "x".repeat(64 * 1024 + 1),
      })
    ).rejects.toThrow("OIDC provider request body is too large or unbounded");
    await expect(
      fetchProvider("https://issuer.example/token", {
        method: "POST",
        body: new FormData(),
      })
    ).rejects.toThrow("OIDC provider request body is too large or unbounded");
    expect(mocks.safeFetch).not.toHaveBeenCalled();

    mocks.safeFetch.mockResolvedValueOnce(new Response("ok"));
    await fetchProvider("https://issuer.example/token", { method: "GET" });
    expect(mocks.safeFetch).toHaveBeenCalledWith(
      "https://issuer.example/token",
      expect.objectContaining({ requireHttps: true, allowPrivate: false })
    );

    mocks.config.auth.oidc.allowPrivateIssuer = true;
    const privateLogin = await request(app).get("/api/auth/oidc/login");
    expect(privateLogin.status).toBe(302);
    const secondArgs = mocks.discovery.mock.calls[0] as unknown[];
    const secondOptions = secondArgs[4] as Record<PropertyKey, unknown>;
    const privateFetch = secondOptions[mocks.customFetch] as (
      url: string,
      init: { method?: string; body?: unknown }
    ) => Promise<Response>;
    mocks.safeFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const empty = await privateFetch("http://issuer.internal/token", {
      method: "GET",
    });
    expect(empty.status).toBe(204);
    expect(mocks.safeFetch).toHaveBeenLastCalledWith(
      "http://issuer.internal/token",
      expect.objectContaining({ requireHttps: false, allowPrivate: true })
    );
  });

  it("rejects provider responses exceeding either declared or streamed size limits", async () => {
    configureOidc();
    await startLogin();
    const discoveryArgs = mocks.discovery.mock.calls[0] as unknown[];
    const discoveryOptions = discoveryArgs[4] as Record<PropertyKey, unknown>;
    const fetchProvider = discoveryOptions[mocks.customFetch] as (
      url: string,
      init: { method?: string }
    ) => Promise<Response>;

    mocks.safeFetch.mockResolvedValueOnce(
      new Response("small", {
        headers: { "content-length": String((1 << 20) + 1) },
      })
    );
    await expect(
      fetchProvider("https://issuer.example/metadata", { method: "GET" })
    ).rejects.toThrow("OIDC provider response is too large");

    mocks.safeFetch.mockResolvedValueOnce(new Response("x".repeat((1 << 20) + 1)));
    await expect(
      fetchProvider("https://issuer.example/metadata", { method: "GET" })
    ).rejects.toThrow("OIDC provider response is too large");

    mocks.config.auth.oidc.clientSecret = "";
    await expect(
      fetchProvider("https://issuer.example/metadata", { method: "GET" })
    ).rejects.toThrow("OIDC is not configured");
  });

  it("evicts the oldest transaction when the bounded state map reaches its limit", async () => {
    configureOidc();
    let oldest = "";
    for (let index = 0; index < 257; index += 1) {
      const login = await startLogin();
      if (index === 0) oldest = login.state;
    }

    const response = await completeGetCallback(oldest, { code: "code" });
    expect(response.headers.location).toBe("/login?oidcFailed=true");
    expect(mocks.authorizationCodeGrant).not.toHaveBeenCalled();
  });
});
