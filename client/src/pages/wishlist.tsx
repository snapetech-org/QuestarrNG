import {
  formatInterfaceMessage,
  getInterfaceCollator,
  useInterfaceLanguage,
} from "@/lib/interface-locale";
import React, { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, Eye, EyeOff } from "lucide-react";
import GameStatusGrid from "@/components/GameStatusGrid";
import { type Game } from "@shared/schema";
import { useHiddenMutation } from "@/hooks/use-hidden-mutation";
import { useGameStatusMutation } from "@/hooks/use-game-status-mutation";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { useGridColumns } from "@/hooks/use-grid-columns";
import EmptyState from "@/components/EmptyState";
import GameFilterPills from "@/components/GameFilterPills";
import GridColumnsControl from "@/components/GridColumnsControl";
import { Button } from "@/components/ui/button";
import { useViewControls } from "@/hooks/use-view-controls";
import PageToolbar from "@/components/PageToolbar";
import { useDownloadSummary } from "@/hooks/use-download-summary";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { compareDates } from "@/lib/game-sort";

type SortOption = "release-asc" | "release-desc" | "added-desc" | "title-asc";
type MobileSection = { id: string; label: string; count: number; games: Game[] };

const SORT_OPTIONS = [
  { value: "release-desc", label: "Release (Newest)" },
  { value: "release-asc", label: "Release (Oldest)" },
  { value: "added-desc", label: "Recently Added" },
  { value: "title-asc", label: "Title (A-Z)" },
];

// 笞｡ Bolt: Move sortGames outside of the component to prevent it from being recreated
// on every render, which would break the `useMemo` dependencies below if it were
// included in the dependency array.
export const sortGames = (
  gameList: Game[],
  currentSortBy: SortOption,
  interfaceLanguage: ReturnType<typeof useInterfaceLanguage>["language"]
): Game[] => {
  const sorted = [...gameList];
  const titleCollator =
    currentSortBy === "title-asc" ? getInterfaceCollator(interfaceLanguage) : null;

  return sorted.sort((a, b) => {
    switch (currentSortBy) {
      case "release-asc":
        return compareDates(a.releaseDate, b.releaseDate, true);
      case "release-desc":
        return compareDates(a.releaseDate, b.releaseDate, false);
      case "added-desc":
        return compareDates(a.addedAt, b.addedAt, false);
      case "title-asc":
        return titleCollator!.compare(a.title, b.title);
      default:
        return 0;
    }
  });
};

export default function WishlistPage() {
  const { language: interfaceLanguage, t, languageFor, directionFor } = useInterfaceLanguage();
  const [sortBy, setSortBy] = useState<SortOption>("release-desc");
  const { viewMode, setViewMode, listDensity, setListDensity } = useViewControls("wishlist");
  const [showUnreleased, setShowUnreleased] = useLocalStorageState("wishlistShowUnreleased", true);
  const [showDownloadsOnly, setShowDownloadsOnly] = useState(false);
  const downloadSummaries = useDownloadSummary();
  const [showSearchResultsOnly, setShowSearchResultsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { gridColumns: safeGridColumns, handleGridColumnsChange } =
    useGridColumns("wishlistGridColumns");

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games", "?status=wanted"],
  });

  const { releasedGames, upcomingGames, tbaGames, filteredCount } = useMemo(() => {
    // 笞｡ Bolt: Use a string comparison for dates instead of new Date() allocations
    // Since releaseDate is an ISO string like "2024-05-23T00:00:00Z"
    const nowStr = new Date().toISOString();

    const released: Game[] = [];
    const upcoming: Game[] = [];
    const tba: Game[] = [];
    let count = 0;

    const lowercaseQuery = searchQuery?.toLowerCase() || "";

    // 笞｡ Bolt: Consolidate multiple O(N) filters into a single manual traversal
    for (const game of games) {
      // Apply filters
      if (showSearchResultsOnly && !game.searchResultsAvailable) continue;
      if (showDownloadsOnly && !downloadSummaries?.[game.id]) continue;
      if (searchQuery && !game.title.toLowerCase().includes(lowercaseQuery)) continue;

      count++;

      // Bucketize
      if (!game.releaseDate) {
        tba.push(game);
      } else if (game.releaseDate <= nowStr) {
        released.push(game);
      } else {
        upcoming.push(game);
      }
    }

    return {
      releasedGames: released,
      upcomingGames: upcoming,
      tbaGames: tba,
      filteredCount: count,
    };
  }, [games, showSearchResultsOnly, showDownloadsOnly, downloadSummaries, searchQuery]);

  // 笞｡ Bolt: Memoize the sorted arrays to prevent re-sorting on every render
  const sortedUpcomingGames = useMemo(() => {
    return sortGames(upcomingGames, sortBy, interfaceLanguage);
  }, [upcomingGames, sortBy, interfaceLanguage]);

  const sortedReleasedGames = useMemo(() => {
    return sortGames(releasedGames, sortBy, interfaceLanguage);
  }, [releasedGames, sortBy, interfaceLanguage]);

  const sortedTbaGames = useMemo(() => {
    return sortGames(tbaGames, sortBy, interfaceLanguage);
  }, [tbaGames, sortBy, interfaceLanguage]);

  const isMobile = useIsMobile();

  const mobileSections = useMemo(() => {
    const sections: MobileSection[] = [];
    if (sortedReleasedGames.length > 0)
      sections.push({
        id: "released",
        label: "Released",
        count: sortedReleasedGames.length,
        games: sortedReleasedGames,
      });
    if (showUnreleased && sortedUpcomingGames.length > 0)
      sections.push({
        id: "upcoming",
        label: "Upcoming",
        count: sortedUpcomingGames.length,
        games: sortedUpcomingGames,
      });
    if (showUnreleased && sortedTbaGames.length > 0)
      sections.push({
        id: "tba",
        label: "TBA",
        count: sortedTbaGames.length,
        games: sortedTbaGames,
      });
    return sections;
  }, [sortedReleasedGames, sortedUpcomingGames, sortedTbaGames, showUnreleased]);

  const [activeTab, setActiveTab] = useState(() => mobileSections[0]?.id ?? "released");

  useEffect(() => {
    if (mobileSections.length > 0 && !mobileSections.some((section) => section.id === activeTab)) {
      setActiveTab(mobileSections[0]!.id);
    }
  }, [mobileSections, activeTab]);

  const emptyStateContent = useMemo(() => {
    if (searchQuery) {
      return {
        title: "No games match your search",
        description: "No wishlist games found for “{query}”.",
      };
    }

    if (showDownloadsOnly && showSearchResultsOnly) {
      return {
        title: "No games match your filters",
        description: "Try disabling one or more filters to see more games.",
      };
    }

    if (showDownloadsOnly) {
      return {
        title: "No games with active downloads",
        description: "Try disabling one or more filters to see more games.",
      };
    }

    if (showSearchResultsOnly) {
      return {
        title: "No games with search results",
        description: "Try disabling one or more filters to see more games.",
      };
    }

    if (!showUnreleased) {
      return {
        title: "No released games in your wishlist",
        description:
          "All your wishlist games are upcoming or unannounced. Enable 'Unreleased' to see them.",
      };
    }

    return {
      title: "No games match your filters",
      description: "Try adjusting your filters.",
    };
  }, [searchQuery, showDownloadsOnly, showSearchResultsOnly, showUnreleased]);

  const statusMutation = useGameStatusMutation();

  const hiddenMutation = useHiddenMutation({
    hiddenSuccessMessage: "Game hidden from wishlist",
    unhiddenSuccessMessage: "Game unhidden",
    errorMessage: "Failed to update game visibility",
  });

  let wishlistContent: React.ReactNode;

  if (!isLoading && games.length === 0) {
    wishlistContent = (
      <EmptyState
        icon={Star}
        title="Your wishlist is empty"
        data-i18n-title={"Your wishlist is empty"}
        description="Keep track of games you want to play. Add them from the Discover page to get notified about releases and updates."
        actionLabel="Find Games"
        actionLink="/discover"
      />
    );
  } else if (!isLoading && filteredCount === 0) {
    wishlistContent = (
      <EmptyState
        icon={Star}
        title={emptyStateContent.title}
        description={emptyStateContent.description}
        {...(searchQuery ? { descriptionValues: { query: searchQuery } } : {})}
      />
    );
  } else if (isMobile && mobileSections.length > 1) {
    wishlistContent = (
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          {mobileSections.map((section) => (
            <TabsTrigger key={section.id} value={section.id} className="flex-1">
              <span lang={languageFor(section.label)} dir={directionFor(section.label)}>
                {t(section.label)}
              </span>
              <span className="ml-1.5 text-xs opacity-60">{section.count}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {mobileSections.map((section) => (
          <TabsContent key={section.id} value={section.id} className="mt-4">
            <GameStatusGrid
              games={section.games}
              statusMutation={statusMutation}
              hiddenMutation={hiddenMutation}
              isLoading={isLoading}
              viewMode={viewMode}
              density={listDensity}
              downloadSummaries={downloadSummaries}
              columns={safeGridColumns}
            />
          </TabsContent>
        ))}
      </Tabs>
    );
  } else {
    wishlistContent = (
      <div className="space-y-8 md:space-y-12">
        {releasedGames.length > 0 && (
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                lang={languageFor("Released")}
                dir={directionFor("Released")}
              >
                {t("Released")}
              </h2>
              <span className="text-xs text-muted-foreground/60">{releasedGames.length}</span>
            </div>
            <GameStatusGrid
              games={sortedReleasedGames}
              statusMutation={statusMutation}
              hiddenMutation={hiddenMutation}
              isLoading={isLoading}
              viewMode={viewMode}
              density={listDensity}
              downloadSummaries={downloadSummaries}
              columns={safeGridColumns}
            />
          </section>
        )}

        {showUnreleased && upcomingGames.length > 0 && (
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                lang={languageFor("Upcoming")}
                dir={directionFor("Upcoming")}
              >
                {t("Upcoming")}
              </h2>
              <span className="text-xs text-muted-foreground/60">{upcomingGames.length}</span>
            </div>
            <GameStatusGrid
              games={sortedUpcomingGames}
              statusMutation={statusMutation}
              hiddenMutation={hiddenMutation}
              isLoading={isLoading}
              viewMode={viewMode}
              density={listDensity}
              downloadSummaries={downloadSummaries}
              columns={safeGridColumns}
            />
          </section>
        )}

        {showUnreleased && tbaGames.length > 0 && (
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <h2
                className="text-xs font-semibold uppercase tracking-widest text-muted-foreground"
                lang={languageFor("TBA")}
                dir={directionFor("TBA")}
              >
                {t("TBA")}
              </h2>
              <span className="text-xs text-muted-foreground/60">{tbaGames.length}</span>
            </div>
            <GameStatusGrid
              games={sortedTbaGames}
              statusMutation={statusMutation}
              hiddenMutation={hiddenMutation}
              isLoading={isLoading}
              viewMode={viewMode}
              density={listDensity}
              downloadSummaries={downloadSummaries}
              columns={safeGridColumns}
            />
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="space-y-3">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            lang={languageFor("Wishlist")}
            dir={directionFor("Wishlist")}
          >
            {t("Wishlist")}
          </h1>
          {games.length > 0 && (
            <p
              className="text-sm text-muted-foreground mt-0.5"
              lang={languageFor(
                games.length === 1 ? "{count} game wanted" : "{count} games wanted"
              )}
              dir={directionFor(
                games.length === 1 ? "{count} game wanted" : "{count} games wanted"
              )}
            >
              {formatInterfaceMessage(
                games.length === 1 ? "{count} game wanted" : "{count} games wanted",
                { count: games.length },
                interfaceLanguage
              )}
            </p>
          )}
        </div>

        <PageToolbar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Filter wishlist..."
          actions={
            <GridColumnsControl
              columns={safeGridColumns}
              onColumnsChange={handleGridColumnsChange}
            />
          }
          filterPills={
            <>
              <Button
                variant={showUnreleased ? "secondary" : "outline"}
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setShowUnreleased(!showUnreleased)}
              >
                {showUnreleased ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                <span lang={languageFor("Unreleased")} dir={directionFor("Unreleased")}>
                  {t("Unreleased")}
                </span>
              </Button>
              <GameFilterPills
                showSearchResultsOnly={showSearchResultsOnly}
                setShowSearchResultsOnly={setShowSearchResultsOnly}
                showDownloadsOnly={showDownloadsOnly}
                setShowDownloadsOnly={setShowDownloadsOnly}
              />
              {showSearchResultsOnly && showDownloadsOnly && (
                <p
                  className="text-xs text-muted-foreground"
                  lang={languageFor("Multiple filters active")}
                  dir={directionFor("Multiple filters active")}
                >
                  {t("Multiple filters active")}
                </p>
              )}
            </>
          }
          sortValue={sortBy}
          onSortChange={(v) => setSortBy(v as SortOption)}
          sortOptions={SORT_OPTIONS}
          viewControls={{
            viewMode,
            onViewModeChange: setViewMode,
            listDensity,
            onListDensityChange: setListDensity,
          }}
        />

        {wishlistContent}
      </div>
    </div>
  );
}
