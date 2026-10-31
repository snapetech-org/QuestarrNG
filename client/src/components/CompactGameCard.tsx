import {
  formatRegionalNumber,
  getRegionalDirection,
  getRegionalLocale,
  useRegionalPreference,
} from "@/lib/regional-format";
import { coverSrc } from "@/lib/cover";
import React, { memo, useState, useEffect, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Download, Info, Star, Calendar, Eye, EyeOff, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import StatusBadge, { type GameStatus } from "./StatusBadge";
import StatusPicker from "./StatusPicker";
import { type Game, type DownloadSummary } from "@shared/schema";
import DownloadIndicator from "./DownloadIndicator";
import SearchResultsBadge from "./SearchResultsBadge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mapGameToInsertGame, isDiscoveryId, cn, parseReleaseDate } from "@/lib/utils";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import LazyModalFallback from "./LazyModalFallback";
import { getReleaseStatus } from "@/lib/game-utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import { InterfaceText } from "@/components/InterfaceText";

const GameDetailsModal = lazy(() => import("./GameDetailsModal"));
const GameDownloadDialog = lazy(() => import("./GameDownloadDialog"));

interface CompactGameCardProps {
  game: Game;
  onStatusChange?: ((gameId: string, newStatus: GameStatus) => void) | undefined;
  onViewDetails?: ((gameId: string) => void) | undefined;
  onToggleHidden?: ((gameId: string, hidden: boolean) => void) | undefined;
  isDiscovery?: boolean;
  density?: "comfortable" | "compact";
  downloadSummary?: DownloadSummary | undefined;
  /** When true, the row uses CSS subgrid (parent must provide the grid context). */
  useSubgrid?: boolean;
  mobileLayout?: boolean;
}

const DEFAULT_RATING = 5;

// Comfortable: Cover | Title | Genres | Score | My Score | Release | Status | Type | Actions
// Compact:           Title | Genres | Score | My Score | Release | Status | Type | Actions
const GRID_COLS = {
  comfortable: "52px 1fr 180px 64px 64px 76px 90px 90px auto",
  compact: "1fr 180px 64px 64px 76px 90px 90px auto",
} as const;

const CompactGameCard = ({
  game,
  onStatusChange,
  onViewDetails,
  onToggleHidden,
  isDiscovery = false,
  density = "comfortable",
  downloadSummary,
  useSubgrid = false,
  mobileLayout = false,
}: CompactGameCardProps) => {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const regionalPreference = useRegionalPreference();
  const regionalLocale =
    getRegionalLocale(regionalPreference) ?? Intl.DateTimeFormat().resolvedOptions().locale;
  const regionalDirection = getRegionalDirection(regionalLocale);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [popoverRating, setPopoverRating] = useState<number>(game.userRating ?? DEFAULT_RATING);
  const releaseStatus = getReleaseStatus(game);
  const [resolvedGame, setResolvedGame] = useState<Game>(game);

  useEffect(() => {
    setResolvedGame(game);
  }, [game]);

  const addGameMutation = useMutation<Game, Error, Game>({
    mutationFn: async (game: Game) => {
      const gameData = mapGameToInsertGame(game);
      try {
        const response = await apiRequest("POST", "/api/games", {
          ...gameData,
          status: "wanted",
        });
        return response.json() as Promise<Game>;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const data = error.data as Record<string, unknown>;
          if (data?.game) return data.game as Game;
          return game;
        }
        throw error;
      }
    },
    onSuccess: (newGame) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      setResolvedGame(newGame);
    },
  });

  const userRatingMutation = useMutation({
    mutationFn: async ({ gameId, userRating }: { gameId: string; userRating: number | null }) => {
      await apiRequest("PATCH", `/api/games/${gameId}/user-rating`, { userRating });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/games"] }),
    onError: () =>
      toast({
        description:
          language === "en" ? (
            "Failed to save your rating"
          ) : (
            <InterfaceText source="interface.failed_to_save_your_rating_02ea6f62" />
          ),
        variant: "destructive",
      }),
  });

  const handleDetailsClick = () => {
    setDetailsOpen(true);
    onViewDetails?.(game.id);
  };
  const handleDownloadClick = async () => {
    if (isDiscoveryId(resolvedGame.id)) {
      try {
        const gameInLibrary = await addGameMutation.mutateAsync(resolvedGame);
        setResolvedGame(gameInLibrary);
        setDownloadOpen(true);
      } catch (error) {
        console.error("Failed to add game to library before downloading:", error);
        toast({
          description:
            language === "en" ? (
              "Failed to add game to library before downloading"
            ) : (
              <InterfaceText source="interface.failed_to_add_game_to_library_befo_2d413451" />
            ),
          variant: "destructive",
        });
      }
    } else {
      setDownloadOpen(true);
    }
  };
  const handleToggleHidden = () => onToggleHidden?.(game.id, !game.hidden);
  const { year: releaseYear, fullDate: releaseFullDate } = parseReleaseDate(
    game.releaseDate,
    regionalPreference
  );
  const hasVisibleRating = game.rating != null && Number(game.rating) > 0;
  const ratingDisplay = hasVisibleRating
    ? formatRegionalNumber(Number(game.rating), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    : null;
  if (mobileLayout) {
    return (
      <>
        <div
          className={cn(
            "rounded-xl border border-border bg-card p-3 shadow-sm",
            game.hidden && "opacity-60 grayscale"
          )}
          data-testid={`card-game-compact-${game.id}`}
        >
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDetailsClick}
              className="h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-muted"
              aria-label={formatInterfaceMessage("interface.view_details_for_title_0a6aaff1", {
                title: game.title,
              })}
              lang={languageFor("interface.view_details_for_title_0a6aaff1")}
              dir={directionFor("interface.view_details_for_title_0a6aaff1")}
            >
              <img
                src={coverSrc(game.coverUrl)}
                alt={formatInterfaceMessage("interface.cover_art_for_title_44c4687e", {
                  title: game.title,
                })}
                lang={languageFor("interface.cover_art_for_title_44c4687e")}
                dir={directionFor("interface.cover_art_for_title_44c4687e")}
                className="h-full w-full object-cover"
                loading="lazy"
                data-testid={`img-cover-${game.id}`}
              />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={handleDetailsClick}
                  className="min-w-0 text-start"
                  aria-label={formatInterfaceMessage("interface.view_details_for_title_0a6aaff1", {
                    title: game.title,
                  })}
                  lang={languageFor("interface.view_details_for_title_0a6aaff1")}
                  dir={directionFor("interface.view_details_for_title_0a6aaff1")}
                >
                  <h3
                    className="truncate text-sm font-semibold"
                    data-testid={`text-title-${game.id}`}
                    lang="und"
                    dir="auto"
                  >
                    {game.title}
                  </h3>
                </button>
                {!isDiscovery && game.status && <StatusBadge status={game.status} />}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1">
                <DownloadIndicator summary={downloadSummary} variant="inline" />
                <SearchResultsBadge
                  visible={game.searchResultsAvailable ?? false}
                  updatesAvailable={!isDiscovery && game.updateSearchResultsAvailable}
                  variant="inline"
                />
                {!isDiscovery && game.status === "wanted" && (
                  <Badge
                    variant={releaseStatus.variant}
                    className={cn("h-5 px-1.5 text-[10px]", releaseStatus.className)}
                  >
                    <span
                      lang={languageFor(releaseStatus.label)}
                      dir={directionFor(releaseStatus.label)}
                    >
                      {t(releaseStatus.label)}
                    </span>
                  </Badge>
                )}
                {game.earlyAccess && (
                  <Badge
                    className="h-5 bg-amber-500 px-1.5 text-[10px] text-white"
                    aria-label={t("interface.early_access_3a5fe28e")}
                    lang={languageFor("interface.early_access_3a5fe28e")}
                    dir={directionFor("interface.early_access_3a5fe28e")}
                  >
                    <InterfaceText source={"EA"} />
                  </Badge>
                )}
                {game.hidden && (
                  <Badge
                    variant="secondary"
                    className="h-5 bg-gray-500 px-1.5 text-[10px] text-white"
                  >
                    <span
                      lang={languageFor("interface.hidden_3c2dfe59")}
                      dir={directionFor("interface.hidden_3c2dfe59")}
                    >
                      {t("interface.hidden_3c2dfe59")}
                    </span>
                  </Badge>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {game.genres && game.genres.length > 0 ? (
                  <>
                    {game.genres.slice(0, 2).map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full bg-muted/70 px-2 py-1 text-[11px] text-muted-foreground"
                      >
                        {genre}
                      </span>
                    ))}
                    {game.genres.length > 2 && (
                      <span className="rounded-full bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground/60">
                        <span
                          lang={languageFor("interface.count_more_1b6a0c82")}
                          dir={directionFor("interface.count_more_1b6a0c82")}
                        >
                          {formatInterfaceMessage("interface.count_more_1b6a0c82", {
                            count: game.genres.length - 2,
                          })}
                        </span>
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    className="text-xs text-muted-foreground/50"
                    lang={languageFor("interface.no_genres_0b16e77a")}
                    dir={directionFor("interface.no_genres_0b16e77a")}
                  >
                    {t("interface.no_genres_0b16e77a")}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span
                  className="inline-flex items-center gap-1"
                  role="img"
                  aria-label={formatInterfaceMessage(
                    "interface.igdb_rating_rating_out_of_10_fbf37993",
                    {
                      rating: ratingDisplay ?? t("interface.not_rated_9de37148"),
                    }
                  )}
                  lang={languageFor("interface.igdb_rating_rating_out_of_10_fbf37993")}
                  dir={directionFor("interface.igdb_rating_rating_out_of_10_fbf37993")}
                >
                  <Star className="h-3 w-3 text-amber-400" />
                  {ratingDisplay ? `${ratingDisplay}/10` : t("interface.not_rated_9de37148")}
                </span>
                {!isDiscovery && (
                  <span
                    className="inline-flex items-center gap-1"
                    role="img"
                    aria-label={
                      game.userRating == null
                        ? t("interface.not_rated_9de37148")
                        : formatInterfaceMessage("interface.my_rating_rating_out_of_10_f3d2beef", {
                            rating: game.userRating,
                          })
                    }
                    lang={languageFor(
                      game.userRating == null ? "Not rated" : "My rating: {rating} out of 10"
                    )}
                    dir={directionFor(
                      game.userRating == null ? "Not rated" : "My rating: {rating} out of 10"
                    )}
                  >
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    {game.userRating == null
                      ? "—"
                      : `${formatRegionalNumber(game.userRating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/10`}
                  </span>
                )}
                <span
                  className="inline-flex items-center gap-1"
                  role="img"
                  aria-label={formatInterfaceMessage("interface.release_date_date_e2610e34", {
                    date: releaseYear,
                  })}
                  lang={languageFor("interface.release_date_date_e2610e34")}
                  dir={directionFor("interface.release_date_date_e2610e34")}
                >
                  <Calendar className="h-3 w-3" />
                  {releaseYear}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isDiscovery ? (
              <Button
                size="icon"
                variant="default"
                className="h-10 w-10"
                onClick={handleDownloadClick}
                disabled={addGameMutation.isPending}
                aria-label={formatInterfaceMessage("interface.download_title_5de658d1", {
                  title: game.title,
                })}
                lang={languageFor("interface.download_title_5de658d1")}
                dir={directionFor("interface.download_title_5de658d1")}
              >
                {addGameMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            ) : (
              <StatusPicker
                currentStatus={game.status as GameStatus}
                onStatusChange={(newStatus) => onStatusChange?.(game.id, newStatus)}
                gameTitle={game.title}
              />
            )}

            <Button
              variant="secondary"
              size="icon"
              className="h-10 w-10"
              onClick={handleDetailsClick}
              aria-label={formatInterfaceMessage("interface.view_details_for_title_0a6aaff1", {
                title: game.title,
              })}
              lang={languageFor("interface.view_details_for_title_0a6aaff1")}
              dir={directionFor("interface.view_details_for_title_0a6aaff1")}
            >
              <Info className="h-4 w-4" />
            </Button>

            {!isDiscovery && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={handleToggleHidden}
                aria-label={formatInterfaceMessage(
                  game.hidden ? "Unhide {title}" : "Hide {title}",
                  { title: game.title }
                )}
                lang={languageFor(game.hidden ? "Unhide {title}" : "Hide {title}")}
                dir={directionFor(game.hidden ? "Unhide {title}" : "Hide {title}")}
              >
                {game.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {detailsOpen && (
          <Suspense fallback={<LazyModalFallback message="Loading game details..." />}>
            <GameDetailsModal
              game={resolvedGame}
              open={detailsOpen}
              onOpenChange={setDetailsOpen}
            />
          </Suspense>
        )}

        {downloadOpen && (
          <Suspense fallback={<LazyModalFallback message="Loading download dialog..." />}>
            <GameDownloadDialog
              game={resolvedGame}
              open={downloadOpen}
              onOpenChange={setDownloadOpen}
            />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <>
      <div
        onClick={handleDetailsClick}
        style={
          useSubgrid
            ? { gridColumn: "1 / -1", gridTemplateColumns: "subgrid" }
            : { gridTemplateColumns: GRID_COLS[density] }
        }
        className={cn(
          "group grid items-center cursor-pointer transition-all duration-150",
          game.hidden && "opacity-60 grayscale",
          density === "comfortable" &&
            useSubgrid &&
            "py-2 border-b border-border/40 hover:bg-accent/30",
          density === "comfortable" &&
            !useSubgrid &&
            "gap-3 ps-[13px] pe-3 py-2 border-s-[3px] border-s-transparent hover:bg-accent/30 hover:border-s-primary",
          density === "compact" && "gap-2 px-2 py-1 border-b border-slate-700/50 hover:bg-accent/20"
        )}
        data-testid={`card-game-compact-${game.id}`}
      >
        {/* Cover */}
        {density !== "compact" && (
          <div
            className={cn(
              "flex-shrink-0 overflow-hidden bg-muted",
              density === "comfortable" ? "h-[68px] w-[52px] rounded" : "h-9 w-9 rounded-sm"
            )}
          >
            <img
              src={coverSrc(game.coverUrl)}
              alt={formatInterfaceMessage("interface.cover_art_for_title_44c4687e", {
                title: game.title,
              })}
              lang={languageFor("interface.cover_art_for_title_44c4687e")}
              dir={directionFor("interface.cover_art_for_title_44c4687e")}
              className="w-full h-full object-cover"
              loading="lazy"
              data-testid={`img-cover-${game.id}`}
            />
          </div>
        )}

        {/* Title */}
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <h3
            className={cn(
              "font-medium truncate",
              density === "comfortable" ? "text-sm" : "text-xs"
            )}
            data-testid={`text-title-${game.id}`}
            lang="und"
            dir="auto"
          >
            {game.title}
          </h3>
          <DownloadIndicator summary={downloadSummary} variant="inline" />
          <SearchResultsBadge
            visible={game.searchResultsAvailable ?? false}
            updatesAvailable={!isDiscovery && game.updateSearchResultsAvailable}
            variant="inline"
          />
        </div>

        {/* Genres */}
        {density === "comfortable" ? (
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {game.genres && game.genres.length > 0 ? (
              <>
                {game.genres.slice(0, 2).map((genre) => (
                  <span
                    key={genre}
                    className="text-[10px] bg-muted/70 text-muted-foreground rounded-full px-1.5 py-0.5 truncate max-w-[72px]"
                  >
                    {genre}
                  </span>
                ))}
                {game.genres.length > 2 && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/50">
                    +{game.genres.length - 2}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground/40">—</span>
            )}
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden">
            {game.genres && game.genres.length > 0 ? (
              <span className="text-xs text-muted-foreground/70 truncate block">
                {game.genres.slice(0, 2).join(" • ")}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground/30">—</span>
            )}
          </div>
        )}

        {/* Score (IGDB) */}
        <div className="flex items-center justify-center gap-1 tabular-nums">
          <Star className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-xs text-muted-foreground">
            {ratingDisplay ?? <span className="opacity-40">—</span>}
          </span>
        </div>
        {/* My Score — comfortable gets interactive popover, compact shows static value */}
        <div className="flex items-center justify-center">
          {density === "comfortable" && !isDiscovery ? (
            <Popover
              onOpenChange={(open) => {
                if (open) setPopoverRating(game.userRating ?? DEFAULT_RATING);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  className="flex items-center gap-1 tabular-nums hover:text-foreground text-muted-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={
                    game.userRating == null
                      ? t("interface.rate_this_game_b97d58a1")
                      : formatInterfaceMessage(
                          "interface.my_rating_rating_10_click_to_chang_26204fee",
                          {
                            rating: game.userRating,
                          }
                        )
                  }
                  lang={languageFor(
                    game.userRating == null
                      ? "Rate this game"
                      : "My rating: {rating}/10. Click to change."
                  )}
                  dir={directionFor(
                    game.userRating == null
                      ? "Rate this game"
                      : "My rating: {rating}/10. Click to change."
                  )}
                >
                  <Star className="w-3 h-3 fill-primary text-primary flex-shrink-0" />
                  <span className="text-xs">
                    {game.userRating == null ? (
                      <span className="opacity-40">—</span>
                    ) : (
                      formatRegionalNumber(game.userRating, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })
                    )}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-medium"
                    lang={languageFor("interface.my_rating_809bd9fc")}
                    dir={directionFor("interface.my_rating_809bd9fc")}
                  >
                    {t("interface.my_rating_809bd9fc")}
                  </span>
                  <span className="text-sm font-bold">{popoverRating}/10</span>
                </div>
                <Slider
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={[popoverRating]}
                  onValueChange={([val]) => val !== undefined && setPopoverRating(val)}
                  onValueCommit={([val]) =>
                    val !== undefined &&
                    userRatingMutation.mutate({ gameId: game.id, userRating: val })
                  }
                  aria-label={t("interface.my_rating_809bd9fc")}
                  lang={languageFor("interface.my_rating_809bd9fc")}
                  dir={directionFor("interface.my_rating_809bd9fc")}
                />
                {game.userRating != null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-muted-foreground"
                    onClick={() => {
                      setPopoverRating(DEFAULT_RATING);
                      userRatingMutation.mutate({ gameId: game.id, userRating: null });
                    }}
                  >
                    <span
                      lang={languageFor("interface.clear_rating_0479d557")}
                      dir={directionFor("interface.clear_rating_0479d557")}
                    >
                      {t("interface.clear_rating_0479d557")}
                    </span>
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          ) : (
            <>
              {!isDiscovery && game.userRating != null ? (
                <div className="flex items-center gap-1 tabular-nums">
                  <Star className="w-3 h-3 fill-primary text-primary flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {formatRegionalNumber(game.userRating, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1,
                    })}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/30">—</span>
              )}
            </>
          )}
        </div>

        {/* Release */}
        <div className="flex items-center justify-center gap-1">
          <Calendar className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
          {releaseFullDate ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground cursor-default">{releaseYear}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p lang={regionalLocale} dir={regionalDirection}>
                  {releaseFullDate}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-xs text-muted-foreground">{releaseYear}</span>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center justify-center">
          {!isDiscovery && game.status && <StatusBadge status={game.status} />}
        </div>
        {/* Type (release status, EA, hidden) */}
        <div className="flex items-center justify-center gap-0.5 flex-wrap">
          {!isDiscovery && game.status === "wanted" && (
            <Badge
              variant={releaseStatus.variant}
              className={cn("text-[9px] h-4 px-1", releaseStatus.className)}
            >
              <span lang={languageFor(releaseStatus.label)} dir={directionFor(releaseStatus.label)}>
                {t(releaseStatus.label)}
              </span>
            </Badge>
          )}
          {game.earlyAccess && (
            <Badge className="text-[9px] h-4 px-1 bg-amber-500 border-amber-600 text-white">
              <span
                lang={languageFor("interface.early_access_3a5fe28e")}
                dir={directionFor("interface.early_access_3a5fe28e")}
                aria-label={t("interface.early_access_3a5fe28e")}
              >
                <InterfaceText source={"EA"} />
              </span>
            </Badge>
          )}
          {game.hidden && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-gray-500 text-white">
              <span
                lang={languageFor("interface.hidden_3c2dfe59")}
                dir={directionFor("interface.hidden_3c2dfe59")}
              >
                {t("interface.hidden_3c2dfe59")}
              </span>
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-end gap-1"
          role="group"
          aria-label={t("interface.game_actions_57bffba4")}
          lang={languageFor("interface.game_actions_57bffba4")}
          dir={directionFor("interface.game_actions_57bffba4")}
        >
          {isDiscovery ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="default"
                  className={cn(
                    "transition-all",
                    density === "comfortable" ? "h-7 w-7" : "h-6 w-6"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDownloadClick();
                  }}
                  disabled={addGameMutation.isPending}
                  aria-label={formatInterfaceMessage("interface.download_title_5de658d1", {
                    title: game.title,
                  })}
                  lang={languageFor("interface.download_title_5de658d1")}
                  dir={directionFor("interface.download_title_5de658d1")}
                >
                  {addGameMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span
                  lang={languageFor("interface.download_6964bb19")}
                  dir={directionFor("interface.download_6964bb19")}
                >
                  {t("interface.download_6964bb19")}
                </span>
              </TooltipContent>
            </Tooltip>
          ) : (
            <StatusPicker
              currentStatus={game.status as GameStatus}
              onStatusChange={(newStatus) => onStatusChange?.(game.id, newStatus)}
              gameTitle={game.title}
            >
              <Button
                variant="ghost"
                size="icon"
                disabled={game.status === "downloading"}
                className={cn(
                  "transition-all text-muted-foreground hover:text-foreground",
                  density === "comfortable" ? "h-7 w-7" : "h-6 w-6"
                )}
                aria-label={formatInterfaceMessage("interface.change_status_for_title_4314f9e2", {
                  title: game.title,
                })}
                lang={languageFor("interface.change_status_for_title_4314f9e2")}
                dir={directionFor("interface.change_status_for_title_4314f9e2")}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  if (game.status === "wanted") {
                    return <span className="text-[11px]">📂</span>;
                  } else if (game.status === "owned") {
                    return <span className="text-[11px]">✔</span>;
                  } else if (game.status === "shelved") {
                    return <span className="text-[11px]">📦</span>;
                  } else if (game.status === "playing") {
                    return <span className="text-[11px]">🎮</span>;
                  } else {
                    return <span className="text-[11px]">★</span>;
                  }
                })()}
              </Button>
            </StatusPicker>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "transition-all text-muted-foreground hover:text-foreground",
                  density === "comfortable" ? "h-7 w-7" : "h-6 w-6"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDetailsClick();
                }}
                aria-label={formatInterfaceMessage("interface.view_details_for_title_0a6aaff1", {
                  title: game.title,
                })}
                lang={languageFor("interface.view_details_for_title_0a6aaff1")}
                dir={directionFor("interface.view_details_for_title_0a6aaff1")}
              >
                <Info className="w-3 h-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span
                lang={languageFor("interface.view_details_136a35ae")}
                dir={directionFor("interface.view_details_136a35ae")}
              >
                {t("interface.view_details_136a35ae")}
              </span>
            </TooltipContent>
          </Tooltip>

          {!isDiscovery && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "transition-all text-muted-foreground hover:text-foreground",
                    density === "comfortable" ? "h-7 w-7" : "h-6 w-6"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleHidden();
                  }}
                  aria-label={formatInterfaceMessage(
                    game.hidden ? "Unhide {title}" : "Hide {title}",
                    { title: game.title }
                  )}
                  lang={languageFor(game.hidden ? "Unhide {title}" : "Hide {title}")}
                  dir={directionFor(game.hidden ? "Unhide {title}" : "Hide {title}")}
                >
                  {game.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span
                  lang={languageFor(game.hidden ? "Unhide Game" : "Hide Game")}
                  dir={directionFor(game.hidden ? "Unhide Game" : "Hide Game")}
                >
                  {t(game.hidden ? "Unhide Game" : "Hide Game")}
                </span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {detailsOpen && (
        <Suspense fallback={<LazyModalFallback message="Loading game details..." />}>
          <GameDetailsModal game={resolvedGame} open={detailsOpen} onOpenChange={setDetailsOpen} />
        </Suspense>
      )}

      {downloadOpen && (
        <Suspense fallback={<LazyModalFallback message="Loading download dialog..." />}>
          <GameDownloadDialog
            game={resolvedGame}
            open={downloadOpen}
            onOpenChange={setDownloadOpen}
          />
        </Suspense>
      )}
    </>
  );
};

export default memo(CompactGameCard);
