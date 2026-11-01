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
import { useInterfaceLanguage } from "@/lib/interface-locale";
import {
  formatRegionalNumber,
  formatRegionalPluralMessage,
  useRegionalPreference,
} from "@/lib/regional-format";
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
  const { language, t, tId, languageFor, directionFor, languageForId, directionForId } =
    useInterfaceLanguage();
  const regionalPreference = useRegionalPreference();

  const navigationText = (item: AppNavItem) =>
    item.messageId ? tId(item.messageId) : t(item.title);
  const navigationLanguage = (item: AppNavItem) =>
    item.messageId ? languageForId(item.messageId) : languageFor(item.title);
  const navigationDirection = (item: AppNavItem) =>
    item.messageId ? directionForId(item.messageId) : directionFor(item.title);

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
      badgeLabel = formatRegionalPluralMessage(
        games.length,
        {
          one: "navigation.all_games_count_singular",
          other: "interface.all_games_count_games_298d9ef9",
        },
        {},
        language,
        regionalPreference
      );
      badgeVariant = "outline";
    } else if (item.title === "Wishlist" && wishlistCount > 0) {
      badge = formatRegionalNumber(wishlistCount);
      badgeLabel = formatRegionalPluralMessage(
        wishlistCount,
        {
          one: "interface.wishlist_count_game_a1c82ba1",
          other: "interface.wishlist_count_games_801cfb96",
        },
        {},
        language,
        regionalPreference
      );
    } else if (item.title === "Playing" && playingCount > 0) {
      badge = formatRegionalNumber(playingCount);
      badgeLabel = formatRegionalPluralMessage(
        playingCount,
        {
          one: "interface.playing_count_game_77e0c872",
          other: "interface.playing_count_games_b7dad993",
        },
        {},
        language,
        regionalPreference
      );
      badgeClassName = "border-transparent bg-cyan-600 text-white";
    } else if (item.title === "Downloads" && activeDownloadsCount > 0) {
      badge = formatRegionalNumber(activeDownloadsCount);
      badgeLabel = formatRegionalPluralMessage(
        activeDownloadsCount,
        {
          one: "interface.downloads_count_active_download_5035e337",
          other: "interface.downloads_count_active_downloads_88d4c40c",
        },
        {},
        language,
        regionalPreference
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
    // Sidebar positions itself at the logical start edge, including RTL.
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center">
            <img
              src={withBasePath("/Questarr.svg")}
              alt={t("interface.questarrng_logo_48dde88a")}
              lang={languageFor("interface.questarrng_logo_48dde88a")}
              dir={directionFor("interface.questarrng_logo_48dde88a")}
              className="w-8 h-8"
            />
          </div>
          <div>
            <span className="truncate font-semibold">
              <InterfaceText source={"QuestarrNG"} />
            </span>
            <p
              className="text-xs text-muted-foreground"
              lang={languageFor("interface.game_management_b1319076")}
              dir={directionFor("interface.game_management_b1319076")}
            >
              {t("interface.game_management_b1319076")}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel
            lang={languageFor("interface.navigation_d08919c3")}
            dir={directionFor("interface.navigation_d08919c3")}
          >
            {t("interface.navigation_d08919c3")}
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
                          lang={navigationLanguage(item)}
                          dir={navigationDirection(item)}
                        >
                          <item.icon className="w-4 h-4" aria-hidden="true" />
                          <span lang={navigationLanguage(item)} dir={navigationDirection(item)}>
                            {navigationText(item)}
                          </span>
                          <ChevronRight
                            className="ms-auto h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180"
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
                                      className={cn("ms-auto text-xs", child.badgeClassName)}
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
                        lang={navigationLanguage(item)}
                        dir={navigationDirection(item)}
                        aria-label={item.badgeLabel}
                      >
                        <div className="flex items-center gap-2">
                          <item.icon className="w-4 h-4" aria-hidden="true" />
                          <span lang={navigationLanguage(item)} dir={navigationDirection(item)}>
                            {navigationText(item)}
                          </span>
                        </div>
                        {item.badge && (
                          <Badge variant="secondary" className="ms-auto text-xs" aria-hidden="true">
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
          <SidebarGroupLabel
            lang={languageFor("interface.management_da9fd136")}
            dir={directionFor("interface.management_da9fd136")}
          >
            {t("interface.management_da9fd136")}
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
                      <span lang={navigationLanguage(item)} dir={navigationDirection(item)}>
                        {navigationText(item)}
                      </span>
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel
            lang={languageFor("interface.activity_9e75940c")}
            dir={directionFor("interface.activity_9e75940c")}
          >
            {t("interface.activity_9e75940c")}
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
                      <span lang={navigationLanguage(item)} dir={navigationDirection(item)}>
                        {navigationText(item)}
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
            <InterfaceText source="interface.game_metadata_by_bc91010d" />{" "}
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
              tooltip={t("interface.log_out_88c6d8b5")}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <User className="size-4" />
              </div>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold" lang="und" dir="auto">
                  {user?.username || t("interface.user_e0a63e12")}
                </span>
                <span
                  className="truncate text-xs"
                  lang={languageFor("interface.logged_in_3ecfe96a")}
                  dir={directionFor("interface.logged_in_3ecfe96a")}
                >
                  {t("interface.logged_in_3ecfe96a")}
                </span>
              </div>
              <LogOut className="ms-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
