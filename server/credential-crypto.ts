import crypto from "node:crypto";
import { chmod, link, lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { systemConfig } from "./db/tables.js";
import { config } from "./config.js";
import { configLoader } from "./config-loader.js";
import { logger } from "./logger.js";

const cryptoLogger = logger.child({ module: "credential-crypto" });

const ALGORITHM = "aes-256-gcm";
const ENCRYPTED_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
// Keep generated key material outside the database so a database-only dump does
// not contain both credentials and the key needed to decrypt them. The config
// directory must be persistent; PostgreSQL instances must share this file or
// provide the same environment key.
const ENCRYPTION_KEY_DIRECTORY = path.join(configLoader.getConfigDir(), "secrets");
const ENCRYPTION_KEY_FILE = path.join(ENCRYPTION_KEY_DIRECTORY, "credentials.key");
const LEGACY_ENCRYPTION_MATERIAL_ENTRY_NAME = "app_encryption_material";
const ENCRYPTION_KEY_FINGERPRINT_ENTRY_NAME = "app_credentials_encryption_key_fingerprint";

// Cache the resolved key in memory to avoid a DB round-trip on every call.
let cachedKey: Buffer | null = null;
let keyInitialization: Promise<Buffer> | null = null;

/**
 * Resolve the AES-256 key used to encrypt indexer/downloader credentials at
 * rest. The environment key takes priority and is persisted to the private
 * key file when possible. Any backend without an environment key uses that file,
 * migrating the legacy database key or generating one on first startup.
 */
export async function getCredentialsEncryptionKey(): Promise<Buffer> {
  if (cachedKey) {
    return cachedKey;
  }

  keyInitialization ??= initializeCredentialsEncryptionKey().finally(() => {
    keyInitialization = null;
  });
  return keyInitialization;
}

async function initializeCredentialsEncryptionKey(): Promise<Buffer> {
  if (config.credentials.encryptionKey) {
    if (!/^[a-f0-9]{64}$/i.test(config.credentials.encryptionKey)) {
      throw new Error("CREDENTIALS_ENCRYPTION_KEY must be exactly 32 bytes of hexadecimal data");
    }
    const envKey = Buffer.from(config.credentials.encryptionKey, "hex");
    let keyFileKey = await readKeyFile();
    const legacyKey = await readLegacyDatabaseKey();
    if (keyFileKey && !crypto.timingSafeEqual(keyFileKey, envKey)) {
      throw new Error(
        "CREDENTIALS_ENCRYPTION_KEY does not match the persisted key file; restore the matching key before starting"
      );
    }
    if (legacyKey && !crypto.timingSafeEqual(legacyKey, envKey)) {
      throw new Error(
        "CREDENTIALS_ENCRYPTION_KEY does not match the legacy database key; restore the matching key before starting"
      );
    }

    // Migrate environment-provided keys to the private file automatically.
    // This lets existing PostgreSQL installs keep their key if they later move
    // key management to the persistent config volume. The environment key still
    // works when the config directory is intentionally read-only.
    if (!keyFileKey) {
      try {
        await ensureKeyDirectory();
        keyFileKey = await createKeyFileIfMissing(envKey);
      } catch (error) {
        cryptoLogger.warn(
          { error },
          "Could not persist the environment credentials key; keep CREDENTIALS_ENCRYPTION_KEY configured"
        );
      }
      if (keyFileKey && !crypto.timingSafeEqual(keyFileKey, envKey)) {
        throw new Error(
          "CREDENTIALS_ENCRYPTION_KEY does not match the persisted key file; restore the matching key before starting"
        );
      }
    }
    if (legacyKey) await deleteLegacyDatabaseKey();
    await verifyDatabaseKeyFingerprint(envKey);
    cachedKey = envKey;
    return cachedKey;
  }

  await ensureKeyDirectory();
  const keyFileKey = await readKeyFile();
  if (keyFileKey) {
    const legacyKey = await readLegacyDatabaseKey();
    if (legacyKey && !crypto.timingSafeEqual(legacyKey, keyFileKey)) {
      throw new Error(
        "Persisted credentials key file does not match the legacy database key; restore the matching key before starting"
      );
    }
    await verifyDatabaseKeyFingerprint(keyFileKey);
    cachedKey = keyFileKey;
    await deleteLegacyDatabaseKey();
    return keyFileKey;
  }

  const legacyKey = await readLegacyDatabaseKey();
  const candidate = legacyKey ?? crypto.randomBytes(32);
  const persistedKey = await createKeyFileIfMissing(candidate);
  if (legacyKey && !crypto.timingSafeEqual(legacyKey, persistedKey)) {
    throw new Error(
      "Persisted credentials key file does not match the legacy database key; restore the matching key before starting"
    );
  }
  await verifyDatabaseKeyFingerprint(persistedKey);
  if (legacyKey) await deleteLegacyDatabaseKey();
  cachedKey = persistedKey;
  cryptoLogger.info("Loaded or initialized the private credentials encryption key file");
  return persistedKey;
}

async function ensureKeyDirectory(): Promise<void> {
  await mkdir(ENCRYPTION_KEY_DIRECTORY, { recursive: true, mode: 0o700 });
  const directoryStat = await lstat(ENCRYPTION_KEY_DIRECTORY);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("Credentials encryption key directory must be a real directory");
  }
  if (process.platform !== "win32") {
    await chmod(ENCRYPTION_KEY_DIRECTORY, 0o700);
  }
}

async function readKeyFile(): Promise<Buffer | null> {
  let directoryStat: Awaited<ReturnType<typeof lstat>>;
  try {
    directoryStat = await lstat(ENCRYPTION_KEY_DIRECTORY);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Failed to inspect credentials encryption key directory", { cause: error });
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("Credentials encryption key directory must be a real directory");
  }
  if (process.platform !== "win32" && (directoryStat.mode & 0o077) !== 0) {
    await chmod(ENCRYPTION_KEY_DIRECTORY, 0o700);
  }

  let fileStat: Awaited<ReturnType<typeof lstat>>;
  try {
    fileStat = await lstat(ENCRYPTION_KEY_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Failed to inspect credentials encryption key file", { cause: error });
  }
  if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
    throw new Error("Credentials encryption key path must be a regular file");
  }
  if (process.platform !== "win32" && (fileStat.mode & 0o077) !== 0) {
    await chmod(ENCRYPTION_KEY_FILE, 0o600);
  }
  const keyHex = await readFile(ENCRYPTION_KEY_FILE, "utf8");
  if (!/^[a-f0-9]{64}$/i.test(keyHex)) {
    throw new Error("Stored credentials encryption key file is invalid");
  }
  return Buffer.from(keyHex, "hex");
}

async function createKeyFileIfMissing(candidate: Buffer): Promise<Buffer> {
  const candidateHex = candidate.toString("hex");
  const temporaryPath = path.join(
    ENCRYPTION_KEY_DIRECTORY,
    `.credentials-${process.pid}-${crypto.randomUUID()}.tmp`
  );
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(candidateHex, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    // link() publishes atomically without replacing another process's winner.
    await link(temporaryPath, ENCRYPTION_KEY_FILE);
    if (process.platform !== "win32") await chmod(ENCRYPTION_KEY_FILE, 0o600);
    return candidate;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw new Error("Failed to persist credentials encryption key file", { cause: error });
    }
    const winner = await readKeyFile();
    if (!winner) {
      throw new Error("Credentials encryption key was not persisted", { cause: error });
    }
    return winner;
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function readLegacyDatabaseKey(): Promise<Buffer | null> {
  const [row] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, LEGACY_ENCRYPTION_MATERIAL_ENTRY_NAME));
  if (!row?.value) return null;
  if (!/^[a-f0-9]{64}$/i.test(row.value)) {
    throw new Error("Stored credentials encryption key is invalid");
  }
  return Buffer.from(row.value, "hex");
}

async function deleteLegacyDatabaseKey(): Promise<void> {
  try {
    await db
      .delete(systemConfig)
      .where(eq(systemConfig.key, LEGACY_ENCRYPTION_MATERIAL_ENTRY_NAME));
  } catch (error) {
    cryptoLogger.error({ error }, "Failed to remove the legacy database encryption key");
    throw new Error("Failed to remove the legacy database encryption key", { cause: error });
  }
}

/**
 * Record a one-way key fingerprint so app instances sharing a database fail
 * startup if they resolve different keys. The database never stores the key.
 */
async function verifyDatabaseKeyFingerprint(key: Buffer): Promise<void> {
  const fingerprint = crypto
    .createHash("sha256")
    .update("questarrng:credentials-encryption-key:v1\0", "utf8")
    .update(key)
    .digest("hex");
  await db
    .insert(systemConfig)
    .values({ key: ENCRYPTION_KEY_FINGERPRINT_ENTRY_NAME, value: fingerprint })
    .onConflictDoNothing();

  const [row] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, ENCRYPTION_KEY_FINGERPRINT_ENTRY_NAME));
  if (!row?.value || !/^[a-f0-9]{64}$/i.test(row.value)) {
    throw new Error("Credentials encryption key fingerprint is missing or invalid");
  }
  const storedFingerprint = Buffer.from(row.value, "hex");
  const expectedFingerprint = Buffer.from(fingerprint, "hex");
  if (!crypto.timingSafeEqual(storedFingerprint, expectedFingerprint)) {
    throw new Error(
      "Credentials encryption key does not match this database; all app instances must use the same key"
    );
  }
}

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

function decryptWithKey(value: string, key: Buffer): string {
  const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Encrypt a credential value for storage. Nullish/empty values pass through unchanged. */
export async function encryptCredential<T extends string | null | undefined>(
  plaintext: T
): Promise<T> {
  if (!plaintext) return plaintext;
  const key = await getCredentialsEncryptionKey();
  return encryptWithKey(plaintext, key) as T;
}

/**
 * Decrypt a credential value read from storage. Values without the encrypted
 * prefix are legacy plaintext rows written before this feature existed --
 * they're returned unchanged (no migration required) and get encrypted the
 * next time they're written.
 */
export async function decryptCredential<T extends string | null | undefined>(value: T): Promise<T> {
  if (!value || !value.startsWith(ENCRYPTED_PREFIX)) return value;
  const key = await getCredentialsEncryptionKey();
  return decryptWithKey(value, key) as T;
}

/**
 * Synchronous variant for use inside better-sqlite3's synchronous
 * db.transaction() callbacks (see syncIndexers in storage.ts). The caller
 * must resolve the key beforehand via getCredentialsEncryptionKey() since
 * that may need an async DB read.
 */
export function encryptCredentialSync<T extends string | null | undefined>(
  plaintext: T,
  key: Buffer
): T {
  if (!plaintext) return plaintext;
  return encryptWithKey(plaintext, key) as T;
}
