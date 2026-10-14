import React, { useMemo } from "react";
import GameCard from "./GameCard";
import CompactGameCard from "./CompactGameCard";
import { type Game, type DownloadSummary } from "@shared/schema";
import { type GameStatus } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useInterfaceLanguage } from "@/lib/interface-locale";

interface GameGridProps {
  games: Game[];
  onStatusChange?: (gameId: string, newStatus: GameStatus) => void;
  onViewDetails?: (gameId: string) => void;
  onTrackGame?: (game: Game) => void;
  onToggleHidden?: (gameId: string, hidden: boolean) => void;
  isDiscovery?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  columns?: number;
  viewMode?: "grid" | "list";
  density?: "comfortable" | "compact";
  downloadSummaries?: Record<string, DownloadSummary>;
}

export default function GameGrid({
  games,
  onStatusChange,
  onViewDetails,
  onTrackGame,
  onToggleHidden,
  isDiscovery = false,
  isLoading = false,
  isFetching = false,
  columns = 5,
  viewMode = "grid",
  density = "comfortable",
  downloadSummaries,
}: GameGridProps) {
  const isMobile = useIsMobile();
  const { t, languageFor, directionFor } = useInterfaceLanguage();

  // Map column count to tailwind classes
  const gridColsClass = useMemo(() => {
    if (viewMode === "list") return "grid-cols-1";

    switch (columns) {
      case 2:
        return "grid-cols-2";
      case 3:
        return "grid-cols-2 sm:grid-cols-3";
      case 4:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";
      case 5:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-5";
      case 6:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-6";
      case 7:
        return "grid-cols-2 sm:grid-cols-4 md:grid-cols-7";
      case 8:
        return "grid-cols-2 sm:grid-cols-4 md:grid-cols-8";
      case 9:
        return "grid-cols-2 sm:grid-cols-4 md:grid-cols-9";
      case 10:
        return "grid-cols-2 sm:grid-cols-4 md:grid-cols-10";
      default:
        return "grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10";
    }
  }, [columns, viewMode]);

  if (isLoading) {
    return (
      <div className={cn("grid gap-4", gridColsClass)} data-testid="grid-games-loading">
        {Array.from({ length: 20 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "animate-pulse bg-muted rounded-md",
              viewMode === "list" ? "h-24 w-full" : "min-w-[150px] min-h-[200px]"
            )}
          >
            {viewMode === "grid" && (
              <div className="bg-muted-foreground/10 rounded-md aspect-[3/4] w-full max-w-[225px] max-h-[300px] mx-auto mb-4"></div>
            )}
            <div className="space-y-2 p-4">
              <div className="h-4 bg-muted-foreground/10 rounded w-3/4"></div>
              <div className="h-3 bg-muted-foreground/10 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center py-12" data-testid="text-no-games">
        <div
          className="text-muted-foreground text-lg mb-2"
          lang={languageFor("No games found")}
          dir={directionFor("No games found")}
        >
          {t("No games found")}
        </div>
        <div
          className="text-sm text-muted-foreground"
          lang={languageFor("Try adjusting your search or filters")}
          dir={directionFor("Try adjusting your search or filters")}
        >
          {t("Try adjusting your search or filters")}
        </div>
      </div>
    );
  }

  if (viewMode === "list") {
    if (isMobile) {
      return (
        <div
          className={cn(
            "space-y-3 transition-opacity duration-200",
            isFetching && "opacity-50 pointer-events-none"
          )}
          data-testid="grid-games"
          aria-busy={isFetching}
        >
          {games.map((game) => (
            <CompactGameCard
              key={game.id}
              game={game}
              onStatusChange={onStatusChange}
              onViewDetails={onViewDetails}
              onToggleHidden={onToggleHidden}
              isDiscovery={isDiscovery}
              density={density}
              downloadSummary={downloadSummaries?.[game.id]}
              mobileLayout={true}
            />
          ))}
        </div>
      );
    }

    const rows = games.map((game) => (
      <CompactGameCard
        key={game.id}
        game={game}
        onStatusChange={onStatusChange}
        onViewDetails={onViewDetails}
        onToggleHidden={onToggleHidden}
        isDiscovery={isDiscovery}
        density={density}
        downloadSummary={downloadSummaries?.[game.id]}
        useSubgrid={true}
      />
    ));

    const listContainerClass = cn(
      "grid rounded-lg border border-border bg-card overflow-hidden transition-opacity duration-200",
      isFetching && "opacity-50 pointer-events-none"
    );

    const headerCellClass =
      "text-[10px] uppercase tracking-widest text-muted-foreground font-medium";

    if (density === "comfortable") {
      return (
        <div
          className={cn(listContainerClass, "gap-x-3 px-3")}
          style={{ gridTemplateColumns: "52px 1fr 180px 64px 64px 76px 90px 90px auto" }}
          data-testid="grid-games"
          aria-busy={isFetching}
        >
          <div
            className="col-span-full grid items-center py-2 border-b border-border bg-muted/40"
            style={{ gridTemplateColumns: "subgrid" }}
          >
            <div />
            <span
              className={headerCellClass}
              lang={languageFor("Title")}
              dir={directionFor("Title")}
            >
              {t("Title")}
            </span>
            <span
              className={headerCellClass}
              lang={languageFor("Genres")}
              dir={directionFor("Genres")}
            >
              {t("Genres")}
            </span>
            <span
              className={cn(headerCellClass, "text-center")}
              lang={languageFor("Score")}
              dir={directionFor("Score")}
            >
              {t("Score")}
            </span>
            <span
              className={cn(headerCellClass, "text-center")}
              lang={languageFor("My Score")}
              dir={directionFor("My Score")}
            >
              {t("My Score")}
            </span>
            <span
              className={cn(headerCellClass, "text-center")}
              lang={languageFor("Release")}
              dir={directionFor("Release")}
            >
              {t("Release")}
            </span>
            <span
              className={cn(headerCellClass, "text-center")}
              lang={languageFor("Status")}
              dir={directionFor("Status")}
            >
              {t("Status")}
            </span>
            <span
              className={cn(headerCellClass, "text-center")}
              lang={languageFor("Type")}
              dir={directionFor("Type")}
            >
              {t("Type")}
            </span>
            <div />
          </div>
          {rows}
        </div>
      );
    }

    return (
      <div
        className={cn(listContainerClass, "gap-x-2 px-2")}
        style={{ gridTemplateColumns: "1fr 180px 64px 64px 76px 90px 90px auto" }}
        data-testid="grid-games"
        aria-busy={isFetching}
      >
        <div
          className="col-span-full grid items-center py-1 border-b border-border bg-muted/40"
          style={{ gridTemplateColumns: "subgrid" }}
        >
          <span className={headerCellClass} lang={languageFor("Title")} dir={directionFor("Title")}>
            {t("Title")}
          </span>
          <span
            className={headerCellClass}
            lang={languageFor("Genres")}
            dir={directionFor("Genres")}
          >
            {t("Genres")}
          </span>
          <span
            className={cn(headerCellClass, "text-center")}
            lang={languageFor("Score")}
            dir={directionFor("Score")}
          >
            {t("Score")}
          </span>
          <span
            className={cn(headerCellClass, "text-center")}
            lang={languageFor("My Score")}
            dir={directionFor("My Score")}
          >
            {t("My Score")}
          </span>
          <span
            className={cn(headerCellClass, "text-center")}
            lang={languageFor("Release")}
            dir={directionFor("Release")}
          >
            {t("Release")}
          </span>
          <span
            className={cn(headerCellClass, "text-center")}
            lang={languageFor("Status")}
            dir={directionFor("Status")}
          >
            {t("Status")}
          </span>
          <span
            className={cn(headerCellClass, "text-center")}
            lang={languageFor("Type")}
            dir={directionFor("Type")}
          >
            {t("Type")}
          </span>
          <div />
        </div>
        {rows}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "grid min-w-0 gap-2 sm:gap-4 transition-opacity duration-200",
        gridColsClass,
        isFetching ? "opacity-50 pointer-events-none" : ""
      )}
      data-testid="grid-games"
      aria-busy={isFetching}
    >
      {games.map((game) => (
        <GameCard
          key={game.id}
          game={game}
          onStatusChange={onStatusChange}
          onViewDetails={onViewDetails}
          onTrackGame={onTrackGame}
          onToggleHidden={onToggleHidden}
          isDiscovery={isDiscovery}
          downloadSummary={downloadSummaries?.[game.id]}
        />
      ))}
    </div>
  );
}
