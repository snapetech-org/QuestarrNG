import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { systemConfig } from "../../shared/schema.js";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("credential-crypto", () => {
  let db: BetterSQLite3Database<Record<string, unknown>>;
  let cryptoModule: typeof import("../credential-crypto.js");
  let keyDirectory: string;
  let temporaryRoot: string;

  beforeEach(async () => {
    process.env.SQLITE_DB_PATH = ":memory:";
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "questarr-credential-crypto-"));
    keyDirectory = path.join(temporaryRoot, "config");

    // Fresh module registry so the in-memory encryption key cache resets per test.
    vi.resetModules();
    vi.doMock("../config-loader.js", () => ({
      configLoader: { getConfigDir: () => keyDirectory, getSslConfig: () => ({ enabled: false }) },
    }));

    const dbModule = await import("../db.js");
    db = dbModule.db;
    await migrate(db, { migrationsFolder: "migrations" });

    cryptoModule = await import("../credential-crypto.js");
  });

  afterEach(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
    vi.doUnmock("../config-loader.js");
  });

  it("round-trips a plaintext value through encrypt/decrypt", async () => {
    const { encryptCredential, decryptCredential } = cryptoModule;

    const ciphertext = await encryptCredential("fixture-plaintext-value");
    expect(ciphertext).not.toBe("fixture-plaintext-value");
    expect(ciphertext?.startsWith("enc:v1:")).toBe(true);

    const plaintext = await decryptCredential(ciphertext);
    expect(plaintext).toBe("fixture-plaintext-value");
  });

  it("produces different ciphertext for the same plaintext on each call (random IV)", async () => {
    const { encryptCredential } = cryptoModule;

    const first = await encryptCredential("same-value");
    const second = await encryptCredential("same-value");
    expect(first).not.toBe(second);
  });

  it("passes through null/undefined/empty values unchanged", async () => {
    const { encryptCredential, decryptCredential } = cryptoModule;

    expect(await encryptCredential(null)).toBeNull();
    expect(await encryptCredential(undefined)).toBeUndefined();
    expect(await encryptCredential("")).toBe("");
    expect(await decryptCredential(null)).toBeNull();
    expect(await decryptCredential(undefined)).toBeUndefined();
    expect(await decryptCredential("")).toBe("");
  });

  it("treats a value without the encrypted prefix as legacy plaintext", async () => {
    const { decryptCredential } = cryptoModule;

    const legacyPlaintextRow = "an-old-plaintext-api-key";
    expect(await decryptCredential(legacyPlaintextRow)).toBe(legacyPlaintextRow);
  });

  it("auto-generates a private key file and removes the legacy database key on first use", async () => {
    const { encryptCredential } = cryptoModule;

    const [before] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "app_encryption_material"));
    expect(before).toBeUndefined();

    await encryptCredential("anything");

    const keyHex = await readFile(path.join(keyDirectory, "secrets", "credentials.key"), "utf8");
    expect(keyHex).toMatch(/^[0-9a-f]{64}$/);

    const [after] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "app_encryption_material"));
    expect(after).toBeUndefined();
  });

  it("reuses the key file after the in-memory key cache is cleared", async () => {
    const { encryptCredential } = cryptoModule;

    const ciphertext = await encryptCredential("stored-key-value");
    vi.resetModules();
    vi.doMock("../config-loader.js", () => ({
      configLoader: { getConfigDir: () => keyDirectory, getSslConfig: () => ({ enabled: false }) },
    }));
    const reloadedDbModule = await import("../db.js");
    await migrate(reloadedDbModule.db, { migrationsFolder: "migrations" });
    cryptoModule = await import("../credential-crypto.js");
    const { decryptCredential: decryptAfterReload } = cryptoModule;

    // A fresh module instance loads the persisted key instead of generating a
    // process-local replacement that could no longer decrypt stored values.
    expect(await decryptAfterReload(ciphertext)).toBe("stored-key-value");
  });

  it("moves a pre-existing database key into the private key file on first use", async () => {
    const preExistingKeyHex = "b".repeat(64);
    await db
      .insert(systemConfig)
      .values({ key: "app_encryption_material", value: preExistingKeyHex });

    const { encryptCredential, decryptCredential } = cryptoModule;
    const ciphertext = await encryptCredential("value-under-preexisting-key");

    const [row] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "app_encryption_material"));
    expect(row).toBeUndefined();
    expect(await readFile(path.join(keyDirectory, "secrets", "credentials.key"), "utf8")).toBe(
      preExistingKeyHex
    );
    expect(await decryptCredential(ciphertext)).toBe("value-under-preexisting-key");
  });

  it("prefers the CREDENTIALS_ENCRYPTION_KEY env var over the database", async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "a".repeat(64);
    vi.resetModules();
    const envDbModule = await import("../db.js");
    await migrate(envDbModule.db, { migrationsFolder: "migrations" });
    const envCryptoModule = await import("../credential-crypto.js");

    const ciphertext = await envCryptoModule.encryptCredential("env-key-value");
    const plaintext = await envCryptoModule.decryptCredential(ciphertext);
    expect(plaintext).toBe("env-key-value");

    const [row] = await envDbModule.db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "app_encryption_material"));
    expect(row).toBeUndefined();

    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  });
});
