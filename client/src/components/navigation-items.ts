import {
  Calendar,
  ClipboardList,
  Compass,
  Database,
  Download,
  FolderInput,
  Gamepad2,
  HardDrive,
  Home,
  List,
  MoreHorizontal,
  Newspaper,
  PieChart,
  Rss,
  ScrollText,
  Search,
  Settings,
  Star,
} from "lucide-react";
import type { ComponentType } from "react";
import type { StableInterfaceMessageId } from "@/lib/stable-interface-messages";

type LucideIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export interface AppNavItem {
  title: string;
  messageId?: StableInterfaceMessageId | undefined;
  url: string;
  icon: LucideIcon;
  /** Nested sub-items, rendered as a collapsible group under this entry (sidebar only). */
  children?: AppNavItem[] | undefined;
  defaultOpen?: boolean | undefined;
}

export const primaryNavigation: AppNavItem[] = [
  {
    title: "Library",
    messageId: "navigation.library",
    url: "/",
    icon: Home,
    children: [
      { title: "All Games", messageId: "navigation.all_games", url: "/", icon: Home },
      { title: "Playing", messageId: "navigation.playing", url: "/playing", icon: Gamepad2 },
      { title: "Custom Lists", messageId: "navigation.custom_lists", url: "/lists", icon: List },
      {
        title: "Library Import",
        messageId: "navigation.library_import",
        url: "/library-import",
        icon: FolderInput,
      },
    ],
  },
  {
    title: "Discover",
    messageId: "navigation.discover",
    url: "/discover",
    icon: Compass,
    // The group header only toggles the group, so the Discover page itself needs its own
    // entry here (like "All Games" under Library), or the desktop sidebar can't reach it.
    children: [
      { title: "Browse", messageId: "navigation.browse", url: "/discover", icon: Compass },
      {
        title: "xREL.to Releases",
        messageId: "navigation.xrel_releases",
        url: "/xrel",
        icon: Newspaper,
      },
      { title: "RSS Feeds", messageId: "navigation.rss_feeds", url: "/rss", icon: Rss },
    ],
  },
  { title: "Downloads", messageId: "navigation.downloads", url: "/downloads", icon: Download },
  { title: "Stats", messageId: "navigation.stats", url: "/stats", icon: PieChart },
  {
    title: "More",
    messageId: "navigation.more",
    url: "/more",
    icon: MoreHorizontal,
    defaultOpen: false,
    children: [
      { title: "Calendar", messageId: "navigation.calendar", url: "/calendar", icon: Calendar },
      { title: "Wishlist", messageId: "navigation.wishlist", url: "/wishlist", icon: Star },
    ],
  },
];

export const managementNavigation: AppNavItem[] = [
  { title: "Indexers", messageId: "navigation.indexers", url: "/indexers", icon: Database },
  {
    title: "Downloaders",
    messageId: "navigation.downloaders",
    url: "/downloaders",
    icon: HardDrive,
  },
  { title: "Settings", messageId: "navigation.settings", url: "/settings", icon: Settings },
];

export const activityNavigation: AppNavItem[] = [
  { title: "Logs", messageId: "navigation.logs", url: "/logs", icon: ScrollText },
  {
    title: "Import History",
    messageId: "navigation.import_history",
    url: "/activity/imports",
    icon: ClipboardList,
  },
];

export const mobileBottomNavigation: AppNavItem[] = [
  { title: "Library", messageId: "navigation.library", url: "/", icon: Home },
  { title: "Discover", messageId: "navigation.discover", url: "/discover", icon: Compass },
  { title: "Downloads", messageId: "navigation.downloads", url: "/downloads", icon: Download },
  { title: "Playing", messageId: "navigation.playing", url: "/playing", icon: Gamepad2 },
];

export function flattenNavigation(items: AppNavItem[]): AppNavItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.children ? flattenNavigation(item.children) : []),
  ]);
}

const allNavigation: AppNavItem[] = [
  ...flattenNavigation(primaryNavigation),
  ...managementNavigation,
  ...activityNavigation,
  { title: "Search", messageId: "navigation.search", url: "/search", icon: Search },
];

export function getPageMessageId(path: string): StableInterfaceMessageId | undefined {
  return allNavigation.find((entry) => entry.url === path)?.messageId;
}

export function getPageTitle(path: string): string {
  const item = allNavigation.find((entry) => entry.url === path);
  return item?.title ?? "QuestarrNG";
}
