import {
  formatRegionalPercent,
  getRegionalLocale,
  useRegionalPreference,
} from "@/lib/regional-format";
import { useRef, useState } from "react";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  ImagePlus,
  Loader2,
  Plus,
  Trophy,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { apiFetch, apiRequest, throwIfResNotOk } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { withBasePath } from "@/lib/app-path";
import type { GameJournalEntry, GameMilestone } from "@shared/schema";

interface GameJournalTabProps {
  gameId: string;
  steamAppId: number | null;
}

interface SteamAchievement {
  apiName: string;
  displayName: string;
  description: string | null;
  icon: string;
  iconGray: string;
  hidden: boolean;
  achieved: boolean;
  unlockedAt: number | null;
  globalPercent: number | null;
}

interface GameScreenshotWithUrl {
  id: string;
  filePath: string;
  caption: string | null;
  createdAt: string | null;
  url: string;
}

interface AchievementsResponse {
  achievements: SteamAchievement[];
  reason?: "not_configured" | "no_steam_app_id" | "no_steam_id";
}

function formatDate(value: string | Date | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(getRegionalLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function GameJournalTab({ gameId, steamAppId }: Readonly<GameJournalTabProps>) {
  const { toast } = useToast();
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const regionalPreference = useRegionalPreference();
  const queryClient = useQueryClient();
  const localizedText = (source: string, values: Record<string, string | number> = {}) => {
    const text = formatInterfaceMessage(source, values, language);
    if (language === "en") return text;
    return (
      <span lang={languageFor(source)} dir={directionFor(source)}>
        {text}
      </span>
    );
  };

  /** Shared onSuccess/onError pair for the mutations below: invalidate the
   * given query key and, on failure, show a toast with `errorMessage`. */
  const invalidateOnSuccess = (
    queryKey: string,
    errorMessage: string,
    onSuccessExtra?: () => void
  ) => ({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      onSuccessExtra?.();
    },
    onError: () =>
      toast({ description: localizedText(errorMessage), variant: "destructive" as const }),
  });

  const { data: steamSettings } = useQuery<{ apiKeyConfigured: boolean }>({
    queryKey: ["/api/settings/steam"],
  });

  const achievementsEnabled = Boolean(steamSettings?.apiKeyConfigured && steamAppId);

  const { data: achievementsData } = useQuery<AchievementsResponse>({
    queryKey: [`/api/games/${gameId}/achievements`],
    enabled: achievementsEnabled,
  });

  const { data: journalEntries = [] } = useQuery<GameJournalEntry[]>({
    queryKey: [`/api/games/${gameId}/journal`],
  });

  const { data: milestones = [] } = useQuery<GameMilestone[]>({
    queryKey: [`/api/games/${gameId}/milestones`],
  });

  const { data: screenshots = [] } = useQuery<GameScreenshotWithUrl[]>({
    queryKey: [`/api/games/${gameId}/screenshots`],
  });

  // ─── Journal notes ───────────────────────────────────────────────────────
  const [noteDraft, setNoteDraft] = useState("");

  const addEntryMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await apiRequest("POST", `/api/games/${gameId}/journal`, { note });
      return res.json();
    },
    ...invalidateOnSuccess(`/api/games/${gameId}/journal`, "Failed to add journal entry", () =>
      setNoteDraft("")
    ),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiRequest("DELETE", `/api/games/${gameId}/journal/${entryId}`);
    },
    ...invalidateOnSuccess(`/api/games/${gameId}/journal`, "Failed to delete journal entry"),
  });

  // ─── Milestones ──────────────────────────────────────────────────────────
  const [milestoneDraft, setMilestoneDraft] = useState("");

  const addMilestoneMutation = useMutation({
    mutationFn: async (label: string) => {
      const res = await apiRequest("POST", `/api/games/${gameId}/milestones`, { label });
      return res.json();
    },
    ...invalidateOnSuccess(`/api/games/${gameId}/milestones`, "Failed to add milestone", () =>
      setMilestoneDraft("")
    ),
  });

  const toggleMilestoneMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      await apiRequest("PATCH", `/api/games/${gameId}/milestones/${id}`, { completed });
    },
    ...invalidateOnSuccess(`/api/games/${gameId}/milestones`, "Failed to update milestone"),
  });

  const deleteMilestoneMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/games/${gameId}/milestones/${id}`);
    },
    ...invalidateOnSuccess(`/api/games/${gameId}/milestones`, "Failed to delete milestone"),
  });

  // ─── Screenshots ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxScreenshot, setLightboxScreenshot] = useState<GameScreenshotWithUrl | null>(null);

  const uploadScreenshotMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await apiFetch(`/api/games/${gameId}/screenshots`, {
        method: "POST",
        body: formData,
      });
      await throwIfResNotOk(res);
      return res.json();
    },
    ...invalidateOnSuccess(`/api/games/${gameId}/screenshots`, "Failed to upload screenshot"),
  });

  const deleteScreenshotMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/games/${gameId}/screenshots/${id}`);
    },
    ...invalidateOnSuccess(`/api/games/${gameId}/screenshots`, "Failed to delete screenshot", () =>
      setLightboxScreenshot(null)
    ),
  });

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadScreenshotMutation.mutate(file);
  };

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 pe-4 pb-2">
        {/* ── Achievements (Steam, when available) ── */}
        {achievementsEnabled && achievementsData && achievementsData.achievements.length > 0 && (
          <section>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              <span
                lang={languageFor("interface.achievements_51a391d1")}
                dir={directionFor("interface.achievements_51a391d1")}
              >
                {t("interface.achievements_51a391d1")}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {achievementsData.achievements.filter((a) => a.achieved).length}/
                {achievementsData.achievements.length}
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {achievementsData.achievements.map((achievement) => (
                <Card
                  key={achievement.apiName}
                  className={achievement.achieved ? "" : "opacity-60"}
                >
                  <CardContent className="p-3 flex items-center gap-3">
                    {achievement.icon && (
                      <img
                        src={achievement.achieved ? achievement.icon : achievement.iconGray}
                        alt=""
                        className="w-10 h-10 rounded shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" lang="und" dir="auto">
                        {achievement.displayName}
                      </p>
                      {achievement.description && (
                        <p
                          className="text-xs text-muted-foreground line-clamp-2"
                          lang="und"
                          dir="auto"
                        >
                          {achievement.description}
                        </p>
                      )}
                      {achievement.globalPercent !== null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {localizedText("interface.percent_of_players_42682819", {
                            percent: formatRegionalPercent(
                              achievement.globalPercent,
                              { minimumFractionDigits: 1, maximumFractionDigits: 1 },
                              regionalPreference
                            ),
                          })}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* ── Milestones (manual "successes" checklist) ── */}
        <section>
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span
              lang={languageFor("interface.milestones_836aa82a")}
              dir={directionFor("interface.milestones_836aa82a")}
            >
              {t("interface.milestones_836aa82a")}
            </span>
          </h3>
          <div className="space-y-1.5 mb-2">
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() =>
                    toggleMilestoneMutation.mutate({
                      id: milestone.id,
                      completed: !milestone.completedAt,
                    })
                  }
                  aria-label={formatInterfaceMessage(
                    milestone.completedAt ? 'Mark "{label}" incomplete' : 'Mark "{label}" complete',
                    { label: milestone.label },
                    language
                  )}
                  lang="und"
                  dir="auto"
                  className="shrink-0"
                >
                  {milestone.completedAt ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                <span
                  className={`flex-1 min-w-0 text-sm truncate ${milestone.completedAt ? "text-muted-foreground line-through" : ""}`}
                  lang="und"
                  dir="auto"
                >
                  {milestone.label}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={formatInterfaceMessage(
                    "interface.delete_milestone_label_27c6a0ec",
                    { label: milestone.label },
                    language
                  )}
                  lang="und"
                  dir="auto"
                  onClick={() => deleteMilestoneMutation.mutate(milestone.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
            {milestones.length === 0 && (
              <p
                className="text-sm text-muted-foreground"
                lang={languageFor("interface.no_milestones_yet_8a03293b")}
                dir={directionFor("interface.no_milestones_yet_8a03293b")}
              >
                {t("interface.no_milestones_yet_8a03293b")}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={milestoneDraft}
              onChange={(e) => setMilestoneDraft(e.target.value)}
              placeholder={t("interface.add_a_milestone_a288e551")}
              lang={languageFor("interface.new_milestone_label_74d61b01")}
              dir={directionFor("interface.new_milestone_label_74d61b01")}
              maxLength={200}
              aria-label={t("interface.new_milestone_label_74d61b01")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && milestoneDraft.trim() && !addMilestoneMutation.isPending) {
                  addMilestoneMutation.mutate(milestoneDraft.trim());
                }
              }}
            />
            <Button
              size="icon"
              variant="outline"
              disabled={!milestoneDraft.trim() || addMilestoneMutation.isPending}
              onClick={() =>
                milestoneDraft.trim() && addMilestoneMutation.mutate(milestoneDraft.trim())
              }
              aria-label={t("interface.add_milestone_36a90766")}
              lang={languageFor("interface.add_milestone_36a90766")}
              dir={directionFor("interface.add_milestone_36a90766")}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </section>

        {/* ── Notes (local-only journal) ── */}
        <section>
          <h3 className="font-semibold mb-2 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            <span
              lang={languageFor("interface.notes_0ff01b6a")}
              dir={directionFor("interface.notes_0ff01b6a")}
            >
              {t("interface.notes_0ff01b6a")}
            </span>
          </h3>
          <div className="flex gap-2 mb-3">
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={t("interface.jot_down_a_thought_while_you_play_fdc764da")}
              lang={languageFor("interface.new_journal_note_057d9fa2")}
              dir={directionFor("interface.new_journal_note_057d9fa2")}
              className="resize-none min-h-[64px] text-sm"
              maxLength={10000}
              aria-label={t("interface.new_journal_note_057d9fa2")}
            />
            <Button
              variant="outline"
              disabled={!noteDraft.trim() || addEntryMutation.isPending}
              onClick={() => noteDraft.trim() && addEntryMutation.mutate(noteDraft.trim())}
              className="self-end"
            >
              <span
                lang={languageFor("interface.add_9dc3aa14")}
                dir={directionFor("interface.add_9dc3aa14")}
              >
                {t("interface.add_9dc3aa14")}
              </span>
            </Button>
          </div>
          <div className="space-y-2">
            {journalEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p
                    className="text-sm whitespace-pre-wrap break-words flex-1 min-w-0"
                    lang="und"
                    dir="auto"
                  >
                    {entry.note}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label={t("interface.delete_journal_entry_f479cbe5")}
                    lang={languageFor("interface.delete_journal_entry_f479cbe5")}
                    dir={directionFor("interface.delete_journal_entry_f479cbe5")}
                    onClick={() => deleteEntryMutation.mutate(entry.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(entry.createdAt)}</p>
              </div>
            ))}
            {journalEntries.length === 0 && (
              <p
                className="text-sm text-muted-foreground"
                lang={languageFor("interface.no_journal_entries_yet_dca3284b")}
                dir={directionFor("interface.no_journal_entries_yet_dca3284b")}
              >
                {t("interface.no_journal_entries_yet_dca3284b")}
              </p>
            )}
          </div>
        </section>

        {/* ── Screenshots ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2">
              <ImagePlus className="w-4 h-4" />
              <span
                lang={languageFor("interface.screenshots_9ad59e86")}
                dir={directionFor("interface.screenshots_9ad59e86")}
              >
                {t("interface.screenshots_9ad59e86")}
              </span>
            </h3>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadScreenshotMutation.isPending}
            >
              {uploadScreenshotMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span
                lang={languageFor("interface.upload_826f7f7c")}
                dir={directionFor("interface.upload_826f7f7c")}
              >
                {t("interface.upload_826f7f7c")}
              </span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileSelected}
              aria-label={t("interface.upload_screenshot_10dc7ce0")}
              lang={languageFor("interface.upload_screenshot_10dc7ce0")}
              dir={directionFor("interface.upload_screenshot_10dc7ce0")}
            />
          </div>
          {screenshots.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {screenshots.map((screenshot) => (
                <button
                  key={screenshot.id}
                  type="button"
                  className="relative aspect-video rounded-md overflow-hidden border border-border"
                  onClick={() => setLightboxScreenshot(screenshot)}
                  aria-label={t("interface.view_screenshot_e64b2c9c")}
                  lang={languageFor("interface.view_screenshot_e64b2c9c")}
                  dir={directionFor("interface.view_screenshot_e64b2c9c")}
                >
                  <img
                    src={withBasePath(screenshot.url)}
                    alt={screenshot.caption ?? t("interface.game_screenshot_9be01171")}
                    lang={
                      screenshot.caption ? "und" : languageFor("interface.game_screenshot_9be01171")
                    }
                    dir={
                      screenshot.caption
                        ? "auto"
                        : directionFor("interface.game_screenshot_9be01171")
                    }
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p
              className="text-sm text-muted-foreground"
              lang={languageFor("interface.no_screenshots_yet_97fdff75")}
              dir={directionFor("interface.no_screenshots_yet_97fdff75")}
            >
              {t("interface.no_screenshots_yet_97fdff75")}
            </p>
          )}
        </section>
      </div>

      <Dialog
        open={!!lightboxScreenshot}
        onOpenChange={(open) => !open && setLightboxScreenshot(null)}
      >
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle
            className="sr-only"
            lang={languageFor("interface.screenshot_d51a9351")}
            dir={directionFor("interface.screenshot_d51a9351")}
          >
            {t("interface.screenshot_d51a9351")}
          </DialogTitle>
          {lightboxScreenshot && (
            <div className="space-y-2">
              <img
                src={withBasePath(lightboxScreenshot.url)}
                alt={lightboxScreenshot.caption ?? t("interface.game_screenshot_9be01171")}
                lang={
                  lightboxScreenshot.caption
                    ? "und"
                    : languageFor("interface.game_screenshot_9be01171")
                }
                dir={
                  lightboxScreenshot.caption
                    ? "auto"
                    : directionFor("interface.game_screenshot_9be01171")
                }
                className="w-full rounded-md"
              />
              <div className="flex justify-end px-1 pb-1">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => deleteScreenshotMutation.mutate(lightboxScreenshot.id)}
                  disabled={deleteScreenshotMutation.isPending}
                >
                  <X className="w-3.5 h-3.5" />
                  <span
                    lang={languageFor("interface.delete_5797ea6a")}
                    dir={directionFor("interface.delete_5797ea6a")}
                  >
                    {t("interface.delete_5797ea6a")}
                  </span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
