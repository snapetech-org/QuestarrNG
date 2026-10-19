import { z } from "zod";
import { normalizeTitle } from "../shared/title-utils.js";

/**
 * Content a SeerrNG request asked for beyond the base title. A request that
 * names an edition or specific add-ons is satisfied only by a release that
 * actually matches, never by an unrelated edition of the same game.
 */
export const wantedContentSchema = z.object({
  kind: z.literal("game-content"),
  mode: z.enum(["edition", "missing-selected"]),
  editionId: z.number().int().positive().optional(),
  addonIds: z.array(z.number().int().positive()).max(30).optional(),
});

export type WantedContentSelection = z.infer<typeof wantedContentSchema>;

export interface WantedContentTargets {
  /** Edition title tokens, e.g. "ultimate edition". Empty for add-on requests. */
  edition?: { id: number; title: string; versionTitle?: string };
  addons: { id: number; title: string; acquired?: boolean }[];
}

export interface WantedContentState {
  selection: WantedContentSelection;
  targets: WantedContentTargets;
  /** Add-on ids already queued or imported, so each is acquired once. */
  acquiredAddonIds: number[];
}

const BUNDLE_WORDS = [
  "complete",
  "goty",
  "game of the year",
  "definitive",
  "all dlc",
  "all dlcs",
  "collection",
  "ultimate",
  "gold",
];

const tokens = (value: string) =>
  normalizeTitle(value)
    .split(" ")
    .filter((token) => token.length > 1);

const includesAll = (release: string, wanted: string[]) => {
  const have = new Set(tokens(release));
  return wanted.length > 0 && wanted.every((token) => have.has(token));
};

/**
 * An edition request matches only releases naming that edition. The base
 * title words are removed first so "Deluxe" is what has to appear.
 */
export const releaseMatchesEdition = (
  releaseTitle: string,
  baseTitle: string,
  editionTitle: string
): boolean => {
  const base = new Set(tokens(baseTitle));
  const distinctive = tokens(editionTitle).filter((token) => !base.has(token));
  return distinctive.length > 0 && includesAll(releaseTitle, distinctive);
};

/** A release satisfies an add-on when it names it, or is a complete bundle. */
export const releaseMatchesAddon = (
  releaseTitle: string,
  baseTitle: string,
  addonTitle: string
): { match: boolean; viaBundle: boolean } => {
  const base = new Set(tokens(baseTitle));
  const distinctive = tokens(addonTitle).filter((token) => !base.has(token));
  if (distinctive.length > 0 && includesAll(releaseTitle, distinctive)) {
    return { match: true, viaBundle: false };
  }
  const normalized = normalizeTitle(releaseTitle);
  const bundle = BUNDLE_WORDS.some((word) => normalized.includes(normalizeTitle(word)));
  return { match: bundle, viaBundle: bundle };
};

export const parseWantedContent = (raw: string | null | undefined): WantedContentState | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WantedContentState>;
    const selection = wantedContentSchema.safeParse(value.selection);
    if (!selection.success || !value.targets) return null;
    return {
      selection: selection.data,
      targets: value.targets,
      acquiredAddonIds: Array.isArray(value.acquiredAddonIds) ? value.acquiredAddonIds : [],
    };
  } catch {
    return null;
  }
};

export const pendingAddons = (state: WantedContentState) =>
  state.targets.addons.filter((addon) => !state.acquiredAddonIds.includes(addon.id));
