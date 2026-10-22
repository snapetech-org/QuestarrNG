export type OidcProviderPresentation = {
  labelKey: string;
  icon: string;
  setupUrl: string;
};

const GENERIC_PROVIDER: OidcProviderPresentation = {
  labelKey: "identity provider",
  icon: "generic",
  setupUrl: "https://openid.net/developers/how-connect-works/",
};

const PROVIDERS: Record<string, OidcProviderPresentation> = {
  google: {
    labelKey: "Google",
    icon: "google",
    setupUrl: "https://developers.google.com/identity/openid-connect/openid-connect",
  },
  "microsoft-entra": {
    labelKey: "Microsoft Entra ID",
    icon: "microsoft",
    setupUrl: "https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc",
  },
  okta: {
    labelKey: "Okta",
    icon: "okta",
    setupUrl: "https://developer.okta.com/docs/guides/implement-grant-type/authcodepkce/main/",
  },
  auth0: {
    labelKey: "Auth0",
    icon: "auth0",
    setupUrl:
      "https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow",
  },
  keycloak: {
    labelKey: "Keycloak",
    icon: "keycloak",
    setupUrl: "https://www.keycloak.org/docs/latest/server_admin/",
  },
  authentik: {
    labelKey: "authentik",
    icon: "authentik",
    setupUrl:
      "https://docs.goauthentik.io/add-secure-apps/providers/oauth2/create-oauth2-provider/",
  },
  zitadel: {
    labelKey: "ZITADEL",
    icon: "zitadel",
    setupUrl: "https://zitadel.com/docs/guides/integrate/login/oidc/oauth-recommended-flows",
  },
  "amazon-cognito": {
    labelKey: "Amazon Cognito",
    icon: "amazon-cognito",
    setupUrl: "https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html",
  },
  "apple-sign-in": {
    labelKey: "Apple",
    icon: "apple",
    setupUrl:
      "https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple",
  },
  gitlab: {
    labelKey: "GitLab",
    icon: "gitlab",
    setupUrl: "https://docs.gitlab.com/integration/openid_connect_provider/",
  },
  fusionauth: {
    labelKey: "FusionAuth",
    icon: "fusionauth",
    setupUrl: "https://fusionauth.io/docs/lifecycle/authenticate-users/oauth/",
  },
  onelogin: {
    labelKey: "OneLogin",
    icon: "onelogin",
    setupUrl: "https://developers.onelogin.com/docs/openid-connect/connect-to-onelogin/",
  },
  pingone: {
    labelKey: "PingOne",
    icon: "pingone",
    setupUrl: "https://docs.pingidentity.com/pingone/applications/p1_edit_application_oidc.html",
  },
  jumpcloud: {
    labelKey: "JumpCloud",
    icon: "jumpcloud",
    setupUrl: "https://jumpcloud.com/support/sso-with-oidc",
  },
};

export function getOidcProviderPresentation(provider: unknown): OidcProviderPresentation {
  if (typeof provider !== "string") return GENERIC_PROVIDER;
  const key = provider.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PROVIDERS, key)
    ? (PROVIDERS[key] ?? GENERIC_PROVIDER)
    : GENERIC_PROVIDER;
}
