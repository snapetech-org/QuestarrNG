// @vitest-environment node
import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, vi } from "vitest";
import {
  localizeServiceMessage,
  serviceMessage,
  serializeServiceMessageDescriptor,
} from "../../shared/service-messages.js";
import { localizeOutboundNotification } from "../../shared/notification-messages.js";

const game = 'Game ": Provider: /a/path العربية';
const error = serviceMessage("service.client_reported_error", {
  client: "Synology Download Station",
});
const notice = serviceMessage("service.notification_download_aborted", { game, error });
const statements = (text: string) =>
  text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
const sqliteMigration = readFileSync("migrations/0054_localized_error_metadata.sql", "utf8");
const postgresMigration = readFileSync("migrations-pg/0016_localized_error_metadata.sql", "utf8");

describe("nullable localized error metadata migrations", () => {
  it("preserves legacy SQLite text and defaults metadata to null", () => {
    const db = new Database(":memory:");
    try {
      db.exec(
        "CREATE TABLE game_downloads(id text,error_message text);CREATE TABLE notifications(id text,message text);"
      );
      db.prepare("INSERT INTO game_downloads VALUES (?,?)").run("d", error.message);
      db.prepare("INSERT INTO notifications VALUES (?,?)").run("n", notice.message);
      for (const statement of statements(sqliteMigration)) db.exec(statement);
      expect(
        db.prepare("SELECT error_message,error_message_i18n FROM game_downloads").get()
      ).toEqual({ error_message: error.message, error_message_i18n: null });
      expect(db.prepare("SELECT message,message_i18n FROM notifications").get()).toEqual({
        message: notice.message,
        message_i18n: null,
      });
    } finally {
      db.close();
    }
  });
  it("preserves legacy PostgreSQL text and defaults metadata to null", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE TABLE game_downloads(id text,error_message text);CREATE TABLE notifications(id text,message text);"
      );
      await db.query("INSERT INTO game_downloads VALUES ($1,$2)", ["d", error.message]);
      await db.query("INSERT INTO notifications VALUES ($1,$2)", ["n", notice.message]);
      for (const statement of statements(postgresMigration)) await db.exec(statement);
      expect(
        (await db.query("SELECT error_message,error_message_i18n FROM game_downloads")).rows[0]
      ).toEqual({ error_message: error.message, error_message_i18n: null });
      expect((await db.query("SELECT message,message_i18n FROM notifications")).rows[0]).toEqual({
        message: notice.message,
        message_i18n: null,
      });
    } finally {
      await db.close();
    }
  });
});

describe("localized errors survive real storage round-trips", () => {
  it.each(["better-sqlite3", "pglite"] as const)(
    "round-trips, clears, and preserves raw values using %s",
    async (driver) => {
      const prior = process.env.QUESTARR_DB_DRIVER;
      process.env.QUESTARR_DB_DRIVER = driver;
      process.env.SQLITE_DB_PATH = ":memory:";
      vi.resetModules();
      const database = await import("../db.js");
      try {
        if (driver === "pglite") {
          const { migrate } = await import("drizzle-orm/pglite/migrator");
          await migrate(database.db as never, { migrationsFolder: "migrations-pg" });
        } else {
          const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
          migrate(database.db as never, { migrationsFolder: "migrations" });
        }
        const { storage } = await import("../storage.js");
        const user = await storage.createUser({
          username: "metadata-roundtrip",
          passwordHash: "fixture-hash",
        });
        const addedGame = await storage.addGame({ title: game, userId: user.id, status: "wanted" });
        const downloader = await storage.addDownloader({
          name: "Fixture",
          type: "realdebrid",
          url: "https://example.invalid",
          enabled: false,
        });
        const download = await storage.addGameDownload({
          gameId: addedGame.id,
          downloaderId: downloader.id,
          downloadHash: "metadata-fixture",
          downloadTitle: game,
        });
        expect(download).toBeDefined();
        await storage.updateGameDownloadStatus(
          download!.id,
          "failed",
          error.message,
          serializeServiceMessageDescriptor(error)
        );
        const loaded = (await storage.getDownloadsByGameId(addedGame.id))[0]!;
        expect(loaded.errorMessage).toBe(error.message);
        expect(
          localizeServiceMessage(loaded.errorMessage!, loaded.errorMessageI18n, "es")
        ).toContain("informó");
        const saved = await storage.addNotification({
          userId: user.id,
          type: "error",
          title: "Download Aborted",
          message: notice.message,
          messageI18n: serializeServiceMessageDescriptor(notice),
        });
        const read = (await storage.getNotifications(user.id)).find((row) => row.id === saved.id)!;
        expect(read.message).toBe(notice.message);
        const rendered = localizeOutboundNotification(
          read.title,
          read.message,
          "es",
          read.messageI18n
        );
        expect(rendered.message).toContain(game);
        expect(rendered.message).toContain("informó");
        expect(rendered.message).not.toContain("reported an error");
        const provider = "Real-Debrid could not read this magnet link.";
        const raw = serviceMessage("service.notification_download_aborted", {
          game,
          error: provider,
        });
        expect(
          localizeServiceMessage(raw.message, serializeServiceMessageDescriptor(raw), "es")
        ).toContain(provider);
        const legacy = await storage.addNotification({
          userId: user.id,
          type: "error",
          title: "Download Aborted",
          message: 'Download aborted for "Legacy Game": Provider raw',
        });
        expect(legacy.messageI18n).toBeNull();
        expect(
          localizeOutboundNotification(legacy.title, legacy.message, "es", legacy.messageI18n)
            .message
        ).toContain("Legacy Game");
        await storage.updateGameDownloadStatus(download!.id, "downloading", null);
        const cleared = await storage.getGameDownload(download!.id);
        expect(cleared).toMatchObject({ errorMessage: null, errorMessageI18n: null });
      } finally {
        await database.closeDatabase();
        if (driver === "better-sqlite3") database.pool.close();
        if (prior === undefined) delete process.env.QUESTARR_DB_DRIVER;
        else process.env.QUESTARR_DB_DRIVER = prior;
      }
    }
  );
});
