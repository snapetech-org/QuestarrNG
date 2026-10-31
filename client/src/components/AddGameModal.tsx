import {
  getRegionalDirection,
  getRegionalLocale,
  parseRegionalNumber,
} from "@/lib/regional-format";
import { coverSrc } from "@/lib/cover";
import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Star, AlertCircle, Calendar, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { type Game, type InsertGame, type Config, type UserSettings } from "@shared/schema";
import { visibleIgdbPlatforms } from "@shared/platforms";
import { mapGameToInsertGame } from "@/lib/utils";
import { Link } from "wouter";
import { apiFetch, apiRequest, throwIfResNotOk } from "@/lib/queryClient";
import { getAddGamePendingQuery, clearAddGamePendingQuery } from "@/lib/add-game-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveTargetPlatform } from "@shared/title-utils";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface SearchResult extends Game {
  inCollection?: boolean;
  platformOptions?: IGDBPlatform[];
}

interface AddGameModalProps {
  children: React.ReactNode;
  initialQuery?: string;
}

interface IGDBPlatform {
  id: number;
  name: string;
}

const EMPTY_GAMES: Game[] = [];

export default function AddGameModal({ children, initialQuery }: AddGameModalProps) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showUndatedGames, setShowUndatedGames] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const [releaseYear, setReleaseYear] = useState("");
  const [targetPlatforms, setTargetPlatforms] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const regionalLocale = getRegionalLocale() ?? Intl.DateTimeFormat().resolvedOptions().locale;
  const regionalDirection = getRegionalDirection(regionalLocale);
  const parsedReleaseYear = parseRegionalNumber(releaseYear, regionalLocale);
  const hasValidReleaseYear =
    parsedReleaseYear !== null &&
    Number.isInteger(parsedReleaseYear) &&
    parsedReleaseYear >= 1950 &&
    parsedReleaseYear <= 2100;
  const canSearchWithReleaseYear = releaseYear === "" || hasValidReleaseYear;

  const { data: config } = useQuery<Config>({
    queryKey: ["/api/config"],
    queryFn: () => apiRequest("GET", "/api/config").then((res) => res.json()),
  });

  const { data: platforms = [] } = useQuery<IGDBPlatform[]>({
    queryKey: ["/api/igdb/platforms"],
    queryFn: () => apiRequest("GET", "/api/igdb/platforms").then((res) => res.json()),
    enabled: open && !!config?.igdb?.configured,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    enabled: open,
  });
  // The Platforms setting governs every platform selector, this one included.
  const displayPlatforms = useMemo(
    () => visibleIgdbPlatforms(platforms, userSettings?.importPlatformIds),
    [platforms, userSettings?.importPlatformIds]
  );

  // A previously chosen platform can be excluded by the Platforms setting after
  // this modal was last opened. Reset to "all" so the search does not keep
  // querying a platform the dropdown no longer offers.
  useEffect(() => {
    if (selectedPlatform === "all") return;
    if (displayPlatforms.some((platform) => String(platform.id) === selectedPlatform)) return;
    setSelectedPlatform("all");
  }, [displayPlatforms, selectedPlatform]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Per-result target overrides only apply to the current discovery result set.
  useEffect(() => {
    setTargetPlatforms({});
  }, [searchQuery, selectedPlatform, releaseYear, showUndatedGames]);

  // Pre-fill search when modal opens (from prop or from the dashboard store)
  useEffect(() => {
    if (open) {
      const fromStore = getAddGamePendingQuery();
      const queryToUse = initialQuery ?? (fromStore || "");
      if (queryToUse) {
        setSearchQuery(queryToUse);
        setDebouncedQuery(queryToUse);
        clearAddGamePendingQuery();
      }
    } else {
      setSearchQuery("");
      setDebouncedQuery("");
      setShowUndatedGames(false);
      setSelectedPlatform("all");
      setReleaseYear("");
      setTargetPlatforms({});
    }
  }, [open, initialQuery]);

  // Search IGDB for games
  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: [
      "/api/igdb/search",
      debouncedQuery,
      showUndatedGames,
      selectedPlatform,
      parsedReleaseYear ?? releaseYear,
    ],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      const params = new URLSearchParams({
        q: debouncedQuery,
        limit: "10",
        includeUndated: String(showUndatedGames),
      });
      if (selectedPlatform !== "all") params.set("platform", selectedPlatform);
      if (hasValidReleaseYear) {
        params.set("year", String(parsedReleaseYear));
      }
      const response = await apiFetch(`/api/igdb/search?${params.toString()}`);
      await throwIfResNotOk(response);
      const data: unknown = await response.json();
      return Array.isArray(data) ? data.slice(0, 10) : [];
    },
    enabled:
      debouncedQuery.trim().length > 2 && canSearchWithReleaseYear && !!config?.igdb?.configured,
  });

  // Get user's collection to check if games are already added
  const { data: userGames = EMPTY_GAMES } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  // Add game mutation
  const addGameMutation = useMutation({
    mutationFn: async (gameData: InsertGame) => {
      const response = await apiFetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gameData),
      });
      await throwIfResNotOk(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      toast({
        description: (
          <span
            lang={languageFor("interface.game_added_to_collection_successfu_0b0de90f")}
            dir={directionFor("interface.game_added_to_collection_successfu_0b0de90f")}
          >
            {t("interface.game_added_to_collection_successfu_0b0de90f")}
          </span>
        ),
      });
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search is handled by the debounced query
  };

  const handleReleaseYearChange = (value: string) => {
    setReleaseYear(value);
    const parsedYear = parseRegionalNumber(value, regionalLocale);
    if (
      parsedYear !== null &&
      Number.isInteger(parsedYear) &&
      parsedYear >= 1950 &&
      parsedYear <= 2100
    ) {
      setShowUndatedGames(false);
    }
  };

  const renderDiscoveryFilters = (compact = false) => (
    <div className={compact ? "space-y-2" : "mb-4 space-y-4"}>
      <div className="grid grid-cols-2 gap-2">
        <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
          <SelectTrigger
            aria-label={t("interface.platform_filter_8216ff70")}
            lang={languageFor("interface.platform_filter_8216ff70")}
            dir={directionFor("interface.platform_filter_8216ff70")}
          >
            <SelectValue placeholder={t("interface.all_platforms_4bed1134")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value="all"
              lang={languageFor("interface.all_platforms_4bed1134")}
              dir={directionFor("interface.all_platforms_4bed1134")}
            >
              {t("interface.all_platforms_4bed1134")}
            </SelectItem>
            {displayPlatforms.map((platform) => (
              <SelectItem key={platform.id} value={String(platform.id)}>
                {platform.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="text"
          inputMode="numeric"
          placeholder={t("interface.release_year_e4615ec7")}
          value={releaseYear}
          onChange={(event) => handleReleaseYearChange(event.target.value)}
          aria-label={t("interface.release_year_filter_3b994a57")}
          lang={regionalLocale}
          dir={regionalDirection}
        />
      </div>
      <div
        className={
          compact
            ? "flex items-center justify-between gap-2"
            : "flex items-center justify-between gap-2 rounded-md border px-4 py-2"
        }
      >
        <div className={compact ? undefined : "space-y-1"}>
          <p className={compact ? "text-xs text-muted-foreground" : "text-sm font-medium"}>
            <span
              lang={languageFor("interface.show_undated_games_first_cf4b82d4")}
              dir={directionFor("interface.show_undated_games_first_cf4b82d4")}
            >
              {t("interface.show_undated_games_first_cf4b82d4")}
            </span>
          </p>
          {!compact && (
            <p className="text-xs text-muted-foreground">
              <span
                lang={languageFor("interface.include_titles_without_a_release_d_c3584b75")}
                dir={directionFor("interface.include_titles_without_a_release_d_c3584b75")}
              >
                {t("interface.include_titles_without_a_release_d_c3584b75")}
              </span>
            </p>
          )}
        </div>
        <Switch
          checked={showUndatedGames}
          onCheckedChange={setShowUndatedGames}
          disabled={hasValidReleaseYear}
          aria-label={t("interface.show_undated_games_first_cf4b82d4")}
          lang={languageFor("interface.show_undated_games_first_cf4b82d4")}
          dir={directionFor("interface.show_undated_games_first_cf4b82d4")}
        />
      </div>
    </div>
  );
  const getSupportedTargetOptions = (game: SearchResult) =>
    game.platformOptions?.filter(({ id, name }) => resolveTargetPlatform(id, name)) ?? [];

  const getTargetPlatformValue = (game: SearchResult) => {
    const supportedOptions = getSupportedTargetOptions(game);
    const key = String(game.igdbId ?? game.id);
    const explicitValue = targetPlatforms[key];
    if (
      explicitValue &&
      (explicitValue === "default" ||
        supportedOptions.some(({ id }) => String(id) === explicitValue))
    ) {
      return explicitValue;
    }
    if (
      selectedPlatform !== "all" &&
      supportedOptions.some(({ id }) => String(id) === selectedPlatform)
    ) {
      return selectedPlatform;
    }
    return supportedOptions.length === 1 ? String(supportedOptions[0]!.id) : "default";
  };

  const renderTargetPlatformSelect = (game: SearchResult) => {
    const supportedOptions = getSupportedTargetOptions(game);
    if (game.inCollection || !supportedOptions?.length) return null;
    const key = String(game.igdbId ?? game.id);
    return (
      <Select
        value={getTargetPlatformValue(game)}
        onValueChange={(value) => setTargetPlatforms((current) => ({ ...current, [key]: value }))}
      >
        <SelectTrigger
          className="h-8 w-full max-w-64 text-xs"
          aria-label={formatInterfaceMessage("interface.target_platform_for_title_57b072f4", {
            title: game.title,
          })}
          lang={languageFor("interface.target_platform_for_title_57b072f4")}
          dir={directionFor("interface.target_platform_for_title_57b072f4")}
        >
          <SelectValue placeholder={t("interface.account_default_a3be6849")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            value="default"
            lang={languageFor("interface.account_default_a3be6849")}
            dir={directionFor("interface.account_default_a3be6849")}
          >
            {t("interface.account_default_a3be6849")}
          </SelectItem>
          {supportedOptions.map((platform) => (
            <SelectItem key={platform.id} value={String(platform.id)}>
              {platform.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };
  const handleAddGame = (searchResult: SearchResult) => {
    const selectedTarget = getTargetPlatformValue(searchResult);
    const targetPlatform = searchResult.platformOptions?.find(
      ({ id }) => String(id) === selectedTarget
    );
    const gameData = mapGameToInsertGame({
      ...searchResult,
      targetPlatformId: targetPlatform?.id ?? null,
      targetPlatformName: targetPlatform?.name ?? null,
    });
    addGameMutation.mutate(gameData);
  };

  const userGameIgdbIds = useMemo(() => {
    const ids = new Set<number>();
    for (const g of userGames) {
      if (g.igdbId != null) ids.add(g.igdbId);
    }
    return ids;
  }, [userGames]);

  // Mark games already in collection
  const resultsWithCollectionStatus: SearchResult[] = useMemo(() => {
    return searchResults.slice(0, 10).map((game: Game) => ({
      ...game,
      inCollection: game.igdbId != null ? userGameIgdbIds.has(game.igdbId) : false,
    }));
  }, [searchResults, userGameIgdbIds]);

  const igdbNotConfigured = config && !config.igdb?.configured;

  const isAddingGame = (igdbId: number | null | undefined) =>
    addGameMutation.isPending && addGameMutation.variables?.igdbId === igdbId;

  // ─── Mobile layout (bottom sheet) ────────────────────────────────────────────

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerTrigger asChild>{children}</DrawerTrigger>
        <DrawerContent className="h-[92vh] flex flex-col">
          <DrawerHeader className="pt-2 pb-0 px-4">
            <DrawerTitle
              className="text-base"
              lang={languageFor("interface.add_game_75fb4616")}
              dir={directionFor("interface.add_game_75fb4616")}
            >
              {t("interface.add_game_75fb4616")}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              <span
                lang={languageFor("interface.search_for_games_to_add_to_your_co_3f62b09f")}
                dir={directionFor("interface.search_for_games_to_add_to_your_co_3f62b09f")}
              >
                {t("interface.search_for_games_to_add_to_your_co_3f62b09f")}
              </span>
            </DrawerDescription>
          </DrawerHeader>

          {igdbNotConfigured ? (
            <div className="flex flex-col items-center justify-center flex-1 py-8 text-center space-y-4 px-6">
              <div className="bg-muted p-4 rounded-full">
                <AlertCircle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3
                className="font-semibold text-lg"
                lang={languageFor("interface.igdb_configuration_required_6ad1583e")}
                dir={directionFor("interface.igdb_configuration_required_6ad1583e")}
              >
                {t("interface.igdb_configuration_required_6ad1583e")}
              </h3>
              <p className="text-muted-foreground text-sm">
                <span
                  lang={languageFor("interface.please_configure_igdb_credentials_46a3a94e")}
                  dir={directionFor("interface.please_configure_igdb_credentials_46a3a94e")}
                >
                  {t("interface.please_configure_igdb_credentials_46a3a94e")}
                </span>
              </p>
              <Link href="/settings">
                <Button className="w-full" onClick={() => setOpen(false)}>
                  <span
                    lang={languageFor("interface.go_to_settings_a94624fd")}
                    dir={directionFor("interface.go_to_settings_a94624fd")}
                  >
                    {t("interface.go_to_settings_a94624fd")}
                  </span>
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Sticky search + filter strip */}
              <div className="flex-shrink-0 px-4 pt-3 pb-3 space-y-2 border-b border-border/50">
                <div className="relative">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
                  <Input
                    type="search"
                    placeholder={t("interface.search_for_games_70015265")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="ps-10 h-11"
                    data-testid="input-game-search"
                    aria-label={t("interface.search_games_1ca9688e")}
                    lang={languageFor("interface.search_games_1ca9688e")}
                    dir={directionFor("interface.search_games_1ca9688e")}
                  />
                </div>
                {renderDiscoveryFilters(true)}
              </div>

              {/* Scrollable results */}
              <div
                className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-2"
                aria-live="polite"
              >
                {isSearching && (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    <span
                      lang={languageFor("interface.searching_games_d00f2efe")}
                      dir={directionFor("interface.searching_games_d00f2efe")}
                    >
                      {t("interface.searching_games_d00f2efe")}
                    </span>
                  </div>
                )}

                {!isSearching && !debouncedQuery && (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    <span
                      lang={languageFor("interface.type_at_least_3_characters_to_sear_e98eb685")}
                      dir={directionFor("interface.type_at_least_3_characters_to_sear_e98eb685")}
                    >
                      {t("interface.type_at_least_3_characters_to_sear_e98eb685")}
                    </span>
                  </div>
                )}

                {!isSearching && debouncedQuery && resultsWithCollectionStatus.length === 0 && (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    <span
                      lang={languageFor("interface.no_games_found_try_a_different_sea_b8cfa0be")}
                      dir={directionFor("interface.no_games_found_try_a_different_sea_b8cfa0be")}
                    >
                      {t("interface.no_games_found_try_a_different_sea_b8cfa0be")}
                    </span>
                  </div>
                )}

                {resultsWithCollectionStatus.map((game) => (
                  <div
                    key={game.id}
                    className="flex gap-3 rounded-lg bg-muted/40 p-3"
                    data-testid={`search-result-${game.id}`}
                  >
                    <img
                      src={coverSrc(game.coverUrl)}
                      alt={formatInterfaceMessage("interface.cover_art_for_title_44c4687e", {
                        title: game.title,
                      })}
                      lang={languageFor("interface.cover_art_for_title_44c4687e")}
                      dir={directionFor("interface.cover_art_for_title_44c4687e")}
                      className="w-14 h-20 object-cover rounded-md flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3
                          className="font-semibold text-sm leading-snug line-clamp-2 flex-1"
                          data-testid={`text-game-title-${game.id}`}
                          lang="und"
                          dir="auto"
                        >
                          {game.title}
                        </h3>
                        {game.inCollection ? (
                          <Badge variant="default" className="text-xs flex-shrink-0 mt-0.5 gap-1">
                            <Check className="w-3 h-3" />
                            <span
                              lang={languageFor("interface.added_b35c3185")}
                              dir={directionFor("interface.added_b35c3185")}
                            >
                              {t("interface.added_b35c3185")}
                            </span>
                          </Badge>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddGame(game)}
                            disabled={addGameMutation.isPending}
                            className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
                            data-testid={`button-add-${game.id}`}
                            aria-label={formatInterfaceMessage(
                              "interface.add_title_to_collection_a7b5e227",
                              {
                                title: game.title,
                              }
                            )}
                            lang={languageFor("interface.add_title_to_collection_a7b5e227")}
                            dir={directionFor("interface.add_title_to_collection_a7b5e227")}
                          >
                            {isAddingGame(game.igdbId) ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {game.releaseDate && (
                          <span
                            className="flex items-center gap-1"
                            lang={regionalLocale}
                            dir={regionalDirection}
                          >
                            <Calendar className="w-3 h-3" />
                            {game.releaseDate.endsWith("-12-31")
                              ? new Date(game.releaseDate).getFullYear()
                              : new Date(game.releaseDate).toLocaleDateString(getRegionalLocale(), {
                                  year: "numeric",
                                  month: "short",
                                })}
                          </span>
                        )}
                        {game.rating !== null && game.rating !== undefined && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-accent" />
                            {game.rating}/10
                          </span>
                        )}
                      </div>

                      {game.genres?.[0] && (
                        <Badge variant="secondary" className="text-xs w-fit" lang="und" dir="auto">
                          {game.genres[0]}
                        </Badge>
                      )}

                      {game.summary && (
                        <p
                          className="text-xs text-muted-foreground line-clamp-2 mt-0.5"
                          lang="und"
                          dir="auto"
                        >
                          {game.summary}
                        </p>
                      )}

                      {renderTargetPlatformSelect(game)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  // ─── Desktop layout (dialog, unchanged) ──────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle
            lang={languageFor("interface.add_game_to_collection_227161e1")}
            dir={directionFor("interface.add_game_to_collection_227161e1")}
          >
            {t("interface.add_game_to_collection_227161e1")}
          </DialogTitle>
          <DialogDescription
            lang={languageFor("interface.search_for_games_to_add_to_your_co_3f62b09f")}
            dir={directionFor("interface.search_for_games_to_add_to_your_co_3f62b09f")}
          >
            {t("interface.search_for_games_to_add_to_your_co_3f62b09f")}
          </DialogDescription>
        </DialogHeader>

        {igdbNotConfigured ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
            <div className="bg-muted p-4 rounded-full">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3
              className="font-semibold text-lg"
              lang={languageFor("interface.igdb_configuration_required_6ad1583e")}
              dir={directionFor("interface.igdb_configuration_required_6ad1583e")}
            >
              {t("interface.igdb_configuration_required_6ad1583e")}
            </h3>
            <p className="text-muted-foreground max-w-sm">
              <span
                lang={languageFor("interface.please_configure_igdb_credentials_46a3a94e")}
                dir={directionFor("interface.please_configure_igdb_credentials_46a3a94e")}
              >
                {t("interface.please_configure_igdb_credentials_46a3a94e")}
              </span>
            </p>
            <Link href="/settings">
              <Button onClick={() => setOpen(false)}>
                <span
                  lang={languageFor("interface.go_to_settings_a94624fd")}
                  dir={directionFor("interface.go_to_settings_a94624fd")}
                >
                  {t("interface.go_to_settings_a94624fd")}
                </span>
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="search"
                  placeholder={t("interface.search_for_games_70015265")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ps-10"
                  data-testid="input-game-search"
                  aria-label={t("interface.search_games_1ca9688e")}
                  lang={languageFor("interface.search_games_1ca9688e")}
                  dir={directionFor("interface.search_games_1ca9688e")}
                />
              </div>
              <Button
                type="submit"
                disabled={isSearching}
                data-testid="button-search-games"
                aria-label={t("navigation.search")}
                lang={languageFor("navigation.search")}
                dir={directionFor("navigation.search")}
              >
                <Search className="w-4 h-4" />
              </Button>
            </form>

            {renderDiscoveryFilters()}

            <div className="space-y-4" aria-live="polite">
              {isSearching && (
                <div
                  className="text-center py-8 text-muted-foreground"
                  lang={languageFor("interface.searching_games_80b22ec2")}
                  dir={directionFor("interface.searching_games_80b22ec2")}
                >
                  {t("interface.searching_games_80b22ec2")}
                </div>
              )}

              {!isSearching && debouncedQuery && resultsWithCollectionStatus.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <span
                    lang={languageFor("interface.no_games_found_try_a_different_sea_b8cfa0be")}
                    dir={directionFor("interface.no_games_found_try_a_different_sea_b8cfa0be")}
                  >
                    {t("interface.no_games_found_try_a_different_sea_b8cfa0be")}
                  </span>
                </div>
              )}

              {resultsWithCollectionStatus.map((game) => (
                <Card
                  key={game.id}
                  className="hover-elevate"
                  data-testid={`search-result-${game.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <img
                        src={coverSrc(game.coverUrl)}
                        alt={formatInterfaceMessage("interface.cover_art_for_title_44c4687e", {
                          title: game.title,
                        })}
                        lang={languageFor("interface.cover_art_for_title_44c4687e")}
                        dir={directionFor("interface.cover_art_for_title_44c4687e")}
                        className="w-16 h-24 object-cover rounded-md flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3
                            className="font-semibold truncate"
                            data-testid={`text-game-title-${game.id}`}
                            lang="und"
                            dir="auto"
                          >
                            {game.title}
                          </h3>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {game.releaseDate && (
                              <div
                                className="flex items-center gap-1 text-sm text-muted-foreground"
                                lang={regionalLocale}
                                dir={regionalDirection}
                              >
                                <Calendar className="w-3 h-3" />
                                {game.releaseDate.endsWith("-12-31")
                                  ? new Date(game.releaseDate).getFullYear()
                                  : new Date(game.releaseDate).toLocaleDateString(
                                      getRegionalLocale(),
                                      {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                      }
                                    )}
                              </div>
                            )}
                            {game.rating !== null && game.rating !== undefined && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <Star className="w-3 h-3 text-accent" />
                                {game.rating}/10
                              </div>
                            )}
                          </div>
                        </div>

                        {game.summary && (
                          <p
                            className="text-sm text-muted-foreground mb-2 line-clamp-2"
                            lang="und"
                            dir="auto"
                          >
                            {game.summary}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1 mb-3">
                          {game.genres?.slice(0, 3).map((genre) => (
                            <Badge
                              key={genre}
                              variant="secondary"
                              className="text-xs"
                              lang="und"
                              dir="auto"
                            >
                              {genre}
                            </Badge>
                          ))}
                        </div>

                        {renderTargetPlatformSelect(game)}

                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {game.platforms?.slice(0, 3).map((platform) => (
                              <Badge
                                key={platform}
                                variant="outline"
                                className="text-xs"
                                lang="und"
                                dir="auto"
                              >
                                {platform}
                              </Badge>
                            ))}
                          </div>

                          {game.inCollection ? (
                            <Badge variant="default" className="text-xs">
                              <span
                                lang={languageFor("interface.in_collection_7c9c692a")}
                                dir={directionFor("interface.in_collection_7c9c692a")}
                              >
                                {t("interface.in_collection_7c9c692a")}
                              </span>
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleAddGame(game)}
                              disabled={addGameMutation.isPending}
                              data-testid={`button-add-${game.id}`}
                              aria-label={formatInterfaceMessage(
                                "interface.add_title_to_collection_a7b5e227",
                                {
                                  title: game.title,
                                }
                              )}
                              lang={languageFor("interface.add_title_to_collection_a7b5e227")}
                              dir={directionFor("interface.add_title_to_collection_a7b5e227")}
                            >
                              {isAddingGame(game.igdbId) ? (
                                <Loader2 className="w-4 h-4 me-1 animate-spin" />
                              ) : (
                                <Plus className="w-4 h-4 me-1" />
                              )}
                              <span
                                lang={languageFor(isAddingGame(game.igdbId) ? "Adding..." : "Add")}
                                dir={directionFor(isAddingGame(game.igdbId) ? "Adding..." : "Add")}
                              >
                                {t(isAddingGame(game.igdbId) ? "Adding..." : "Add")}
                              </span>
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
