import React, { lazy, Suspense, useEffect, useState } from "react";
import { Dices, Gamepad2, Loader2 } from "lucide-react";
import type { Game } from "@shared/schema";
import { coverSrc } from "@/lib/cover";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import StatusBadge from "./StatusBadge";
import LazyModalFallback from "./LazyModalFallback";
import { InterfaceText } from "./InterfaceText";

const GameDetailsModal = lazy(() => import("./GameDetailsModal"));
type Pool = "owned" | "playing" | "all";

const ALL_POOLS: Pool[] = ["owned", "playing", "all"];

/** Draw from a filtered game list and let users inspect or mark a game as Playing. */
export default function BacklogRoulette({
  games,
  loading,
  onStartPlaying,
  pools = ALL_POOLS,
}: {
  games: Game[];
  loading: boolean;
  /** Omit to hide the "Mark as Playing" action (e.g. when every game is already playing). */
  onStartPlaying?: (gameId: string) => Promise<void>;
  /** Pools offered in the "Pick from" select; the first one is the default draw. */
  pools?: Pool[];
}) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState<Pool>(pools[0] ?? "all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsGameId, setDetailsGameId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const candidates = games.filter(
    (game) => !game.hidden && (pool === "all" || game.status === pool)
  );
  const selected = candidates.find((game) => game.id === selectedId);
  const detailsGame = games.find((game) => game.id === detailsGameId);

  // Read the latest query data, and close details if a refresh removes the game.
  useEffect(() => {
    if (detailsGameId && !detailsGame) setDetailsGameId(null);
  }, [detailsGameId, detailsGame]);

  /** Draw uniformly from the chosen pool, skipping the previous game when possible. */
  function roll(nextPool = pool) {
    const eligible = games.filter(
      (game) => !game.hidden && (nextPool === "all" || game.status === nextPool)
    );
    const choices =
      eligible.length > 1 ? eligible.filter((game) => game.id !== selectedId) : eligible;
    if (!choices.length) {
      setSelectedId(null);
      return;
    }
    // Reject the remainder of the uint32 range so modulo does not bias the draw.
    const limit = Math.floor(2 ** 32 / choices.length) * choices.length;
    let draw;
    do {
      [draw = 0] = crypto.getRandomValues(new Uint32Array(1));
    } while (draw >= limit);
    setSelectedId(choices[draw % choices.length]?.id ?? null);
  }

  /** Save the selected game's status; keep the dialog open if the save fails. */
  async function startPlaying() {
    if (!selected || !onStartPlaying) return;
    setStarting(true);
    try {
      await onStartPlaying(selected.id);
      setOpen(false);
    } catch {
      // The Library mutation shows its error toast. Keep the selection open to retry.
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (starting) return;
          if (value) roll();
          setOpen(value);
        }}
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={loading}
            aria-label={t("interface.pick_a_game_c1a9f0fb")}
          >
            <Dices className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              <InterfaceText source="interface.pick_a_game_c1a9f0fb" />
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dices className="h-5 w-5 text-primary" />
              <InterfaceText source="interface.backlog_roulette_a636d178" />
            </DialogTitle>
            <DialogDescription>
              <InterfaceText source="interface.too_many_games_nothing_to_play_let_6cb0fba3" />
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="roulette-pool">
              <InterfaceText source="interface.pick_from_cd0562f8" />
            </Label>
            <Select
              value={pool}
              disabled={starting || loading}
              onValueChange={(value) => {
                const nextPool = value as Pool;
                setPool(nextPool);
                roll(nextPool);
              }}
            >
              <SelectTrigger id="roulette-pool">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pools.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === "owned" ? (
                      <InterfaceText source="interface.owned_games_daef9331" />
                    ) : value === "playing" ? (
                      <InterfaceText source="interface.currently_playing_11f33077" />
                    ) : (
                      <InterfaceText source="interface.all_visible_games_21a37c61" />
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <InterfaceText source="interface.your_current_search_and_filters_ap_d16bd663" />
            </p>
          </div>
          <div aria-live="polite" aria-atomic="true">
            {selected ? (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                  <InterfaceText source="interface.tonight_s_quest_07b89764" />
                </p>
                <div className="flex gap-4">
                  <img
                    key={selected.id}
                    src={coverSrc(selected.coverUrl)}
                    alt={formatInterfaceMessage(
                      "interface.cover_art_for_title_44c4687e",
                      { title: selected.title },
                      language
                    )}
                    lang={languageFor("interface.cover_art_for_title_44c4687e")}
                    dir={directionFor("interface.cover_art_for_title_44c4687e")}
                    className="w-24 sm:w-28 aspect-[3/4] shrink-0 self-start rounded-md object-cover"
                  />
                  <div className="min-w-0 space-y-2">
                    <h2 className="text-xl font-bold break-words" data-testid="roulette-title">
                      {selected.title}
                    </h2>
                    <StatusBadge status={selected.status} />
                    <p className="text-sm text-muted-foreground break-words">
                      {selected.genres?.join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground break-words">
                      {selected.platforms?.join(" · ")}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  <InterfaceText
                    source="interface.eligible_options_count_f3ea0f53"
                    values={{ count: Intl.NumberFormat(language).format(candidates.length) }}
                  />
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center space-y-2">
                <Gamepad2 className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-medium">
                  {candidates.length ? (
                    <InterfaceText source="interface.ready_for_another_quest_940cc507" />
                  ) : (
                    <InterfaceText source="interface.no_games_in_this_draw_5859286a" />
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {candidates.length ? (
                    <InterfaceText source="interface.roll_again_to_pick_from_your_updat_4148ccba" />
                  ) : (
                    <InterfaceText source="interface.choose_another_pool_or_adjust_your_6ba5536a" />
                  )}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => roll()}
              disabled={
                loading || starting || !candidates.length || (candidates.length === 1 && !!selected)
              }
            >
              <Dices className="h-4 w-4 me-2" />
              <InterfaceText source="interface.roll_again_ba2a178a" />
            </Button>
            {selected && (
              <>
                <Button
                  variant="outline"
                  disabled={starting || loading}
                  onClick={() => {
                    setDetailsGameId(selected.id);
                    setOpen(false);
                  }}
                >
                  <InterfaceText source="interface.view_game_a57efe9a" />
                </Button>
                {selected.status === "owned" && onStartPlaying && (
                  <Button
                    className="sm:ms-auto"
                    onClick={startPlaying}
                    disabled={starting || loading}
                  >
                    {starting ? (
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                    ) : (
                      <Gamepad2 className="h-4 w-4 me-2" />
                    )}
                    <InterfaceText source="interface.mark_as_playing_d108203e" />
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {detailsGame && (
        <Suspense fallback={<LazyModalFallback />}>
          <GameDetailsModal
            game={detailsGame}
            open
            onOpenChange={(value) => {
              if (!value) setDetailsGameId(null);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
