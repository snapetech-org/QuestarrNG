import { formatRegionalPercent, useRegionalPreference } from "@/lib/regional-format";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { type Game } from "@shared/schema";
import StatsCard from "@/components/StatsCard";
import {
  Star,
  Gamepad2,
  Tags,
  Filter,
  Calendar,
  Building2,
  Code2,
  Package,
  CheckCircle2,
  BarChart3,
  LayoutGrid,
  Share2,
  UserRound,
} from "lucide-react";
import { calculateLibraryStats } from "@/lib/stats";
import { apiRequest } from "@/lib/queryClient";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  type PieLabelRenderProps,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ShareDiscordDialog from "@/components/ShareDiscordDialog";
import DiscordWebhookSettings from "@/components/DiscordWebhookSettings";

export default function StatsPage() {
  const [shareOpen, setShareOpen] = useState(false);
  const regionalPreference = useRegionalPreference();
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();

  const { data: games = [], isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games", "", true], // Empty search, include hidden
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/games?includeHidden=true");
      return response.json();
    },
  });

  const { data: discordConfig } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/settings/discord"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/settings/discord");
      return response.json();
    },
  });

  const isMobile = useIsMobile();
  const stats = useMemo(
    () => calculateLibraryStats(games, regionalPreference, language),
    [games, regionalPreference, language]
  );

  const pieData = useMemo(() => {
    return [
      { key: "Wanted", name: t("Wanted"), value: stats.statusBreakdown.wanted },
      { key: "Owned", name: t("Owned"), value: stats.statusBreakdown.owned },
      { key: "Playing", name: t("Playing"), value: stats.statusBreakdown.playing },
      { key: "Completed", name: t("Completed"), value: stats.statusBreakdown.completed },
      { key: "Downloading", name: t("Downloading"), value: stats.statusBreakdown.downloading },
    ].filter((item) => item.value > 0);
  }, [stats.statusBreakdown, t]);

  const chartColors = {
    Wanted: "#ef4444",
    Owned: "#3b82f6",
    Playing: "#06b6d4",
    Completed: "#10b981",
    Downloading: "#8b5cf6",
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-6 md:space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            lang={languageFor("Statistics")}
            dir={directionFor("Statistics")}
          >
            {t("Statistics")}
          </h1>
          <p
            className="text-muted-foreground text-sm mt-0.5"
            lang={languageFor("Detailed insights into your collection of {count} games.")}
            dir={directionFor("Detailed insights into your collection of {count} games.")}
          >
            {formatInterfaceMessage(
              "Detailed insights into your collection of {count} games.",
              { count: stats.totalGames },
              language
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
            <Share2 className="w-4 h-4 mr-2" />
            <span
              lang={languageFor(discordConfig?.configured ? "Share to Discord" : "Share")}
              dir={directionFor(discordConfig?.configured ? "Share to Discord" : "Share")}
            >
              {t(discordConfig?.configured ? "Share to Discord" : "Share")}
            </span>
          </Button>
          <DiscordWebhookSettings />
        </div>
      </div>

      <ShareDiscordDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        stats={stats}
        date={new Date()}
        discordConfigured={discordConfig?.configured}
      />

      <div className="grid gap-3 grid-cols-2 md:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatsCard
          title="Total Games"
          data-i18n-title={"Total Games"}
          value={stats.totalGames}
          subtitle="in library"
          icon={Package}
        />
        <StatsCard
          title="Avg. Rating"
          data-i18n-title={"Avg. Rating"}
          value={stats.avgRating}
          subtitle="average score"
          icon={Star}
        />
        <StatsCard
          title="Avg. User Rating"
          data-i18n-title={"Avg. User Rating"}
          value={stats.avgUserRating}
          subtitle="personal score"
          icon={UserRound}
        />
        <StatsCard
          title="Completion Rate"
          data-i18n-title={"Completion Rate"}
          value={formatRegionalPercent(
            stats.completionRate,
            { maximumFractionDigits: 0 },
            regionalPreference
          )}
          subtitle="of acquired games"
          icon={CheckCircle2}
        />
        <StatsCard
          title="Metadata Health"
          data-i18n-title={"Metadata Health"}
          value={formatRegionalPercent(
            stats.metadataHealth,
            { maximumFractionDigits: 0 },
            regionalPreference
          )}
          subtitle="complete metadata"
          icon={Filter}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <span lang={languageFor("Status Breakdown")} dir={directionFor("Status Breakdown")}>
                {t("Status Breakdown")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={isMobile ? 45 : 60}
                  outerRadius={isMobile ? 75 : 100}
                  paddingAngle={5}
                  dataKey="value"
                  {...(isMobile
                    ? {}
                    : {
                        label: ({ name, percent }: PieLabelRenderProps) =>
                          `${name} ${formatRegionalPercent(
                            (percent ?? 0) * 100,
                            { maximumFractionDigits: 0 },
                            regionalPreference
                          )}`,
                      })}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={chartColors[entry.key as keyof typeof chartColors]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-primary" />
              <span lang={languageFor("Quick Info")} dir={directionFor("Quick Info")}>
                {t("Quick Info")}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Tags className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                    <span lang={languageFor("Top Genre")} dir={directionFor("Top Genre")}>
                      {t("Top Genre")}
                    </span>
                  </p>
                  <p className="font-medium">
                    {stats.topGenre?.name ? (
                      <span lang="und" dir="auto">
                        {stats.topGenre.name}
                      </span>
                    ) : (
                      <span lang={languageFor("N/A")} dir={directionFor("N/A")}>
                        {t("N/A")}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-3">
                <Gamepad2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                    <span lang={languageFor("Top Platform")} dir={directionFor("Top Platform")}>
                      {t("Top Platform")}
                    </span>
                  </p>
                  <p className="font-medium">
                    {stats.topPlatform?.name ? (
                      <span lang="und" dir="auto">
                        {stats.topPlatform.name}
                      </span>
                    ) : (
                      <span lang={languageFor("N/A")} dir={directionFor("N/A")}>
                        {t("N/A")}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-3">
                <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                    <span lang={languageFor("Top Publisher")} dir={directionFor("Top Publisher")}>
                      {t("Top Publisher")}
                    </span>
                  </p>
                  <p className="font-medium">
                    {stats.topPublisher?.name ? (
                      <span lang="und" dir="auto">
                        {stats.topPublisher.name}
                      </span>
                    ) : (
                      <span lang={languageFor("N/A")} dir={directionFor("N/A")}>
                        {t("N/A")}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-3">
                <Code2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                    <span
                      lang={languageFor("Unique Developers")}
                      dir={directionFor("Unique Developers")}
                    >
                      {t("Unique Developers")}
                    </span>
                  </p>
                  <p className="font-medium">{stats.uniqueDevelopers}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 py-3 last:pb-0">
                <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                    <span
                      lang={languageFor("Avg. Release Year")}
                      dir={directionFor("Avg. Release Year")}
                    >
                      {t("Avg. Release Year")}
                    </span>
                  </p>
                  <p className="font-medium">{stats.avgReleaseYear}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
