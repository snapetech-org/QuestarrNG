import {
  getInterfaceCollator,
  useInterfaceLanguage,
  formatInterfaceMessage,
  translateInterfaceLabel,
} from "@/lib/interface-locale";
import { formatRegionalNumber, useRegionalPreference } from "@/lib/regional-format";
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import PageToolbar from "./PageToolbar";
import GameGrid from "./GameGrid";
import AddGameModal from "./AddGameModal";
import {
  Archive,
  Bookmark,
  CheckCircle2,
  EyeOff,
  Filter,
  Gamepad2,
  LayoutGrid,
  Library as LibraryIcon,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { type Game, type UserSettings } from "@shared/schema";
import { isPlatformNameSelected, selectedPlatformNames } from "@shared/platforms";
import { getStatusSourceLabel, type GameStatus } from "./StatusBadge";
import { useHiddenMutation } from "@/hooks/use-hidden-mutation";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { calculateLibraryStats } from "@/lib/stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useViewControls } from "@/hooks/use-view-controls";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { setAddGamePendingQuery, clearAddGamePendingQuery } from "@/lib/add-game-store";
import { useDownloadSummary } from "@/hooks/use-download-summary";
import GameFilterPills from "./GameFilterPills";
import PendingImportsCard from "./PendingImportsCard";
import { LIBRARY_SORT_OPTIONS, sortLibraryGames, type LibrarySortOption } from "@/lib/game-sort";
import { InterfaceText } from "@/components/InterfaceText";

function LabeledSwitch({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

export default function Library() {
  const regionalPreference = useRegionalPreference();
  const { language: interfaceLanguage } = useInterfaceLanguage();
  const nameCollator = useMemo(() => getInterfaceCollator(interfaceLanguage), [interfaceLanguage]);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GameStatus | "all">("all");
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [showSearchResultsOnly, setShowSearchResultsOnly] = useState(false);
  const [showDownloadsOnly, setShowDownloadsOnly] = useState(false);
  const [minRating, setMinRating] = useState<number | null>(null);
  const [showUnratedOnly, setShowUnratedOnly] = useState(false);
  // Session-only overrides for the account-level default filters (see Settings
  // > Library Filtering). These don't persist so the defaults apply again next visit.
  const [showShelvedOverride, setShowShelvedOverride] = useState(false);
  const [showOwnedInResultsOverride, setShowOwnedInResultsOverride] = useState(false);
  const [sortBy, setSortBy] = useLocalStorageState<LibrarySortOption>(
    "librarySortBy",
    "added-desc"
  );

  const clearAllFilters = useCallback(() => {
    setStatusFilter("all");
    setGenreFilter("all");
    setPlatformFilter("all");
    setShowSearchResultsOnly(false);
    setShowDownloadsOnly(false);
    setMinRating(null);
    setShowUnratedOnly(false);
    setShowShelvedOverride(false);
    setShowOwnedInResultsOverride(false);
  }, []);

  const { viewMode, setViewMode, listDensity, setListDensity } = useViewControls("dashboard");
  const [gridColumns, setGridColumns] = useLocalStorageState("dashboardGridColumns", 5);
  const [showHiddenGames, setShowHiddenGames] = useLocalStorageState("showHiddenGames", false);
  const downloadSummaries = useDownloadSummary();

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });
  const hideShelvedByDefault = (userSettings?.hideShelvedByDefault ?? true) && !showShelvedOverride;
  const hideOwnedInHasResults =
    (userSettings?.hideOwnedInHasResults ?? true) && !showOwnedInResultsOverride;

  const {
    data: games = [],
    isLoading,
    isFetching,
  } = useQuery<Game[]>({
    queryKey: ["/api/games", debouncedSearchQuery, showHiddenGames],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery.trim()) params.set("search", debouncedSearchQuery.trim());
      if (showHiddenGames) params.set("includeHidden", "true");
      const response = await apiRequest("GET", `/api/games?${params}`);
      return response.json();
    },
    placeholderData: keepPreviousData,
  });

  const statusMutation = useMutation({
    mutationFn: async ({ gameId, status }: { gameId: string; status: GameStatus }) => {
      const response = await apiRequest("PATCH", `/api/games/${gameId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      toast({ description: "Game status updated successfully" });
    },
    onError: () => {
      toast({ description: "Failed to update game status", variant: "destructive" });
    },
  });

  const hiddenMutation = useHiddenMutation({
    hiddenSuccessMessage: "Game hidden from library",
    unhiddenSuccessMessage: "Game unhidden",
    errorMessage: "Failed to update game visibility",
  });

  // The platforms the user selected in Settings → Platforms. Only these appear
  // in the filter dropdown; games on other platforms stay in the library.
  const { data: igdbPlatforms = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/igdb/platforms"],
  });

  // ⚡ Bolt: Consolidate multiple array traversals into a single pass to
  // optimize render performance and reduce unnecessary allocations.
  const { uniqueGenres, uniquePlatforms } = useMemo(() => {
    const genreSet = new Set<string>();
    const platformSet = new Set<string>();

    for (const g of games) {
      if (g.genres) {
        for (const genre of g.genres) {
          genreSet.add(genre);
        }
      }
      if (g.platforms) {
        for (const platform of g.platforms) {
          platformSet.add(platform);
        }
      }
    }

    return {
      uniqueGenres: Array.from(genreSet).sort(nameCollator.compare),
      uniquePlatforms: Array.from(platformSet).sort(nameCollator.compare),
    };
  }, [games, nameCollator]);

  const visiblePlatforms = useMemo(() => {
    // The platform setting stores IGDB ids, while `games.platforms` holds IGDB
    // names, so translate once via the platform list both surfaces share.
    const allowed = selectedPlatformNames(igdbPlatforms, userSettings?.importPlatformIds);
    const filtered = uniquePlatforms.filter((platform) =>
      isPlatformNameSelected(platform, allowed, userSettings?.importPlatformIds)
    );
    // An empty `allowed` means one of two things: while the IGDB platform list
    // is still loading (or errored) every name is filtered out and the dropdown
    // would blank, so fall back to the unfiltered list. Once the list is present
    // an empty `filtered` is a genuine zero-overlap selection — return it, or
    // the dropdown would offer platforms the user did not select.
    return igdbPlatforms.length === 0 ? uniquePlatforms : filtered;
  }, [uniquePlatforms, igdbPlatforms, userSettings?.importPlatformIds]);

  // The Platforms setting can drop the platform currently being filtered on.
  // Reset to "all" so a stale value cannot filter the grid invisibly (it would
  // leave an active-filter pill with no matching dropdown option).
  useEffect(() => {
    if (platformFilter === "all") return;
    if (visiblePlatforms.includes(platformFilter)) return;
    setPlatformFilter("all");
  }, [visiblePlatforms, platformFilter]);

  const filteredGames = useMemo(() => {
    const filtered = games.filter((game) => {
      if (statusFilter !== "all" && game.status !== statusFilter) return false;
      // Shelved games are hidden by default unless the user explicitly filters
      // by the Shelved status, which always takes precedence over the default.
      if (hideShelvedByDefault && statusFilter === "all" && game.status === "shelved") return false;
      if (genreFilter !== "all" && !game.genres?.includes(genreFilter)) return false;
      if (platformFilter !== "all" && !game.platforms?.includes(platformFilter)) return false;
      if (showSearchResultsOnly && !game.searchResultsAvailable) return false;
      // Owned games are skipped by the Has Results filter by default (you
      // already own them), unless the user explicitly filters by Owned status.
      if (
        showSearchResultsOnly &&
        hideOwnedInHasResults &&
        statusFilter !== "owned" &&
        game.status === "owned"
      )
        return false;
      if (showDownloadsOnly && !downloadSummaries[game.id]) return false;
      if (showUnratedOnly) return game.userRating === null;
      if (minRating !== null && (game.userRating === null || game.userRating < minRating))
        return false;
      return true;
    });
    return sortLibraryGames(filtered, sortBy, interfaceLanguage);
  }, [
    games,
    statusFilter,
    genreFilter,
    platformFilter,
    showSearchResultsOnly,
    hideShelvedByDefault,
    hideOwnedInHasResults,
    showDownloadsOnly,
    downloadSummaries,
    minRating,
    showUnratedOnly,
    sortBy,
    interfaceLanguage,
  ]);

  const activeFilters = useMemo(() => {
    const filters: {
      source: string;
      values?: Record<string, string | number>;
      onRemove: () => void;
    }[] = [];
    if (statusFilter !== "all")
      filters.push({
        source: "Status: {status}",
        values: {
          status: translateInterfaceLabel(getStatusSourceLabel(statusFilter), interfaceLanguage),
        },
        onRemove: () => setStatusFilter("all"),
      });
    if (genreFilter !== "all")
      filters.push({
        source: "Genre: {genre}",
        values: { genre: genreFilter },
        onRemove: () => setGenreFilter("all"),
      });
    if (platformFilter !== "all")
      filters.push({
        source: "Platform: {platform}",
        values: { platform: platformFilter },
        onRemove: () => setPlatformFilter("all"),
      });
    if (showSearchResultsOnly)
      filters.push({
        source: "Has Search Results",
        onRemove: () => setShowSearchResultsOnly(false),
      });
    if (showDownloadsOnly)
      filters.push({ source: "Has Downloads", onRemove: () => setShowDownloadsOnly(false) });
    if (minRating !== null)
      filters.push({
        source: "Rating: ≥ {rating}",
        values: {
          rating: formatRegionalNumber(minRating, { maximumFractionDigits: 1 }, regionalPreference),
        },
        onRemove: () => setMinRating(null),
      });
    if (showUnratedOnly)
      filters.push({ source: "Unrated only", onRemove: () => setShowUnratedOnly(false) });
    if (showShelvedOverride)
      filters.push({
        source: "Shelved games shown",
        onRemove: () => setShowShelvedOverride(false),
      });
    if (showSearchResultsOnly && showOwnedInResultsOverride)
      filters.push({
        source: "Owned games shown in results",
        onRemove: () => setShowOwnedInResultsOverride(false),
      });
    return filters;
  }, [
    statusFilter,
    genreFilter,
    platformFilter,
    showSearchResultsOnly,
    showDownloadsOnly,
    minRating,
    showUnratedOnly,
    regionalPreference,
    interfaceLanguage,
    showShelvedOverride,
    showOwnedInResultsOverride,
  ]);

  const libStats = useMemo(
    () => calculateLibraryStats(games, regionalPreference, interfaceLanguage),
    [games, regionalPreference, interfaceLanguage]
  );

  // Keep the last known non-empty stats so the header line doesn't vanish
  // when a search returns zero results.
  const stableLibStatsRef = useRef(libStats);
  if (libStats.totalGames > 0) stableLibStatsRef.current = libStats;
  const stableLibStats = stableLibStatsRef.current;

  const filtersActive = filteredGames.length < games.length;

  // Sync dashboard search query to the add-game store so the Header's AddGameModal
  // can pre-fill when opened while the user has typed something here.
  useEffect(() => {
    setAddGamePendingQuery(searchQuery);
  }, [searchQuery]);

  // Clear the add-game store only on unmount.
  useEffect(() => {
    return () => {
      clearAddGamePendingQuery();
    };
  }, []);

  const handleStatusChange = useCallback(
    (gameId: string, newStatus: GameStatus) => {
      statusMutation.mutate({ gameId, status: newStatus });
    },
    [statusMutation]
  );

  const handleToggleHidden = useCallback(
    (gameId: string, hidden: boolean) => {
      hiddenMutation.mutate({ gameId, hidden });
    },
    [hiddenMutation]
  );

  const handleSortChange = useCallback(
    (value: string) => setSortBy(value as LibrarySortOption),
    [setSortBy]
  );

  return (
    <div className="h-full overflow-auto px-3 py-4 sm:p-6" data-testid="layout-dashboard">
      <div className="space-y-3">
        {/* Page header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            <InterfaceText source={"My Library"} />
          </h1>
          {stableLibStats.totalGames > 0 && (
            <div className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">
                  {filtersActive ? filteredGames.length : stableLibStats.totalGames}
                </span>{" "}
                {filtersActive ? (
                  <InterfaceText
                    source={"{shownGames} of {totalGames} games shown"}
                    values={{
                      shownGames: String(filteredGames.length),
                      totalGames: String(stableLibStats.totalGames ?? ""),
                    }}
                  />
                ) : (
                  <InterfaceText source={"games"} />
                )}
              </span>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-1">
                <Bookmark className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {stableLibStats.statusBreakdown.wanted}
                </span>{" "}
                <InterfaceText source={"wanted"} />
              </span>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-1">
                <LibraryIcon className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {stableLibStats.statusBreakdown.owned}
                </span>{" "}
                <InterfaceText source={"owned"} />
              </span>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-1">
                <Gamepad2 className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {stableLibStats.statusBreakdown.playing}
                </span>{" "}
                <InterfaceText source={"playing"} />
              </span>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-1">
                <Archive className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {stableLibStats.statusBreakdown.shelved}
                </span>{" "}
                <InterfaceText source={"shelved"} />
              </span>
              <span className="opacity-30">·</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {stableLibStats.statusBreakdown.completed}
                </span>{" "}
                <InterfaceText source={"completed"} />
              </span>
              {stableLibStats.avgRating !== "N/A" && (
                <>
                  <span className="opacity-30">·</span>
                  <span>
                    <InterfaceText source={"avg."} />{" "}
                    <span className="font-medium text-foreground">
                      <span aria-hidden="true">⭐</span> {stableLibStats.avgRating}
                    </span>
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <PendingImportsCard />

        {/* Toolbar: search + filter pills + view controls + filter toggle + grid settings */}
        <PageToolbar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search your library…"
          filterPills={
            <div className="hidden sm:contents">
              <GameFilterPills
                showSearchResultsOnly={showSearchResultsOnly}
                setShowSearchResultsOnly={setShowSearchResultsOnly}
                showDownloadsOnly={showDownloadsOnly}
                setShowDownloadsOnly={setShowDownloadsOnly}
              />
            </div>
          }
          sortValue={sortBy}
          onSortChange={handleSortChange}
          sortOptions={LIBRARY_SORT_OPTIONS}
          sortAriaLabel="Sort library games"
          viewControls={{
            viewMode,
            onViewModeChange: setViewMode,
            listDensity,
            onListDensityChange: setListDensity,
          }}
          actions={
            <>
              <div className="flex sm:hidden items-center gap-2">
                <GameFilterPills
                  showSearchResultsOnly={showSearchResultsOnly}
                  setShowSearchResultsOnly={setShowSearchResultsOnly}
                  showDownloadsOnly={showDownloadsOnly}
                  setShowDownloadsOnly={setShowDownloadsOnly}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showFilters ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => setShowFilters((v) => !v)}
                    aria-label="Toggle filters"
                    data-i18n-aria-label={"Toggle filters"}
                    aria-expanded={showFilters}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      <InterfaceText source={"Filters"} />
                    </span>
                    {activeFilters.length > 0 && (
                      <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold w-4 h-4 flex items-center justify-center">
                        {activeFilters.length}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="sm:hidden">
                  <InterfaceText source={"Filters"} />
                </TooltipContent>
              </Tooltip>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    aria-label="Grid settings"
                    data-i18n-aria-label={"Grid settings"}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-4 p-4">
                  <div
                    className={`space-y-3 ${viewMode === "list" ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <Label
                        className="flex items-center gap-2 text-sm font-medium"
                        aria-disabled={viewMode === "list"}
                      >
                        <LayoutGrid className="h-4 w-4" />
                        <InterfaceText source={"Grid Columns"} />
                      </Label>
                      <span className="text-sm font-bold w-4 text-center">{gridColumns}</span>
                    </div>
                    <Slider
                      value={[gridColumns]}
                      onValueChange={([val]) => val !== undefined && setGridColumns(val)}
                      min={2}
                      max={10}
                      step={1}
                      disabled={viewMode === "list"}
                      aria-label="Grid columns"
                      data-i18n-aria-label={"Grid columns"}
                    />
                    <p className="text-xs text-muted-foreground">
                      {viewMode === "list" ? (
                        <InterfaceText
                          source={"Switch to grid view to adjust the number of columns."}
                        />
                      ) : (
                        <InterfaceText source={"Number of columns in the game grid (2–10)."} />
                      )}
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <Label
                      htmlFor="show-hidden"
                      className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                    >
                      <EyeOff className="h-4 w-4" />
                      <InterfaceText source={"Show Hidden Games"} />
                    </Label>
                    <Switch
                      id="show-hidden"
                      checked={showHiddenGames}
                      onCheckedChange={setShowHiddenGames}
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </>
          }
        />

        {/* Active filter badges */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {activeFilters.map((f) => (
              <Badge key={f.source} variant="secondary" className="gap-1">
                <InterfaceText source={f.source} values={f.values} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-3 w-3 p-0 hover:bg-transparent"
                  onClick={f.onRemove}
                  aria-label={formatInterfaceMessage(
                    "Remove filter: {label}",
                    {
                      label: formatInterfaceMessage(f.source, f.values ?? {}, interfaceLanguage),
                    },
                    interfaceLanguage
                  )}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground px-2"
              onClick={clearAllFilters}
            >
              <X className="h-3 w-3" />
              <InterfaceText source={"Clear all"} />
            </Button>
            <span className="text-xs text-muted-foreground">
              <InterfaceText
                source={"Showing {visible} of {total}"}
                values={{ visible: filteredGames.length, total: games.length }}
              />
            </span>
          </div>
        )}

        {/* Filter panel */}
        {showFilters && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <Label className="text-sm font-semibold">
                <InterfaceText source={"Filters"} />
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>
                    <InterfaceText source={"Status"} />
                  </Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v as GameStatus | "all")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <InterfaceText source={"All"} />
                      </SelectItem>
                      <SelectItem value="wanted">
                        <InterfaceText source={"Wanted"} />
                      </SelectItem>
                      <SelectItem value="owned">
                        <InterfaceText source={"Owned"} />
                      </SelectItem>
                      <SelectItem value="playing">
                        <InterfaceText source={"Playing"} />
                      </SelectItem>
                      <SelectItem value="shelved">
                        <InterfaceText source={"Shelved"} />
                      </SelectItem>
                      <SelectItem value="completed">
                        <InterfaceText source={"Completed"} />
                      </SelectItem>
                      <SelectItem value="downloading">
                        <InterfaceText source={"Downloading"} />
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    <InterfaceText source={"Genre"} />
                  </Label>
                  <Select value={genreFilter} onValueChange={setGenreFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <InterfaceText source={"All Genres"} />
                      </SelectItem>
                      {uniqueGenres.map((genre) => (
                        <SelectItem key={genre} value={genre}>
                          {genre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    <InterfaceText source={"Platform"} />
                  </Label>
                  <Select value={platformFilter} onValueChange={setPlatformFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <InterfaceText source={"All Platforms"} />
                      </SelectItem>
                      {visiblePlatforms.map((platform) => (
                        <SelectItem key={platform} value={platform}>
                          {platform}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-start border-t pt-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>
                      <InterfaceText source={"Min Rating"} />
                    </Label>
                    <span className="text-sm text-muted-foreground">
                      {minRating === null ? <InterfaceText source={"Any"} /> : `≥ ${minRating}/10`}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={10}
                    step={0.5}
                    value={[minRating ?? 0]}
                    onValueChange={([val]) => {
                      if (val === undefined) return;
                      setMinRating(val === 0 ? null : val);
                      if (val > 0) setShowUnratedOnly(false);
                    }}
                    disabled={showUnratedOnly}
                    aria-label="Minimum rating filter"
                    data-i18n-aria-label={"Minimum rating filter"}
                  />
                </div>
                <div className="flex items-center gap-2 sm:pt-7">
                  <Switch
                    id="filter-unrated-only"
                    checked={showUnratedOnly}
                    onCheckedChange={(checked) => {
                      setShowUnratedOnly(checked);
                      if (checked) setMinRating(null);
                    }}
                  />
                  <Label htmlFor="filter-unrated-only" className="cursor-pointer">
                    <InterfaceText source={"Unrated only"} />
                  </Label>
                </div>
              </div>
              {(() => {
                const filterOverrides = [
                  {
                    id: "filter-show-shelved",
                    label: "Show shelved games",
                    checked: showShelvedOverride,
                    onCheckedChange: setShowShelvedOverride,
                    visible: userSettings?.hideShelvedByDefault ?? true,
                  },
                  {
                    id: "filter-show-owned-in-results",
                    label: "Show owned games in search results",
                    checked: showOwnedInResultsOverride,
                    onCheckedChange: setShowOwnedInResultsOverride,
                    visible: showSearchResultsOnly && (userSettings?.hideOwnedInHasResults ?? true),
                  },
                ].filter((override) => override.visible);

                return (
                  filterOverrides.length > 0 && (
                    <div className="flex flex-col sm:flex-row gap-4 items-start border-t pt-4">
                      {filterOverrides.map(({ visible: _visible, ...override }) => (
                        <LabeledSwitch key={override.id} {...override} />
                      ))}
                    </div>
                  )
                );
              })()}
            </CardContent>
          </Card>
        )}

        {filteredGames.length === 0 ? (
          (() => {
            const hasActiveFilters =
              debouncedSearchQuery.trim() ||
              statusFilter !== "all" ||
              genreFilter !== "all" ||
              platformFilter !== "all" ||
              minRating !== null ||
              showUnratedOnly ||
              (hideShelvedByDefault && games.some((g) => g.status === "shelved")) ||
              (showSearchResultsOnly &&
                hideOwnedInHasResults &&
                games.some((g) => g.status === "owned"));
            const hasSearchQuery = debouncedSearchQuery.trim();

            if (hasActiveFilters) {
              return hasSearchQuery ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <p className="text-lg font-medium mb-1">
                    <InterfaceText source={"No results for “"} />
                    {debouncedSearchQuery}&rdquo;
                  </p>
                  <p className="text-sm text-muted-foreground mb-6">
                    <InterfaceText source={"This game isn't in your library yet."} />
                  </p>
                  <AddGameModal initialQuery={debouncedSearchQuery}>
                    <Button size="lg" className="gap-2" data-testid="button-add-game-from-search">
                      <Plus className="w-4 h-4" />
                      <InterfaceText source={"Add “"} />
                      {debouncedSearchQuery}
                      <InterfaceText source={"” to collection"} />
                    </Button>
                  </AddGameModal>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                  <p className="text-lg font-medium mb-1">
                    <InterfaceText source={"No games match your current filters"} />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <InterfaceText source={"Try adjusting or clearing your filters."} />
                  </p>
                </div>
              );
            }

            return (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <p className="text-lg font-medium mb-1">
                  <InterfaceText source={"No games yet"} />
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  <InterfaceText source={"Start building your library by adding a game."} />
                </p>
                <AddGameModal initialQuery="">
                  <Button size="lg" className="gap-2">
                    <Plus className="w-4 h-4" />
                    <InterfaceText source={"Add your first game"} />
                  </Button>
                </AddGameModal>
              </div>
            );
          })()
        ) : (
          <GameGrid
            games={filteredGames}
            onStatusChange={handleStatusChange}
            onToggleHidden={handleToggleHidden}
            isLoading={isLoading}
            isFetching={isFetching}
            columns={gridColumns}
            downloadSummaries={downloadSummaries}
            viewMode={viewMode}
            density={listDensity}
          />
        )}
      </div>
    </div>
  );
}
