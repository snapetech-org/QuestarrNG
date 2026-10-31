import {
  SERVICE_MESSAGE_SOURCES,
  SERVICE_MESSAGE_TRANSLATIONS,
  type ServiceMessageKey,
} from "./service-message-catalog.js";
import { normalizeNotificationLanguage } from "./notification-language.js";
export { SERVICE_MESSAGE_SOURCES, type ServiceMessageKey } from "./service-message-catalog.js";
export type ServiceMessageValues = Record<string, string | number>;
export interface ServiceMessageDescriptor {
  messageKey: ServiceMessageKey;
  messageValues: ServiceMessageValues;
  messageDetails?: Record<string, ServiceMessageDescriptor>;
}
export interface ServiceMessageMetadata {
  messageKey?: ServiceMessageKey;
  messageValues?: ServiceMessageValues;
  messageDetails?: Record<string, ServiceMessageDescriptor>;
}
export interface ServiceMessageFragment extends ServiceMessageDescriptor {
  message: string;
}
export interface ServiceMessageResult extends ServiceMessageMetadata {
  success: boolean;
  message: string;
}
type Parameters = Record<string, string | number | ServiceMessageFragment>;
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;
export function isServiceMessageKey(value: unknown): value is ServiceMessageKey {
  return typeof value === "string" && Object.hasOwn(SERVICE_MESSAGE_SOURCES, value);
}
function sourceText(key: ServiceMessageKey, values: ServiceMessageValues): string {
  return SERVICE_MESSAGE_SOURCES[key].replace(PLACEHOLDER, (_placeholder, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) throw new Error(`Missing service message value: ${name}`);
    return String(value);
  });
}
/** Only app-owned constructors attach metadata; arbitrary Error/provider text stays raw. */
export function serviceMessage(
  key: ServiceMessageKey,
  parameters: Parameters
): ServiceMessageFragment {
  const values: ServiceMessageValues = {};
  const details: Record<string, ServiceMessageDescriptor> = Object.create(null);
  for (const match of SERVICE_MESSAGE_SOURCES[key].matchAll(PLACEHOLDER)) {
    const name = match[1]!;
    const value = parameters[name];
    if (value === undefined) throw new Error(`Missing service message value: ${name}`);
    if (typeof value === "object") {
      const descriptor = parseServiceMessageDescriptor(value);
      if (
        !descriptor ||
        sourceText(descriptor.messageKey, descriptor.messageValues) !== value.message
      )
        throw new Error("Invalid nested app message");
      values[name] = value.message;
      details[name] = descriptor;
    } else values[name] = value;
  }
  return {
    message: sourceText(key, values),
    messageKey: key,
    messageValues: values,
    ...(Object.keys(details).length ? { messageDetails: details } : {}),
  };
}
export class ServiceMessageError extends Error implements ServiceMessageDescriptor {
  readonly messageKey: ServiceMessageKey;
  readonly messageValues: ServiceMessageValues;
  readonly messageDetails?: Record<string, ServiceMessageDescriptor>;
  constructor(key: ServiceMessageKey, values: Parameters, options?: ErrorOptions) {
    const fragment = serviceMessage(key, values);
    super(fragment.message, options);
    this.name = "ServiceMessageError";
    this.messageKey = fragment.messageKey;
    this.messageValues = fragment.messageValues;
    if (fragment.messageDetails) this.messageDetails = fragment.messageDetails;
  }
}
export function serviceErrorValue(error: unknown): string | ServiceMessageFragment {
  if (error instanceof ServiceMessageError)
    return { message: error.message, ...serviceErrorMetadata(error) } as ServiceMessageFragment;
  return error instanceof Error
    ? error.message
    : serviceMessage("interface.unknown_error_ce512b43", {});
}
export function serviceErrorMetadata(error: unknown): ServiceMessageMetadata {
  if (!(error instanceof ServiceMessageError)) return {};
  return {
    messageKey: error.messageKey,
    messageValues: error.messageValues,
    ...(error.messageDetails ? { messageDetails: error.messageDetails } : {}),
  };
}
/** Only app-owned error classes carry descriptors; provider Error text stays opaque. */
export function serviceErrorResult(
  error: unknown,
  fallback: ServiceMessageFragment
): ServiceMessageResult {
  if (error instanceof Error)
    return { success: false, message: error.message, ...serviceErrorMetadata(error) };
  return { success: false, ...fallback };
}
/** A nullable descriptor explicitly distinguishes raw provider errors from legacy API text. */
export function serviceErrorBody(error: unknown, fallback: ServiceMessageFragment) {
  const result = serviceErrorResult(error, fallback);
  return {
    error: result.message,
    errorI18n: serializeServiceMessageDescriptor(result),
  };
}
/** Nullable persisted metadata is optional; old rows and invalid JSON retain raw text. */
export function parseServiceMessageDescriptor(
  value: unknown,
  depth = 0
): ServiceMessageDescriptor | undefined {
  if (depth > 4) return undefined;
  if (typeof value === "string") {
    if (value.length > 131072) return undefined;
    try {
      return parseServiceMessageDescriptor(JSON.parse(value), depth);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const key = data.messageKey;
  const raw = data.messageValues;
  if (!isServiceMessageKey(key) || !raw || typeof raw !== "object" || Array.isArray(raw))
    return undefined;
  const values = Object.fromEntries(Object.entries(raw));
  if (
    !Object.values(values).every(
      (v) => typeof v === "string" || (typeof v === "number" && Number.isFinite(v))
    )
  )
    return undefined;
  const params = values as ServiceMessageValues;
  try {
    sourceText(key, params);
  } catch {
    return undefined;
  }
  const details: Record<string, ServiceMessageDescriptor> = Object.create(null);
  if (data.messageDetails !== undefined) {
    if (
      !data.messageDetails ||
      typeof data.messageDetails !== "object" ||
      Array.isArray(data.messageDetails)
    )
      return undefined;
    for (const [name, nested] of Object.entries(data.messageDetails)) {
      const descriptor = parseServiceMessageDescriptor(nested, depth + 1);
      if (
        !descriptor ||
        sourceText(descriptor.messageKey, descriptor.messageValues) !== params[name]
      )
        return undefined;
      details[name] = descriptor;
    }
  }
  return {
    messageKey: key,
    messageValues: params,
    ...(Object.keys(details).length ? { messageDetails: details } : {}),
  };
}
export function matchingServiceMessageDescriptor(
  message: string,
  metadata: unknown
): ServiceMessageDescriptor | undefined {
  const descriptor = parseServiceMessageDescriptor(metadata);
  return descriptor && sourceText(descriptor.messageKey, descriptor.messageValues) === message
    ? descriptor
    : undefined;
}

export function serializeServiceMessageDescriptor(value: unknown): string | null {
  const descriptor = parseServiceMessageDescriptor(value);
  return descriptor ? JSON.stringify(descriptor) : null;
}
/** Translate only an exact source/key/value match, including explicitly tagged nested details. */
export function localizeServiceMessage(
  message: string,
  metadata: unknown,
  locale: unknown
): string {
  const language = normalizeNotificationLanguage(locale);
  if (language === "en") return message;
  const descriptor = parseServiceMessageDescriptor(metadata);
  if (!descriptor || sourceText(descriptor.messageKey, descriptor.messageValues) !== message)
    return message;
  const template = SERVICE_MESSAGE_TRANSLATIONS[descriptor.messageKey][language];
  if (!template || template === SERVICE_MESSAGE_SOURCES[descriptor.messageKey]) return message;
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    const raw = descriptor.messageValues[name];
    if (raw === undefined) return placeholder;
    const nested = descriptor.messageDetails?.[name];
    const value = nested
      ? localizeServiceMessage(String(raw), nested, language)
      : name === "count" && typeof raw === "number"
        ? new Intl.NumberFormat(language).format(raw)
        : String(raw);
    return language === "ar" ? `\u2068${value}\u2069` : value;
  });
}
