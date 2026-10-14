export const API_ERROR_CODE_BY_STATUS = {
  400: "api.bad_request",
  401: "api.unauthorized",
  403: "api.forbidden",
  404: "api.not_found",
  409: "api.conflict",
  422: "api.invalid_data",
  429: "api.rate_limited",
  502: "api.upstream_unavailable",
  503: "api.service_unavailable",
} as const;

export type ApiErrorCode =
  | (typeof API_ERROR_CODE_BY_STATUS)[keyof typeof API_ERROR_CODE_BY_STATUS]
  | "api.server_error"
  | "api.request_failed";

export function apiErrorCodeForStatus(status: number): ApiErrorCode {
  const known = Object.hasOwn(API_ERROR_CODE_BY_STATUS, status)
    ? API_ERROR_CODE_BY_STATUS[status as keyof typeof API_ERROR_CODE_BY_STATUS]
    : undefined;
  if (known) return known;
  return status >= 500 ? "api.server_error" : "api.request_failed";
}
