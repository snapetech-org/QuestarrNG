/** Metadata is emitted only at the app-owned message construction site. */
export const SERVICE_MESSAGE_SOURCES = {
  "service.connected_successfully": "Connected successfully to {client}",
  "service.connected_successfully_version": "Connected successfully to {client} {version}",
  "service.connected_version": "Connected to {client} v{version}",
  "service.connected_named": "Successfully connected to {name}",
  "service.connection_failed": "Failed to connect to {client}: {error}",
  "service.connection_failed_at": "Failed to connect to {client} at {url}: {error}",
  "service.json_catalog_valid": "Valid JSON catalog with {count} releases",
  "service.realdebrid_connected":
    "Connected to Real-Debrid. Downloads will be copied into QuestarrNG at {path}.",
  "service.realdebrid_connected_user":
    "Connected to Real-Debrid as {username}. Downloads will be copied into QuestarrNG at {path}.",
} as const;
export type ServiceMessageKey = keyof typeof SERVICE_MESSAGE_SOURCES;
export type ServiceMessageValues = Record<string, string | number>;
export interface ServiceMessageMetadata {
  messageKey?: ServiceMessageKey;
  messageValues?: ServiceMessageValues;
}
export interface ServiceMessageResult extends ServiceMessageMetadata {
  success: boolean;
  message: string;
}
export function isServiceMessageKey(value: unknown): value is ServiceMessageKey {
  return typeof value === "string" && Object.hasOwn(SERVICE_MESSAGE_SOURCES, value);
}
export function serviceMessage(key: ServiceMessageKey, values: ServiceMessageValues) {
  const message = SERVICE_MESSAGE_SOURCES[key].replace(
    /\{([a-z]+)\}/g,
    (_placeholder, name: string) => {
      const value = values[name];
      if (value === undefined) throw new Error(`Missing service message value: ${name}`);
      return String(value);
    }
  );
  return { message, messageKey: key, messageValues: values };
}
