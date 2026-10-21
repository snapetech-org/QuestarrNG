import { describe, expect, it } from "vitest";
import { getOidcProviderPresentation } from "../oidc-provider";

describe("getOidcProviderPresentation", () => {
  it("uses a known provider's local icon and setup guide", () => {
    expect(getOidcProviderPresentation("microsoft-entra")).toMatchObject({
      labelKey: "Microsoft Entra ID",
      icon: "microsoft",
      setupUrl: "https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc",
    });
    expect(getOidcProviderPresentation("apple-sign-in")).toMatchObject({
      labelKey: "Apple",
      icon: "apple",
      setupUrl:
        "https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple",
    });
  });

  it.each([
    [
      "fusionauth",
      "FusionAuth",
      "fusionauth",
      "https://fusionauth.io/docs/lifecycle/authenticate-users/oauth/",
    ],
    [
      "onelogin",
      "OneLogin",
      "onelogin",
      "https://developers.onelogin.com/docs/openid-connect/connect-to-onelogin/",
    ],
    [
      "pingone",
      "PingOne",
      "pingone",
      "https://docs.pingidentity.com/pingone/applications/p1_edit_application_oidc.html",
    ],
    ["jumpcloud", "JumpCloud", "jumpcloud", "https://jumpcloud.com/support/sso-with-oidc"],
  ])("returns branded provider presentation for %s", (id, label, icon, setupUrl) => {
    expect(getOidcProviderPresentation(id)).toMatchObject({ labelKey: label, icon, setupUrl });
  });

  it("falls back safely for unknown or non-string provider hints", () => {
    expect(getOidcProviderPresentation("<img src=x>")).toMatchObject({
      labelKey: "identity provider",
      icon: "generic",
    });
    expect(getOidcProviderPresentation(null).icon).toBe("generic");
  });
});
