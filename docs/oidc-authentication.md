# OpenID Connect sign-in

QuestarrNG supports server-side OpenID Connect Authorization Code sign-in
with PKCE for ordinary providers. Apple uses its documented form-post flow
without PKCE. The callback creates the normal QuestarrNG HttpOnly session and
does not expose provider tokens to the browser. Local username/password sign-in
and API keys remain available.

Configure all four required values for the QuestarrNG process:

```dotenv
QUESTARR_OIDC_ISSUER_URL=https://id.example.com/realms/questarr
QUESTARR_OIDC_CLIENT_ID=questarr
QUESTARR_OIDC_CLIENT_SECRET=replace-with-client-secret
QUESTARR_OIDC_REDIRECT_URI=https://games.example.com/api/auth/oidc/callback
QUESTARR_OIDC_ALLOWED_EMAILS=operator@example.com
QUESTARR_OIDC_PROVIDER=keycloak
```

`QUESTARR_OIDC_PROVIDER` is an optional display hint. Supported branded
presets are `google`, `microsoft-entra`, `okta`, `auth0`, `keycloak`,
`authentik`, `zitadel`, `amazon-cognito`, `gitlab`, `fusionauth`, `onelogin`,
`pingone`, `jumpcloud`, and `apple-sign-in`. It changes only the
login button label, local icon, and setup link; issuer discovery and validation
remain driven by `QUESTARR_OIDC_ISSUER_URL`. Unknown values use the generic
OpenID Connect presentation.

The redirect URI must exactly match the HTTPS callback registered with the
provider. If `QUESTARR_BASE_PATH` is set, include it before `/api` in the
registered redirect URI. Use the app's external HTTPS URL when it is behind a
reverse proxy, and configure `TRUST_PROXY` for the trusted proxy path.

The app requests `openid profile email`, requires `email_verified=true`, and
denies access by default. Exact email and domain allowlists are combined. With
no allowlist, nobody can sign in. Set
`QUESTARR_OIDC_ALLOW_ANY_VERIFIED_USER=true` only when every verified identity
should be able to create a separate QuestarrNG user account. OIDC identities
are keyed by `(issuer, subject)`; email does not link an identity to a local
password account. Each OIDC account gets its own QuestarrNG data and local
roles/ownership remain controlled by the app.

Optional settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `QUESTARR_OIDC_SCOPES` | `openid profile email` | Requested scopes; `openid` and `email` are always included. |
| `QUESTARR_OIDC_ALLOWED_EMAIL_DOMAINS` | empty | Comma, semicolon, or whitespace separated verified email domains. |
| `QUESTARR_OIDC_ALLOW_ANY_VERIFIED_USER` | `false` | Allows any verified email to create/sign into a local account. |
| `QUESTARR_OIDC_ALLOW_PRIVATE_ISSUER` | `false` | Allows the provider issuer to use private HTTP endpoints; the browser callback must stay HTTPS. |

OIDC transaction state is short-lived and consumed once. Provider requests use
bounded timeouts and response sizes and reject redirects. Provider tokens are
not saved in the QuestarrNG session. See the
[shared cross-project OIDC contract](https://github.com/snapetech-org/seerrng/blob/main/docs/maintainers/oidc-cross-project-template.md)
for the common behavior and field semantics.

### Sign in with Apple

Set `QUESTARR_OIDC_ISSUER_URL` to exactly `https://appleid.apple.com`, use the
Apple Services ID as `QUESTARR_OIDC_CLIENT_ID`, and set
`QUESTARR_OIDC_CLIENT_SECRET` to the signed client-secret JWT. Register the
exact HTTPS callback `https://<public-host>/api/auth/oidc/callback`. QuestarrNG
requests only `openid email`, uses `response_mode=form_post`, and omits PKCE for
Apple's documented web flow. Apple may encode `email_verified` as a boolean or
string; only `true` is admitted. Rotate the JWT before its six-month maximum
expiry. See Apple's [environment setup](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple)
and [web authorization flow](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms).
