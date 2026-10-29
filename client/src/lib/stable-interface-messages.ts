/** Stable IDs for navigation messages migrated from the legacy English-key catalog. */
export const STABLE_INTERFACE_MESSAGES = {
  "navigation.library": "Library",
  "navigation.all_games": "All Games",
  "navigation.playing": "Playing",
  "navigation.custom_lists": "Custom Lists",
  "navigation.library_import": "Library Import",
  "navigation.discover": "Discover",
  "navigation.browse": "Browse",
  "navigation.xrel_releases": "xREL.to Releases",
  "navigation.rss_feeds": "RSS Feeds",
  "navigation.downloads": "Downloads",
  "navigation.stats": "Stats",
  "navigation.more": "More",
  "navigation.calendar": "Calendar",
  "navigation.wishlist": "Wishlist",
  "navigation.indexers": "Indexers",
  "navigation.downloaders": "Downloaders",
  "navigation.settings": "Settings",
  "navigation.logs": "Logs",
  "navigation.import_history": "Import History",
  "navigation.search": "Search",
} as const;

export type StableInterfaceMessageId = keyof typeof STABLE_INTERFACE_MESSAGES;
