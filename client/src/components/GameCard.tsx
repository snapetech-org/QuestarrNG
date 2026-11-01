import { coverSrc } from "@/lib/cover";
import React, { useState, memo, useRef, useEffect, useId, lazy, Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Star, Calendar, Eye, EyeOff, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { TagList } from "@/components/ui/tag-list";
import StatusBadge, { type GameStatus } from "./StatusBadge";
import StatusPicker from "./StatusPicker";
import { type Game, type DownloadSummary } from "@shared/schema";
import DownloadIndicator from "./DownloadIndicator";
import SearchResultsBadge from "./SearchResultsBadge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mapGameToInsertGame, isDiscoveryId, parseReleaseDate } from "@/lib/utils";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import LazyModalFallback from "./LazyModalFallback";
import { getReleaseStatus } from "@/lib/game-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getRegionalDirection,
  getRegionalLocale,
  useRegionalPreference,
} from "@/lib/regional-format";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import { InterfaceRichText, InterfaceText } from "@/components/InterfaceText";

// ⚡ Bolt: Lazy load heavy modal components to reduce initial bundle size.
// These are only needed when the user interacts with the card.
const GameDetailsModal = lazy(() => import("./GameDetailsModal"));
const GameDownloadDialog = lazy(() => import("./GameDownloadDialog"));

interface GameCardProps {
  game: Game;
  onStatusChange?: ((gameId: string, newStatus: GameStatus) => void) | undefined;
  onViewDetails?: ((gameId: string) => void) | undefined;
  onTrackGame?: ((game: Game) => void) | undefined;
  onToggleHidden?: ((gameId: string, hidden: boolean) => void) | undefined;
  isDiscovery?: boolean;
  downloadSummary?: DownloadSummary | undefined;
}

// ⚡ Bolt: Using React.memo to prevent unnecessary re-renders of the GameCard
// when parent components update but this card's props remain unchanged.
// This is particularly effective in grids or lists where many cards are rendered.
const GameCard = ({
  game,
  onStatusChange,
  onViewDetails,
  onTrackGame,
  onToggleHidden,
  isDiscovery = false,
  downloadSummary,
}: GameCardProps) => {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const gameCardLabelId = useId();
  const detailsButtonLabelId = useId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const releaseStatus = getReleaseStatus(game);
  const hasUserVisibleRating = game.rating != null && Number(game.rating) > 0;
  const isMobile = useIsMobile();
  const regionalPreference = useRegionalPreference();
  const regionalLocale =
    getRegionalLocale(regionalPreference) ?? Intl.DateTimeFormat().resolvedOptions().locale;
  const regionalDirection = getRegionalDirection(regionalLocale);

  // Keep track of the resolved game object (either original or newly added)
  const [resolvedGame, setResolvedGame] = useState<Game>(game);

  // Update resolved game if props change
  useEffect(() => {
    setResolvedGame(game);
  }, [game]);

  // For auto-adding games when downloading from Discovery
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
        // Handle 409 Conflict (already in library)
        if (error instanceof ApiError && error.status === 409) {
          const data = error.data as Record<string, unknown>;
          if (data?.game) {
            return data.game as Game;
          }
          // Fallback if data format is unexpected but we know it's a 409
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

  const handleDetailsClick = () => {
    console.warn(`View details triggered for game: ${game.title}`);
    setDetailsOpen(true);
    onViewDetails?.(game.id);
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !cardRef.current?.contains(target)) return;
    if (target.closest("button, a, input, textarea, select, [role='button']")) return;
    handleDetailsClick();
  };

  const handleDownloadClick = async () => {
    console.warn(`Download triggered for game: ${resolvedGame.title}`);

    // If it's a discovery game (temporary ID), add it to library first
    if (isDiscoveryId(resolvedGame.id)) {
      try {
        const gameInLibrary = await addGameMutation.mutateAsync(resolvedGame);
        // Note: resolvedGame is updated in onSuccess, but we use gameInLibrary here
        // to be absolutely sure we have the latest version for the dialog
        setResolvedGame(gameInLibrary);
        setDownloadOpen(true);
      } catch {
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

  const handleToggleHidden = () => {
    onToggleHidden?.(game.id, !game.hidden);
  };

  const { year: releaseYear, fullDate: releaseFullDate } = parseReleaseDate(
    game.releaseDate,
    regionalPreference
  );
  const mobileActionButtonClass = "h-9 w-9";

  return (
    <Card
      ref={cardRef}
      onClick={handleCardClick}
      className={`group hover-elevate transition-all duration-200 mx-auto min-w-0 w-full max-w-full cursor-pointer flex flex-col h-full overflow-hidden sm:max-w-[225px] ${game.hidden ? "opacity-60 grayscale" : ""}`}
      data-testid={`card-game-${game.id}`}
      role="group"
      aria-labelledby={gameCardLabelId}
    >
      <span className="sr-only" id={gameCardLabelId}>
        <InterfaceRichText
          source="interface.game_card_for_title_da08dee8"
          values={{ title: game.title }}
        />
      </span>
      <div className="relative">
        {/* ⚡ Bolt: Lazy loading images prevents fetching all game covers upfront,
            improving initial page load speed, especially on pages with many carousels. */}
        <img
          src={coverSrc(game.coverUrl)}
          alt={formatInterfaceMessage("interface.cover_art_for_title_44c4687e", {
            title: game.title,
          })}
          lang={languageFor("interface.cover_art_for_title_44c4687e")}
          dir={directionFor("interface.cover_art_for_title_44c4687e")}
          className="thumbnail-image rounded-t-md"
          loading="lazy"
          data-testid={`img-cover-${game.id}`}
        />
        <DownloadIndicator summary={downloadSummary} />
        <div className="absolute end-1.5 top-1.5 flex max-w-[calc(100%-0.75rem)] flex-col items-end gap-1 sm:end-2 sm:top-2">
          {!isDiscovery && game.status && <StatusBadge status={game.status} />}
          {game.earlyAccess && (
            <Badge
              className="text-xs bg-amber-500 border-amber-600 text-white"
              lang={languageFor("interface.early_access_3a5fe28e")}
              dir={directionFor("interface.early_access_3a5fe28e")}
            >
              {t("interface.early_access_3a5fe28e")}
            </Badge>
          )}
          {game.status === "wanted" && (
            <Badge
              variant={releaseStatus.variant}
              className={`max-w-full truncate text-[10px] sm:text-xs ${releaseStatus.className || ""}`}
            >
              <span lang={languageFor(releaseStatus.label)} dir={directionFor(releaseStatus.label)}>
                {t(releaseStatus.label)}
              </span>
            </Badge>
          )}
          {game.hidden && (
            <Badge variant="secondary" className="text-xs bg-gray-500 text-white">
              <span
                lang={languageFor("interface.hidden_3c2dfe59")}
                dir={directionFor("interface.hidden_3c2dfe59")}
              >
                {t("interface.hidden_3c2dfe59")}
              </span>
            </Badge>
          )}
        </div>
        {!isDiscovery && (
          <div
            className={`absolute start-1.5 top-1.5 z-10 transition-opacity duration-200 sm:start-2 sm:top-2 ${
              isMobile
                ? "opacity-100"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
            }`}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9 bg-background/80 backdrop-blur-sm"
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
                  data-testid={`button-toggle-hidden-${game.id}`}
                >
                  {game.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p
                  lang={languageFor(game.hidden ? "Unhide Game" : "Hide Game")}
                  dir={directionFor(game.hidden ? "Unhide Game" : "Hide Game")}
                >
                  {t(game.hidden ? "Unhide Game" : "Hide Game")}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <SearchResultsBadge
          visible={game.searchResultsAvailable ?? false}
          updatesAvailable={!isDiscovery && game.updateSearchResultsAvailable}
        />
        {!isMobile && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-t-md bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
            {isDiscovery && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="default"
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
                    data-testid={`button-download-${game.id}`}
                  >
                    {addGameMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p
                    lang={languageFor("interface.download_6964bb19")}
                    dir={directionFor("interface.download_6964bb19")}
                  >
                    {t("interface.download_6964bb19")}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <CardContent className="flex min-w-0 flex-1 flex-col p-2 sm:p-3">
        <h3
          className="mb-1.5 line-clamp-2 text-xs font-semibold leading-4 sm:mb-2 sm:text-sm sm:leading-5"
          data-testid={`text-title-${game.id}`}
          lang="und"
          dir="auto"
        >
          <button
            type="button"
            className="w-full rounded-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={(event) => {
              event.stopPropagation();
              handleDetailsClick();
            }}
            aria-labelledby={detailsButtonLabelId}
            data-testid={`button-details-${game.id}`}
          >
            <span className="sr-only" id={detailsButtonLabelId}>
              <InterfaceRichText
                source="interface.view_details_for_title_0a6aaff1"
                values={{ title: game.title }}
              />
            </span>
            <bdi lang="und" dir="auto">{game.title}</bdi>
          </button>
        </h3>
        <div className="mb-2 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground sm:gap-2 sm:text-xs">
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                role="img"
                aria-label={
                  hasUserVisibleRating
                    ? formatInterfaceMessage("interface.igdb_rating_rating_out_of_10_fbf37993", {
                        rating: Number(game.rating),
                      })
                    : t("interface.not_rated_9de37148")
                }
                lang={languageFor(
                  hasUserVisibleRating ? "IGDB rating: {rating} out of 10" : "Not rated"
                )}
                dir={directionFor(
                  hasUserVisibleRating ? "IGDB rating: {rating} out of 10" : "Not rated"
                )}
                tabIndex={0}
              >
                <Star className="w-3 h-3 text-accent" aria-hidden="true" />
                <span data-testid={`text-rating-${game.id}`}>
                  {hasUserVisibleRating ? `${game.rating}/10` : t("interface.n_a_79db7a01")}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p
                lang={languageFor("interface.igdb_score_39719cbd")}
                dir={directionFor("interface.igdb_score_39719cbd")}
              >
                {t("interface.igdb_score_39719cbd")}
              </p>
            </TooltipContent>
          </Tooltip>
          {!isDiscovery && game.userRating !== null && game.userRating !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  role="img"
                  aria-label={formatInterfaceMessage(
                    "interface.my_rating_rating_out_of_10_f3d2beef",
                    {
                      rating: game.userRating,
                    }
                  )}
                  lang={languageFor("interface.my_rating_rating_out_of_10_f3d2beef")}
                  dir={directionFor("interface.my_rating_rating_out_of_10_f3d2beef")}
                  tabIndex={0}
                >
                  <Star className="w-3 h-3 fill-primary text-primary" aria-hidden="true" />
                  <span data-testid={`text-user-rating-${game.id}`}>{game.userRating}/10</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p
                  lang={languageFor("interface.my_rating_809bd9fc")}
                  dir={directionFor("interface.my_rating_809bd9fc")}
                >
                  {t("interface.my_rating_809bd9fc")}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                role="img"
                aria-label={formatInterfaceMessage("interface.release_date_date_e2610e34", {
                  date: releaseYear,
                })}
                lang={languageFor("interface.release_date_date_e2610e34")}
                dir={directionFor("interface.release_date_date_e2610e34")}
                tabIndex={0}
              >
                <Calendar className="w-3 h-3" aria-hidden="true" />
                <span data-testid={`text-release-${game.id}`}>{releaseYear}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {releaseFullDate ? (
                <p lang={regionalLocale} dir={regionalDirection}>
                  {releaseFullDate}
                </p>
              ) : (
                <p
                  lang={languageFor("interface.release_date_1d144bfe")}
                  dir={directionFor("interface.release_date_1d144bfe")}
                >
                  {t("interface.release_date_1d144bfe")}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="mb-3 flex-1 content-start">
          <TagList
            items={game.genres ?? []}
            variant="secondary"
            maxVisible={isMobile ? 1 : 2}
            getTestId={(g) => `tag-genre-${g.toLowerCase()}`}
            emptyText="No genres"
            className="gap-1"
          />
        </div>
        {isMobile && isDiscovery && (
          <div
            className="mb-3 flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
            role="toolbar"
            aria-label={formatInterfaceMessage("interface.actions_for_title_f9d3c417", {
              title: game.title,
            })}
            lang={languageFor("interface.actions_for_title_f9d3c417")}
            dir={directionFor("interface.actions_for_title_f9d3c417")}
            tabIndex={0}
          >
            <Button
              size="icon"
              variant="default"
              className={mobileActionButtonClass}
              onClick={() => void handleDownloadClick()}
              disabled={addGameMutation.isPending}
              aria-label={formatInterfaceMessage("interface.download_title_5de658d1", {
                title: game.title,
              })}
              lang={languageFor("interface.download_title_5de658d1")}
              dir={directionFor("interface.download_title_5de658d1")}
              data-testid={`button-download-${game.id}`}
            >
              {addGameMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
        <div className="mt-auto">
          {isDiscovery ? (
            <Button
              variant="default"
              size="sm"
              className="h-10 w-full sm:h-9"
              onClick={(e) => {
                e.stopPropagation();
                onTrackGame?.(game);
              }}
              disabled={addGameMutation.isPending}
              data-testid={`button-track-${game.id}`}
              aria-label={formatInterfaceMessage("interface.track_title_c799ab04", {
                title: game.title,
              })}
              lang={languageFor("interface.track_title_c799ab04")}
              dir={directionFor("interface.track_title_c799ab04")}
            >
              {addGameMutation.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 me-2 animate-spin" />
                  <span
                    lang={languageFor("interface.tracking_0f7e9712")}
                    dir={directionFor("interface.tracking_0f7e9712")}
                  >
                    {t("interface.tracking_0f7e9712")}
                  </span>
                </>
              ) : (
                <span
                  lang={languageFor("interface.track_game_164dac9e")}
                  dir={directionFor("interface.track_game_164dac9e")}
                >
                  {t("interface.track_game_164dac9e")}
                </span>
              )}
            </Button>
          ) : (
            <StatusPicker
              currentStatus={game.status as GameStatus}
              onStatusChange={(newStatus) => onStatusChange?.(game.id, newStatus)}
              gameTitle={game.title}
              data-testid={`button-status-${game.id}`}
              compact={isMobile}
              triggerClassName="w-full"
            />
          )}
        </div>
      </CardContent>

      {/* ⚡ Bolt: Conditionally render modals only when they are active.
          This prevents rendering hundreds of hidden, complex components on pages
          with many game cards, significantly improving initial render performance
          and reducing memory usage. */}
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
    </Card>
  );
};

export default memo(GameCard);
