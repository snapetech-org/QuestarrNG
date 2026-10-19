import type { IGDBContentRef, IGDBDiscoverGame, IGDBEditionGraph } from "./igdb.js";

/**
 * Editions, expansions, and add-ons in the terms people choose between.
 * IGDB does not say whether content is story or cosmetic, so that is derived
 * from its game type and the item's name, and left unknown when neither says.
 */
export type ContentType =
  "expansion" | "dlc" | "cosmetic" | "season-pass" | "bonus" | "soundtrack" | "unknown";

export interface ContentItem {
  igdbId: number;
  title: string;
  type: ContentType;
  /** true: story content; false: cosmetic or extras; null: not documented. */
  storyContent: boolean | null;
  releaseDate?: string | undefined;
  coverUrl?: string | undefined;
  owned: boolean;
}

export interface EditionView {
  igdbId: number;
  title: string;
  summary?: string | undefined;
  releaseDate?: string | undefined;
  includes: ContentItem[];
  /** False when IGDB links no content to this edition. */
  contentKnown: boolean;
  owned: boolean;
}

export interface EditionsResponse {
  base: { igdbId: number; title: string; owned: boolean; status?: string | undefined };
  editions: EditionView[];
  addons: ContentItem[];
}

const COSMETIC =
  /\b(costume|skin|skins|outfit|cosmetic|appearance|dye|emote|avatar|theme pack|wallpaper|cape|armor set|weapon pack|character pack)\b/i;
const SOUNDTRACK = /\b(soundtrack|ost|artbook|art book|digital art|making of|behind the scenes)\b/i;
const SEASON_PASS = /\b(season pass|expansion pass|battle pass)\b/i;
const STORY = /\b(story|chapter|episode|campaign|quest|adventure|saga|act \d|part \d)\b/i;

const IGDB_EXPANSION = 2;
const IGDB_STANDALONE_EXPANSION = 4;
const IGDB_DLC = 1;
const IGDB_PACK = 13;
const IGDB_BUNDLE = 3;

/** Exported for tests. */
export const classifyContent = (
  name: string,
  gameType?: number
): { type: ContentType; storyContent: boolean | null } => {
  if (SEASON_PASS.test(name)) return { type: "season-pass", storyContent: null };
  if (SOUNDTRACK.test(name)) return { type: "soundtrack", storyContent: false };
  if (COSMETIC.test(name)) return { type: "cosmetic", storyContent: false };
  if (gameType === IGDB_EXPANSION || gameType === IGDB_STANDALONE_EXPANSION) {
    return { type: "expansion", storyContent: true };
  }
  if (gameType === IGDB_DLC) {
    return { type: "dlc", storyContent: STORY.test(name) ? true : null };
  }
  if (gameType === IGDB_PACK || gameType === IGDB_BUNDLE) {
    return { type: "bonus", storyContent: null };
  }
  return { type: "unknown", storyContent: null };
};

const coverUrl = (ref: IGDBContentRef) =>
  ref.cover?.url ? `https:${ref.cover.url.replace("t_thumb", "t_cover_big")}` : undefined;

const isoDate = (seconds?: number) =>
  seconds ? new Date(seconds * 1000).toISOString().split("T")[0] : undefined;

const toItem = (ref: IGDBContentRef, owned: Set<number>): ContentItem => ({
  igdbId: ref.id,
  title: ref.name,
  ...classifyContent(ref.name, ref.game_type),
  releaseDate: isoDate(ref.first_release_date),
  coverUrl: coverUrl(ref),
  owned: owned.has(ref.id),
});

const contentRefs = (graph: IGDBEditionGraph): IGDBContentRef[] => {
  const seen = new Set<number>();
  return [
    ...(graph.expansions ?? []).map((ref) => ({
      ...ref,
      game_type: ref.game_type ?? IGDB_EXPANSION,
    })),
    ...(graph.standalone_expansions ?? []).map((ref) => ({
      ...ref,
      game_type: ref.game_type ?? IGDB_STANDALONE_EXPANSION,
    })),
    ...(graph.dlcs ?? []).map((ref) => ({ ...ref, game_type: ref.game_type ?? IGDB_DLC })),
  ].filter((ref) => (seen.has(ref.id) ? false : (seen.add(ref.id), true)));
};

export const buildEditionsResponse = (
  graph: { base: IGDBEditionGraph | null; editions: IGDBEditionGraph[] },
  owned: { ids: Set<number>; baseStatus?: string | undefined }
): EditionsResponse | null => {
  if (!graph.base) return null;
  const addons = contentRefs(graph.base).map((ref) => toItem(ref, owned.ids));
  const editions: EditionView[] = graph.editions.map((edition) => {
    const includes = contentRefs(edition).map((ref) => toItem(ref, owned.ids));
    return {
      igdbId: edition.id,
      title: edition.version_title ? `${graph.base?.name}: ${edition.version_title}` : edition.name,
      summary: edition.summary?.slice(0, 600),
      releaseDate: isoDate(edition.first_release_date),
      includes,
      contentKnown: includes.length > 0,
      owned: owned.ids.has(edition.id),
    };
  });
  return {
    base: {
      igdbId: graph.base.id,
      title: graph.base.name,
      owned: owned.ids.has(graph.base.id),
      status: owned.baseStatus,
    },
    editions,
    addons,
  };
};

const hoursToBeat = (times?: { hastily?: number; normally?: number } | null) =>
  times?.normally ?? times?.hastily;

/** Languages grouped by support type, as SeerrNG displays them. */
export const groupLanguages = (game: IGDBDiscoverGame) => {
  const out: { audio: string[]; subtitles: string[]; interface: string[] } = {
    audio: [],
    subtitles: [],
    interface: [],
  };
  for (const support of game.language_supports ?? []) {
    const language = support.language?.name;
    const kind = support.language_support_type?.name?.toLowerCase();
    if (!language || !kind) continue;
    const bucket = kind.includes("audio")
      ? out.audio
      : kind.includes("subtitle")
        ? out.subtitles
        : out.interface;
    if (!bucket.includes(language)) bucket.push(language);
  }
  return out;
};

export { hoursToBeat };
