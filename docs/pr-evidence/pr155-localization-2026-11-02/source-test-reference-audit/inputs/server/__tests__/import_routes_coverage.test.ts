import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const {
  mockStorage,
  mockImportManager,
  mockPathMappingService,
  mockPlatformMappingService,
  fsMock,
} = vi.hoisted(() => ({
  mockStorage: {
    getImportConfig: vi.fn(),
    getRomMConfig: vi.fn(),
    updateRomMConfig: vi.fn(),
    getEnabledDownloaders: vi.fn(),
    getPendingImportReviews: vi.fn(),
    getUnlinkedImportReviews: vi.fn(),
    getQuarantinedDownloads: vi.fn(),
    getGame: vi.fn(),
    getPlatformMappings: vi.fn(),
    addPlatformMapping: vi.fn(),
    removePlatformMapping: vi.fn(),
    getPathMappings: vi.fn(),
    addPathMapping: vi.fn(),
    updatePathMapping: vi.fn(),
    removePathMapping: vi.fn(),
    getUserSettings: vi.fn(),
    updateUserSettings: vi.fn(),
    createUserSettings: vi.fn(),
    getGameDownload: vi.fn(),
    relinkGameDownload: vi.fn(),
    updateGameDownloadStatus: vi.fn(),
    completeUnlinkedGameDownload: vi.fn(),
  },
  mockImportManager: {
    confirmImport: vi.fn(),
    planConfirmImport: vi.fn(),
  },
  mockPlatformMappingService: {
    initializeDefaults: vi.fn(),
    updateMapping: vi.fn(),
  },
  mockPathMappingService: {
    translatePath: vi.fn(),
  },
  fsMock: {
    stat: vi.fn(),
    writeFile: vi.fn(),
    link: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("../storage.js", () => ({ storage: mockStorage }));
vi.mock("../services/index.js", () => ({
  importManager: mockImportManager,
  pathMappingService: mockPathMappingService,
  platformMappingService: mockPlatformMappingService,
}));
vi.mock("fs-extra", () => ({ default: fsMock }));
vi.mock("../library-scanner.js", () => ({
  rescanAllEnabledRootFolders: vi.fn().mockResolvedValue(undefined),
}));

import { importRouter } from "../routes/import.js";
import { IncompleteScanError } from "../services/ImportManager.js";
import { rescanAllEnabledRootFolders } from "../library-scanner.js";
import {
  makeImportConfig,
  makeRomMConfig,
  createImportTestApp,
} from "./helpers/import-test-helpers.js";

const createApp = (withUser = true) => createImportTestApp(importRouter, withUser);

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getImportConfig.mockResolvedValue(makeImportConfig({ overwriteExisting: true }));
  mockStorage.getRomMConfig.mockResolvedValue(makeRomMConfig());
  mockStorage.getPathMappings.mockResolvedValue([]);
  mockStorage.getEnabledDownloaders.mockResolvedValue([]);
  mockStorage.getPendingImportReviews.mockResolvedValue([]);
  mockStorage.getUnlinkedImportReviews.mockResolvedValue([]);
  mockStorage.getQuarantinedDownloads.mockResolvedValue([]);
  mockImportManager.confirmImport.mockResolvedValue(undefined);
  mockImportManager.planConfirmImport.mockResolvedValue({
    originalPath: "/local/game.iso",
    proposedPath: "/data/PC/My Game",
    files: [],
    hasArchive: false,
    totalCount: 0,
  });
});

describe("PATCH /api/imports/romm", () => {
  it("saves current settings when a legacy client includes the fixed multi-file default", async () => {
    const savedConfig = makeRomMConfig({ enabled: true });
    mockStorage.updateRomMConfig.mockResolvedValue(savedConfig);

    const res = await request(createApp()).patch("/api/imports/romm").send({
      enabled: true,
      multiFilePlacement: "subfolder",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(savedConfig);
    expect(mockStorage.updateRomMConfig).toHaveBeenCalledWith(
      "user-1",
      makeRomMConfig({ enabled: true })
    );
  });

  it("continues rejecting unrelated unknown settings", async () => {
    const res = await request(createApp())
      .patch("/api/imports/romm")
      .send({ multiFilePlacement: "subfolder", unexpectedSetting: true });

    expect(res.status).toBe(400);
    expect(mockStorage.updateRomMConfig).not.toHaveBeenCalled();
  });
});

describe("GET /api/imports/pending", () => {
  it("scopes orphaned import recovery items to the authenticated user", async () => {
    const res = await request(createApp()).get("/api/imports/pending");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockStorage.getUnlinkedImportReviews).toHaveBeenCalledWith("user-1");
  });
});

// ─── Platform mapping CRUD ────────────────────────────────────────────────────

describe("GET /api/imports/mappings/platforms", () => {
  it("returns all platform mappings", async () => {
    mockStorage.getPlatformMappings.mockResolvedValue([
      { id: "pm-1", igdbPlatformId: 6, sourcePlatformName: "pc" },
    ]);

    const res = await request(createApp()).get("/api/imports/mappings/platforms");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "pm-1", igdbPlatformId: 6, sourcePlatformName: "pc" }]);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.getPlatformMappings.mockRejectedValue(new Error("db failure"));

    const res = await request(createApp()).get("/api/imports/mappings/platforms");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/fetch platform mappings/i);
  });
});

describe("POST /api/imports/mappings/platforms", () => {
  it("creates a platform mapping", async () => {
    mockStorage.addPlatformMapping.mockResolvedValue({
      id: "pm-2",
      igdbPlatformId: 19,
      sourcePlatformName: "snes",
    });

    const res = await request(createApp()).post("/api/imports/mappings/platforms").send({
      igdbPlatformId: 19,
      sourcePlatformName: "snes",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ igdbPlatformId: 19, sourcePlatformName: "snes" });
    expect(mockStorage.addPlatformMapping).toHaveBeenCalled();
  });

  it("returns 400 for invalid schema (missing igdbPlatformId)", async () => {
    const res = await request(createApp()).post("/api/imports/mappings/platforms").send({
      sourcePlatformName: "snes",
    });

    expect(res.status).toBe(400);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.addPlatformMapping.mockRejectedValue(new Error("db failure"));

    const res = await request(createApp()).post("/api/imports/mappings/platforms").send({
      igdbPlatformId: 19,
      sourcePlatformName: "snes",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/create platform mapping/i);
  });
});

describe("PATCH /api/imports/mappings/platforms/:id", () => {
  it("updates a platform mapping", async () => {
    mockPlatformMappingService.updateMapping.mockResolvedValue({
      id: "pm-1",
      igdbPlatformId: 6,
      sourcePlatformName: "win",
    });

    const res = await request(createApp())
      .patch("/api/imports/mappings/platforms/pm-1")
      .send({ sourcePlatformName: "win" });

    expect(res.status).toBe(200);
    expect(res.body.sourcePlatformName).toBe("win");
  });

  it("returns 404 when mapping not found", async () => {
    mockPlatformMappingService.updateMapping.mockResolvedValue(undefined);

    const res = await request(createApp())
      .patch("/api/imports/mappings/platforms/missing")
      .send({ sourcePlatformName: "win" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid schema", async () => {
    const res = await request(createApp())
      .patch("/api/imports/mappings/platforms/pm-1")
      .send({ unknownField: true });

    expect(res.status).toBe(400);
  });

  it("returns 500 on service error", async () => {
    mockPlatformMappingService.updateMapping.mockRejectedValue(new Error("db error"));

    const res = await request(createApp())
      .patch("/api/imports/mappings/platforms/pm-1")
      .send({ sourcePlatformName: "win" });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/update platform mapping/i);
  });
});

describe("DELETE /api/imports/mappings/platforms/:id", () => {
  it("deletes a platform mapping", async () => {
    mockStorage.removePlatformMapping.mockResolvedValue(true);

    const res = await request(createApp()).delete("/api/imports/mappings/platforms/pm-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 when mapping not found", async () => {
    mockStorage.removePlatformMapping.mockResolvedValue(false);

    const res = await request(createApp()).delete("/api/imports/mappings/platforms/missing");

    expect(res.status).toBe(404);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.removePlatformMapping.mockRejectedValue(new Error("db failure"));

    const res = await request(createApp()).delete("/api/imports/mappings/platforms/pm-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/delete platform mapping/i);
  });
});

// ─── Path mapping CRUD ────────────────────────────────────────────────────────

describe("GET /api/imports/mappings/paths", () => {
  it("returns all path mappings", async () => {
    mockStorage.getPathMappings.mockResolvedValue([
      { id: "pm-1", remotePath: "/downloads", localPath: "/mnt/downloads", remoteHost: null },
    ]);

    const res = await request(createApp()).get("/api/imports/mappings/paths");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.getPathMappings.mockRejectedValue(new Error("db failure"));

    const res = await request(createApp()).get("/api/imports/mappings/paths");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/fetch path mappings/i);
  });
});

describe("POST /api/imports/mappings/paths", () => {
  it("creates a path mapping", async () => {
    mockStorage.addPathMapping.mockResolvedValue({
      id: "pm-new",
      remotePath: "/downloads",
      localPath: "/mnt/downloads",
      remoteHost: null,
    });

    const res = await request(createApp()).post("/api/imports/mappings/paths").send({
      remotePath: "/downloads",
      localPath: "/mnt/downloads",
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("pm-new");
    expect(mockStorage.addPathMapping).toHaveBeenCalled();
  });

  it("returns 400 for invalid schema", async () => {
    const res = await request(createApp()).post("/api/imports/mappings/paths").send({
      invalidField: true,
    });

    expect(res.status).toBe(400);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.addPathMapping.mockRejectedValue(new Error("db failure"));

    const res = await request(createApp()).post("/api/imports/mappings/paths").send({
      remotePath: "/downloads",
      localPath: "/mnt/downloads",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/create path mapping/i);
  });
});

describe("DELETE /api/imports/mappings/paths/:id", () => {
  it("deletes a path mapping", async () => {
    mockStorage.removePathMapping.mockResolvedValue(true);

    const res = await request(createApp()).delete("/api/imports/mappings/paths/pm-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 when mapping not found", async () => {
    mockStorage.removePathMapping.mockResolvedValue(false);

    const res = await request(createApp()).delete("/api/imports/mappings/paths/missing");

    expect(res.status).toBe(404);
  });

  it("returns 500 on storage error", async () => {
    mockStorage.removePathMapping.mockRejectedValue(new Error("db failure"));

    const res = await request(createApp()).delete("/api/imports/mappings/paths/pm-1");

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/delete path mapping/i);
  });
});

// ─── PATCH /config — createUserSettings branch ───────────────────────────────

describe("PATCH /api/imports/config — createUserSettings branch", () => {
  it("calls createUserSettings when no existing settings found", async () => {
    mockStorage.getUserSettings.mockResolvedValue(undefined);
    mockStorage.createUserSettings.mockResolvedValue({ id: "s-1", userId: "user-1" });

    const res = await request(createApp())
      .patch("/api/imports/config")
      .send({ renamePattern: "{Title}" });

    expect(res.status).toBe(200);
    expect(mockStorage.createUserSettings).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", renamePattern: "{Title}" })
    );
    expect(mockStorage.updateUserSettings).not.toHaveBeenCalled();
  });
});

// ─── GET /:id/plan ────────────────────────────────────────────────────────────

describe("GET /api/imports/:id/plan", () => {
  it("returns the import plan for a download", async () => {
    mockImportManager.planConfirmImport.mockResolvedValue({
      originalPath: "/local/downloads/game.iso",
      proposedPath: "/data/PC/My Game",
      files: [],
      hasArchive: false,
      totalCount: 0,
    });

    const res = await request(createApp()).get("/api/imports/dl-1/plan");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      originalPath: "/local/downloads/game.iso",
      proposedPath: "/data/PC/My Game",
    });
    expect(mockImportManager.planConfirmImport).toHaveBeenCalledWith(
      "dl-1",
      undefined,
      "user-1",
      "pc"
    );
  });

  it("passes sourcePath query param to planConfirmImport", async () => {
    const res = await request(createApp()).get("/api/imports/dl-2/plan?sourcePath=/custom/source");

    expect(res.status).toBe(200);
    expect(mockImportManager.planConfirmImport).toHaveBeenCalledWith(
      "dl-2",
      "/custom/source",
      "user-1",
      "pc"
    );
  });

  it("returns 404 when download not found", async () => {
    mockImportManager.planConfirmImport.mockRejectedValue(new Error("Download dl-x not found"));

    const res = await request(createApp()).get("/api/imports/dl-x/plan");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 500 on unexpected error", async () => {
    mockImportManager.planConfirmImport.mockRejectedValue(new Error("unexpected failure"));

    const res = await request(createApp()).get("/api/imports/dl-err/plan");

    expect(res.status).toBe(500);
  });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

describe("DELETE /api/imports/:id", () => {
  it("marks the download as completed (skip import)", async () => {
    mockStorage.getGameDownload.mockResolvedValue({ id: "dl-1", gameId: "g1" });

    const res = await request(createApp()).delete("/api/imports/dl-1");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStorage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "completed");
  });

  it("returns 404 when download not found", async () => {
    mockStorage.getGameDownload.mockResolvedValue(undefined);

    const res = await request(createApp()).delete("/api/imports/dl-missing");

    expect(res.status).toBe(404);
    expect(mockStorage.updateGameDownloadStatus).not.toHaveBeenCalled();
  });

  it("returns 500 on storage error", async () => {
    mockStorage.getGameDownload.mockRejectedValue(new Error("db failure"));

    const res = await request(createApp()).delete("/api/imports/dl-err");

    expect(res.status).toBe(500);
  });

  it("skips an owned game_link_required download through an owner-scoped transition", async () => {
    mockStorage.getGameDownload.mockResolvedValue({
      id: "dl-unlinked",
      gameId: "missing-game",
      ownerUserId: "user-1",
      status: "game_link_required",
    });
    mockStorage.completeUnlinkedGameDownload.mockResolvedValue({
      id: "dl-unlinked",
      status: "completed",
    });

    const res = await request(createApp()).delete("/api/imports/dl-unlinked");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStorage.getGameDownload).toHaveBeenCalledExactlyOnceWith("dl-unlinked", "user-1");
    expect(mockStorage.completeUnlinkedGameDownload).toHaveBeenCalledWith("dl-unlinked", "user-1");
    expect(mockStorage.updateGameDownloadStatus).not.toHaveBeenCalled();
  });

  it("returns 409 when a game_link_required download is relinked before it can be skipped", async () => {
    mockStorage.getGameDownload.mockResolvedValue({
      id: "dl-race",
      gameId: "g1",
      ownerUserId: "user-1",
      status: "game_link_required",
    });
    mockStorage.completeUnlinkedGameDownload.mockResolvedValue(undefined);

    const res = await request(createApp()).delete("/api/imports/dl-race");

    expect(res.status).toBe(409);
    expect(mockStorage.updateGameDownloadStatus).not.toHaveBeenCalled();
  });

  it("does not reveal or skip another user's orphaned download", async () => {
    mockStorage.getGameDownload.mockResolvedValue(undefined);

    const res = await request(createApp()).delete("/api/imports/dl-foreign");

    expect(res.status).toBe(404);
    expect(mockStorage.getGameDownload).toHaveBeenCalledExactlyOnceWith("dl-foreign", "user-1");
    expect(mockStorage.completeUnlinkedGameDownload).not.toHaveBeenCalled();
    expect(mockStorage.updateGameDownloadStatus).not.toHaveBeenCalled();
  });
});

describe("POST /api/imports/:id/link", () => {
  it("links an owned recovery download to a game in the same user's library", async () => {
    mockStorage.getGameDownload.mockResolvedValue({
      id: "dl-link",
      gameId: "missing-game",
      ownerUserId: "user-1",
      status: "game_link_required",
    });
    mockStorage.getGame.mockResolvedValue({ id: "game-1", userId: "user-1" });
    mockStorage.relinkGameDownload.mockResolvedValue({
      id: "dl-link",
      gameId: "game-1",
      ownerUserId: "user-1",
      status: "manual_review_required",
    });

    const res = await request(createApp())
      .post("/api/imports/dl-link/link")
      .send({ gameId: "game-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockStorage.getGameDownload).toHaveBeenCalledExactlyOnceWith("dl-link", "user-1");
    expect(mockStorage.relinkGameDownload).toHaveBeenCalledWith("dl-link", "game-1", "user-1");
  });

  it("does not link an owned download to another user's game", async () => {
    mockStorage.getGameDownload.mockResolvedValue({
      id: "dl-link",
      gameId: "missing-game",
      ownerUserId: "user-1",
      status: "game_link_required",
    });
    mockStorage.getGame.mockResolvedValue({ id: "game-2", userId: "user-2" });

    const res = await request(createApp())
      .post("/api/imports/dl-link/link")
      .send({ gameId: "game-2" });

    expect(res.status).toBe(404);
    expect(mockStorage.relinkGameDownload).not.toHaveBeenCalled();
  });

  it("does not reveal another user's recovery download", async () => {
    mockStorage.getGameDownload.mockResolvedValue(undefined);

    const res = await request(createApp())
      .post("/api/imports/dl-foreign/link")
      .send({ gameId: "game-1" });

    expect(res.status).toBe(404);
    expect(mockStorage.getGameDownload).toHaveBeenCalledExactlyOnceWith("dl-foreign", "user-1");
    expect(mockStorage.getGame).not.toHaveBeenCalled();
  });
});

// ─── POST /:id/confirm — additional coverage ──────────────────────────────────

describe("POST /api/imports/:id/confirm — Source path error", () => {
  it("accepts the symlink transfer mode offered by import review", async () => {
    const res = await request(createApp()).post("/api/imports/dl-link/confirm").send({
      strategy: "pc",
      proposedPath: "/data/PC/game",
      originalPath: "/downloads/game.rom",
      transferMode: "symlink",
    });

    expect(res.status).toBe(200);
    expect(mockImportManager.confirmImport).toHaveBeenCalledWith(
      "dl-link",
      expect.objectContaining({ transferMode: "symlink" }),
      "user-1"
    );
  });

  it("returns 400 when source path cannot be resolved", async () => {
    mockImportManager.confirmImport.mockRejectedValue(
      new Error(
        "Source path could not be resolved — the download may no longer be tracked by the download client. Please specify the source path manually."
      )
    );

    const res = await request(createApp()).post("/api/imports/dl-1/confirm").send({
      strategy: "pc",
      proposedPath: "/data/PC/game",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/source path could not be resolved/i);
  });

  it("returns 404 when download not found during confirm", async () => {
    mockImportManager.confirmImport.mockRejectedValue(new Error("Download dl-x not found"));

    const res = await request(createApp()).post("/api/imports/dl-x/confirm").send({
      strategy: "pc",
      proposedPath: "/data/PC/game",
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns the incomplete-scan reason so the user can see it before confirming again", async () => {
    mockImportManager.confirmImport.mockRejectedValue(
      new IncompleteScanError(
        "ClamAV did not scan this download. Confirm again to import it anyway."
      )
    );

    const res = await request(createApp()).post("/api/imports/dl-1/confirm").send({
      strategy: "pc",
      proposedPath: "/data/PC/game",
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ClamAV did not scan/);
  });

  it("returns 500 on unexpected confirm error", async () => {
    mockImportManager.confirmImport.mockRejectedValue(new Error("Something exploded"));

    const res = await request(createApp()).post("/api/imports/dl-err/confirm").send({
      strategy: "pc",
      proposedPath: "/data/PC/game",
    });

    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/imports/config — root folder scan on enabling post-processing", () => {
  beforeEach(() => {
    mockStorage.getUserSettings.mockResolvedValue({ userId: "user-1" });
    mockStorage.updateUserSettings.mockResolvedValue(undefined);
  });

  it("scans every enabled root folder when post-processing is switched on", async () => {
    mockStorage.getImportConfig.mockResolvedValue(
      makeImportConfig({ enablePostProcessing: false })
    );

    const res = await request(createApp())
      .patch("/api/imports/config")
      .send({ enablePostProcessing: true });

    expect(res.status).toBe(200);
    expect(rescanAllEnabledRootFolders).toHaveBeenCalledTimes(1);
  });

  it("does not scan when post-processing was already on", async () => {
    mockStorage.getImportConfig.mockResolvedValue(makeImportConfig({ enablePostProcessing: true }));

    await request(createApp()).patch("/api/imports/config").send({ autoUnpack: true });

    expect(rescanAllEnabledRootFolders).not.toHaveBeenCalled();
  });

  it("does not scan when post-processing is switched off", async () => {
    mockStorage.getImportConfig.mockResolvedValue(makeImportConfig({ enablePostProcessing: true }));

    await request(createApp()).patch("/api/imports/config").send({ enablePostProcessing: false });

    expect(rescanAllEnabledRootFolders).not.toHaveBeenCalled();
  });
});
