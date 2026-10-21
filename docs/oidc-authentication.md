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

| Variable                                | Default                | Purpose                                                                                         |
| --------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `QUESTARR_OIDC_SCOPES`                  | `openid profile email` | Requested scopes; `openid` and `email` are always included.                                     |
| `QUESTARR_OIDC_ALLOWED_EMAIL_DOMAINS`   | empty                  | Comma, semicolon, or whitespace separated verified email domains.                               |
| `QUESTARR_OIDC_ALLOW_ANY_VERIFIED_USER` | `false`                | Allows any verified email to create/sign into a local account.                                  |
| `QUESTARR_OIDC_ALLOW_PRIVATE_ISSUER`    | `false`                | Allows the provider issuer to use private HTTP endpoints; the browser callback must stay HTTPS. |

OIDC transaction state is short-lived, consumed once, and stored in a distinct
HttpOnly cookie for each pending sign-in. Up to 16 attempts can be active at
once; further attempts are rejected until an earlier one completes or expires.
The callback accepts the normal provider GET response and Apple's URL-encoded
POST response; reverse proxies must preserve the method and form body.
Provider requests use bounded timeouts and response sizes and reject redirects.
Provider tokens are not saved in the QuestarrNG session. See the
[shared cross-project OIDC contract](https://github.com/snapetech-org/seerrng/blob/main/docs/maintainers/oidc-cross-project-template.md)
for the common behavior and field semantics. The
[provider catalog](https://github.com/snapetech-org/seerrng/blob/main/docs/maintainers/oidc-provider-catalog.md)
has all provider IDs, official setup links, issuer examples, and claim notes.

## Sign in with Apple

Set `QUESTARR_OIDC_ISSUER_URL` to exactly `https://appleid.apple.com`, use the
Apple Services ID as `QUESTARR_OIDC_CLIENT_ID`, and set
`QUESTARR_OIDC_CLIENT_SECRET` to the signed client-secret JWT. Register the
exact HTTPS callback `https://<public-host>/api/auth/oidc/callback`. QuestarrNG
requests only `openid email`, uses `response_mode=form_post`, and omits PKCE for
Apple's documented web flow. Apple may encode `email_verified` as a boolean or
string; only `true` is admitted. Rotate the JWT before its six-month maximum
expiry. See Apple's [environment setup](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple)
and [web authorization flow](https://developer.apple.com/documentation/signinwithapple/incorporating-sign-in-with-apple-into-other-platforms).

## Enable, verify, and recover

Configure the issuer, client ID, client secret, and public redirect URI as one
set. Keep the secret in the QuestarrNG process environment or deployment secret
store. Register only the exact HTTPS URL ending
`/api/auth/oidc/callback`; if `QUESTARR_BASE_PATH` is set, include it before
`/api`. The external URL, proxy forwarding, configured redirect URI, and
provider registration must all describe the same public address.

An exact email or domain allow-list admits that verified identity. With
`QUESTARR_OIDC_ALLOW_ANY_VERIFIED_USER=true`, any provider identity with a
verified email can create or access its own QuestarrNG account. Each account is
keyed from `(issuer, subject)` and is separate from a password account even
when the emails match. Review user access using QuestarrNG's local controls;
provider groups do not assign local privileges.

Test with one admitted address and one denied address before allowing normal
users to use the button. Confirm the correct QuestarrNG user is created or
reused, and confirm local password/API-key sign-in still works. To disable
OIDC, remove the `QUESTARR_OIDC_*` provider settings from the service
environment and apply the normal deployment change. Starting a new login is
the recovery action for an expired or interrupted callback.

## Troubleshooting

| Symptom                                            | Check                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Provider rejects the redirect                      | Match `QUESTARR_OIDC_REDIRECT_URI` exactly, including scheme, host, port, base path, and `/api/auth/oidc/callback`.                                                                  |
| Provider discovery or validation fails             | Use the exact issuer from discovery metadata and the intended tenant/realm. Confirm outbound DNS/HTTPS and enable private issuer access only for a trusted internal endpoint.        |
| A valid user is rejected                           | Check email scope and provider claim mapping, affirmative `email_verified`, the normalized email/domain list, and whether allow-any is intentionally enabled.                        |
| Callback state/nonce or cookie validation fails    | Retry in the same browser and public hostname; confirm the reverse proxy reports the external HTTPS scheme and host, preserves cookies, and has the configured trusted-proxy policy. |
| A second local account appeared for the same email | QuestarrNG keys OIDC users by issuer and subject; it does not merge identities by email. Use the intended issuer/client identity and do not expect automatic linking.                |
| Apple returns an error                             | Check the Services ID, exact issuer, callback, `form_post` cookie handling, `openid email`, and client-secret JWT expiration.                                                        |

For support, include QuestarrNG's version, provider ID, redacted issuer host,
callback path, and timestamp. Never include secrets, tokens, authorization
codes, or raw ID-token claims.
