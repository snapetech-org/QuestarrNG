import { describe, expect, it } from "vitest";
import {
  buildEditionsResponse,
  classifyContent,
  groupLanguages,
  hoursToBeat,
} from "../content-catalog.js";
import {
  parseWantedContent,
  pendingAddons,
  releaseMatchesAddon,
  releaseMatchesEdition,
  summarizeWantedRequest,
  wantedContentSchema,
} from "../wanted-content.js";

describe("classifyContent", () => {
  it("treats IGDB expansions as story content", () => {
    expect(classifyContent("Blood and Wine", 2)).toEqual({ type: "expansion", storyContent: true });
  });

  it("recognises cosmetic and soundtrack content by name", () => {
    expect(classifyContent("Cyber Costume Pack", 1)).toEqual({
      type: "cosmetic",
      storyContent: false,
    });
    expect(classifyContent("Original Soundtrack", 1)).toEqual({
      type: "soundtrack",
      storyContent: false,
    });
  });

  it("leaves undocumented DLC unknown rather than guessing", () => {
    expect(classifyContent("Content Pack 3", 1)).toEqual({ type: "dlc", storyContent: null });
    expect(classifyContent("Mystery", undefined)).toEqual({ type: "unknown", storyContent: null });
  });

  it("flags a season pass as undocumented", () => {
    expect(classifyContent("Season Pass", 13).storyContent).toBeNull();
  });

  it("covers standalone expansions, story chapters, and extra-content bundles", () => {
    expect(classifyContent("Standalone Adventure", 4)).toEqual({
      type: "expansion",
      storyContent: true,
    });
    expect(classifyContent("Story Chapter", 1)).toEqual({ type: "dlc", storyContent: true });
    expect(classifyContent("Artbook", 3)).toEqual({ type: "bonus", storyContent: null });
  });
});

describe("buildEditionsResponse", () => {
  const graph = {
    base: {
      id: 1,
      name: "Game",
      expansions: [{ id: 10, name: "Big Expansion", game_type: 2 }],
      dlcs: [{ id: 11, name: "Skin Pack", game_type: 1 }],
    },
    editions: [
      {
        id: 2,
        name: "Game: Deluxe",
        version_title: "Deluxe Edition",
        expansions: [{ id: 10, name: "Big Expansion", game_type: 2 }],
      },
      { id: 3, name: "Game: Mystery", version_title: "Mystery Edition" },
    ],
  };

  it("marks owned content and unknown edition contents", () => {
    const response = buildEditionsResponse(graph, { ids: new Set([1, 10]), baseStatus: "owned" })!;
    expect(response.base.owned).toBe(true);
    expect(response.addons.find((a) => a.igdbId === 10)?.owned).toBe(true);
    expect(response.addons.find((a) => a.igdbId === 11)?.type).toBe("cosmetic");
    expect(response.editions[0]).toMatchObject({
      contentKnown: true,
      title: "Game: Deluxe Edition",
    });
    expect(response.editions[1]).toMatchObject({ contentKnown: false, includes: [] });
  });

  it("returns null for an unknown game", () => {
    expect(buildEditionsResponse({ base: null, editions: [] }, { ids: new Set() })).toBeNull();
  });
});

describe("groupLanguages", () => {
  it("groups language support by type", () => {
    const grouped = groupLanguages({
      id: 1,
      name: "G",
      language_supports: [
        { language: { name: "English" }, language_support_type: { name: "Audio" } },
        { language: { name: "French" }, language_support_type: { name: "Subtitles" } },
        { language: { name: "German" }, language_support_type: { name: "Interface" } },
      ],
    });
    expect(grouped).toEqual({ audio: ["English"], subtitles: ["French"], interface: ["German"] });
  });

  it("deduplicates languages and ignores incomplete support records", () => {
    const grouped = groupLanguages({
      id: 1,
      name: "G",
      language_supports: [
        { language: { name: "English" }, language_support_type: { name: "Audio" } },
        { language: { name: "English" }, language_support_type: { name: "Audio" } },
        { language: null, language_support_type: { name: "Audio" } },
        { language: { name: "Japanese" }, language_support_type: null },
      ],
    });
    expect(grouped).toEqual({ audio: ["English"], subtitles: [], interface: [] });
  });
});

describe("hoursToBeat", () => {
  it("prefers the normal estimate and falls back to the shorter estimate", () => {
    expect(hoursToBeat({ normally: 20, hastily: 8 })).toBe(20);
    expect(hoursToBeat({ hastily: 8 })).toBe(8);
    expect(hoursToBeat(undefined)).toBeUndefined();
  });
});

describe("release matching", () => {
  it("matches an edition only when its distinctive words are present", () => {
    expect(
      releaseMatchesEdition("Game Deluxe Edition v1.2-GRP", "Game", "Game Deluxe Edition")
    ).toBe(true);
    expect(releaseMatchesEdition("Game Standard v1.2-GRP", "Game", "Game Deluxe Edition")).toBe(
      false
    );
    expect(releaseMatchesEdition("Game v1.2", "Game", "Game")).toBe(false);
  });

  it("matches an add-on by name or through a complete bundle", () => {
    expect(releaseMatchesAddon("Game Big Expansion-GRP", "Game", "Big Expansion")).toEqual({
      match: true,
      viaBundle: false,
    });
    expect(releaseMatchesAddon("Game Complete Edition-GRP", "Game", "Big Expansion")).toEqual({
      match: true,
      viaBundle: true,
    });
    expect(releaseMatchesAddon("Game v1.2-GRP", "Game", "Big Expansion").match).toBe(false);
  });
});

describe("wanted content state", () => {
  it("validates the selection shape", () => {
    expect(
      wantedContentSchema.safeParse({ kind: "game-content", mode: "edition", editionId: 5 }).success
    ).toBe(true);
    expect(
      wantedContentSchema.safeParse({ kind: "game-content", mode: "everything" }).success
    ).toBe(false);
    expect(
      wantedContentSchema.safeParse({
        kind: "game-content",
        mode: "missing-selected",
        addonIds: Array(40).fill(1),
      }).success
    ).toBe(false);
  });

  it("reports only add-ons not yet acquired and survives bad stored JSON", () => {
    const state = parseWantedContent(
      JSON.stringify({
        selection: { kind: "game-content", mode: "missing-selected", addonIds: [1, 2] },
        targets: {
          addons: [
            { id: 1, title: "A" },
            { id: 2, title: "B" },
          ],
        },
        acquiredAddonIds: [1],
      })
    )!;
    expect(pendingAddons(state).map((a) => a.id)).toEqual([2]);
    expect(parseWantedContent("{nope")).toBeNull();
    expect(parseWantedContent(null)).toBeNull();
  });
});

describe("summarizeWantedRequest", () => {
  const selection = JSON.stringify({
    selection: { kind: "game-content", mode: "missing-selected", addonIds: [11, 12] },
    targets: {
      addons: [
        { id: 11, title: "Soundtrack" },
        { id: 12, title: "Expansion Pass" },
      ],
    },
    acquiredAddonIds: [11],
  });

  it("lists only add-ons not yet acquired and falls back to the request title", () => {
    expect(
      summarizeWantedRequest({ externalRequestId: "e1", title: "Test Game", selection })
    ).toEqual({
      id: "e1",
      gameTitle: "Test Game",
      mode: "missing-selected",
      pending: [{ id: 12, title: "Expansion Pass" }],
      acquiredCount: 1,
    });
  });

  it("prefers the library game title and drops completed or unreadable selections", () => {
    expect(
      summarizeWantedRequest({ externalRequestId: "e1", title: "Req", selection }, "Library Title")
        ?.gameTitle
    ).toBe("Library Title");
    expect(
      summarizeWantedRequest({ externalRequestId: "e2", title: "x", selection: null })
    ).toBeNull();
    const done = selection.replace('"acquiredAddonIds":[11]', '"acquiredAddonIds":[11,12]');
    expect(
      summarizeWantedRequest({ externalRequestId: "e3", title: "x", selection: done })
    ).toBeNull();
  });
});
