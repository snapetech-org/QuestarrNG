import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Downloader } from "../../shared/schema.js";
import { ServiceMessageError, serviceErrorMetadata } from "../../shared/service-messages.js";

const mocks = vi.hoisted(() => ({
  safeFetch: vi.fn(),
  updateDownloader: vi.fn(),
}));

vi.mock("../ssrf.js", () => ({ safeFetch: mocks.safeFetch }));
vi.mock("../storage.js", () => ({ storage: { updateDownloader: mocks.updateDownloader } }));

import {
  getRealDebridAccessToken,
  pollRealDebridDeviceAuth,
  startRealDebridDeviceAuth,
} from "./realdebrid-auth.js";

describe("Real-Debrid account authorization", () => {
  it("tags the fixed missing-account condition without changing its English text", async () => {
    const error = await getRealDebridAccessToken({
      id: "rd-typed-missing-account",
      password: null,
    } as Downloader).catch((value) => value);
    expect(error).toBeInstanceOf(ServiceMessageError);
    expect(error.message).toBe(
      "Connect a Real-Debrid account in Downloaders before using this client."
    );
    expect(serviceErrorMetadata(error)).toEqual({
      messageKey: "service.realdebrid_connect_account_required",
      messageValues: {},
    });
  });

  it.each([true, false])("keeps OAuth provider error ownership distinct: %s", async (provider) => {
    const id = `rd-provider-ownership-${provider}`;
    const text = "Real-Debrid did not return a refresh token.";
    mocks.safeFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            device_code: "device-code",
            user_code: "USER-CODE",
            verification_url: "https://real-debrid.com/device",
            interval: 5,
            expires_in: 1800,
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ client_id: "client", client_secret: "secret" }))
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(provider ? { error: text } : {}), { status: 400 })
      );
    const authorization = await startRealDebridDeviceAuth(id);
    const error = await pollRealDebridDeviceAuth({ id } as Downloader, authorization.handle).catch(
      (value) => value
    );
    expect(error).toBeInstanceOf(Error);
    if (provider) {
      expect(error).not.toBeInstanceOf(ServiceMessageError);
      expect(error.message).toBe(text);
      expect(serviceErrorMetadata(error)).toEqual({});
    } else {
      expect(error).toBeInstanceOf(ServiceMessageError);
      expect(error.message).toBe("Real-Debrid authorization failed.");
      expect(serviceErrorMetadata(error)).toMatchObject({
        messageKey: "service.realdebrid_authorization_failed",
      });
    }
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateDownloader.mockResolvedValue({ id: "rd-auth-test" });
  });

  it("uses open-source device credentials and stores the account-bound refresh token", async () => {
    const downloaderId = "rd-oauth-success";
    mocks.safeFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            device_code: "device-code-value",
            user_code: "USER-CODE",
            verification_url: "https://real-debrid.com/device",
            interval: 5,
            expires_in: 1800,
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ client_id: "account-client-id", client_secret: "bound-secret" })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token",
            expires_in: 3600,
            refresh_token: "account-refresh-token",
          })
        )
      );

    const authorization = await startRealDebridDeviceAuth(downloaderId);
    expect(authorization).toMatchObject({ userCode: "USER-CODE", intervalSeconds: 5 });
    const deviceUrl = new URL(String(mocks.safeFetch.mock.calls[0]?.[0]));
    expect(deviceUrl.pathname).toBe("/oauth/v2/device/code");
    expect(deviceUrl.searchParams.get("new_credentials")).toBe("yes");

    const result = await pollRealDebridDeviceAuth(
      { id: downloaderId } as Downloader,
      authorization.handle
    );

    expect(result).toEqual({ status: "connected" });
    expect(mocks.safeFetch).toHaveBeenCalledTimes(3);
    const credentialUrl = new URL(String(mocks.safeFetch.mock.calls[1]?.[0]));
    expect(credentialUrl.pathname).toBe("/oauth/v2/device/credentials");
    expect(credentialUrl.searchParams.get("code")).toBe("device-code-value");
    expect(mocks.safeFetch.mock.calls[2]?.[1]).toMatchObject({
      method: "POST",
      body: expect.stringContaining("code=device-code-value"),
    });
    expect(mocks.updateDownloader).toHaveBeenCalledWith(downloaderId, {
      password: JSON.stringify({
        clientId: "account-client-id",
        clientSecret: "bound-secret",
        refreshToken: "account-refresh-token",
      }),
    });
  });

  it("reuses the cached access token only while the saved credentials still match", async () => {
    const downloaderId = "rd-token-cache-test";
    const password = JSON.stringify({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
    mocks.safeFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "cached-access-token", expires_in: 3600 }), {
        status: 200,
      })
    );

    await expect(
      getRealDebridAccessToken({ id: downloaderId, password } as Downloader)
    ).resolves.toBe("cached-access-token");
    await expect(
      getRealDebridAccessToken({ id: downloaderId, password: null } as Downloader)
    ).rejects.toThrow("Connect a Real-Debrid account");
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a rotated refresh token on the downloader snapshot for later calls", async () => {
    const downloader = {
      id: "rd-rotating-token-test",
      password: JSON.stringify({
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "refresh-token-before-rotation",
      }),
    } as Downloader;
    mocks.safeFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "rotated-access-token",
          expires_in: 3600,
          refresh_token: "refresh-token-after-rotation",
        }),
        { status: 200 }
      )
    );

    await expect(getRealDebridAccessToken(downloader)).resolves.toBe("rotated-access-token");
    expect(JSON.parse(downloader.password ?? "{}")).toMatchObject({
      refreshToken: "refresh-token-after-rotation",
    });
    await expect(getRealDebridAccessToken(downloader)).resolves.toBe("rotated-access-token");
    expect(mocks.safeFetch).toHaveBeenCalledTimes(1);
  });
});
