import { ServiceMessageError } from "../../shared/service-messages.js";
import { randomUUID } from "node:crypto";
import type { Downloader } from "../../shared/schema.js";
import { storage } from "../storage.js";
import { safeFetch } from "../ssrf.js";

const OAUTH_BASE_URL = "https://api.real-debrid.com/oauth/v2";
// Real-Debrid publishes this client for open source applications and grants
// per-account client credentials through its device authorization workflow.
const OPEN_SOURCE_CLIENT_ID = "X245A4XAIBGVM";
const DEVICE_GRANT_TYPE = "http://oauth.net/grant_type/device/1.0";

interface RealDebridCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface RealDebridTokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

interface PendingDeviceAuth {
  downloaderId: string;
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  intervalSeconds: number;
  expiresAt: number;
  nextPollAt: number;
  polling: boolean;
}

const pendingDeviceAuth = new Map<string, PendingDeviceAuth>();
const accessTokenCache = new Map<
  string,
  { token: string; expiresAt: number; credentials: RealDebridCredentials }
>();
const accessTokenRequests = new Map<string, Promise<string>>();

const parseCredentials = (password: string | null | undefined): RealDebridCredentials | null => {
  if (!password) return null;
  try {
    const value = JSON.parse(password) as Partial<RealDebridCredentials>;
    if (
      typeof value.clientId === "string" &&
      typeof value.clientSecret === "string" &&
      typeof value.refreshToken === "string"
    ) {
      return {
        clientId: value.clientId,
        clientSecret: value.clientSecret,
        refreshToken: value.refreshToken,
      };
    }
  } catch {
    return null;
  }
  return null;
};

const postForm = async <T>(url: string, form: URLSearchParams): Promise<T> => {
  const response = await safeFetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    timeoutMs: 15000,
    requireHttps: true,
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (!response.ok) {
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      throw new Error(body.error.slice(0, 160));
    }
    throw new ServiceMessageError("service.realdebrid_authorization_failed", {});
  }
  return body as T;
};

const exchangeRefreshToken = async (
  credentials: RealDebridCredentials
): Promise<RealDebridTokenResponse> =>
  postForm<RealDebridTokenResponse>(
    `${OAUTH_BASE_URL}/token`,
    new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code: credentials.refreshToken,
      grant_type: DEVICE_GRANT_TYPE,
    })
  );

export async function getRealDebridAccessToken(downloader: Downloader): Promise<string> {
  let credentials = parseCredentials(downloader.password);
  if (!credentials) {
    accessTokenCache.delete(downloader.id);
    throw new ServiceMessageError("service.realdebrid_connect_account_required", {});
  }
  const cached = accessTokenCache.get(downloader.id);
  if (
    cached &&
    cached.expiresAt > Date.now() + 60_000 &&
    cached.credentials.clientId === credentials.clientId &&
    cached.credentials.clientSecret === credentials.clientSecret &&
    cached.credentials.refreshToken === credentials.refreshToken
  ) {
    return cached.token;
  }
  const pending = accessTokenRequests.get(downloader.id);
  if (pending) return pending;

  const request = (async () => {
    let token: RealDebridTokenResponse;
    try {
      token = await exchangeRefreshToken(credentials!);
    } catch {
      throw new ServiceMessageError("service.realdebrid_authorization_expired", {});
    }
    if (
      typeof token.access_token !== "string" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in! <= 0
    ) {
      throw new ServiceMessageError("service.realdebrid_access_token_missing", {});
    }
    if (
      typeof token.refresh_token === "string" &&
      token.refresh_token !== credentials!.refreshToken
    ) {
      credentials = { ...credentials!, refreshToken: token.refresh_token };
      const saved = await storage.updateDownloader(downloader.id, {
        password: JSON.stringify(credentials),
      });
      if (!saved) throw new ServiceMessageError("service.realdebrid_account_save_failed", {});
      // Keep this client snapshot in sync with the persisted rotating token so
      // later calls in the same manager cycle can continue using the cache.
      downloader.password = JSON.stringify(credentials);
    }
    const expiresAt = Date.now() + token.expires_in! * 1000;
    accessTokenCache.set(downloader.id, {
      token: token.access_token,
      expiresAt,
      credentials: credentials!,
    });
    return token.access_token;
  })();
  accessTokenRequests.set(downloader.id, request);
  try {
    return await request;
  } finally {
    if (accessTokenRequests.get(downloader.id) === request) {
      accessTokenRequests.delete(downloader.id);
    }
  }
}

export async function startRealDebridDeviceAuth(downloaderId: string) {
  const url = new URL(`${OAUTH_BASE_URL}/device/code`);
  url.searchParams.set("client_id", OPEN_SOURCE_CLIENT_ID);
  url.searchParams.set("new_credentials", "yes");
  const response = await safeFetch(url.toString(), {
    timeoutMs: 15000,
    requireHttps: true,
  });
  if (!response.ok)
    throw new ServiceMessageError("service.realdebrid_authorization_start_failed", {});
  const payload = (await response.json()) as {
    device_code?: unknown;
    user_code?: unknown;
    verification_url?: unknown;
    interval?: unknown;
    expires_in?: unknown;
  };
  const verification =
    typeof payload.verification_url === "string" ? new URL(payload.verification_url) : null;
  if (
    typeof payload.device_code !== "string" ||
    typeof payload.user_code !== "string" ||
    !verification ||
    verification.protocol !== "https:" ||
    verification.hostname !== "real-debrid.com" ||
    !Number.isFinite(payload.interval) ||
    !Number.isFinite(payload.expires_in)
  ) {
    throw new ServiceMessageError("service.realdebrid_authorization_details_incomplete", {});
  }
  const handle = randomUUID();
  const intervalSeconds = Math.max(2, Math.min(30, Math.floor(Number(payload.interval))));
  const expiresAt = Date.now() + Math.max(60, Number(payload.expires_in)) * 1000;
  pendingDeviceAuth.set(handle, {
    downloaderId,
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUrl: verification.toString(),
    intervalSeconds,
    expiresAt,
    nextPollAt: 0,
    polling: false,
  });
  return {
    handle,
    userCode: payload.user_code,
    verificationUrl: verification.toString(),
    intervalSeconds,
    expiresIn: Math.floor((expiresAt - Date.now()) / 1000),
  };
}

export async function pollRealDebridDeviceAuth(
  downloader: Downloader,
  handle: string
): Promise<{ status: "pending" | "connected"; waitSeconds?: number }> {
  const state = pendingDeviceAuth.get(handle);
  if (!state || state.downloaderId !== downloader.id) {
    throw new ServiceMessageError("service.realdebrid_authorization_session_expired", {});
  }
  if (Date.now() >= state.expiresAt) {
    pendingDeviceAuth.delete(handle);
    throw new ServiceMessageError("service.realdebrid_authorization_code_expired", {});
  }
  if (state.polling || Date.now() < state.nextPollAt) {
    return {
      status: "pending",
      waitSeconds: Math.max(1, Math.ceil((state.nextPollAt - Date.now()) / 1000)),
    };
  }

  state.polling = true;
  state.nextPollAt = Date.now() + state.intervalSeconds * 1000;
  try {
    const credentialsUrl = new URL(`${OAUTH_BASE_URL}/device/credentials`);
    credentialsUrl.searchParams.set("client_id", OPEN_SOURCE_CLIENT_ID);
    credentialsUrl.searchParams.set("code", state.deviceCode);
    const response = await safeFetch(credentialsUrl.toString(), {
      timeoutMs: 15000,
      requireHttps: true,
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        return { status: "pending", waitSeconds: state.intervalSeconds };
      }
      throw new ServiceMessageError("service.realdebrid_authorization_check_failed", {});
    }
    const credentialResponse = (await response.json()) as {
      client_id?: unknown;
      client_secret?: unknown;
    };
    if (
      typeof credentialResponse.client_id !== "string" ||
      typeof credentialResponse.client_secret !== "string"
    ) {
      throw new ServiceMessageError("service.realdebrid_credentials_missing", {});
    }
    const credentials = {
      clientId: credentialResponse.client_id,
      clientSecret: credentialResponse.client_secret,
      refreshToken: "",
    };
    const token = await postForm<RealDebridTokenResponse>(
      `${OAUTH_BASE_URL}/token`,
      new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code: state.deviceCode,
        grant_type: DEVICE_GRANT_TYPE,
      })
    );
    if (typeof token.refresh_token !== "string" || !token.refresh_token) {
      throw new ServiceMessageError("service.realdebrid_refresh_token_missing", {});
    }
    credentials.refreshToken = token.refresh_token;
    const saved = await storage.updateDownloader(downloader.id, {
      password: JSON.stringify(credentials),
    });
    if (!saved) throw new ServiceMessageError("service.realdebrid_credentials_save_failed", {});
    accessTokenCache.delete(downloader.id);
    pendingDeviceAuth.delete(handle);
    return { status: "connected" };
  } finally {
    state.polling = false;
  }
}
