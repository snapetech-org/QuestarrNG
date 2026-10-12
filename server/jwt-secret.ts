const LEGACY_DEFAULT_JWT_SECRET = "questarr-default-secret-change-me";

/** HS256 needs a key of at least 256 bits; operators must also use random input. */
export function isStrongJwtSecret(value: string): boolean {
  return value !== LEGACY_DEFAULT_JWT_SECRET && Buffer.byteLength(value, "utf8") >= 32;
}
