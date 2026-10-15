import { ChevronRight, LogOut, User } from "lucide-react";
import { useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { type Game, type DownloadStatus, type Config } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { GitHubVersionLink } from "@/components/GitHubVersionLink";
import {
  activityNavigation,
  managementNavigation,
  primaryNavigation,
  type AppNavItem,
} from "@/components/navigation-items";
import { withBasePath } from "@/lib/app-path";
import { cn } from "@/lib/utils";
import {
  formatInterfaceMessage,
  getInterfaceLanguageDirection,
  useInterfaceLanguage,
} from "@/lib/interface-locale";
import { formatRegionalNumber, useRegionalPreference } from "@/lib/regional-format";
import { InterfaceText } from "@/components/InterfaceText";

interface AppSidebarProps {
  activeItem?: string;
  onNavigate?: (url: string) => void;
}

// Stable reference for useQuery's no-data fallback so `games` doesn't change
// identity on every render (which would otherwise defeat the count memos).
const EMPTY_GAMES: Game[] = [];

export default function AppSidebar({ activeItem = "/", onNavigate }: Readonly<AppSidebarProps>) {
  const { logout, user } = useAuth();
  const { data: appConfig } = useQuery<Config>({ queryKey: ["/api/config"] });
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  useRegionalPreference();

  const handleNavigation = (url: string) => {
    onNavigate?.(url);
  };

  const { data: games = EMPTY_GAMES } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { data: downloadsData } = useQuery<{ downloads: DownloadStatus[] }>({
    queryKey: ["/api/downloads"],
    refetchInterval: 30_000,
  });

  // ⚡ Single-pass counts instead of `.filter(...).length`, which walks the array
  // once and allocates an intermediate array that's immediately discarded.
  // Memoized so heavily re-rendered components like this sidebar don't recompute
  // on every render.
  const { wishlistCount, playingCount } = useMemo(() => {
    let wanted = 0;
    let playing = 0;
    for (const game of games) {
      if (game.status === "wanted") wanted++;
      else if (game.status === "playing") playing++;
    }
    return { wishlistCount: wanted, playingCount: playing };
  }, [games]);

  const activeDownloadsCount = useMemo(() => {
    const downloads = downloadsData?.downloads;
    if (!downloads) return 0;
    let count = 0;
    for (const download of downloads) {
      if (download.status === "downloading") count++;
    }
    return count;
  }, [downloadsData?.downloads]);

  type NavItemWithBadge = Omit<AppNavItem, "children"> & {
    badge?: string | undefined;
    badgeLabel?: string | undefined;
    badgeClassName?: string | undefined;
    badgeVariant?: "secondary" | "outline" | undefined;
    children?: NavItemWithBadge[] | undefined;
  };

  const withBadge = (item: AppNavItem): NavItemWithBadge => {
    let badge: string | undefined;
    let badgeLabel: string | undefined;
    let badgeClassName: string | undefined;
    let badgeVariant: NavItemWithBadge["badgeVariant"];
    if (item.title === "All Games" && games.length > 0) {
      badge = formatRegionalNumber(games.length);
      badgeLabel = formatInterfaceMessage("All Games, {count} games", { count: badge }, language);
      badgeVariant = "outline";
    } else if (item.title === "Wishlist" && wishlistCount > 0) {
      badge = formatRegionalNumber(wishlistCount);
      badgeLabel = formatInterfaceMessage(
        wishlistCount === 1 ? "Wishlist, {count} game" : "Wishlist, {count} games",
        { count: badge },
        language
      );
    } else if (item.title === "Playing" && playingCount > 0) {
      badge = formatRegionalNumber(playingCount);
      badgeLabel = formatInterfaceMessage(
        playingCount === 1 ? "Playing, {count} game" : "Playing, {count} games",
        { count: badge },
        language
      );
      badgeClassName = "border-transparent bg-cyan-600 text-white";
    } else if (item.title === "Downloads" && activeDownloadsCount > 0) {
      badge = formatRegionalNumber(activeDownloadsCount);
      badgeLabel = formatInterfaceMessage(
        activeDownloadsCount === 1
          ? "Downloads, {count} active download"
          : "Downloads, {count} active downloads",
        { count: badge },
        language
      );
    }
    return {
      ...item,
      badge,
      badgeLabel,
      badgeClassName,
      badgeVariant,
      children: item.children?.map(withBadge),
    };
  };

  const navigation = primaryNavigation.map(withBadge);

  return (
    <Sidebar
      side={getInterfaceLanguageDirection(language) === "rtl" ? "right" : "left"}
      data-testid="sidebar-main"
    >
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img
              src={withBasePath("/Questarr.svg")}
              alt={t("QuestarrNG logo")}
              lang={languageFor("QuestarrNG logo")}
              dir={directionFor("QuestarrNG logo")}
              className="w-8 h-8"
            />
          </div>
          <div>
            <span className="truncate font-semibold">
              <InterfaceText source={"QuestarrNG"} />
            </span>
            <p
              className="text-xs text-muted-foreground"
              lang={languageFor("Game Management")}
              dir={directionFor("Game Management")}
            >
              {t("Game Management")}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel lang={languageFor("Navigation")} dir={directionFor("Navigation")}>
            {t("Navigation")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) =>
                item.children && item.children.length > 0 ? (
                  <Collapsible
                    key={item.title}
                    defaultOpen={
                      item.children?.some((child) => child.url === activeItem) ||
                      (item.defaultOpen ?? true)
                    }
                    className="group/collapsible"
                    asChild
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={
                            activeItem === item.url ||
                            item.children.some((child) => child.url === activeItem)
                          }
                          data-testid={`nav-${item.title.toLowerCase()}`}
                          lang={languageFor(item.title)}
                          dir={directionFor(item.title)}
                        >
                          <item.icon className="w-4 h-4" aria-hidden="true" />
                          <span lang={languageFor(item.title)} dir={directionFor(item.title)}>
                            {t(item.title)}
                          </span>
                          <ChevronRight
                            className="ml-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90"
                            aria-hidden="true"
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={activeItem === child.url}
                                data-testid={`nav-${child.title.toLowerCase().replace(/\s+/g, "-")}`}
                              >
                                <button
                                  onClick={() => handleNavigation(child.url)}
                                  className="flex items-center justify-between w-full"
                                  lang={languageFor(child.title)}
                                  dir={directionFor(child.title)}
                                  aria-label={child.badgeLabel}
                                >
                                  <div className="flex items-center gap-2">
                                    <child.icon className="w-4 h-4" aria-hidden="true" />
                                    <span
                                      lang={languageFor(child.title)}
                                      dir={directionFor(child.title)}
                                    >
                                      {t(child.title)}
                                    </span>
                                  </div>
                                  {child.badge && (
                                    <Badge
                                      variant={child.badgeVariant ?? "secondary"}
                                      className={cn("ml-auto text-xs", child.badgeClassName)}
                                      aria-hidden="true"
                                      data-testid={`badge-${child.title.toLowerCase().replace(/\s+/g, "-")}`}
                                    >
                                      {child.badge}
                                    </Badge>
                                  )}
                                </button>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={activeItem === item.url}
                      data-testid={`nav-${item.title.toLowerCase()}`}
                    >
                      <button
                        onClick={() => handleNavigation(item.url)}
                        className="flex items-center justify-between w-full"
                        lang={languageFor(item.title)}
                        dir={directionFor(item.title)}
                        aria-label={item.badgeLabel}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className="w-4 h-4" aria-hidden="true" />
                          <span lang={languageFor(item.title)} dir={directionFor(item.title)}>
                            {t(item.title)}
                          </span>
                        </div>
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto text-xs" aria-hidden="true">
                            {item.badge}
                          </Badge>
                        )}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel lang={languageFor("Management")} dir={directionFor("Management")}>
            {t("Management")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {managementNavigation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeItem === item.url}
                    data-testid={`nav-${item.title.toLowerCase()}`}
                  >
                    <button
                      onClick={() => handleNavigation(item.url)}
                      className="flex items-center gap-2 w-full"
                    >
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span lang={languageFor(item.title)} dir={directionFor(item.title)}>
                        {t(item.title)}
                      </span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel lang={languageFor("Activity")} dir={directionFor("Activity")}>
            {t("Activity")}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {activityNavigation.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={activeItem === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <button
                      onClick={() => handleNavigation(item.url)}
                      className="flex items-center gap-2 w-full"
                    >
                      <item.icon className="w-4 h-4" aria-hidden="true" />
                      <span lang={languageFor(item.title)} dir={directionFor(item.title)}>
                        {t(item.title)}
                      </span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <div className="flex-1" />
        {/* Divider above GitHub link */}
        <div className="border-t border-[#374151]/40 mx-2 mb-2" />
        {/* GitHub link and version info at the bottom */}
        <div className="flex items-center justify-center pb-2">
          <GitHubVersionLink />
        </div>
      </SidebarContent>

      <SidebarFooter>
        {appConfig?.rawg?.configured && (
          <div className="px-3 pb-2 text-center text-xs text-muted-foreground">
            <InterfaceText source="Game metadata by" />{" "}
            <a className="underline" href="https://rawg.io" target="_blank" rel="noreferrer">
              RAWG
            </a>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => logout()}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer w-full"
              tooltip={t("Log out")}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <User className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold" lang="und" dir="auto">
                  {user?.username || t("User")}
                </span>
                <span
                  className="truncate text-xs"
                  lang={languageFor("Logged in")}
                  dir={directionFor("Logged in")}
                >
                  {t("Logged in")}
                </span>
              </div>
              <LogOut className="ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
