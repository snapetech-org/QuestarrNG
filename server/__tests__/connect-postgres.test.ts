import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  config: {
    database: {
      connectionString: "postgres://questarr:secret@db.example.test:5432/questarr",
      poolMax: 4,
    },
  },
  error: vi.fn(),
  info: vi.fn(),
  poolOptions: undefined as Record<string, unknown> | undefined,
  listeners: new Map<string, (error: Error) => void>(),
  poolEnd: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("pg", () => ({
  default: {
    Pool: class MockPool {
      constructor(options: Record<string, unknown>) {
        mockState.poolOptions = options;
      }

      on(event: string, listener: (error: Error) => void) {
        mockState.listeners.set(event, listener);
      }

      end() {
        return mockState.poolEnd();
      }
    },
  },
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ execute: mockState.execute })),
}));

vi.mock("drizzle-orm", () => ({
  sql: (parts: TemplateStringsArray) => parts.join(""),
}));

vi.mock("../config.js", () => ({ config: mockState.config }));
vi.mock("../logger.js", () => ({
  logger: { error: mockState.error, info: mockState.info },
}));

import { connectPostgres } from "../db/connect-postgres.js";

describe("connectPostgres", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.config.database.connectionString =
      "postgres://questarr:secret@db.example.test:5432/questarr";
    mockState.config.database.poolMax = 4;
    mockState.poolOptions = undefined;
    mockState.listeners.clear();
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error("process.exit:" + String(code));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a missing connection string and exits", () => {
    mockState.config.database.connectionString = "";

    expect(() => connectPostgres()).toThrow("process.exit:1");
    expect(mockState.error).toHaveBeenCalledWith(
      expect.stringContaining("requires DATABASE_URL to be set")
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("rejects non-finite and undersized connection pools", () => {
    mockState.config.database.poolMax = Number.NaN;
    expect(() => connectPostgres()).toThrow("process.exit:1");

    mockState.config.database.poolMax = 1;
    expect(() => connectPostgres()).toThrow("process.exit:1");
    expect(mockState.error).toHaveBeenLastCalledWith(
      "DATABASE_POOL_MAX must be at least 2, got: 1"
    );
  });

  it("rejects invalid database URLs", () => {
    mockState.config.database.connectionString = "not-a-database-url";

    expect(() => connectPostgres()).toThrow("process.exit:1");
    expect(mockState.error).toHaveBeenCalledWith("DATABASE_URL is not a valid connection URL");
  });

  it("sets bounded pool options, logs only the host and path, and supports ping and close", async () => {
    mockState.execute.mockResolvedValueOnce(undefined);
    mockState.poolEnd.mockResolvedValueOnce(undefined);

    const connection = connectPostgres();

    expect(mockState.poolOptions).toEqual({
      connectionString: "postgres://questarr:secret@db.example.test:5432/questarr",
      max: 4,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
    });
    expect(mockState.info).toHaveBeenCalledWith(
      "Initializing Postgres database at: db.example.test:5432/questarr"
    );
    expect(mockState.info.mock.calls.flat().join(" ")).not.toContain("secret");

    mockState.listeners.get("error")?.(new Error("idle connection failed"));
    expect(mockState.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Unexpected error on idle Postgres client"
    );

    await connection.ping();
    await connection.close();
    expect(mockState.execute).toHaveBeenCalledOnce();
    expect(mockState.poolEnd).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "ECONNREFUSED",
      "Nothing is listening at db.example.test:5432/questarr. Is the Postgres server running and reachable?",
    ],
    ["28P01", "Authentication failed. Check the username and password in DATABASE_URL."],
    ["3D000", "That database does not exist. Create it before starting Questarr."],
    ["XX000", "Check DATABASE_URL and that the server is reachable."],
  ])("explains Postgres error %s and rethrows it", async (code, hint) => {
    const error = { code };
    mockState.execute.mockRejectedValueOnce(error);
    const connection = connectPostgres();

    await expect(connection.ping()).rejects.toBe(error);
    expect(mockState.error).toHaveBeenCalledWith(
      { err: error, target: "db.example.test:5432/questarr" },
      "Cannot connect to Postgres at db.example.test:5432/questarr. " + hint
    );
  });

  it("reads wrapped driver codes and uses the generic hint when no code exists", async () => {
    const wrapped = { cause: { code: "28P01" } };
    mockState.execute.mockRejectedValueOnce(wrapped);
    const connection = connectPostgres();

    await expect(connection.ping()).rejects.toBe(wrapped);
    expect(mockState.error).toHaveBeenLastCalledWith(
      { err: wrapped, target: "db.example.test:5432/questarr" },
      "Cannot connect to Postgres at db.example.test:5432/questarr. " +
        "Authentication failed. Check the username and password in DATABASE_URL."
    );

    const uncoded = new Error("unknown driver failure");
    mockState.execute.mockRejectedValueOnce(uncoded);
    await expect(connection.ping()).rejects.toBe(uncoded);
    expect(mockState.error).toHaveBeenLastCalledWith(
      { err: uncoded, target: "db.example.test:5432/questarr" },
      "Cannot connect to Postgres at db.example.test:5432/questarr. " +
        "Check DATABASE_URL and that the server is reachable."
    );
  });
});
