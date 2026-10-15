import {
  formatRegionalNumber,
  getRegionalLocale,
  useRegionalPreference,
} from "@/lib/regional-format";
import { getInterfaceCollator, formatInterfaceMessage } from "@/lib/interface-locale";
import { ApiErrorDetailText } from "@/components/ApiErrorDetailText";
import React, { useState, useEffect, useMemo, useCallback, useRef, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { MultiSelect } from "@/components/ui/multi-select";
import { Label } from "@/components/ui/label";
import {
  Download,
  FileDown,
  Loader2,
  PackagePlus,
  SlidersHorizontal,
  Newspaper,
  Magnet,
  MoreVertical,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Activity,
  Ban,
  Info,
  Plus,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn, copyToClipboard, safeUrl, isDiscoveryId, mapGameToInsertGame } from "@/lib/utils";
import {
  type Game,
  type Indexer,
  type UserSettings,
  type Downloader,
  downloadRulesSchema,
} from "@shared/schema";
import {
  getCategoryLabel,
  groupDownloadsByCategory,
  type DownloadCategory,
} from "@shared/download-categorizer";
import { inferReleaseCategory } from "@shared/version-utils";
import type { ReleaseType } from "@shared/typesafe-types";
import {
  parseReleaseMetadata,
  parseJsonStringArray,
  matchesPlatformFilter,
  normalizeTitle,
  resolveGamePlatformPreference,
  UNSUPPORTED_TARGET_PLATFORM,
  type CanonicalPlatform,
} from "@shared/title-utils";
import { canonicalPlatformsForIgdbIds, matchesSelectedIgdbPlatform } from "@shared/platforms";
import { isTorrentDownloaderType, isUsenetDownloaderType } from "@shared/downloader-types";
import { BUILT_IN_RULES, type ReleaseEvaluation } from "@shared/release-scoring";

interface DownloadItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  category?: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  downloadVolumeFactor?: number;
  uploadVolumeFactor?: number;
  guid?: string;
  comments?: string;
  indexerId?: string;
  indexerName?: string;
  downloadType?: "torrent" | "usenet";
  // Usenet-specific fields
  grabs?: number;
  age?: number;
  files?: number;
  poster?: string;
  group?: string;
  aiReleaseType?: ReleaseType;
  aiReleaseTypeConfidence?: number;
  releaseEvaluation?: ReleaseEvaluation;
}

interface SearchResult {
  items: DownloadItem[];
  total: number;
  offset: number;
  blacklistedCount?: number;
  errors?: string[];
}

const SMALL_EXTRA_MAX_MAIN_SIZE_RATIO = 0.25;

function getSmallExtras(main: DownloadItem, extras: DownloadItem[]): DownloadItem[] {
  const mainSize = main.size;
  if (!mainSize || mainSize <= 0) return [];
  return extras.filter(
    (extra) =>
      extra.size != null &&
      extra.size > 0 &&
      extra.size <= mainSize * SMALL_EXTRA_MAX_MAIN_SIZE_RATIO
  );
}

interface GameDownloadDialogProps {
  game: Game | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ReleaseMetadata = ReturnType<typeof parseReleaseMetadata>;

function ReleaseScoreBadge({
  evaluation,
}: Readonly<{ evaluation?: ReleaseEvaluation | undefined }>) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  if (!evaluation) return null;
  const scoreLines = evaluation.lines.map((line) => {
    const rule = BUILT_IN_RULES.find((candidate) => candidate.id === line.ruleId);
    return formatInterfaceMessage(
      "{label}: {points}",
      {
        label: rule ? t(rule.label) : line.label,
        points: `${line.points >= 0 ? "+" : ""}${Intl.NumberFormat(language).format(line.points)}`,
      },
      language
    );
  });
  const rejectionLines = evaluation.rejections.map((rejection) =>
    rejection.detail
      ? `${rejection.code.replaceAll("_", " ")}: ${rejection.detail}`
      : rejection.code.replaceAll("_", " ")
  );
  const title = [...scoreLines, ...rejectionLines].join(" · ") || t("No scoring rules matched");
  const scoreLabelSource = evaluation.accepted ? "Score {score}" : "Rejected · {score}";
  const ariaLabelSource = evaluation.accepted ? "Release score {score}" : "Rejected, score {score}";
  return (
    <Badge
      variant={evaluation.accepted ? "secondary" : "destructive"}
      title={title}
      aria-label={formatInterfaceMessage(ariaLabelSource, { score: evaluation.score }, language)}
      lang={languageFor(ariaLabelSource)}
      dir={directionFor(ariaLabelSource)}
      className="h-5 shrink-0 px-1.5 text-[10px]"
    >
      {formatInterfaceMessage(scoreLabelSource, { score: evaluation.score }, language)}
    </Badge>
  );
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString(getRegionalLocale());
  } catch {
    return dateString;
  }
}

import { apiRequest, ApiError } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import { formatBytes, formatAge, isUsenetItem } from "@/lib/downloads-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useInterfaceLanguage } from "@/lib/interface-locale";
import { InterfaceText } from "@/components/InterfaceText";

type ReleaseMetadataBadgesProps = Readonly<{
  metadata: ReleaseMetadata;
  isUsenet: boolean;
  downloadVolumeFactor?: number | undefined;
  className?: string;
}>;

function ReleaseMetadataBadges({
  metadata,
  isUsenet,
  downloadVolumeFactor,
  className,
}: ReleaseMetadataBadgesProps) {
  const hasMetadata =
    metadata.version ||
    (metadata.languages && metadata.languages.length > 0) ||
    metadata.drm ||
    metadata.platform ||
    metadata.isScene ||
    (!isUsenet && downloadVolumeFactor === 0);

  if (!hasMetadata) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {metadata.version && (
        <Badge
          variant="secondary"
          className="h-5 px-1.5 text-xs font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border-none"
        >
          {metadata.version}
        </Badge>
      )}
      {metadata.languages?.map((lang) => (
        <Badge
          key={lang}
          variant="secondary"
          className="h-5 px-1.5 text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-none"
        >
          {lang}
        </Badge>
      ))}
      {metadata.drm && (
        <Badge
          variant="secondary"
          className="h-5 px-1.5 text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-none"
        >
          {metadata.drm}
        </Badge>
      )}
      {metadata.platform && (
        <Badge
          variant="secondary"
          className="h-5 px-1.5 text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 border-none"
        >
          {metadata.platform}
        </Badge>
      )}
      {metadata.isScene && (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-xs border-muted-foreground/30 text-muted-foreground uppercase tracking-tighter"
        >
          <InterfaceText source={"Scene"} />
        </Badge>
      )}
      {!isUsenet && downloadVolumeFactor === 0 && (
        <Badge
          variant="secondary"
          className="h-5 px-1.5 text-[10px] bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-none uppercase tracking-tighter"
        >
          <InterfaceText source={"Freeleech"} />
        </Badge>
      )}
    </div>
  );
}

/** Renders release search, filtering, and download controls for a game. */
export default function GameDownloadDialog({ game, open, onOpenChange }: GameDownloadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Discover and search results carry a temporary "igdb-<id>" id, which the
  // download and blacklist endpoints reject. Add such a game to the library
  // on first use and send its real id instead.
  // Every cached value is keyed by the dialog game's id, so a result for one
  // game can never be used for the next one.
  type ResolvedId = { forId: string; id: string };
  const [resolvedGame, setResolvedGame] = useState<ResolvedId | null>(null);
  const libraryGameId = resolvedGame && resolvedGame.forId === game?.id ? resolvedGame.id : null;
  // Mirrors resolvedGame for mutation callbacks, which run before the re-render.
  const resolvedGameRef = useRef<ResolvedId | null>(null);
  const currentGameId = useCallback(() => {
    const resolved = resolvedGameRef.current;
    return resolved && resolved.forId === game?.id ? resolved.id : game?.id;
  }, [game?.id]);

  // Shared by actions fired before the first add returns, so they don't each
  // POST the game and create duplicate library rows.
  const pendingAddRef = useRef<{ forId: string; promise: Promise<string> } | null>(null);

  const ensureLibraryGameId = useCallback(async (): Promise<string | undefined> => {
    if (!game) return undefined;
    if (!isDiscoveryId(game.id)) return game.id;
    const forId = game.id;
    if (resolvedGameRef.current?.forId === forId) return resolvedGameRef.current.id;
    if (pendingAddRef.current?.forId === forId) return pendingAddRef.current.promise;

    const promise = (async () => {
      let added: Game;
      try {
        const response = await apiRequest("POST", "/api/games", {
          ...mapGameToInsertGame(game),
          status: "wanted",
        });
        added = (await response.json()) as Game;
      } catch (error) {
        const existing =
          error instanceof ApiError && error.status === 409
            ? (error.data as { game?: Game } | undefined)?.game
            : undefined;
        if (!existing) throw error;
        added = existing;
      }
      const resolved = { forId, id: added.id };
      resolvedGameRef.current = resolved;
      setResolvedGame(resolved);
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      return added.id;
    })().finally(() => {
      if (pendingAddRef.current?.forId === forId) pendingAddRef.current = null;
    });
    pendingAddRef.current = { forId, promise };
    return promise;
  }, [game, queryClient]);
  const isMobile = useIsMobile();
  const downloadLabelIdPrefix = useId();
  const { t, language, languageFor, directionFor } = useInterfaceLanguage();
  const regionalPreference = useRegionalPreference();
  const formatNumber = (value: number) =>
    formatRegionalNumber(value, undefined, regionalPreference);
  const formatOptionalNumber = (value: number | undefined) =>
    value === undefined ? "—" : formatNumber(value);
  const interfaceCollator = useMemo(() => getInterfaceCollator(language), [language]);
  const translateText = (source: string, values: Record<string, string | number> = {}) => {
    let message = t(source);
    for (const [key, value] of Object.entries(values))
      message = message.replace(
        `{${key}}`,
        String(typeof value === "number" ? formatNumber(value) : value)
      );
    return message;
  };
  const localizedText = (source: string, values?: Record<string, string | number>) => {
    const text = translateText(source, values);
    // English is already declared on the document; avoid adding a span around
    // every English label and preserve plain strings for English toast payloads.
    if (language === "en") return text;
    return (
      <span lang={languageFor(source)} dir={directionFor(source)}>
        {text}
      </span>
    );
  };
  const localizedAge = (days?: number) => {
    if (days === undefined) return null;
    if (days === 0) return localizedText("Today");
    return (
      <span lang={languageFor("Today")} dir={directionFor("Today")}>
        {formatAge(days, language, regionalPreference)}
      </span>
    );
  };
  const localizedMultiSelectProps = (placeholderSource: string) => ({
    placeholder: t(placeholderSource),
    lang: languageFor(placeholderSource),
    dir: directionFor(placeholderSource),
    searchPlaceholder: translateText("Search..."),
    searchLang: languageFor("Search..."),
    searchDir: directionFor("Search..."),
    emptyMessage: translateText("No items found."),
    emptyLang: languageFor("No items found."),
    emptyDir: directionFor("No items found."),
    removeLabel: (label: string) => translateText("Remove {name}", { name: label }),
    removeLang: languageFor("Remove {name}"),
    removeDir: directionFor("Remove {name}"),
  });
  const categoryLabel = (category: DownloadCategory) => localizedText(getCategoryLabel(category));
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [downloadingGuid, setDownloadingGuid] = useState<string | null>(null);
  const [showBundleDialog, setShowBundleDialog] = useState(false);
  const [selectedMainDownload, setSelectedMainDownload] = useState<DownloadItem | null>(null);
  const [isDirectDownloadMode, setIsDirectDownloadMode] = useState(false);
  const [selectedUpdateIndices, setSelectedUpdateIndices] = useState<Set<number>>(new Set());
  const [selectedExtraIndices, setSelectedExtraIndices] = useState<Set<number>>(new Set());

  // Filter states
  const [minSeeders, setMinSeeders] = useState<number>(0);
  const meetsSeederThreshold = useCallback(
    (t: DownloadItem) => isUsenetItem(t) || (t.seeders ?? 0) >= minSeeders,
    [minSeeders]
  );
  const [selectedIndexer, setSelectedIndexer] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"seeders" | "date" | "size" | "priority" | "score">(
    "seeders"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCategories, setVisibleCategories] = useState<Set<DownloadCategory>>(
    new Set(["main", "update", "dlc", "extra", "packs"] as DownloadCategory[])
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  // Tracks whether dialog defaults have already been applied for the current open session.
  // This prevents settings refetches from overwriting user-made changes after initialization.
  const defaultsAppliedRef = useRef(false);
  // Tracks whether platform preselection has been applied this dialog session to prevent
  // re-applying it (and overriding the user's manual choice) if userSettings refetches.
  const platformPreselectedRef = useRef(false);
  // Tracks whether the /api/games invalidation has already fired for this dialog session
  // to avoid re-invalidating (and re-rendering the full library) on every new search result.
  const hasInvalidatedRef = useRef(false);

  const setDefaults = useCallback(() => {
    setSearchQuery("");
    setShowBundleDialog(false);
    setSelectedMainDownload(null);
    setIsDirectDownloadMode(false);
    setSelectedUpdateIndices(new Set());
    setMinSeeders(0);
    setSelectedIndexer("all");
    setSortBy("seeders");
    setSortOrder("desc");
    setShowFilters(false);
    setVisibleCategories(
      new Set(["main", "update", "dlc", "extra", "packs"] as DownloadCategory[])
    );
    setSelectedGroups([]);
    setSelectedPlatforms([]);
    defaultsAppliedRef.current = false;
    platformPreselectedRef.current = false;
    hasInvalidatedRef.current = false;
  }, []);

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    enabled: open,
  });

  const savePreferredGroupsMutation = useMutation({
    mutationFn: async (groupsToAdd: string[]) => {
      const settingsResponse = await apiRequest("GET", "/api/settings");
      const latestSettings = (await settingsResponse.json()) as Pick<
        UserSettings,
        "preferredReleaseGroups"
      >;
      const preferredGroups = parseJsonStringArray(latestSettings.preferredReleaseGroups);
      const existing = new Set(preferredGroups.map((group) => group.trim().toLowerCase()));
      const addedGroups: string[] = [];

      for (const group of groupsToAdd) {
        const trimmed = group.trim();
        const key = trimmed.toLowerCase();
        if (trimmed && !existing.has(key)) {
          preferredGroups.push(trimmed);
          addedGroups.push(trimmed);
          existing.add(key);
        }
      }

      if (addedGroups.length > 0) {
        await apiRequest("PATCH", "/api/settings", {
          preferredReleaseGroups: JSON.stringify(preferredGroups),
        });
      }

      return addedGroups;
    },
    onSuccess: (addedGroups) => {
      if (addedGroups.length > 0) {
        toast({
          title: "Preferred groups updated",
          description: formatInterfaceMessage(
            "Added {groups} to your preferred release groups.",
            { groups: addedGroups.join(", ") },
            language
          ),
        });
      } else {
        toast({
          title: "Groups already saved",
          description: "The selected groups are already in your preferred list.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not save preferred groups",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const applyDownloadRules = useCallback(() => {
    if (userSettings?.downloadRules) {
      try {
        const rules = downloadRulesSchema.parse(JSON.parse(userSettings.downloadRules));
        setMinSeeders(rules.minSeeders);
        setSortBy(rules.sortBy);
        setSortOrder("desc");
        if (rules.visibleCategories) {
          setVisibleCategories(new Set(rules.visibleCategories as DownloadCategory[]));
        }
      } catch (error) {
        console.warn("Failed to apply download rules from settings", error);
      }
    }
    if (userSettings?.filterByPreferredGroups) {
      const groups = parseJsonStringArray(userSettings.preferredReleaseGroups);
      if (groups.length > 0) {
        setSelectedGroups(groups);
      }
    }
    const preferredPlatform = resolveGamePlatformPreference(
      game ?? {},
      userSettings?.preferredPlatform ?? null
    );
    if (
      preferredPlatform &&
      preferredPlatform !== UNSUPPORTED_TARGET_PLATFORM &&
      !platformPreselectedRef.current
    ) {
      // A game's explicit target wins over the account default. The chosen
      // platform must also be allowed by the Platforms setting; otherwise the
      // prefilter would hide every release and blame the wrong control.
      const allowed = canonicalPlatformsForIgdbIds(userSettings?.importPlatformIds);
      const preferredAllowed =
        allowed.length === 0 || allowed.includes(preferredPlatform as CanonicalPlatform);
      if (preferredAllowed) {
        setSelectedPlatforms([preferredPlatform]);
      }
      platformPreselectedRef.current = true;
    }
  }, [
    userSettings?.downloadRules,
    userSettings?.filterByPreferredGroups,
    userSettings?.preferredReleaseGroups,
    userSettings?.preferredPlatform,
    userSettings?.importPlatformIds,
    game,
  ]);

  // Initialize search query only when the dialog opens or game changes — not on settings refetch.
  useEffect(() => {
    if (open && game) {
      setSearchQuery(game.title);
    } else if (!open) {
      setDefaults();
    }
  }, [open, game, setDefaults]);

  // Apply settings-derived defaults only once per dialog session so later refetches
  // do not overwrite manual adjustments the user makes in the UI.
  useEffect(() => {
    if (open && game && userSettings && !defaultsAppliedRef.current) {
      applyDownloadRules();
      defaultsAppliedRef.current = true;
    }
  }, [open, game, userSettings, applyDownloadRules]);

  const buildSearchQueryKey = (gameId: string | undefined) =>
    gameId
      ? `/api/search?query=${encodeURIComponent(debouncedSearchQuery)}&gameId=${gameId}`
      : `/api/search?query=${encodeURIComponent(debouncedSearchQuery)}`;
  // Once a Discover game is in the library, search with its real id so the
  // server applies that game's release blacklist.
  const searchQueryKey = buildSearchQueryKey(libraryGameId ?? game?.id);

  const { data: searchResults, isLoading: isSearching } = useQuery<SearchResult>({
    queryKey: [searchQueryKey],
    enabled: open && debouncedSearchQuery.trim().length > 0,
  });

  const scoreSortInitializedRef = useRef(false);
  const hasScoredResults =
    searchResults?.items.some((item) => item.releaseEvaluation !== undefined) ?? false;
  useEffect(() => {
    if (hasScoredResults && !scoreSortInitializedRef.current) {
      setSortBy("score");
      setSortOrder("desc");
      scoreSortInitializedRef.current = true;
    } else if (!hasScoredResults) {
      scoreSortInitializedRef.current = false;
    }
  }, [hasScoredResults]);

  // When a canonical search returns results, refresh the games list so the "Has results" badge
  // reflects the updated searchResultsAvailable flag. Only invalidate once per dialog session.
  useEffect(() => {
    if (!searchResults || !game) return;
    if (searchResults.items.length === 0) return;
    if (hasInvalidatedRef.current) return;
    if (normalizeTitle(debouncedSearchQuery) !== normalizeTitle(game.title)) return;
    hasInvalidatedRef.current = true;
    queryClient.invalidateQueries({ queryKey: ["/api/games"] });
  }, [searchResults, game, debouncedSearchQuery, queryClient]);

  const { data: enabledIndexers } = useQuery<Indexer[]>({
    queryKey: ["/api/indexers/enabled"],
    enabled: open,
  });

  const { data: downloaders = [] } = useQuery<Downloader[]>({
    queryKey: ["/api/downloaders/enabled"],
    enabled: open,
  });

  // Maps indexer name -> configured priority (lower number = higher priority) so
  // results can be sorted to match the order set on Management > Indexers.
  const indexerPriorityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const indexer of enabledIndexers ?? []) {
      map.set(indexer.name, indexer.priority);
    }
    return map;
  }, [enabledIndexers]);

  // Categorize downloads
  const categorizedDownloads = useMemo(() => {
    if (!searchResults?.items) return { main: [], update: [], dlc: [], extra: [], packs: [] };
    return groupDownloadsByCategory(searchResults.items);
  }, [searchResults?.items]);

  // Distinct indexer names actually present in the current results, regardless of
  // whether they're still in the user's enabled-indexers list. Used to decide when
  // the Priority column is meaningful (i.e. results span more than one indexer).
  const resultIndexerNames = useMemo(() => {
    if (!searchResults?.items) return [];
    const indexers = new Set(
      searchResults.items
        .map((item) => item.indexerName)
        .filter((name): name is string => Boolean(name))
    );
    return Array.from(indexers);
  }, [searchResults?.items]);

  const availableIndexers = useMemo(() => {
    if (enabledIndexers) {
      const enabledNames = new Set(enabledIndexers.map((i) => i.name));
      return resultIndexerNames
        .filter((name) => enabledNames.has(name))
        .sort(interfaceCollator.compare);
    }
    return [...resultIndexerNames].sort(interfaceCollator.compare);
  }, [resultIndexerNames, enabledIndexers, interfaceCollator]);

  const availableGroups = useMemo(() => {
    if (!searchResults?.items) return [];
    const groups = new Set(
      searchResults.items
        .map((item) => item.group)
        .filter((group): group is string => Boolean(group))
    );
    return Array.from(groups).sort(interfaceCollator.compare);
  }, [searchResults?.items, interfaceCollator]);

  const preferredGroups = useMemo(
    () => parseJsonStringArray(userSettings?.preferredReleaseGroups),
    [userSettings?.preferredReleaseGroups]
  );
  const preferredGroupKeys = useMemo(
    () => new Set(preferredGroups.map((group) => group.trim().toLowerCase())),
    [preferredGroups]
  );
  const selectedGroupsToSave = useMemo(
    () =>
      selectedGroups.filter(
        (group) => group.trim() && !preferredGroupKeys.has(group.trim().toLowerCase())
      ),
    [selectedGroups, preferredGroupKeys]
  );

  // Pre-calculate release metadata once per item to avoid repeated regex operations
  const itemsMetadata = useMemo(() => {
    if (!searchResults?.items) return new Map<string, ReturnType<typeof parseReleaseMetadata>>();
    return new Map(
      searchResults.items.map((item) => [item.title, parseReleaseMetadata(item.title)])
    );
  }, [searchResults?.items]);

  const availablePlatforms = useMemo(() => {
    const metas = Array.from(itemsMetadata.values());
    const platforms = new Set(
      metas.map((meta) => meta.platform).filter((p): p is string => Boolean(p))
    );
    // PC also covers releases with no detected platform — add it when such items exist
    if (metas.some((meta) => !meta.platform)) {
      platforms.add("PC");
    }
    // The Platforms setting narrows this dropdown the same way it narrows the
    // Library and Discover selectors.
    const allowed = new Set<string>(canonicalPlatformsForIgdbIds(userSettings?.importPlatformIds));
    return Array.from(platforms)
      .filter((p) => allowed.size === 0 || allowed.has(p))
      .sort(interfaceCollator.compare)
      .map((p) => ({ label: p, value: p }));
  }, [itemsMetadata, userSettings?.importPlatformIds, interfaceCollator]);

  const itemPubDateTimestamps = useMemo(() => {
    if (!searchResults?.items) return new Map<string, number>();
    return new Map(
      searchResults.items.map((item) => [item.guid || item.link, new Date(item.pubDate).getTime()])
    );
  }, [searchResults?.items]);

  // Apply filters and sorting
  const filteredCategorizedDownloads = useMemo(() => {
    const filtered: Record<DownloadCategory, DownloadItem[]> = {
      main: [],
      update: [],
      dlc: [],
      extra: [],
      packs: [],
    };

    for (const [category, downloads] of Object.entries(categorizedDownloads) as [
      DownloadCategory,
      DownloadItem[],
    ][]) {
      if (!visibleCategories.has(category)) continue;

      filtered[category] = downloads
        .filter((t) => meetsSeederThreshold(t))
        .filter((t) => selectedIndexer === "all" || t.indexerName === selectedIndexer)
        .filter((t) => selectedGroups.length === 0 || (t.group && selectedGroups.includes(t.group)))
        .filter((t) => {
          const platform = itemsMetadata.get(t.title)?.platform;
          // Platforms setting first: releases outside the user's platforms are
          // never offered, regardless of the in-dialog selection below.
          if (!matchesSelectedIgdbPlatform(platform, userSettings?.importPlatformIds)) return false;
          if (selectedPlatforms.length === 0) return true;
          return selectedPlatforms.some((sp) => matchesPlatformFilter(platform, sp));
        })
        .sort((a, b) => {
          let comparison;
          if (sortBy === "seeders") {
            const aHealth = isUsenetItem(a) ? (a.grabs ?? 0) : (a.seeders ?? 0);
            const bHealth = isUsenetItem(b) ? (b.grabs ?? 0) : (b.seeders ?? 0);
            comparison = bHealth - aHealth;
          } else if (sortBy === "score") {
            comparison =
              (b.releaseEvaluation?.score ?? -Infinity) - (a.releaseEvaluation?.score ?? -Infinity);
            if (!Number.isFinite(comparison)) comparison = 0;
          } else if (sortBy === "date") {
            const keyA = a.guid || a.link;
            const keyB = b.guid || b.link;
            comparison =
              (itemPubDateTimestamps.get(keyB) ?? 0) - (itemPubDateTimestamps.get(keyA) ?? 0);
          } else if (sortBy === "priority") {
            // Lower priority number = higher-priority indexer, so it sorts first by default.
            // Indexers with no configured priority (e.g. since removed/disabled) always sort
            // last, regardless of the chosen sort direction.
            const aPriority = indexerPriorityMap.get(a.indexerName ?? "");
            const bPriority = indexerPriorityMap.get(b.indexerName ?? "");
            if (aPriority === undefined || bPriority === undefined) {
              if (aPriority === undefined && bPriority === undefined) return 0;
              return aPriority === undefined ? 1 : -1;
            }
            comparison = aPriority - bPriority;
          } else {
            comparison = (b.size ?? 0) - (a.size ?? 0);
          }
          return sortOrder === "desc" ? comparison : -comparison;
        });
    }

    return filtered;
  }, [
    categorizedDownloads,
    itemsMetadata,
    meetsSeederThreshold,
    selectedIndexer,
    sortBy,
    sortOrder,
    visibleCategories,
    selectedGroups,
    selectedPlatforms,
    itemPubDateTimestamps,
    indexerPriorityMap,
    userSettings?.importPlatformIds,
  ]);

  const recommendedExtras = useMemo(
    () =>
      selectedMainDownload
        ? getSmallExtras(selectedMainDownload, filteredCategorizedDownloads.extra)
        : [],
    [selectedMainDownload, filteredCategorizedDownloads.extra]
  );
  const selectedBundleAddons = [
    ...Array.from(selectedUpdateIndices)
      .map((i) => filteredCategorizedDownloads.update[i])
      .filter((download): download is DownloadItem => download !== undefined),
    ...Array.from(selectedExtraIndices)
      .map((i) => recommendedExtras[i])
      .filter((download): download is DownloadItem => download !== undefined),
  ];
  const hasUpdates = filteredCategorizedDownloads.update.length > 0;
  const hasRecommendedExtras = recommendedExtras.length > 0;
  const bundleDialogTitle =
    hasUpdates && hasRecommendedExtras
      ? "Add updates and extras?"
      : hasUpdates
        ? "Download with Updates?"
        : "Add small extras?";
  const selectedBundleAddonLabel =
    selectedUpdateIndices.size > 0 && selectedExtraIndices.size > 0
      ? `${selectedBundleAddons.length} add-ons`
      : selectedExtraIndices.size > 0
        ? `${selectedExtraIndices.size} ${selectedExtraIndices.size === 1 ? "extra" : "extras"}`
        : `${selectedUpdateIndices.size} ${selectedUpdateIndices.size === 1 ? "update" : "updates"}`;

  const downloadMutation = useMutation({
    mutationFn: async (downloads: DownloadItem[]) => {
      const gameId = await ensureLibraryGameId();
      const results = [];
      for (const download of downloads) {
        const response = await apiRequest("POST", "/api/downloads", {
          url: download.link,
          title: download.title,
          gameId,
          downloadType: isUsenetItem(download) ? "usenet" : "torrent",
          releaseCategory: inferReleaseCategory(
            download.title,
            download.aiReleaseType,
            download.aiReleaseTypeConfidence
          ),
        });
        results.push(await response.json());
      }
      return results;
    },
    onSuccess: (results, variables) => {
      const successfulResults = results.filter((r) => r.success);
      const successCount = successfulResults.length;
      const failedResults = results
        .map((r, i) => ({ result: r, download: variables[i]! }))
        .filter(({ result }) => !result.success);
      if (successCount === 0) {
        toast({ title: "Failed to start download", variant: "destructive" });
        return;
      }
      const downloaderNames = Array.from(
        new Set(successfulResults.map((r) => r.downloaderName).filter(Boolean))
      );
      const title =
        downloaderNames.length === 1
          ? formatInterfaceMessage("Downloads sent: {count} to {downloaderName}", {
              count: formatNumber(successCount),
              downloaderName: downloaderNames[0]!,
            })
          : formatInterfaceMessage("Downloads sent: {count}", {
              count: formatNumber(successCount),
            });
      toast({
        title,
        description:
          results.length > 1
            ? formatInterfaceMessage("Added {count} of {total} downloads", {
                count: formatNumber(successCount),
                total: formatNumber(results.length),
              })
            : undefined,
      });
      if (failedResults.length > 0) {
        toast({
          title: formatInterfaceMessage("Downloads failed: {count}", {
            count: formatNumber(failedResults.length),
          }),
          description: failedResults.map(({ download }) => download.title).join(", "),
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/downloads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/downloads/summary"] });
      const gameId = currentGameId();
      if (gameId) {
        queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/downloads`] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start download",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setDownloadingGuid(null);
      setShowBundleDialog(false);
      setSelectedMainDownload(null);
    },
  });

  const sendToDownloaderMutation = useMutation({
    mutationFn: async ({
      download,
      downloaderId,
    }: {
      download: DownloadItem;
      downloaderId: string;
      downloaderName: string;
    }) => {
      const gameId = await ensureLibraryGameId();
      const response = await apiRequest("POST", `/api/downloaders/${downloaderId}/downloads`, {
        url: download.link,
        title: download.title,
        gameId,
        downloadType: isUsenetItem(download) ? "usenet" : "torrent",
      });
      return response.json();
    },
    onSuccess: (result, variables) => {
      if (result.success) {
        const awaitingConfirmation = Boolean(result.correlationTag);
        toast({
          title: awaitingConfirmation
            ? localizedText("Checking qBittorrent")
            : formatInterfaceMessage("Download sent to {downloaderName}", {
                downloaderName: String(variables.downloaderName ?? ""),
              }),
          ...(awaitingConfirmation
            ? {
                description:
                  result.message ||
                  localizedText(
                    "The request was accepted, but qBittorrent has not confirmed the download yet. Check qBittorrent before retrying to avoid a duplicate."
                  ),
              }
            : {}),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/downloads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/downloads/summary"] });
        const gameId = currentGameId();
        if (gameId) {
          queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/downloads`] });
        }
      } else {
        toast({ title: result.message || "Failed to start download", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to start download",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const blacklistMutation = useMutation({
    mutationFn: async (item: DownloadItem) => {
      const gameId = await ensureLibraryGameId();
      if (!gameId) throw new Error("No game context");
      await apiRequest("POST", `/api/games/${gameId}/blacklist`, {
        releaseTitle: item.title,
        indexerName: item.indexerName ?? null,
      });
    },
    onSuccess: (_data, item) => {
      const remaining = queryClient.getQueryData<SearchResult>([searchQueryKey]);
      const filtered = remaining && {
        ...remaining,
        items: remaining.items.filter((i) => i.title !== item.title),
      };
      // A Discover game just added to the library searches under its real id
      // from the next render on: seed that key too so the dialog doesn't flash.
      const resolvedKey = buildSearchQueryKey(currentGameId());
      for (const key of new Set([searchQueryKey, resolvedKey])) {
        queryClient.setQueryData<SearchResult>([key], filtered);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      queryClient.invalidateQueries({ queryKey: [resolvedKey] });
      toast({ description: "Release blacklisted" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to blacklist release" });
    },
  });

  const handleDownload = (download: DownloadItem) => {
    const downloadCategory = groupDownloadsByCategory([download]);
    const smallExtras = getSmallExtras(download, filteredCategorizedDownloads.extra);
    if (
      downloadCategory.main.length > 0 &&
      (filteredCategorizedDownloads.update.length > 0 || smallExtras.length > 0)
    ) {
      setSelectedMainDownload(download);
      setIsDirectDownloadMode(false);
      setSelectedUpdateIndices(new Set(filteredCategorizedDownloads.update.map((_, i) => i)));
      setSelectedExtraIndices(new Set());
      setShowBundleDialog(true);
      return;
    }
    setDownloadingGuid(download.guid || download.link);
    downloadMutation.mutate([download]);
  };

  const handleDirectDownload = (download: DownloadItem) => {
    if (!safeUrl(download.link, "")) {
      toast({
        title: "Direct download unavailable",
        description: "This release does not have a downloadable file URL.",
        variant: "destructive",
      });
      return;
    }

    const downloadCategory = groupDownloadsByCategory([download]);
    const smallExtras = getSmallExtras(download, filteredCategorizedDownloads.extra);
    if (
      downloadCategory.main.length > 0 &&
      (filteredCategorizedDownloads.update.length > 0 || smallExtras.length > 0)
    ) {
      setSelectedMainDownload(download);
      setIsDirectDownloadMode(true);
      setSelectedUpdateIndices(new Set(filteredCategorizedDownloads.update.map((_, i) => i)));
      setSelectedExtraIndices(new Set());
      setShowBundleDialog(true);
      return;
    }

    if (downloadFile(download)) {
      const fileType = isUsenetItem(download) ? "NZB" : t("Torrent");
      toast({
        title: "Download started",
        description: formatInterfaceMessage(
          "{fileType} file download initiated",
          { fileType },
          language
        ),
      });
    }
  };

  const handleBundleDownload = (includeSelectedAddons: boolean) => {
    if (!selectedMainDownload) return;
    const guid = selectedMainDownload.guid || selectedMainDownload.link;
    setDownloadingGuid(guid);
    downloadMutation.mutate([
      selectedMainDownload,
      ...(includeSelectedAddons ? selectedBundleAddons : []),
    ]);
  };

  const downloadFile = (download: DownloadItem): boolean => {
    const url = safeUrl(download.link, "");
    if (!url) return false;

    const link = document.createElement("a");
    link.href = url;
    const isUsenet = isUsenetItem(download);
    link.download = `${download.title}.${isUsenet ? "nzb" : "torrent"}`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  };

  const handleBundleDirectDownload = async (includeSelectedAddons: boolean) => {
    if (!selectedMainDownload) return;
    const downloads = [
      selectedMainDownload,
      ...(includeSelectedAddons ? selectedBundleAddons : []),
    ];
    if (downloads.length > 1) {
      try {
        const response = await apiRequest("POST", "/api/downloads/bundle", { downloads });
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${selectedMainDownload.title}-bundle.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast({
          title: `Bundle downloaded`,
          description: formatInterfaceMessage("ZIP file item count: {count}", {
            count: formatNumber(downloads.length),
          }),
        });
      } catch (error) {
        toast({
          title: "Failed to create bundle",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        });
      }
    } else {
      if (downloadFile(selectedMainDownload)) {
        const fileType = isUsenetItem(selectedMainDownload) ? "NZB" : t("Torrent");
        toast({
          title: "Download started",
          description: formatInterfaceMessage(
            "{fileType} file download initiated",
            { fileType },
            language
          ),
        });
      } else {
        toast({
          title: "Direct download unavailable",
          description: "This release does not have a downloadable file URL.",
          variant: "destructive",
        });
      }
    }
    setShowBundleDialog(false);
    setSelectedMainDownload(null);
  };

  const toggleUpdateSelection = (index: number) => {
    setSelectedUpdateIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAllUpdates = () =>
    setSelectedUpdateIndices(new Set(filteredCategorizedDownloads.update.map((_, i) => i)));
  const deselectAllUpdates = () => setSelectedUpdateIndices(new Set());

  const toggleExtraSelection = (index: number) => {
    setSelectedExtraIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleCategory = (category: DownloadCategory) => {
    setVisibleCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleSort = (field: "seeders" | "date" | "size" | "priority" | "score") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const SortHeader = ({
    field,
    label,
    className = "",
  }: {
    field: "seeders" | "date" | "size" | "priority" | "score";
    label: string;
    className?: string;
  }) => (
    <button
      onClick={() => toggleSort(field)}
      lang={languageFor(label)}
      dir={directionFor(label)}
      className={cn(
        "flex items-center hover:text-foreground transition-colors uppercase tracking-wider font-bold",
        sortBy === field ? "text-foreground" : "text-muted-foreground/70",
        className
      )}
    >
      {localizedText(label)}
      {sortBy === field ? (
        sortOrder === "asc" ? (
          <ArrowUp className="h-3 w-3 ml-1" />
        ) : (
          <ArrowDown className="h-3 w-3 ml-1" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );

  if (!game) return null;

  // ─── Shared: Filter panel ─────────────────────────────────────────────────────

  const filterPanel = showFilters && (
    <div
      className={cn(
        "p-4 border rounded-md bg-muted/50",
        isMobile ? "grid grid-cols-1 gap-3" : "grid grid-cols-4 gap-4"
      )}
    >
      <div className="space-y-2">
        <Label htmlFor="indexer" className="text-sm">
          {localizedText("Indexer")}
        </Label>
        <Select
          value={selectedIndexer}
          onValueChange={setSelectedIndexer}
          disabled={availableIndexers.length === 1}
        >
          <SelectTrigger
            id="indexer"
            lang={languageFor("All Indexers")}
            dir={directionFor("All Indexers")}
          >
            <SelectValue placeholder={t("All Indexers")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {availableIndexers.length === 1
                ? availableIndexers[0]
                : localizedText("All Indexers")}
            </SelectItem>
            {availableIndexers.length > 1 &&
              availableIndexers.map((indexer) => (
                <SelectItem key={indexer} value={indexer as string}>
                  {indexer}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">{localizedText("Release Groups")}</Label>
        <MultiSelect
          {...localizedMultiSelectProps("Select groups...")}
          options={availableGroups.map((g) => ({ label: g as string, value: g as string }))}
          selected={selectedGroups}
          onChange={setSelectedGroups}
          className="w-full"
        />
        {selectedGroupsToSave.length > 0 && (
          <div className="space-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={savePreferredGroupsMutation.isPending}
              onClick={() => savePreferredGroupsMutation.mutate(selectedGroupsToSave)}
            >
              <Plus className="h-4 w-4" />
              {savePreferredGroupsMutation.isPending
                ? "Saving groups..."
                : "Add to preferred groups"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {localizedText(
                "Saves these groups in Settings without changing your automatic search filter."
              )}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm">{localizedText("Platform")}</Label>
        <MultiSelect
          {...localizedMultiSelectProps(
            availablePlatforms.length === 0 ? "No platforms detected" : "All platforms"
          )}
          options={availablePlatforms}
          selected={selectedPlatforms}
          onChange={setSelectedPlatforms}
          className="w-full"
          disabled={availablePlatforms.length === 0}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="minSeeders" className="text-sm">
          {localizedText("Min Seeders")}
        </Label>
        <Input
          id="minSeeders"
          type="number"
          min="0"
          value={minSeeders}
          onChange={(e) => setMinSeeders(Number.parseInt(e.target.value) || 0)}
          className="w-full"
        />
      </div>

      <div className={cn("space-y-2", !isMobile && "col-span-4")}>
        <Label className="text-sm">{localizedText("Categories")}</Label>
        <div className="flex flex-wrap gap-2">
          {(["main", "update", "dlc", "packs", "extra"] as const).map((cat) => (
            <div key={cat} className="flex items-center">
              <Checkbox
                id={`cat-${cat}`}
                checked={visibleCategories.has(cat)}
                onCheckedChange={() => toggleCategory(cat)}
              />
              <label htmlFor={`cat-${cat}`} className="ml-2 text-sm cursor-pointer capitalize">
                {categoryLabel(cat)}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ─── Shared: Search + filter bar ─────────────────────────────────────────────

  const searchBar = (
    <div className="space-y-3">
      <Input
        type="text"
        placeholder={t("Search for downloads...")}
        lang={searchQuery ? "und" : languageFor("Search for downloads...")}
        dir="auto"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {localizedText(showFilters ? "Hide Filters" : "Show Filters")}
        </Button>
        {minSeeders > 0 && (
          <Badge variant="secondary" className="text-xs">
            {localizedText("Min Seeders")}: {formatNumber(minSeeders)}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs capitalize">
          {localizedText("Sorted by:")}{" "}
          {localizedText(
            (
              {
                seeders: "Health",
                date: "Date",
                size: "Size",
                priority: "Priority",
                score: "Score",
              } as const
            )[sortBy]
          )}{" "}
          ({localizedText(sortOrder === "asc" ? "Asc" : "Desc")})
        </Badge>
      </div>
      {filterPanel}
    </div>
  );

  // ─── Shared: Results body ─────────────────────────────────────────────────────

  const resultsBody = (
    <div className="space-y-4">
      {downloadingGuid !== null && (
        <span className="sr-only" role="status">
          {localizedText("Downloading selected release...")}
        </span>
      )}
      {isSearching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">{localizedText("Searching...")}</span>
        </div>
      )}

      {!isSearching && searchResults && searchResults.items.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{localizedText("No Results Found")}</CardTitle>
            <CardDescription>
              {searchResults.blacklistedCount
                ? searchResults.blacklistedCount === 1
                  ? localizedText(
                      "This result is blacklisted. Review the blacklist in game settings."
                    )
                  : localizedText(
                      "All {count} results are blacklisted. Review the blacklist in game settings.",
                      { count: searchResults.blacklistedCount }
                    )
                : localizedText(
                    "No downloads found for this game. Try configuring indexers in settings."
                  )}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isSearching &&
        searchResults &&
        searchResults.items.length > 0 &&
        (() => {
          const totalFiltered = Object.values(filteredCategorizedDownloads).reduce(
            (sum, arr) => sum + arr.length,
            0
          );
          const totalWithoutPlatformFilter = Object.entries(categorizedDownloads).reduce(
            (sum, [cat, downloads]) => {
              if (!visibleCategories.has(cat as DownloadCategory)) return sum;
              return (
                sum +
                downloads
                  .filter((t) => meetsSeederThreshold(t))
                  .filter((t) => selectedIndexer === "all" || t.indexerName === selectedIndexer)
                  .filter(
                    (t) =>
                      selectedGroups.length === 0 || (t.group && selectedGroups.includes(t.group))
                  )
                  // Apply the Platforms setting here too, so this baseline reflects
                  // only the in-dialog platform selection. Otherwise a release
                  // hidden by the Platforms setting would make the warning below
                  // claim the preferred-platform filter is at fault, and clearing
                  // that filter would still show nothing.
                  .filter((t) =>
                    matchesSelectedIgdbPlatform(
                      itemsMetadata.get(t.title)?.platform,
                      userSettings?.importPlatformIds
                    )
                  ).length
              );
            },
            0
          );
          const platformFilterHidesAll =
            selectedPlatforms.length > 0 && totalFiltered === 0 && totalWithoutPlatformFilter > 0;

          return (
            <div className="space-y-8">
              {platformFilterHidesAll && (
                <div className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <span>
                      {localizedText("No results for selected platforms:")}{" "}
                      <strong>{selectedPlatforms.join(", ")}</strong>
                    </span>{" "}
                    <button
                      type="button"
                      className="underline hover:text-amber-100 transition-colors"
                      onClick={() => setSelectedPlatforms([])}
                    >
                      {localizedText("Show all results")}
                    </button>
                  </div>
                </div>
              )}

              {(["main", "update", "dlc", "packs", "extra"] as const).map((category) => {
                const downloadsInCategory = filteredCategorizedDownloads[category] || [];
                if (downloadsInCategory.length === 0) return null;

                return (
                  <div key={category} className="relative">
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <h3 className="font-bold text-lg capitalize tracking-tight">
                        {categoryLabel(category)}
                      </h3>
                      <Badge variant="secondary" className="text-xs font-semibold">
                        {formatNumber(downloadsInCategory.length)}
                      </Badge>
                    </div>

                    <div className="border rounded-md divide-y mb-4 bg-card">
                      {/* Desktop sticky sort header */}
                      {!isMobile && (
                        <div className="sticky top-0 z-10 bg-muted/95 backdrop-blur-md p-3 text-xs font-bold flex items-center px-4 border-b rounded-t-md group">
                          <div className="flex-1 flex items-center">
                            <span className="text-muted-foreground/70 uppercase tracking-widest">
                              {localizedText("Release Information")}
                            </span>
                          </div>
                          <div className="flex items-center gap-6 md:gap-10">
                            {hasScoredResults && (
                              <SortHeader
                                field="score"
                                label="Score"
                                className="min-w-[70px] justify-end"
                              />
                            )}
                            {resultIndexerNames.length > 1 && (
                              <SortHeader
                                field="priority"
                                label="Priority"
                                className="min-w-[70px] justify-end"
                              />
                            )}
                            <SortHeader
                              field="date"
                              label="Date"
                              className="min-w-[70px] justify-end"
                            />
                            <SortHeader
                              field="size"
                              label="Size"
                              className="min-w-[70px] justify-end"
                            />
                            <SortHeader
                              field="seeders"
                              label="Health"
                              className="min-w-[70px] justify-end"
                            />
                            <div className="w-[112px] text-right text-muted-foreground/70 uppercase tracking-widest">
                              {localizedText("Actions")}
                            </div>
                          </div>
                        </div>
                      )}

                      {downloadsInCategory.map((download: DownloadItem, downloadIndex: number) => {
                        const labelIdPrefix = `${downloadLabelIdPrefix}-${category}-${downloadIndex}`;
                        const actionLabelId = `${labelIdPrefix}-action`;
                        const titleLabelId = `${labelIdPrefix}-title`;
                        const isUsenet = isUsenetItem(download);
                        const downloadId = download.guid || download.link;
                        const isCurrentDownload = downloadingGuid === downloadId;
                        const metadata =
                          itemsMetadata.get(download.title) ?? parseReleaseMetadata(download.title);

                        let healthColor: string;
                        if (isUsenet) {
                          const grabs = download.grabs ?? 0;
                          if (grabs > 100) healthColor = "text-green-500";
                          else if (grabs > 20) healthColor = "text-amber-500";
                          else healthColor = "text-red-500";
                        } else {
                          const seeders = download.seeders ?? 0;
                          if (seeders >= 20) healthColor = "text-green-500";
                          else if (seeders >= 5) healthColor = "text-amber-500";
                          else healthColor = "text-red-500";
                        }

                        const pubDate = new Date(download.pubDate);
                        const hoursOld = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
                        const isNew = hoursOld <= 24;

                        // ── Shared: actions dropdown ────────────────────────
                        const actionsDropdown = (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                aria-label={translateText("More download options")}
                                lang={languageFor("More download options")}
                                dir={directionFor("More download options")}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  void copyToClipboard(download.link).then((succeeded) => {
                                    toast({
                                      description: succeeded
                                        ? "Link copied to clipboard"
                                        : "Copy failed",
                                      variant: succeeded ? undefined : "destructive",
                                    });
                                  });
                                }}
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                <InterfaceText source={"Copy"} />{" "}
                                {isUsenet ? (
                                  <InterfaceText source={"NZB"} />
                                ) : (
                                  <InterfaceText source={"Torrent"} />
                                )}{" "}
                                <InterfaceText source={"Link"} />
                              </DropdownMenuItem>

                              {(() => {
                                const compatibleDownloaders = downloaders.filter((d) =>
                                  isUsenet
                                    ? isUsenetDownloaderType(d.type)
                                    : isTorrentDownloaderType(d.type)
                                );
                                if (compatibleDownloaders.length <= 1) return null;
                                return (
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <Download className="h-4 w-4 mr-2" />
                                      <InterfaceText source={"Send to downloader"} />
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                      <DropdownMenuSubContent>
                                        {compatibleDownloaders.map((d) => (
                                          <DropdownMenuItem
                                            key={d.id}
                                            onClick={() =>
                                              sendToDownloaderMutation.mutate({
                                                download,
                                                downloaderId: d.id,
                                                downloaderName: d.name,
                                              })
                                            }
                                          >
                                            {d.name}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                  </DropdownMenuSub>
                                );
                              })()}

                              <DropdownMenuItem
                                onClick={() => blacklistMutation.mutate(download)}
                                disabled={blacklistMutation.isPending}
                                className="text-destructive focus:text-destructive"
                              >
                                <Ban className="h-4 w-4 mr-2" />
                                <InterfaceText source={"Blacklist release"} />
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        );

                        const directDownloadAction = safeUrl(download.link, "") ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9"
                                aria-label={formatInterfaceMessage(
                                  "Download {fileType} file for {title}",
                                  {
                                    fileType: isUsenet ? "NZB" : t("Torrent"),
                                    title: download.title.replace(/[._]/g, " "),
                                  },
                                  language
                                )}
                                onClick={() => handleDirectDownload(download)}
                              >
                                <FileDown className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <InterfaceText source="Download" />{" "}
                              <InterfaceText
                                source="{extension} file"
                                values={{ extension: isUsenet ? ".nzb" : ".torrent" }}
                              />
                            </TooltipContent>
                          </Tooltip>
                        ) : null;

                        // ── Mobile: stacked card ────────────────────────────
                        if (isMobile) {
                          return (
                            <div
                              key={download.guid || download.link}
                              className="p-3 text-sm overflow-hidden"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                {/* Type icon */}
                                <div
                                  className={cn(
                                    "h-5 w-5 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5",
                                    isUsenet ? "text-amber-500" : "text-violet-500"
                                  )}
                                >
                                  {isUsenet ? (
                                    <Newspaper className="h-4 w-4" />
                                  ) : (
                                    <Magnet className="h-4 w-4" />
                                  )}
                                </div>

                                <div className="flex-1 min-w-0 overflow-hidden">
                                  {/* Title row + actions */}
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start gap-1.5 min-w-0">
                                        <h4 className="font-semibold text-sm leading-snug break-words min-w-0 flex-1">
                                          {download.comments ? (
                                            <a
                                              href={safeUrl(download.comments)}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="hover:underline cursor-pointer"
                                              onClick={(event) => event.stopPropagation()}
                                            >
                                              <span id={titleLabelId} lang="und" dir="auto">
                                                {download.title}
                                              </span>
                                            </a>
                                          ) : (
                                            <span id={titleLabelId} lang="und" dir="auto">
                                              {download.title}
                                            </span>
                                          )}
                                        </h4>
                                        {isNew && (
                                          <Badge
                                            variant="default"
                                            className="h-4 px-1 text-[8px] uppercase bg-blue-600 hover:bg-blue-600 flex-shrink-0 mt-0.5"
                                          >
                                            <InterfaceText source={"NEW"} />
                                          </Badge>
                                        )}
                                        <ReleaseScoreBadge
                                          evaluation={download.releaseEvaluation}
                                        />
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0 self-start">
                                      {directDownloadAction}
                                      <Button
                                        variant="ghost"
                                        size={isCurrentDownload ? "sm" : "icon"}
                                        onClick={() => handleDownload(download)}
                                        disabled={downloadingGuid !== null}
                                        className={cn(
                                          "h-9 hover:bg-primary hover:text-primary-foreground transition-all",
                                          isCurrentDownload
                                            ? "min-w-[120px] gap-1.5 px-2"
                                            : "w-9 px-0"
                                        )}
                                        aria-labelledby={`${actionLabelId} ${titleLabelId}`}
                                        aria-busy={isCurrentDownload}
                                      >
                                        <span
                                          id={actionLabelId}
                                          className="sr-only"
                                          lang={languageFor("Download")}
                                          dir={directionFor("Download")}
                                        >
                                          {isCurrentDownload
                                            ? localizedText("Downloading...")
                                            : translateText("Download")}
                                        </span>
                                        {isCurrentDownload ? (
                                          <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            <span>
                                              <InterfaceText source={"Downloading..."} />
                                            </span>
                                          </>
                                        ) : (
                                          <Download className="h-4 w-4" />
                                        )}
                                      </Button>
                                      {actionsDropdown}
                                    </div>
                                  </div>

                                  {/* Metadata badges */}
                                  <ReleaseMetadataBadges
                                    metadata={metadata}
                                    isUsenet={isUsenet}
                                    downloadVolumeFactor={download.downloadVolumeFactor}
                                    className="mt-1"
                                  />

                                  {/* Group + indexer line */}
                                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mt-1 min-w-0 overflow-hidden">
                                    {metadata.group && (
                                      <span className="font-bold text-foreground/50 truncate shrink-0 max-w-[120px]">
                                        {metadata.group}
                                      </span>
                                    )}
                                    {metadata.group && <span className="flex-shrink-0">•</span>}
                                    <span className="truncate">{download.indexerName}</span>
                                  </div>

                                  {/* Metrics row */}
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5 text-xs text-muted-foreground/70">
                                    <span className="font-mono font-bold text-foreground/70">
                                      {download.size ? formatBytes(download.size) : "—"}
                                    </span>
                                    <span>•</span>
                                    <span className={cn("flex items-center gap-0.5", healthColor)}>
                                      <Activity className="h-3 w-3" />
                                      {isUsenet
                                        ? formatNumber(download.grabs ?? 0)
                                        : formatNumber(download.seeders ?? 0)}{" "}
                                      {localizedText(isUsenet ? "grabs" : "seeders")}
                                    </span>
                                    <span>•</span>
                                    <span>{formatDate(download.pubDate)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

                        // ── Desktop: table row ──────────────────────────────
                        return (
                          <div
                            key={download.guid || download.link}
                            className="p-4 text-sm hover:bg-muted/30 transition-colors group/row"
                          >
                            <div className="flex items-center gap-4">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={cn(
                                          "h-5 w-5 flex items-center justify-center rounded-full flex-shrink-0",
                                          isUsenet ? "text-amber-500" : "text-violet-500"
                                        )}
                                      >
                                        {isUsenet ? (
                                          <Newspaper className="h-4 w-4" />
                                        ) : (
                                          <Magnet className="h-4 w-4" />
                                        )}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {isUsenet ? (
                                        <InterfaceText source={"Usenet (NZB)"} />
                                      ) : (
                                        <InterfaceText source={"Torrent"} />
                                      )}
                                    </TooltipContent>
                                  </Tooltip>

                                  <h4 className="font-bold text-base leading-tight break-words min-w-0">
                                    {download.comments ? (
                                      <a
                                        href={safeUrl(download.comments)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline cursor-pointer"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        <span id={titleLabelId} lang="und" dir="auto">
                                          {download.title}
                                        </span>
                                      </a>
                                    ) : (
                                      <span id={titleLabelId} lang="und" dir="auto">
                                        {download.title}
                                      </span>
                                    )}
                                  </h4>

                                  {isNew && (
                                    <Badge
                                      variant="default"
                                      className="h-4 px-1 text-[8px] uppercase bg-blue-600 hover:bg-blue-600"
                                    >
                                      <InterfaceText source={"NEW"} />
                                    </Badge>
                                  )}
                                  <ReleaseScoreBadge evaluation={download.releaseEvaluation} />
                                </div>

                                <ReleaseMetadataBadges
                                  metadata={metadata}
                                  isUsenet={isUsenet}
                                  downloadVolumeFactor={download.downloadVolumeFactor}
                                  className="gap-1.5"
                                />

                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                                  {metadata.group && (
                                    <span className="font-bold text-foreground/50">
                                      {metadata.group}
                                    </span>
                                  )}
                                  {metadata.group && <span>•</span>}
                                  <span>{download.indexerName}</span>
                                  {isUsenet && download.poster && (
                                    <>
                                      <span>•</span>
                                      <span
                                        className="truncate max-w-[160px]"
                                        title={download.poster}
                                      >
                                        {download.poster}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-6 md:gap-10 flex-shrink-0">
                                {resultIndexerNames.length > 1 && (
                                  <div className="min-w-[70px] text-right font-mono text-xs font-bold">
                                    {formatOptionalNumber(
                                      indexerPriorityMap.get(download.indexerName ?? "")
                                    )}
                                  </div>
                                )}

                                <div className="min-w-[70px] text-right">
                                  <div className="text-xs font-medium">
                                    {formatDate(download.pubDate)}
                                  </div>
                                  <div className="text-xs text-muted-foreground/50">
                                    {localizedAge(isUsenet ? download.age : hoursOld / 24)}
                                  </div>
                                </div>

                                <div className="min-w-[70px] text-right font-mono text-xs font-bold">
                                  {download.size ? formatBytes(download.size) : "-"}
                                </div>

                                <div
                                  className={cn(
                                    "min-w-[70px] text-right flex flex-col items-end justify-center",
                                    healthColor
                                  )}
                                >
                                  <div className="flex items-center gap-1 font-bold">
                                    <Activity className="h-3 w-3" />
                                    {isUsenet
                                      ? formatNumber(download.grabs ?? 0)
                                      : formatNumber(download.seeders ?? 0)}
                                  </div>
                                  <div className="text-xs uppercase font-bold opacity-70">
                                    {localizedText(isUsenet ? "grabs" : "seeders")}
                                  </div>
                                  {!isUsenet && download.leechers != null && (
                                    <div className="text-[10px] text-muted-foreground/60">
                                      {formatNumber(download.leechers)}
                                      <InterfaceText source={"L"} />
                                    </div>
                                  )}
                                </div>

                                <div
                                  className={cn(
                                    "flex items-center justify-end gap-1",
                                    isCurrentDownload ? "w-[200px]" : "w-[112px]"
                                  )}
                                >
                                  {directDownloadAction}
                                  <Button
                                    variant="ghost"
                                    size={isCurrentDownload ? "sm" : "icon"}
                                    onClick={() => handleDownload(download)}
                                    disabled={downloadingGuid !== null}
                                    className={cn(
                                      "h-9 hover:bg-primary hover:text-primary-foreground transition-all",
                                      isCurrentDownload ? "min-w-[120px] gap-1.5 px-2" : "w-9 px-0"
                                    )}
                                    aria-labelledby={`${actionLabelId} ${titleLabelId}`}
                                    aria-busy={isCurrentDownload}
                                  >
                                    <span
                                      id={actionLabelId}
                                      className="sr-only"
                                      lang={languageFor("Download")}
                                      dir={directionFor("Download")}
                                    >
                                      {isCurrentDownload
                                        ? localizedText("Downloading...")
                                        : translateText("Download")}
                                    </span>
                                    {isCurrentDownload ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        <span>
                                          <InterfaceText source={"Downloading..."} />
                                        </span>
                                      </>
                                    ) : (
                                      <Download className="h-4 w-4" />
                                    )}
                                  </Button>
                                  {actionsDropdown}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

      {searchResults?.errors && searchResults.errors.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">
              {localizedText("Indexer Errors")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-1">
              {searchResults.errors.map((error, index) => (
                <li key={index} className="text-muted-foreground">
                  • <ApiErrorDetailText source={error} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ─── Bundle dialog (shared) ───────────────────────────────────────────────────

  const bundleDialog = (
    <AlertDialog open={showBundleDialog} onOpenChange={setShowBundleDialog}>
      <AlertDialogContent className="max-w-2xl" dir={directionFor("Download")}>
        <AlertDialogHeader>
          <AlertDialogTitle>{localizedText(bundleDialogTitle)}</AlertDialogTitle>
          <AlertDialogDescription>
            {hasUpdates ? (
              <>
                {filteredCategorizedDownloads.update.length === 1
                  ? localizedText(
                      "One update is available for this game. Select whether to download it with the main game."
                    )
                  : filteredCategorizedDownloads.update.length === 2
                    ? localizedText(
                        "Two updates are available for this game. Select whether to download them with the main game."
                      )
                    : localizedText(
                        "{count} updates are available for this game. Select which ones to download with the main game.",
                        { count: filteredCategorizedDownloads.update.length }
                      )}{" "}
                {hasRecommendedExtras
                  ? localizedText(
                      "Updates are selected by default; small extras are optional and start unchecked."
                    )
                  : localizedText(
                      "Updates are selected by default; uncheck any you don't want with the main game."
                    )}
              </>
            ) : (
              localizedText(
                "Each suggested extra is no larger than 25% of the main release size. Select any you'd like to download with the main game."
              )
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {filteredCategorizedDownloads.update.length > 0 && (
          <div className="my-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">{localizedText("Available Updates:")}</div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAllUpdates}
                  className="h-7 text-xs"
                >
                  {localizedText("Select All")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deselectAllUpdates}
                  className="h-7 text-xs"
                >
                  {localizedText("Deselect All")}
                </Button>
              </div>
            </div>
            <div className="border rounded-md">
              <ScrollArea
                style={{
                  height: Math.min(300, 24 + filteredCategorizedDownloads.update.length * 64),
                }}
              >
                <div className="p-3 space-y-3">
                  {filteredCategorizedDownloads.update.map((update, index) => (
                    <div
                      key={update.guid || update.link}
                      className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`update-${index}`}
                        checked={selectedUpdateIndices.has(index)}
                        onCheckedChange={() => toggleUpdateSelection(index)}
                        className="mt-1"
                      />
                      <label htmlFor={`update-${index}`} className="flex-1 cursor-pointer text-sm">
                        <div className="font-medium" lang="und" dir="auto">
                          {update.title}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                          {update.size && <span>{formatBytes(update.size)}</span>}
                          {update.seeders !== undefined && (
                            <>
                              <span>•</span>
                              <span className="text-green-600">
                                {formatNumber(update.seeders)} {localizedText("seeders")}
                              </span>
                            </>
                          )}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {localizedText("Selection: {count}/{total}", {
                count: selectedUpdateIndices.size,
                total: filteredCategorizedDownloads.update.length,
              })}
            </div>
          </div>
        )}

        {recommendedExtras.length > 0 && (
          <div className="my-4">
            <div className="text-sm font-semibold mb-2">
              {localizedText("Small extras (optional)")}
            </div>
            <div className="text-xs text-muted-foreground mb-2">
              {localizedText(
                "Each suggested extra is 25% or less of the {size} main release. Nothing here is selected automatically.",
                { size: selectedMainDownload?.size ? formatBytes(selectedMainDownload.size) : "—" }
              )}
            </div>
            <div className="border rounded-md">
              <ScrollArea style={{ height: Math.min(160, 24 + recommendedExtras.length * 64) }}>
                <div className="p-3 space-y-3">
                  {recommendedExtras.map((extra, index) => (
                    <div
                      key={extra.guid || extra.link}
                      className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`extra-${index}`}
                        checked={selectedExtraIndices.has(index)}
                        onCheckedChange={() => toggleExtraSelection(index)}
                        className="mt-1"
                      />
                      <label htmlFor={`extra-${index}`} className="flex-1 cursor-pointer text-sm">
                        <div className="font-medium">{extra.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {extra.size ? formatBytes(extra.size) : localizedText("Size unavailable")}
                        </div>
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>{localizedText("Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "outline" })}
            onClick={() => {
              if (isDirectDownloadMode) void handleBundleDirectDownload(false);
              else handleBundleDownload(false);
            }}
          >
            {localizedText("Download game only")}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => {
              if (isDirectDownloadMode) void handleBundleDirectDownload(true);
              else handleBundleDownload(true);
            }}
            disabled={selectedBundleAddons.length === 0}
          >
            <PackagePlus className="w-4 h-4 mr-2" />
            {selectedExtraIndices.size > 0
              ? formatInterfaceMessage("Download with {name}", { name: selectedBundleAddonLabel })
              : selectedUpdateIndices.size === 1
                ? localizedText("Download with one update")
                : selectedUpdateIndices.size === 2
                  ? localizedText("Download with two updates")
                  : localizedText("Download with {count} updates", {
                      count: selectedUpdateIndices.size,
                    })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ─── Mobile: Drawer ───────────────────────────────────────────────────────────

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
          <DrawerContent className="h-[95vh] flex flex-col" dir={directionFor("Download")}>
            <DrawerHeader className="pt-2 pb-0 px-4 flex-shrink-0">
              <DrawerTitle className="text-base font-bold truncate">
                {localizedText("Download")}{" "}
                <span lang="und" dir="auto">
                  {game.title}
                </span>
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {localizedText("Search results for torrents and NZBs matching this game.")}
              </DrawerDescription>
            </DrawerHeader>

            {/* Sticky search + filter */}
            <div className="flex-shrink-0 px-4 pt-3 pb-3 space-y-3 border-b border-border/50">
              {searchBar}
            </div>

            {/* Scrollable results */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">{resultsBody}</div>
          </DrawerContent>
        </Drawer>
        {bundleDialog}
      </>
    );
  }

  // ─── Desktop: Dialog ──────────────────────────────────────────────────────────

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="w-[96vw] max-w-[2000px] max-h-[90vh] flex flex-col"
          dir={directionFor("Download")}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {localizedText("Download")}{" "}
              <span lang="und" dir="auto">
                {game.title}
              </span>
            </DialogTitle>
            <DialogDescription>
              {localizedText("Search results for torrents and NZBs matching this game.")}{" "}
              <span className="text-muted-foreground/80">
                {localizedText(
                  "Tip: Enable auto-download in Settings to automatically download new releases."
                )}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-shrink-0 mt-4">{searchBar}</div>

          <div className="flex-1 mt-4 overflow-y-auto min-h-0">
            <div className="space-y-4 pr-4">{resultsBody}</div>
          </div>
        </DialogContent>
      </Dialog>
      {bundleDialog}
    </>
  );
}
