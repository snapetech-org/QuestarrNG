import {
  formatRegionalNumber,
  getRegionalDirection as getLocaleDirection,
  getRegionalLocale,
  getRegionalWeekStartsOn,
  useRegionalPreference,
} from "@/lib/regional-format";
import { coverSrc } from "@/lib/cover";
import { useId, useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageToolbar from "@/components/PageToolbar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Game, type Config } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Link, type RouteComponentProps } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import GameDownloadDialog from "@/components/GameDownloadDialog";
import { useInterfaceLanguage } from "@/lib/interface-locale";

type ViewMode = "year" | "month" | "week";

interface GamesByDate {
  [date: string]: Game[];
}

export function formatReleaseCount(count: number, translate: (source: string) => string): string {
  const source = count === 1 ? "release" : count === 2 ? "two releases" : "releases";
  const label = translate(source);
  if (count === 2) return label.replaceAll("{count}", formatRegionalNumber(count));
  return `${formatRegionalNumber(count)} ${label}`;
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Release dates are usually date-only ("YYYY-MM-DD"), but a claimed download can carry a full
// ISO datetime. Map those to the viewer's local calendar day before comparing with today.
function toLocalDateKey(releaseDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ? releaseDate : formatDate(new Date(releaseDate));
}

function parseCalendarDate(date: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
}

export function formatCalendarDate(
  date: Date,
  options: Intl.DateTimeFormatOptions,
  locale = getRegionalLocale()
): string {
  return new Intl.DateTimeFormat(locale, { ...options, calendar: "gregory" }).format(date);
}

export function formatCalendarTitle(
  currentDate: Date,
  viewMode: ViewMode,
  locale?: string
): string {
  if (viewMode === "year") {
    return formatCalendarDate(
      currentDate,
      {
        year: "numeric",
      },
      locale
    );
  }

  if (viewMode === "month") {
    return formatCalendarDate(
      currentDate,
      {
        month: "long",
        year: "numeric",
      },
      locale
    );
  }

  const weekDays = getWeekDays(new Date(currentDate));
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  return (
    formatCalendarDate(weekDays[0]!, options, locale) +
    " – " +
    formatCalendarDate(weekDays[6]!, options, locale)
  );
}

export function getGregorianMonthName(month: number, locale = getRegionalLocale()): string {
  return formatCalendarDate(
    new Date(2000, month, 1),
    {
      month: "long",
    },
    locale
  );
}

function getRegionalLanguage(): string {
  return (
    getRegionalLocale() ?? (typeof navigator === "undefined" ? "en" : navigator.language || "en")
  );
}

function getRegionalDirection(locale = getRegionalLanguage()): "ltr" | "rtl" {
  return getLocaleDirection(locale);
}

function LocalizedText({ source }: { source: string }) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <span lang={languageFor(source)} dir={directionFor(source)}>
      {t(source)}
    </span>
  );
}

export function getWeekDays(date: Date, weekStartsOn: number = getRegionalWeekStartsOn()): Date[] {
  const daysSinceWeekStart = (date.getDay() - weekStartsOn + 7) % 7;
  const firstDay = new Date(date);
  firstDay.setDate(date.getDate() - daysSinceWeekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(firstDay);
    d.setDate(firstDay.getDate() + i);
    return d;
  });
}

export function getDaysInMonth(
  year: number,
  month: number,
  weekStartsOn: number = getRegionalWeekStartsOn()
): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Add days from previous month to fill the week
  const firstDayOfWeek = firstDay.getDay();
  const daysToAdd = (firstDayOfWeek - weekStartsOn + 7) % 7;
  for (let i = daysToAdd; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push(d);
  }

  // Add all days of current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // Add days from next month to complete the week
  const lastDayOfWeek = lastDay.getDay();
  const daysToAddEnd = (weekStartsOn + 6 - lastDayOfWeek + 7) % 7;
  for (let i = 1; i <= daysToAddEnd; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

type CalendarPageProps = { today?: Date } & Partial<RouteComponentProps>;

export default function CalendarPage({ today: injectedToday }: CalendarPageProps = {}) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  useRegionalPreference();
  const regionalLocale = getRegionalLanguage();
  const regionalDirection = getRegionalDirection(regionalLocale);
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [currentDate, setCurrentDate] = useState(() =>
    injectedToday ? new Date(injectedToday.getTime()) : new Date()
  );
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [liveToday, setLiveToday] = useState(() => new Date());
  const today = injectedToday ?? liveToday;

  useEffect(() => {
    if (injectedToday) return;

    let timeoutId: number;
    const scheduleRefresh = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setHours(24, 0, 0, 0);
      timeoutId = window.setTimeout(() => {
        setLiveToday(new Date());
        scheduleRefresh();
      }, nextMidnight.getTime() - now.getTime());
    };
    scheduleRefresh();
    return () => window.clearTimeout(timeoutId);
  }, [injectedToday]);

  const handleGameClick = (game: Game) => {
    setSelectedGame(game);
    setDownloadDialogOpen(true);
  };

  const { data: config } = useQuery<Config>({
    queryKey: ["/api/config"],
    queryFn: () => apiRequest("GET", "/api/config").then((res) => res.json()),
  });

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    enabled: !!config?.igdb.configured,
  });

  // Games with year-only release dates use YYYY-12-31 as a placeholder
  const isYearOnlyDate = (releaseDate: string) => releaseDate.endsWith("-12-31");

  // ⚡ Bolt: Consolidate multiple O(N) array traversals (filter, filter, forEach)
  // into a single manual loop to optimize render performance and reduce allocations.
  const { wantedGames, undatedGames, gamesByDate } = useMemo(() => {
    const wanted: Game[] = [];
    const undated: Game[] = [];
    const grouped: GamesByDate = {};
    const lowercaseQuery = searchQuery?.toLowerCase() || "";

    for (const g of games) {
      if (g.status === "wanted" && g.releaseDate) {
        if (lowercaseQuery && !g.title.toLowerCase().includes(lowercaseQuery)) {
          continue;
        }

        if (isYearOnlyDate(g.releaseDate)) {
          undated.push(g);
        } else {
          wanted.push(g);

          if (!grouped[g.releaseDate]) {
            grouped[g.releaseDate] = [];
          }
          grouped[g.releaseDate]!.push(g);
        }
      }
    }

    return { wantedGames: wanted, undatedGames: undated, gamesByDate: grouped };
  }, [games, searchQuery]);

  const navigatePrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "year") {
      newDate.setFullYear(currentDate.getFullYear() - 1);
    } else if (viewMode === "month") {
      newDate.setMonth(currentDate.getMonth() - 1);
    } else {
      newDate.setDate(currentDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const navigateNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "year") {
      newDate.setFullYear(currentDate.getFullYear() + 1);
    } else if (viewMode === "month") {
      newDate.setMonth(currentDate.getMonth() + 1);
    } else {
      newDate.setDate(currentDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const currentYearStr = currentDate.getFullYear().toString();

  const getTitle = () => formatCalendarTitle(currentDate, viewMode, getRegionalLocale());
  const viewModeLabel = viewMode === "year" ? "Year" : viewMode === "month" ? "Month" : "Week";

  if (config && !config.igdb.configured) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="bg-muted p-4 rounded-full">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold">
          <LocalizedText source="interface.igdb_configuration_required_6ad1583e" />
        </h2>
        <p className="text-muted-foreground max-w-md">
          <LocalizedText source="interface.to_track_game_release_dates_and_vi_26aeca72" />
        </p>
        <Link href="/settings">
          <Button>
            <LocalizedText source="interface.go_to_settings_a94624fd" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="space-y-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <LocalizedText source="interface.release_calendar_9a00977c" />
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            <LocalizedText source="interface.track_upcoming_game_releases_e9820f4c" />
          </p>
        </div>
        <PageToolbar
          search={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={t("interface.filter_games_adc0d742")}
          searchClearLabel={t("interface.clear_search_5a13e946")}
          searchClearLang={languageFor("interface.clear_search_5a13e946")}
          searchClearDir={directionFor("interface.clear_search_5a13e946")}
          searchLang={languageFor("interface.filter_games_adc0d742")}
          searchDir="auto"
          searchEmptyDir={directionFor("interface.filter_games_adc0d742")}
          filterPills={
            <span className="text-base font-semibold" lang={regionalLocale} dir={regionalDirection}>
              {getTitle()}
            </span>
          }
          actions={
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={navigatePrevious}
                aria-label={t("interface.previous_period_b5a4f439")}
                lang={languageFor("interface.previous_period_b5a4f439")}
                dir={directionFor("interface.previous_period_b5a4f439")}
              >
                {language === "ar" ? (
                  <ChevronRight className="h-5 w-5" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={navigateNext}
                aria-label={t("interface.next_period_2feea679")}
                lang={languageFor("interface.next_period_2feea679")}
                dir={directionFor("interface.next_period_2feea679")}
              >
                {language === "ar" ? (
                  <ChevronLeft className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </Button>
              <div className="w-px h-5 bg-border" />
              <Button variant="outline" size="sm" onClick={goToToday}>
                <LocalizedText source="interface.today_e7c0775e" />
              </Button>
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <SelectTrigger
                  className="w-[110px] h-8 text-sm"
                  lang={languageFor(viewModeLabel)}
                  dir={directionFor(viewModeLabel)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">
                    <LocalizedText source="interface.year_155ee43c" />
                  </SelectItem>
                  <SelectItem value="month">
                    <LocalizedText source="interface.month_a8761ba5" />
                  </SelectItem>
                  <SelectItem value="week">
                    <LocalizedText source="interface.week_55f2e27d" />
                  </SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <LocalizedText source="interface.loading_calendar_178984ab" />
        </div>
      ) : wantedGames.length === 0 && undatedGames.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LocalizedText source="interface.no_games_in_your_wishlist_add_game_610879cc" />
        </div>
      ) : (
        <div className="space-y-6">
          {wantedGames.length > 0 && (
            <>
              {viewMode === "year" && (
                <YearView
                  currentDate={currentDate}
                  gamesByDate={gamesByDate}
                  onGameClick={handleGameClick}
                  today={today}
                />
              )}
              {viewMode === "month" && (
                <MonthView
                  currentDate={currentDate}
                  gamesByDate={gamesByDate}
                  onGameClick={handleGameClick}
                  today={today}
                />
              )}
              {viewMode === "week" && (
                <WeekView
                  currentDate={currentDate}
                  gamesByDate={gamesByDate}
                  onGameClick={handleGameClick}
                  today={today}
                />
              )}
            </>
          )}
          {viewMode === "year" && (
            <UndatedSection
              year={currentDate.getFullYear()}
              games={undatedGames.filter((g) => g.releaseDate === `${currentYearStr}-12-31`)}
              onGameClick={handleGameClick}
            />
          )}
        </div>
      )}

      <GameDownloadDialog
        game={selectedGame}
        open={downloadDialogOpen}
        onOpenChange={setDownloadDialogOpen}
      />
    </div>
  );
}

function YearView({
  currentDate,
  gamesByDate,
  onGameClick,
  today,
}: {
  currentDate: Date;
  gamesByDate: GamesByDate;
  onGameClick: (game: Game) => void;
  today: Date;
}) {
  const year = currentDate.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => i);
  const todayKey = formatDate(today);
  const currentMonthPrefix = todayKey.slice(0, 8);

  // Pre-calculate entries once outside the render loop
  const allGamesEntries = useMemo(() => Object.entries(gamesByDate), [gamesByDate]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {months.map((month) => {
        // Use string prefix matching for O(1) date comparison instead of expensive Date parsing
        const monthStr = (month + 1).toString().padStart(2, "0");
        const monthPrefix = `${year}-${monthStr}-`;

        let gameCount = 0;
        const gamesInMonth: [string, Game[]][] = [];
        for (const entry of allGamesEntries) {
          if (entry[0].startsWith(monthPrefix)) {
            gamesInMonth.push(entry);
            gameCount += entry[1].length;
          }
        }

        const isPastMonth = monthPrefix < currentMonthPrefix;

        return (
          <div
            key={month}
            className={cn(
              "bg-card border rounded-lg p-4",
              isPastMonth && "opacity-50 grayscale-[0.3]"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <h3
                className="font-semibold"
                lang={getRegionalLanguage()}
                dir={getRegionalDirection()}
              >
                {getGregorianMonthName(month)}
              </h3>
              {gameCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {formatRegionalNumber(gameCount)}
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {gamesInMonth.length > 0 ? (
                gamesInMonth.map(([date, games]) => (
                  <div key={date} className="text-sm">
                    <div
                      className="text-muted-foreground mb-1"
                      lang={getRegionalLanguage()}
                      dir={getRegionalDirection()}
                    >
                      {formatCalendarDate(parseCalendarDate(date), {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    {games.map((game) => (
                      <GameBadge
                        key={game.id}
                        game={game}
                        muted={!isPastMonth && toLocalDateKey(date) < todayKey}
                        onClick={() => onGameClick(game)}
                      />
                    ))}
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  <LocalizedText source="interface.no_releases_af6c37cc" />
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  currentDate,
  gamesByDate,
  onGameClick,
  today,
}: {
  currentDate: Date;
  gamesByDate: GamesByDate;
  onGameClick: (game: Game) => void;
  today: Date;
}) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const labelIdPrefix = useId();
  const regionalLocale = getRegionalLanguage();
  const regionalDirection = getRegionalDirection(regionalLocale);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const weekStartsOn = getRegionalWeekStartsOn();
  const days = getDaysInMonth(year, month, weekStartsOn);
  const weekdayShort = new Intl.DateTimeFormat(getRegionalLocale(), {
    calendar: "gregory",
    weekday: "short",
  });
  const weekdayNarrow = new Intl.DateTimeFormat(getRegionalLocale(), {
    calendar: "gregory",
    weekday: "narrow",
  });
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2023, 0, 1 + ((weekStartsOn + index) % 7));
    return { short: weekdayShort.format(date), narrow: weekdayNarrow.format(date) };
  });
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const todayKey = formatDate(today);

  const handleCellClick = (dateKey: string, gamesOnDay: Game[]) => {
    if (gamesOnDay.length === 0) {
      setSelectedDayKey(null);
      return;
    }
    setSelectedDayKey(selectedDayKey === dateKey ? null : dateKey);
  };

  const selectedGames = selectedDayKey ? (gamesByDate[selectedDayKey] ?? []) : [];

  return (
    <div className="bg-card border rounded-lg p-2 md:p-4">
      <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
        {weekDays.map((day) => (
          <div
            key={day.short}
            className="text-center font-semibold text-xs md:text-sm text-muted-foreground py-1 md:py-2"
            lang={regionalLocale}
            dir={regionalDirection}
          >
            <span className="md:hidden">{day.narrow}</span>
            <span className="hidden md:inline">{day.short}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === month;
          const dateKey = formatDate(day);
          const gamesOnDay = gamesByDate[dateKey] || [];
          const isToday = todayKey === dateKey;
          const isPast = dateKey < todayKey;
          const isSelected = selectedDayKey === dateKey;
          const formattedDayLabel = formatCalendarDate(day, {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
          const releaseCountSource =
            gamesOnDay.length === 1
              ? "release"
              : gamesOnDay.length === 2
                ? "two releases"
                : "releases";
          const releaseLabel = formatReleaseCount(gamesOnDay.length, t);
          const dateLabelId = `${labelIdPrefix}-${dateKey}-date`;
          const releaseLabelId = `${labelIdPrefix}-${dateKey}-releases`;
          const mobileLabelledBy =
            gamesOnDay.length > 0 ? `${dateLabelId} ${releaseLabelId}` : dateLabelId;

          return (
            <div
              key={dateKey}
              className={cn(
                "min-h-[48px] md:min-h-[120px] border rounded-lg p-1 md:p-2 transition-colors",
                !isCurrentMonth && "bg-muted/30",
                isPast && !isToday && "opacity-50 grayscale-[0.3]",
                isToday && "border-primary border-2",
                isSelected && "border-primary/60 bg-primary/5"
              )}
            >
              <button
                type="button"
                onClick={() => handleCellClick(dateKey, gamesOnDay)}
                className={cn(
                  "w-full text-start md:pointer-events-none",
                  gamesOnDay.length > 0 ? "cursor-pointer" : "cursor-default"
                )}
                aria-labelledby={mobileLabelledBy}
                dir="auto"
              >
                <span
                  id={dateLabelId}
                  className="sr-only"
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {formattedDayLabel}
                </span>
                {gamesOnDay.length > 0 && (
                  <span
                    id={releaseLabelId}
                    className="sr-only"
                    lang={languageFor(releaseCountSource)}
                    dir={directionFor(releaseCountSource)}
                  >
                    {releaseLabel}
                  </span>
                )}
                <div
                  className={cn(
                    "text-xs md:text-sm font-medium mb-0.5 md:mb-2",
                    !isCurrentMonth && "text-muted-foreground",
                    isToday && "text-primary font-bold"
                  )}
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {formatRegionalNumber(day.getDate(), { useGrouping: false })}
                </div>
                {/* Mobile: colored dots per game */}
                {gamesOnDay.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 md:hidden">
                    {gamesOnDay.slice(0, 3).map((game) => (
                      <div
                        key={game.id}
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          game.releaseStatus === "delayed" ? "bg-destructive" : "bg-primary"
                        )}
                      />
                    ))}
                    {gamesOnDay.length > 3 && (
                      <span className="text-[9px] leading-none text-muted-foreground">
                        +{formatRegionalNumber(gamesOnDay.length - 3)}
                      </span>
                    )}
                  </div>
                )}
              </button>
              <div
                className="hidden md:block space-y-1"
                aria-hidden={gamesOnDay.length === 0 ? undefined : true}
              >
                {gamesOnDay.map((game) => (
                  <GameBadge
                    key={game.id}
                    game={game}
                    compact
                    muted={isPast && !isToday}
                    onClick={() => onGameClick(game)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Mobile day detail — shown below grid when a day with games is tapped */}
      {selectedDayKey && selectedGames.length > 0 && (
        <div className="mt-3 p-3 bg-muted/50 rounded-lg md:hidden">
          <p
            className="text-xs font-semibold text-muted-foreground mb-2"
            lang={regionalLocale}
            dir={regionalDirection}
          >
            {formatCalendarDate(parseCalendarDate(selectedDayKey), {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <div className="space-y-2">
            {selectedGames.map((game) => (
              <GameBadge
                key={game.id}
                game={game}
                muted={selectedDayKey < todayKey}
                onClick={() => onGameClick(game)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WeekView({
  currentDate,
  gamesByDate,
  onGameClick,
  today,
}: {
  currentDate: Date;
  gamesByDate: GamesByDate;
  onGameClick: (game: Game) => void;
  today: Date;
}) {
  const regionalLocale = getRegionalLanguage();
  const regionalDirection = getRegionalDirection(regionalLocale);
  const weekDays = getWeekDays(new Date(currentDate));
  const todayKey = formatDate(today);

  return (
    <div className="bg-card border rounded-lg p-4">
      {/* Mobile: vertical list — one full-width row per day */}
      <div className="space-y-2 md:hidden">
        {weekDays.map((day) => {
          const dateKey = formatDate(day);
          const gamesOnDay = gamesByDate[dateKey] || [];
          const isToday = todayKey === dateKey;
          const isPast = dateKey < todayKey;
          const dayName = formatCalendarDate(day, { weekday: "short" });
          const monthName = formatCalendarDate(day, { month: "short" });

          return (
            <div
              key={dateKey}
              className={cn(
                "flex gap-3 rounded-lg border p-3",
                isToday ? "border-primary border-2" : "border-border",
                gamesOnDay.length === 0 && "opacity-60",
                isPast && !isToday && "opacity-50 grayscale-[0.3]"
              )}
            >
              {/* Date column */}
              <div className="flex w-12 shrink-0 flex-col items-center justify-center">
                <span
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide",
                    isToday ? "text-primary" : "text-muted-foreground"
                  )}
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {dayName}
                </span>
                <span
                  className={cn("text-xl font-bold leading-tight", isToday && "text-primary")}
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {formatRegionalNumber(day.getDate(), { useGrouping: false })}
                </span>
                <span
                  className="text-xs text-muted-foreground"
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {monthName}
                </span>
              </div>
              <div className="w-px shrink-0 bg-border" />
              {/* Games column */}
              <div className="flex min-w-0 flex-1 items-center">
                {gamesOnDay.length > 0 ? (
                  <div className="w-full space-y-2">
                    {gamesOnDay.map((game) => (
                      <GameBadge
                        key={game.id}
                        game={game}
                        muted={isPast && !isToday}
                        onClick={() => onGameClick(game)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <LocalizedText source="interface.no_releases_af6c37cc" />
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: 7-column grid */}
      <div className="hidden md:grid md:grid-cols-7 md:gap-4">
        {weekDays.map((day) => {
          const dateKey = formatDate(day);
          const gamesOnDay = gamesByDate[dateKey] || [];
          const isToday = todayKey === dateKey;
          const isPast = dateKey < todayKey;
          const dayName = formatCalendarDate(day, { weekday: "short" });

          return (
            <div
              key={dateKey}
              className={cn(
                "border rounded-lg p-3",
                isToday && "border-primary border-2",
                isPast && !isToday && "opacity-50 grayscale-[0.3]"
              )}
            >
              <div className="text-center mb-3">
                <div
                  className={cn("font-semibold", isToday && "text-primary")}
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {dayName}
                </div>
                <div
                  className={cn("text-2xl font-bold", isToday && "text-primary")}
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {formatRegionalNumber(day.getDate(), { useGrouping: false })}
                </div>
                <div
                  className="text-xs text-muted-foreground"
                  lang={regionalLocale}
                  dir={regionalDirection}
                >
                  {formatCalendarDate(day, { month: "short" })}
                </div>
              </div>
              <div className="space-y-2">
                {gamesOnDay.length > 0 ? (
                  gamesOnDay.map((game) => (
                    <GameBadge
                      key={game.id}
                      game={game}
                      muted={isPast && !isToday}
                      onClick={() => onGameClick(game)}
                    />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    <LocalizedText source="interface.no_releases_af6c37cc" />
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UndatedSection({
  year,
  games,
  onGameClick,
}: {
  year: number;
  games: Game[];
  onGameClick: (game: Game) => void;
}) {
  if (games.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-base font-semibold text-muted-foreground">
          <LocalizedText source="interface.no_release_date_b2664da9" /> —{" "}
          <span lang={getRegionalLanguage()} dir={getRegionalDirection()}>
            {formatRegionalNumber(year, { useGrouping: false })}
          </span>
        </h2>
        <Badge variant="secondary" className="text-xs">
          {formatRegionalNumber(games.length)}
        </Badge>
        <div className="flex-1 h-px bg-border" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {games.map((game) => (
          <GameBadge key={game.id} game={game} hideDate onClick={() => onGameClick(game)} />
        ))}
      </div>
    </div>
  );
}

function GameBadge({
  game,
  compact = false,
  hideDate = false,
  muted = false,
  onClick,
}: {
  game: Game;
  compact?: boolean;
  hideDate?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  const isDelayed = game.releaseStatus === "delayed";

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "flex items-center gap-1 p-1 rounded hover:opacity-80 transition-opacity w-full text-start",
              isDelayed ? "bg-destructive/20 border border-destructive/30" : "bg-muted",
              muted && "opacity-50 grayscale-[0.5]"
            )}
          >
            <img
              src={coverSrc(game.coverUrl)}
              alt={game.title}
              className="w-6 h-6 rounded object-cover"
            />
            <span
              className={cn("text-xs truncate flex-1", isDelayed && "text-destructive font-medium")}
            >
              {game.title}
              {isDelayed && (
                <>
                  {" ("}
                  <LocalizedText source="interface.delayed_356b9df9" />
                  {")"}
                </>
              )}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="max-w-xs">
            <p className="font-semibold">{game.title}</p>
            {isDelayed && (
              <Badge variant="destructive" className="mt-1 text-xs h-4">
                <LocalizedText source="interface.delayed_356b9df9" />
              </Badge>
            )}
            <p
              className="text-xs text-muted-foreground mt-1"
              lang={getRegionalLanguage()}
              dir={getRegionalDirection()}
            >
              {game.releaseDate &&
                formatCalendarDate(parseCalendarDate(game.releaseDate), {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
            </p>
            {isDelayed && game.originalReleaseDate && (
              <p className="text-xs text-muted-foreground">
                <LocalizedText source="interface.was_originally_scheduled_for_3fd66704" />{" "}
                <span lang={getRegionalLanguage()} dir={getRegionalDirection()}>
                  {formatCalendarDate(parseCalendarDate(game.originalReleaseDate), {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "flex items-center gap-2 p-2 rounded hover:opacity-80 transition-all w-full text-start",
            isDelayed ? "bg-destructive/10 border border-destructive/20" : "bg-muted",
            muted && "opacity-50 grayscale-[0.5]"
          )}
        >
          <img
            src={coverSrc(game.coverUrl)}
            alt={game.title}
            className="w-12 h-12 rounded object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className={cn("text-sm font-medium truncate", isDelayed && "text-destructive")}>
                {game.title}
              </p>
              {isDelayed && (
                <Badge variant="destructive" className="text-xs h-4 px-1">
                  <LocalizedText source="interface.delayed_356b9df9" />
                </Badge>
              )}
            </div>
            {!hideDate && (
              <p
                className="text-xs text-muted-foreground"
                lang={getRegionalLanguage()}
                dir={getRegionalDirection()}
              >
                {game.releaseDate &&
                  formatCalendarDate(parseCalendarDate(game.releaseDate), {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
              </p>
            )}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="max-w-xs">
          <p className="font-semibold">{game.title}</p>
          <p
            className="text-xs text-muted-foreground mt-0.5"
            lang={getRegionalLanguage()}
            dir={getRegionalDirection()}
          >
            {hideDate ? (
              <LocalizedText source="interface.release_date_tbd_d9339594" />
            ) : game.releaseDate ? (
              formatCalendarDate(parseCalendarDate(game.releaseDate), {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            ) : null}
          </p>
          {isDelayed && (
            <div className="flex flex-col gap-0.5 mt-1">
              <Badge variant="destructive" className="w-fit text-xs h-4">
                <LocalizedText source="interface.delayed_356b9df9" />
              </Badge>
              {game.originalReleaseDate && (
                <p className="text-xs text-muted-foreground">
                  <LocalizedText source="interface.was_originally_scheduled_for_3fd66704" />{" "}
                  <span lang={getRegionalLanguage()} dir={getRegionalDirection()}>
                    {formatCalendarDate(parseCalendarDate(game.originalReleaseDate), {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </p>
              )}
            </div>
          )}
          {game.summary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{game.summary}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {game.genres?.slice(0, 3).map((genre) => (
              <Badge key={genre} variant="secondary" className="text-xs">
                {genre}
              </Badge>
            ))}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
