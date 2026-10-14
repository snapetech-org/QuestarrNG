import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Server,
  Key,
  RefreshCw,
  Search,
  Download,
  AlertCircle,
  Eye,
  EyeOff,
  Newspaper,
  Lock,
  Calendar,
  ShieldCheck,
  ShieldAlert,
  Upload,
  Gamepad2,
  Ban,
  Trash2,
  Bell,
  Monitor,
  Radio,
  Sparkles,
  FlaskConical,
  Archive,
  Filter,
} from "lucide-react";
import { NexusModsIcon } from "@/components/NexusModsIcon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PathBrowser } from "@/components/PathBrowser";
import { BilingualLocaleName } from "@/components/BilingualLocaleName";
import { InterfaceLanguageSelect } from "@/components/InterfaceLanguageSelect";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, apiRequest, clearSearchCache, throwIfResNotOk } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ApiKeysCard } from "@/components/ApiKeysCard";
import AutoDownloadRulesSettings from "@/components/AutoDownloadRulesSettings";
import PreferredReleaseGroupsSettings from "@/components/PreferredReleaseGroupsSettings";
import ReleaseNameBlacklistSettings from "@/components/ReleaseNameBlacklistSettings";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import {
  getRegionalLocale,
  REGIONAL_FORMAT_OPTIONS,
  setRegionalPreference,
  useRegionalPreference,
} from "@/lib/regional-format";
import { GHOST_UNLOCK_KEY } from "@/lib/ghost-mode";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import {
  THEMES,
  THEME_CONFIGS,
  THEME_KEY,
  type Theme,
  getCurrentTheme,
  migrateLegacyTheme,
  applyThemeClass,
  setTheme,
} from "@/lib/theme-mode";
import PasswordSettings from "@/components/PasswordSettings";
import {
  downloadRulesSchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
  downloaderDebugLoggingResponseSchema,
  type Config,
  type UserSettings,
  type DownloadRules,
  type ReleaseBlacklist,
  type NotificationPreferences,
  type NotificationEvent,
  type DownloaderDebugLoggingResponse,
} from "@shared/schema";
import { parseJsonStringArray, CANONICAL_PLATFORMS } from "@shared/title-utils";
import PlatformsSettings from "@/components/PlatformsSettings";
import ImportSettings from "@/components/ImportSettings";
import { IgdbHelpPopover, IgdbTestConnectionButton } from "@/components/IgdbCredentialsHelper";
import { InterfaceText } from "@/components/InterfaceText";

interface CertInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  selfSigned: boolean;
  valid: boolean;
}
const NOTIFICATION_EVENT_ROWS: { key: NotificationEvent; label: string; group: string }[] = [
  { key: "gameReleased", label: "Game Released", group: "library" },
  { key: "gameDelayed", label: "Game Delayed", group: "library" },
  { key: "downloadCompleted", label: "Download Completed", group: "downloads" },
  { key: "downloadFailed", label: "Download Aborted", group: "downloads" },
  { key: "autoDownload", label: "Auto-Download Started", group: "downloads" },
  { key: "gameAvailable", label: "Game Found on Indexer", group: "downloads" },
  { key: "multipleResults", label: "Multiple Releases Found", group: "downloads" },
  { key: "gameUpdates", label: "Game Updates and New Packs/Add-ons", group: "downloads" },
  { key: "xrelRelease", label: "Scene/P2P Release (xREL)", group: "integrations" },
  { key: "steamSync", label: "Steam Wishlist Synced", group: "integrations" },
  { key: "errorDetected", label: "Error Detected", group: "system" },
];

function isHttpUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "http:";
  } catch {
    return false;
  }
}

function SettingsToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: React.ReactNode;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {typeof label === "string" ? (
            <span lang={languageFor(label)} dir={directionFor(label)}>
              {t(label)}
            </span>
          ) : (
            label
          )}
        </Label>
        <p
          className="text-xs text-muted-foreground"
          lang={languageFor(description)}
          dir={directionFor(description)}
        >
          {t(description)}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SettingsSaveButton({
  onClick,
  pending,
  icon: Icon,
  label,
}: {
  onClick: () => void;
  pending: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <div className="flex justify-end pt-4 border-t">
      <Button onClick={onClick} disabled={pending} className="gap-2">
        {pending ? (
          <>
            <RefreshCw className="h-4 w-4 motion-safe:animate-spin" />
            <span lang={languageFor("Saving...")} dir={directionFor("Saving...")}>
              {t("Saving...")}
            </span>
          </>
        ) : (
          <>
            <Icon className="h-4 w-4" />
            <span lang={languageFor(label)} dir={directionFor(label)}>
              {t(label)}
            </span>
          </>
        )}
      </Button>
    </div>
  );
}

function SettingsFilterCard({
  icon: Icon,
  title,
  description,
  onSave,
  savePending,
  saveIcon,
  saveLabel,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onSave: () => void;
  savePending: boolean;
  saveIcon: React.ComponentType<{ className?: string }>;
  saveLabel: string;
  children: React.ReactNode;
}) {
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center space-x-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg" lang={languageFor(title)} dir={directionFor(title)}>
            {t(title)}
          </CardTitle>
        </div>
        <CardDescription lang={languageFor(description)} dir={directionFor(description)}>
          {t(description)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        <SettingsSaveButton
          onClick={onSave}
          pending={savePending}
          icon={saveIcon}
          label={saveLabel}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Configures application preferences, integrations, notifications, account security, and system maintenance settings.
 */
export default function SettingsPage() {
  const { toast } = useToast();
  const { language, setLanguage, t, languageFor, directionFor } = useInterfaceLanguage();
  const queryClient = useQueryClient();

  const [ghostUnlocked] = useLocalStorageState(GHOST_UNLOCK_KEY, false);
  const regionalFormat = useRegionalPreference();
  const selectedRegionalFormatOption = REGIONAL_FORMAT_OPTIONS.find(
    (option) => option.value === regionalFormat
  );
  const renderRegionalFormatLabel = (option: (typeof REGIONAL_FORMAT_OPTIONS)[number]) =>
    option.value === "system" ? (
      <span lang={languageFor(option.label)} dir={directionFor(option.label)}>
        {t(option.label)}
      </span>
    ) : (
      <BilingualLocaleName
        language={option.value}
        nativeName={option.nativeName}
        englishName={option.englishName}
      />
    );
  const [selectedTheme, setSelectedTheme] = useLocalStorageState<Theme>(
    THEME_KEY,
    getCurrentTheme(ghostUnlocked)
  );

  // Normalize the stored theme: useLocalStorageState returns whatever is in localStorage
  // once THEME_KEY exists, without validating it against THEMES or the Ghost unlock state.
  // A corrupted value, or one set directly (e.g. via devtools), would otherwise reach
  // applyThemeClass() and either throw (unknown theme) or bypass the Ghost unlock.
  const effectiveTheme: Theme =
    THEMES.includes(selectedTheme) && (selectedTheme !== "ghost" || ghostUnlocked)
      ? selectedTheme
      : "default";

  // Migrate legacy theme keys once on mount. Not done inline in the useLocalStorageState
  // initializer above, since that runs during render and migration has localStorage
  // side effects (React may render a component without committing it).
  useEffect(() => {
    migrateLegacyTheme(ghostUnlocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the normalized value so a corrected theme sticks for later loads.
  useEffect(() => {
    if (effectiveTheme !== selectedTheme) {
      setSelectedTheme(effectiveTheme);
    }
  }, [effectiveTheme, selectedTheme, setSelectedTheme]);

  // Apply theme class on mount and when theme changes
  useEffect(() => {
    applyThemeClass(effectiveTheme);
  }, [effectiveTheme]);

  const handleThemeChange = (theme: Theme) => {
    setTheme(theme, ghostUnlocked);
    setSelectedTheme(theme);
  };

  const {
    data: config,
    isLoading: configLoading,
    error: configError,
  } = useQuery<Config>({
    queryKey: ["/api/config"],
  });

  const { data: igdbSettings } = useQuery<{
    configured: boolean;
    source?: "env" | "database";
    clientId?: string;
  }>({
    queryKey: ["/api/settings/igdb"],
    queryFn: () => apiRequest("GET", "/api/settings/igdb").then((res) => res.json()),
  });

  const {
    data: userSettings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    retry: 3, // Retry up to 3 times as migrations might be running
  });

  const { data: user } = useQuery<{ id: string; username: string; steamId64?: string }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: blacklistEntries, isLoading: blacklistLoading } = useQuery<
    (ReleaseBlacklist & { gameTitle: string })[]
  >({
    queryKey: ["/api/blacklist"],
  });

  const removeBlacklistMutation = useMutation({
    mutationFn: async ({ gameId, id }: { gameId: string; id: string }) => {
      await apiRequest("DELETE", `/api/games/${gameId}/blacklist/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blacklist"] });
      toast({ description: "Release removed from blacklist" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to remove from blacklist" });
    },
  });

  const blacklistByGame = useMemo(() => {
    if (!blacklistEntries) return {};
    return blacklistEntries.reduce<Record<string, (ReleaseBlacklist & { gameTitle: string })[]>>(
      (acc, entry) => {
        (acc[entry.gameId] ??= []).push(entry);
        return acc;
      },
      {}
    );
  }, [blacklistEntries]);

  // Mobile tab scroller: tracks whether the tab strip has more content to
  // reveal on either side, so we can show a fade hint (tabs overflow on
  // narrow phones and there's no visible scrollbar to signal that).
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const tabsResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);

  const updateTabsScrollFade = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setTabsCanScrollLeft(el.scrollLeft > 1);
    setTabsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // A callback ref (rather than measuring in an effect keyed on a stable
  // callback) so the tab strip is measured whenever it actually mounts —
  // including after the page's loading branch gives way to the real
  // content, which a mount-only effect would otherwise miss entirely.
  const setTabsScrollNode = useCallback(
    (el: HTMLDivElement | null) => {
      tabsScrollRef.current = el;
      updateTabsScrollFade();
    },
    [updateTabsScrollFade]
  );

  // The scroll container itself is pinned to w-full, so a ResizeObserver on
  // it won't fire when only its (overflowing) content grows — e.g. this app
  // ships variable web fonts, and the fallback-font layout can be narrower
  // than the loaded-font layout, widening tab labels after the swap without
  // changing the container's own box. Observe the intrinsic-width inner
  // wrapper instead, whose box does reflect that.
  const setTabsInnerNode = useCallback(
    (el: HTMLDivElement | null) => {
      tabsResizeObserverRef.current?.disconnect();
      tabsResizeObserverRef.current = null;
      if (el && typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(updateTabsScrollFade);
        observer.observe(el);
        tabsResizeObserverRef.current = observer;
      }
      updateTabsScrollFade();
    },
    [updateTabsScrollFade]
  );

  useEffect(() => {
    window.addEventListener("resize", updateTabsScrollFade);
    return () => {
      window.removeEventListener("resize", updateTabsScrollFade);
      tabsResizeObserverRef.current?.disconnect();
    };
  }, [updateTabsScrollFade]);

  // Local state for form
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(true);
  const [autoSearchUnreleased, setAutoSearchUnreleased] = useState(false);
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(false);
  const [searchIntervalHours, setSearchIntervalHours] = useState(6);
  const [igdbRateLimitPerSecond, setIgdbRateLimitPerSecond] = useState(3);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [appriseMode, setAppriseMode] = useState<"api" | "cli">("api");
  const [appriseApiUrl, setAppriseApiUrl] = useState("");
  const [appriseKey, setAppriseKey] = useState("");
  const [appriseUrls, setAppriseUrls] = useState("");
  const [appriseUsername, setAppriseUsername] = useState("");
  const [apprisePassword, setApprisePassword] = useState("");
  const appriseLoadedRef = useRef(false);
  const settingsLoadedRef = useRef(false);

  // Local state for Steam form
  const [steamIdInput, setSteamIdInput] = useState("");
  const [steamSyncEnabled, setSteamSyncEnabled] = useState(false);
  const [steamSyncIntervalHours, setSteamSyncIntervalHours] = useState(24);

  // Local state for forms
  const [igdbClientId, setIgdbClientId] = useState("");
  const [igdbClientSecret, setIgdbClientSecret] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [downloadRules, setDownloadRules] = useState<DownloadRules | null>(null);
  const [preferredReleaseGroups, setPreferredReleaseGroups] = useState<string[]>([]);
  const [filterByPreferredGroups, setFilterByPreferredGroups] = useState(false);
  const [releaseNameBlacklist, setReleaseNameBlacklist] = useState<string[]>([]);
  const [preferredPlatform, setPreferredPlatform] = useState<string>("");
  const [xrelSceneReleases, setXrelSceneReleases] = useState(true);
  const [xrelP2pReleases, setXrelP2pReleases] = useState(false);
  const [hideAdultContent, setHideAdultContent] = useState(true);
  const [hideAgeRestrictedContent, setHideAgeRestrictedContent] = useState(true);
  const [hideShelvedByDefault, setHideShelvedByDefault] = useState(true);
  const [hideOwnedInHasResults, setHideOwnedInHasResults] = useState(true);
  const [telemetryEnabled, setTelemetryEnabled] = useState(false);
  const [xrelApiBase, setXrelApiBase] = useState("");
  const [nexusApiKey, setNexusApiKey] = useState("");
  const [showNexusApiKey, setShowNexusApiKey] = useState(false);
  const [typesafeApiUrl, setTypesafeApiUrl] = useState("");
  const [typesafeApiKey, setTypesafeApiKey] = useState("");
  const [typesafeModel, setTypesafeModel] = useState("");
  const [showTypesafeApiKey, setShowTypesafeApiKey] = useState(false);

  // Sync with fetched settings. Guarded by settingsLoadedRef so a background
  // refetch (e.g. after saving one section) doesn't clobber unsaved edits the
  // user has made in another section of this form.
  useEffect(() => {
    if (userSettings && !settingsLoadedRef.current) {
      setAutoSearchEnabled(userSettings.autoSearchEnabled);
      setAutoSearchUnreleased(userSettings.autoSearchUnreleased ?? false);
      setAutoDownloadEnabled(userSettings.autoDownloadEnabled);
      setSearchIntervalHours(userSettings.searchIntervalHours);
      const rateLimit = userSettings.igdbRateLimitPerSecond;
      setIgdbRateLimitPerSecond(
        Number.isInteger(rateLimit) ? Math.min(4, Math.max(1, rateLimit)) : 3
      );
      if (userSettings.notificationPreferences) {
        try {
          setNotifPrefs({
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...JSON.parse(userSettings.notificationPreferences),
          });
        } catch {
          setNotifPrefs(DEFAULT_NOTIFICATION_PREFERENCES);
          toast({
            title: "Notification preferences could not be loaded, reset to defaults",
            variant: "destructive",
          });
        }
      }

      // Parse download rules from JSON string
      if (userSettings.downloadRules) {
        try {
          const parsed = JSON.parse(userSettings.downloadRules);
          const validated = downloadRulesSchema.parse(parsed);
          setDownloadRules(validated);
        } catch (error) {
          console.warn("Failed to parse download rules", error);
          setDownloadRules(null);
        }
      } else {
        setDownloadRules(null);
      }
      setPreferredReleaseGroups(parseJsonStringArray(userSettings.preferredReleaseGroups));
      setFilterByPreferredGroups(userSettings.filterByPreferredGroups ?? false);
      setReleaseNameBlacklist(parseJsonStringArray(userSettings.releaseNameBlacklist));
      setPreferredPlatform(userSettings.preferredPlatform ?? "");
      setXrelSceneReleases(userSettings.xrelSceneReleases ?? true);
      setXrelP2pReleases(userSettings.xrelP2pReleases ?? false);
      setSteamSyncEnabled(userSettings.steamSyncEnabled ?? false);
      setSteamSyncIntervalHours(userSettings.steamSyncIntervalHours ?? 24);
      setHideAdultContent(userSettings.hideAdultContent ?? true);
      setHideAgeRestrictedContent(userSettings.hideAgeRestrictedContent ?? true);
      setHideShelvedByDefault(userSettings.hideShelvedByDefault ?? true);
      setHideOwnedInHasResults(userSettings.hideOwnedInHasResults ?? true);
      setTelemetryEnabled(userSettings.telemetryEnabled ?? false);
      settingsLoadedRef.current = true;
    }
    if (config?.xrel?.apiBase !== undefined) {
      setXrelApiBase(config.xrel.apiBase);
    }

    if (igdbSettings?.clientId) {
      setIgdbClientId(igdbSettings.clientId);
    }
    if (igdbSettings?.configured) {
      setIgdbClientSecret("");
    }
    if (user?.steamId64) {
      setSteamIdInput(user.steamId64);
    }
  }, [userSettings, config, igdbSettings, user, toast]);

  // SSL Settings State
  const [sslEnabled, setSslEnabled] = useState(false);
  const [sslPort, setSslPort] = useState(9898);
  const [sslCertPath, setSslCertPath] = useState("");
  const [sslKeyPath, setSslKeyPath] = useState("");
  const [sslRedirectHttp, setSslRedirectHttp] = useState(false);

  const { data: sslSettings } = useQuery({
    queryKey: ["/api/settings/ssl"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/ssl");
      return res.json();
    },
  });

  const {
    data: downloaderDebugLogging,
    isLoading: isDownloaderDebugLoggingLoading,
    isError: isDownloaderDebugLoggingError,
  } = useQuery<DownloaderDebugLoggingResponse>({
    queryKey: ["/api/downloaders/debug-logging"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/downloaders/debug-logging");
      return downloaderDebugLoggingResponseSchema.parse(await res.json());
    },
  });

  const updateDownloaderDebugLoggingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/downloaders/debug-logging", { enabled });
      return downloaderDebugLoggingResponseSchema.parse(await res.json());
    },
    onSuccess: (data: DownloaderDebugLoggingResponse) => {
      queryClient.setQueryData(["/api/downloaders/debug-logging"], data);
      toast({
        title: data.enabled
          ? "Downloader debug logging enabled"
          : "Downloader debug logging disabled",
        description: data.enabled
          ? "Full downloader responses will now be written to the log at debug level."
          : undefined,
      });
    },
    onError: () => {
      toast({ title: "Failed to update downloader debug logging", variant: "destructive" });
    },
  });

  const { data: appriseSettings } = useQuery<{
    configured: boolean;
    mode: "api" | "cli";
    apiUrl: string | null;
    key: string | null;
    urls: string | null;
    username?: string;
    password?: string;
  }>({
    queryKey: ["/api/settings/apprise"],
    queryFn: () => apiRequest("GET", "/api/settings/apprise").then((r) => r.json()),
  });

  useEffect(() => {
    if (appriseSettings && !appriseLoadedRef.current) {
      if (appriseSettings.mode) setAppriseMode(appriseSettings.mode);
      if (appriseSettings.apiUrl !== undefined) setAppriseApiUrl(appriseSettings.apiUrl ?? "");
      if (appriseSettings.key !== undefined) setAppriseKey(appriseSettings.key ?? "");
      if (appriseSettings.urls !== undefined) setAppriseUrls(appriseSettings.urls ?? "");
      setAppriseUsername(appriseSettings.username ?? "");
      setApprisePassword(appriseSettings.password ?? "");
      appriseLoadedRef.current = true;
    }
  }, [appriseSettings]);

  const { data: nexusmodsSettings } = useQuery<{
    configured: boolean;
    source?: "env" | "database";
  }>({
    queryKey: ["/api/settings/nexusmods"],
    queryFn: () => apiRequest("GET", "/api/settings/nexusmods").then((r) => r.json()),
  });

  const updateAppriseMutation = useMutation({
    mutationFn: async (data: {
      mode: "api" | "cli";
      apiUrl?: string;
      key?: string;
      urls?: string;
      username?: string;
      password?: string;
    }) => {
      const res = await apiRequest("POST", "/api/settings/apprise", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/apprise"] });
      toast({ title: "Apprise settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save Apprise settings", variant: "destructive" });
    },
  });

  const appriseSaveDisabled =
    updateAppriseMutation.isPending ||
    (appriseMode === "api"
      ? !appriseApiUrl.trim() || (!appriseKey.trim() && !appriseUrls.trim())
      : !appriseUrls.trim());

  const testAppriseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/apprise/test");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Test failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test notification sent successfully" });
    },
    onError: (err: Error) => {
      toast({
        title: formatInterfaceMessage("Apprise test failed: {error}", {
          error: String(err.message ?? ""),
        }),
        variant: "destructive",
      });
    },
  });

  const handleNotifPrefChange = (
    key: NotificationEvent,
    channel: "inApp" | "apprise" | "includeShelved" | "includeCompleted",
    checked: boolean
  ) => {
    const updated = { ...notifPrefs, [key]: { ...notifPrefs[key], [channel]: checked } };
    setNotifPrefs(updated);
    if (notifPrefSaveTimeoutRef.current) clearTimeout(notifPrefSaveTimeoutRef.current);
    notifPrefSaveTimeoutRef.current = setTimeout(() => {
      updateSettingsMutation.mutate({
        updates: { notificationPreferences: JSON.stringify(updated) },
        successMessage: "",
      });
    }, 500);
  };

  const updateNexusMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await apiRequest("POST", "/api/settings/nexusmods", { apiKey });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/nexusmods"] });
      setNexusApiKey("");
      toast({ title: "Nexus Mods API key saved" });
    },
    onError: () => {
      toast({ title: "Failed to save Nexus Mods API key", variant: "destructive" });
    },
  });

  const handleSaveNexus = () => {
    if (!nexusApiKey.trim()) return;
    updateNexusMutation.mutate(nexusApiKey.trim());
  };

  const { data: typesafeSettings } = useQuery<{
    configured: boolean;
    apiUrl?: string;
    model?: string;
  }>({
    queryKey: ["/api/settings/typesafe"],
    queryFn: () => apiRequest("GET", "/api/settings/typesafe").then((r) => r.json()),
  });

  const updateTypesafeMutation = useMutation({
    mutationFn: async (data: { apiUrl: string; apiKey?: string; model: string }) => {
      const res = await apiRequest("POST", "/api/settings/typesafe", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/typesafe"] });
      setTypesafeApiKey("");
      toast({ title: "TypeSafe settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save TypeSafe settings", variant: "destructive" });
    },
  });

  const clearTypesafeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/settings/typesafe");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/typesafe"] });
      setTypesafeApiUrl("");
      setTypesafeApiKey("");
      setTypesafeModel("");
      toast({ title: "TypeSafe integration disabled" });
    },
    onError: () => {
      toast({ title: "Failed to disable TypeSafe integration", variant: "destructive" });
    },
  });

  const handleSaveTypesafe = () => {
    const trimmedKey = typesafeApiKey.trim();
    // A key is only required the first time; once configured, saving with the field left
    // blank reuses the stored key (e.g. to change just the URL or model).
    if (!trimmedKey && !typesafeSettings?.configured) return;
    updateTypesafeMutation.mutate({
      apiUrl: typesafeApiUrl.trim(),
      ...(trimmedKey ? { apiKey: trimmedKey } : {}),
      model: typesafeModel.trim(),
    });
  };

  useEffect(() => {
    if (typesafeSettings?.apiUrl) {
      setTypesafeApiUrl(typesafeSettings.apiUrl);
    }
    if (typesafeSettings?.model) {
      setTypesafeModel(typesafeSettings.model);
    }
  }, [typesafeSettings?.apiUrl, typesafeSettings?.model]);

  const [certInfo, setCertInfo] = useState<CertInfo | null>(null); // State for cert info
  const [isCertBrowserOpen, setIsCertBrowserOpen] = useState(false);
  const [isKeyBrowserOpen, setIsKeyBrowserOpen] = useState(false);

  useEffect(() => {
    if (sslSettings) {
      setSslEnabled(sslSettings.enabled);
      setSslPort(sslSettings.port);
      setSslCertPath(sslSettings.certPath || "");
      setSslKeyPath(sslSettings.keyPath || "");
      setSslRedirectHttp(sslSettings.redirectHttp);
      setCertInfo(sslSettings.certInfo);
    }
  }, [sslSettings]);

  const [selectedCert, setSelectedCert] = useState<File | null>(null);
  const [selectedKey, setSelectedKey] = useState<File | null>(null);
  const certInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const notifPrefSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uploadCertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCert || !selectedKey) throw new Error("Please select both files");

      const formData = new FormData();
      formData.append("cert", selectedCert);
      formData.append("key", selectedKey);

      const res = await apiFetch("/api/settings/ssl/upload", {
        method: "POST",
        body: formData,
      });
      await throwIfResNotOk(res);

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Certificate Uploaded",
        description: data.message,
      });
      setSslCertPath(data.certPath);
      setSslKeyPath(data.keyPath);
      setSelectedCert(null);
      setSelectedKey(null);
      // Reset file inputs
      if (certInputRef.current) certInputRef.current.value = "";
      if (keyInputRef.current) keyInputRef.current.value = "";
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateSslMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/settings/ssl", {
        enabled: sslEnabled,
        port: sslPort,
        certPath: sslCertPath,
        keyPath: sslKeyPath,
        redirectHttp: sslRedirectHttp,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "SSL Settings Saved",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/ssl"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateCertMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/ssl/generate");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Certificate Generated",
        description: data.message,
      });
      setSslCertPath(data.certPath);
      setSslKeyPath(data.keyPath);
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveSsl = () => {
    updateSslMutation.mutate();
  };

  const updateSettingsMutation = useMutation({
    mutationFn: async ({
      updates,
      successMessage,
    }: {
      updates: Partial<UserSettings>;
      successMessage: string;
    }) => {
      const res = await apiRequest("PATCH", "/api/settings", updates);

      // Check if response is HTML (which means the route wasn't found and Vite served index.html)
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("API route not found. Please restart the server to apply changes.");
      }

      return { data: await res.json(), successMessage };
    },
    onSuccess: (data) => {
      toast({
        title: "Settings Updated",
        description: data.successMessage,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      console.error("Settings update error:", error);

      let message = error.message;
      if (message.includes("Unexpected token") || message.includes("JSON")) {
        message = "Server response invalid. Please restart the server.";
      }

      toast({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const updateAdvancedSettingsMutation = useMutation({
    mutationFn: async ({
      updates,
      successMessage,
    }: {
      updates: Partial<UserSettings>;
      successMessage: string;
    }) => {
      const res = await apiRequest("PATCH", "/api/settings", updates);

      // Check if response is HTML (which means the route wasn't found and Vite served index.html)
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("API route not found. Please restart the server to apply changes.");
      }

      return { data: await res.json(), successMessage };
    },
    onSuccess: (data) => {
      // Empty successMessage means the caller (the unified IGDB save button) shows its own
      // combined toast instead, describing exactly which parts were actually saved.
      if (data.successMessage) {
        toast({
          title: "Settings Updated",
          description: data.successMessage,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      console.error("Settings update error:", error);

      let message = error.message;
      if (message.includes("Unexpected token") || message.includes("JSON")) {
        message = "Server response invalid. Please restart the server.";
      }

      toast({
        title: "Update Failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const updateIgdbMutation = useMutation({
    mutationFn: async () => {
      const payload: { clientId: string; clientSecret?: string } = {
        clientId: igdbClientId,
      };
      if (igdbClientSecret) {
        payload.clientSecret = igdbClientSecret;
      }
      const res = await apiRequest("POST", "/api/settings/igdb", payload);
      return res.json();
    },
    onSuccess: () => {
      // The unified IGDB save button (handleSaveIgdb) shows its own combined toast describing
      // exactly which parts were saved, instead of this mutation announcing on its own.
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/igdb"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refreshMetadataMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/games/refresh-metadata");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Metadata Refresh",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Metadata Refresh Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const [libraryHealthResult, setLibraryHealthResult] = useState<{
    drifted: Array<{ id: string; title: string; libraryPath: string }>;
    orphaned: Array<{ path: string }>;
  } | null>(null);

  const libraryHealthMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/games/library-health-check");
      return res.json();
    },
    onSuccess: (data) => {
      setLibraryHealthResult({ drifted: data.drifted, orphaned: data.orphaned });
      toast({
        title: "Library Health Check",
        description:
          data.drifted.length === 0 && data.orphaned.length === 0
            ? "Library is in sync."
            : formatInterfaceMessage("{length} drifted, {length2} orphaned", {
                length: String(data.drifted.length ?? ""),
                length2: String(data.orphaned.length ?? ""),
              }),
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Library Health Check Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = configLoading || settingsLoading;
  const error = configError;

  const handleSaveAutoSearch = () => {
    updateSettingsMutation.mutate({
      updates: {
        autoSearchEnabled,
        autoSearchUnreleased,
        autoDownloadEnabled,
        searchIntervalHours,
        preferredPlatform: preferredPlatform || null,
      },
      successMessage: "Your auto-search preferences have been saved.",
    });
  };

  const handleSaveContentFilter = () => {
    updateSettingsMutation.mutate({
      updates: {
        hideAdultContent,
        hideAgeRestrictedContent,
      },
      successMessage: "Content filtering preferences have been saved.",
    });
  };

  const handleSaveLibraryFilters = () => {
    updateSettingsMutation.mutate({
      updates: {
        hideShelvedByDefault,
        hideOwnedInHasResults,
      },
      successMessage: "Your library filtering defaults have been saved.",
    });
  };

  const handleSaveTelemetry = () => {
    updateSettingsMutation.mutate({
      updates: { telemetryEnabled },
      successMessage: telemetryEnabled
        ? "Telemetry enabled. Detected errors will be reported automatically."
        : "Telemetry disabled.",
    });
  };

  const saveXrelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/settings/xrel", {
        apiBase: xrelApiBase.trim() || undefined,
        xrelSceneReleases,
        xrelP2pReleases,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "xREL.to options have been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveXrel = () => {
    saveXrelMutation.mutate();
  };

  // Single save button covers both the credentials fields and the rate limit below them. Both
  // parts only run when they actually changed (comparing against the last-loaded values), and
  // the summary toast below is built from what actually got saved -- rather than each mutation
  // firing its own fixed-text toast, which would show a stale/misleading combination now that
  // one click can trigger either, both, or neither.
  const handleSaveIgdb = async () => {
    // Omitting the secret and keeping the existing one is only safe when that existing secret
    // actually lives in the DB (source === "database"): the server pairs a DB clientId with a
    // DB secret, so if the current credentials are env-sourced there's no DB secret to pair a
    // new clientId with, and a clientId-only update would silently do nothing.
    const hasDbSecretToPairWith = igdbSettings?.source === "database";
    const originalClientId = igdbSettings?.clientId ?? "";
    const trimmedClientId = igdbClientId.trim();
    const trimmedClientSecret = igdbClientSecret.trim();
    const bothCredentialsProvided = !!(trimmedClientId && trimmedClientSecret);
    const hasCredentialChange = trimmedClientId !== originalClientId || !!trimmedClientSecret;
    const shouldSaveCredentials =
      bothCredentialsProvided || (hasDbSecretToPairWith && hasCredentialChange);
    // Only an actual attempted change that can't be saved counts as "incomplete" -- an
    // env-sourced clientId sitting unchanged in the field (prefilled on load) must not block
    // an unrelated rate-limit-only save.
    const attemptingIncompleteCredentials = hasCredentialChange && !shouldSaveCredentials;

    if (attemptingIncompleteCredentials) {
      toast({
        title: "Missing Credentials",
        description: "Please provide both Client ID and Client Secret.",
        variant: "destructive",
      });
      return;
    }

    const originalRateLimit = userSettings?.igdbRateLimitPerSecond ?? 3;
    const shouldSaveRateLimit = igdbRateLimitPerSecond !== originalRateLimit;

    if (!shouldSaveCredentials && !shouldSaveRateLimit) {
      return;
    }

    const results = await Promise.allSettled([
      shouldSaveCredentials ? updateIgdbMutation.mutateAsync() : Promise.resolve(undefined),
      shouldSaveRateLimit
        ? updateAdvancedSettingsMutation.mutateAsync({
            updates: { igdbRateLimitPerSecond },
            successMessage: "",
          })
        : Promise.resolve(undefined),
    ]);

    const credentialsSaved = shouldSaveCredentials && results[0].status === "fulfilled";
    const rateLimitSaved = shouldSaveRateLimit && results[1].status === "fulfilled";

    // A failed part already showed its own error toast via the mutation's onError; only
    // announce what actually succeeded, and stay silent if everything attempted failed.
    let description: string | null = null;
    if (credentialsSaved && rateLimitSaved) {
      description = "Your IGDB credentials and rate limit have been saved.";
    } else if (credentialsSaved) {
      description = "Your IGDB credentials have been saved.";
    } else if (rateLimitSaved) {
      description = "Your IGDB rate limit has been saved.";
    }

    if (description) {
      toast({ title: "IGDB Settings Updated", description });
    }
  };

  const updateSteamIdMutation = useMutation({
    mutationFn: async (steamId: string) => {
      const res = await apiRequest("PATCH", "/api/user/steam-id", { steamId });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Steam ID Updated",
        description: "Your Steam ID has been saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveSteamId = () => {
    if (!steamIdInput) return;
    updateSteamIdMutation.mutate(steamIdInput);
  };

  const handleSaveSteamSync = () => {
    updateSettingsMutation.mutate({
      updates: {
        steamSyncEnabled,
        steamSyncIntervalHours,
      },
      successMessage: "Your Steam Wishlist auto-sync preferences have been saved.",
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>
            <InterfaceText source={"Loading configuration..."} />
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <InterfaceText source={"Error Loading Configuration"} />
            </CardTitle>
            <CardDescription>
              <InterfaceText source={"Failed to load configuration. Please try again later."} />
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const contentFilteringCard = (
    <SettingsFilterCard
      icon={EyeOff}
      title="Content Filtering"
      data-i18n-title={"Content Filtering"}
      description="Control which games appear in your library and discovery results"
      onSave={handleSaveContentFilter}
      savePending={updateSettingsMutation.isPending}
      saveIcon={EyeOff}
      saveLabel="Save Content Filtering"
    >
      <SettingsToggleRow
        id="hide-adult-content"
        label="Hide erotic content"
        description="Hide games flagged with an explicit/erotic theme from your library, search, and discovery pages"
        checked={hideAdultContent}
        onCheckedChange={setHideAdultContent}
      />
      <SettingsToggleRow
        id="hide-age-restricted-content"
        label="Hide age-restricted content"
        description="Hide games rated ESRB Adults Only (AO) or PEGI 18 from your library, search, and discovery pages"
        checked={hideAgeRestrictedContent}
        onCheckedChange={setHideAgeRestrictedContent}
      />
    </SettingsFilterCard>
  );

  const libraryFilterRows = [
    {
      id: "hide-shelved-by-default",
      label: "Hide shelved games by default",
      description:
        "Keep shelved games out of the library view unless you filter by the Shelved status",
      checked: hideShelvedByDefault,
      onCheckedChange: setHideShelvedByDefault,
    },
    {
      id: "hide-owned-in-has-results",
      label: "Hide owned games in “Has Results” filter",
      description: "When the Has Results filter is active, skip games you already own",
      checked: hideOwnedInHasResults,
      onCheckedChange: setHideOwnedInHasResults,
    },
  ];

  const libraryFilteringCard = (
    <SettingsFilterCard
      icon={Filter}
      title="Library Filtering"
      data-i18n-title={"Library Filtering"}
      description="Choose which games are hidden by default in your library"
      onSave={handleSaveLibraryFilters}
      savePending={updateSettingsMutation.isPending}
      saveIcon={Archive}
      saveLabel="Save Library Filtering"
    >
      {libraryFilterRows.map((row) => (
        <SettingsToggleRow key={row.id} {...row} />
      ))}
    </SettingsFilterCard>
  );

  return (
    <div className="h-full overflow-auto p-4 pb-20 sm:p-6 md:pb-6">
      <div className="mb-6">
        <h1
          className="text-2xl font-bold tracking-tight"
          lang={languageFor("Settings")}
          dir={directionFor("Settings")}
        >
          {t("Settings")}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          <span
            lang={languageFor("Configure your preferences and system settings")}
            dir={directionFor("Configure your preferences and system settings")}
          >
            {t("Configure your preferences and system settings")}
          </span>
        </p>
      </div>

      <div className="w-full space-y-6">
        {/* Database Migration Alert */}
        {settingsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              <InterfaceText source={"Database Migration Required"} />
            </AlertTitle>
            <AlertDescription>
              <InterfaceText
                source={"The user settings table hasn't been created yet. Please run"}
              />{" "}
              <code className="px-1 py-0.5 bg-muted rounded">npm run db:migrate</code>{" "}
              <InterfaceText source={"to update the database schema, then restart the server."} />
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="appearance" className="w-full">
          <div className="relative mb-4 sm:mb-8">
            <TabsList
              ref={setTabsScrollNode}
              onScroll={updateTabsScrollFade}
              className="mb-0 flex w-full flex-nowrap justify-start overflow-x-auto motion-safe:scroll-smooth motion-reduce:scroll-auto"
            >
              <div ref={setTabsInnerNode} className="flex w-max flex-nowrap [&>*]:shrink-0">
                <TabsTrigger
                  value="appearance"
                  lang={languageFor("Appearance")}
                  dir={directionFor("Appearance")}
                >
                  {t("Appearance")}
                </TabsTrigger>
                {(
                  [
                    ["discovery", "Discovery & Downloads"],
                    ["notifications", "Notifications"],
                    ["platforms", "Platforms"],
                    ["integrations", "Integrations"],
                    ["import", "Import"],
                    ["account-security", "Account & Security"],
                    ["system", "System"],
                  ] as const
                ).map(([value, label]) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    lang={languageFor(label)}
                    dir={directionFor(label)}
                  >
                    {t(label)}
                  </TabsTrigger>
                ))}
              </div>
            </TabsList>
            {/* Edge fades hint that the tab strip scrolls further, since it has
                no visible scrollbar on touch devices. */}
            {tabsCanScrollLeft && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-md bg-gradient-to-r from-muted to-transparent"
              />
            )}
            {tabsCanScrollRight && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-md bg-gradient-to-l from-muted to-transparent"
              />
            )}
          </div>

          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <CardTitle
                    className="text-lg"
                    lang={languageFor("Theme")}
                    dir={directionFor("Theme")}
                  >
                    {t("Theme")}
                  </CardTitle>
                </div>
                <CardDescription
                  lang={languageFor("Select the visual theme for QuestarrNG")}
                  dir={directionFor("Select the visual theme for QuestarrNG")}
                >
                  {t("Select the visual theme for QuestarrNG")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="theme-select" className="text-sm font-medium">
                      <span lang={languageFor("Select Theme")} dir={directionFor("Select Theme")}>
                        {t("Select Theme")}
                      </span>
                    </Label>
                    <Select
                      value={effectiveTheme}
                      onValueChange={(value) => handleThemeChange(value as Theme)}
                    >
                      <SelectTrigger id="theme-select" className="w-full sm:w-64">
                        <SelectValue placeholder={t("Select a theme")}>
                          <span
                            lang={languageFor(THEME_CONFIGS[effectiveTheme].name)}
                            dir={directionFor(THEME_CONFIGS[effectiveTheme].name)}
                          >
                            {t(THEME_CONFIGS[effectiveTheme].name)}
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {THEMES.map((theme) => {
                          const config = THEME_CONFIGS[theme];
                          // Only show Ghost if unlocked
                          if (theme === "ghost" && !ghostUnlocked) return null;
                          return (
                            <SelectItem key={theme} value={theme}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  <span
                                    lang={languageFor(config.name)}
                                    dir={directionFor(config.name)}
                                  >
                                    {t(config.name)}
                                  </span>
                                </span>
                                <span
                                  className="text-xs text-muted-foreground"
                                  lang={languageFor(config.description)}
                                  dir={directionFor(config.description)}
                                >
                                  {t(config.description)}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p
                      className="text-xs text-muted-foreground"
                      lang={languageFor(
                        "Purely cosmetic — changes the visual appearance, nothing else changes"
                      )}
                      dir={directionFor(
                        "Purely cosmetic — changes the visual appearance, nothing else changes"
                      )}
                    >
                      {t("Purely cosmetic — changes the visual appearance, nothing else changes")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle
                  className="text-lg"
                  lang={languageFor("Interface language")}
                  dir={directionFor("Interface language")}
                >
                  {t("Interface language")}
                </CardTitle>
                <CardDescription>
                  <span
                    lang={languageFor("Choose the language used for the interface.")}
                    dir={directionFor("Choose the language used for the interface.")}
                  >
                    {t("Choose the language used for the interface.")}
                  </span>{" "}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label
                  htmlFor="interface-language"
                  lang={languageFor("Select a language")}
                  dir={directionFor("Select a language")}
                >
                  {t("Select a language")}
                </Label>
                <InterfaceLanguageSelect
                  id="interface-language"
                  value={language}
                  onValueChange={setLanguage}
                  className="w-full sm:w-80"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle
                  className="text-lg"
                  lang={languageFor("Regional format")}
                  dir={directionFor("Regional format")}
                >
                  {t("Regional format")}
                </CardTitle>
                <CardDescription>
                  <span
                    lang={languageFor(
                      "Choose how dates, times, and numbers are displayed. This setting is separate from interface language."
                    )}
                    dir={directionFor(
                      "Choose how dates, times, and numbers are displayed. This setting is separate from interface language."
                    )}
                  >
                    {t(
                      "Choose how dates, times, and numbers are displayed. This setting is separate from interface language."
                    )}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label
                  htmlFor="regional-format"
                  lang={languageFor("Date, time, and number format")}
                  dir={directionFor("Date, time, and number format")}
                >
                  {t("Date, time, and number format")}
                </Label>
                <Select value={regionalFormat} onValueChange={setRegionalPreference}>
                  <SelectTrigger id="regional-format" className="w-full sm:w-80">
                    <SelectValue placeholder={t("Use browser settings")}>
                      {selectedRegionalFormatOption
                        ? renderRegionalFormatLabel(selectedRegionalFormatOption)
                        : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {REGIONAL_FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {renderRegionalFormatLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {contentFilteringCard}

            {libraryFilteringCard}
          </TabsContent>

          <TabsContent value="platforms" className="space-y-6">
            <PlatformsSettings />
          </TabsContent>

          <TabsContent value="discovery" className="space-y-6">
            {/* Auto-Search Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Search className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">
                    <InterfaceText source={"Auto-Search & Download"} />
                  </CardTitle>
                </div>
                <CardDescription>
                  <InterfaceText
                    source={"Automatically search for and download releases for wanted games"}
                  />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  {/* Auto Search Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="auto-search" className="text-sm font-medium">
                        <InterfaceText source={"Enable Auto-Search"} />
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText source={"Periodically search indexers for wanted games"} />
                      </p>
                    </div>
                    <Switch
                      id="auto-search"
                      checked={autoSearchEnabled}
                      onCheckedChange={setAutoSearchEnabled}
                    />
                  </div>

                  {/* Search Interval */}
                  {autoSearchEnabled && (
                    <div className="space-y-2 pl-4 border-l-2">
                      <Label htmlFor="search-interval" className="text-sm font-medium">
                        <InterfaceText source={"Search Interval (hours)"} />
                      </Label>
                      <Input
                        id="search-interval"
                        type="number"
                        min="1"
                        max="168"
                        value={searchIntervalHours}
                        onChange={(e) =>
                          setSearchIntervalHours(Number.parseInt(e.target.value) || 6)
                        }
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={"How often to search for new releases (1-168 hours)"}
                        />
                      </p>
                    </div>
                  )}

                  {/* Auto Search Unreleased Toggle */}
                  {autoSearchEnabled && (
                    <div className="flex items-center justify-between pl-4 border-l-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-search-unreleased" className="text-sm font-medium">
                          <InterfaceText source={"Search Unreleased Games"} />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          <InterfaceText
                            source={"Include unreleased (upcoming/delayed) games in search"}
                          />
                        </p>
                      </div>
                      <Switch
                        id="auto-search-unreleased"
                        checked={autoSearchUnreleased}
                        onCheckedChange={setAutoSearchUnreleased}
                      />
                    </div>
                  )}

                  {/* Auto Download Toggle */}
                  {autoSearchEnabled && (
                    <div className="flex items-center justify-between pl-4 border-l-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="auto-download" className="text-sm font-medium">
                          <InterfaceText source={"Auto-Download Single Releases"} />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          <InterfaceText
                            source={"Automatically download when only one release is found"}
                          />
                        </p>
                      </div>
                      <Switch
                        id="auto-download"
                        checked={autoDownloadEnabled}
                        onCheckedChange={setAutoDownloadEnabled}
                      />
                    </div>
                  )}
                </div>

                {/* Preferred Platform */}
                <div className="space-y-2 pt-4 border-t">
                  <Label htmlFor="preferred-platform" className="text-sm font-medium">
                    <InterfaceText source={"Preferred Platform"} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText
                      source={
                        "Pre-filter results to this platform in the download dialog and auto-search. PC also matches releases with no explicit platform tag."
                      }
                    />
                  </p>
                  <Select
                    value={preferredPlatform || "__none__"}
                    onValueChange={(v) => setPreferredPlatform(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger id="preferred-platform" className="w-full sm:w-48">
                      <SelectValue
                        placeholder="No preference"
                        data-i18n-placeholder={"No preference"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        <InterfaceText source={"No preference"} />
                      </SelectItem>
                      {CANONICAL_PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleSaveAutoSearch}
                    disabled={updateSettingsMutation.isPending}
                    className="gap-2"
                  >
                    {updateSettingsMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <InterfaceText source={"Saving..."} />
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        <InterfaceText source={"Save Auto-Search"} />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <AutoDownloadRulesSettings
              rules={downloadRules}
              onChange={setDownloadRules}
              onReset={() => setDownloadRules(null)}
            />
            <PreferredReleaseGroupsSettings
              preferredGroups={preferredReleaseGroups}
              filterByPreferredGroups={filterByPreferredGroups}
              onGroupsChange={setPreferredReleaseGroups}
              onFilterChange={setFilterByPreferredGroups}
            />
            <ReleaseNameBlacklistSettings
              blacklistTerms={releaseNameBlacklist}
              onTermsChange={setReleaseNameBlacklist}
            />

            {/* Blacklisted Releases */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  <InterfaceText source={"Blacklisted Releases"} />
                </CardTitle>
                <CardDescription>
                  <InterfaceText
                    source={
                      "Releases hidden from search results. They will not appear in game download searches or be auto-downloaded."
                    }
                  />
                </CardDescription>
              </CardHeader>
              <CardContent>
                {blacklistLoading ? (
                  <div className="text-sm text-muted-foreground">
                    <InterfaceText source={"Loading..."} />
                  </div>
                ) : !blacklistEntries || blacklistEntries.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    <InterfaceText source={"No blacklisted releases."} />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(blacklistByGame).map(([gameId, entries]) => (
                      <div key={gameId}>
                        <h4 className="text-sm font-semibold mb-2">
                          {entries[0]?.gameTitle ?? "Unknown game"}
                        </h4>
                        <div className="space-y-2">
                          {entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between rounded-md border p-3"
                            >
                              <div className="space-y-1">
                                <p className="text-sm font-medium leading-none">
                                  {entry.releaseTitle}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {entry.indexerName ? `${entry.indexerName} · ` : ""}
                                  {entry.createdAt
                                    ? new Date(entry.createdAt).toISOString().split("T")[0]
                                    : ""}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={formatInterfaceMessage(
                                  "Remove {title} from blacklist",
                                  { title: String(entry.releaseTitle ?? "") }
                                )}
                                onClick={() =>
                                  removeBlacklistMutation.mutate({
                                    gameId: entry.gameId,
                                    id: entry.id,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            {/* Apprise Integration Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">
                      <InterfaceText source={"Apprise Push Notifications"} />
                    </CardTitle>
                  </div>
                  {appriseSettings?.configured ? (
                    <Badge
                      variant="default"
                      className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    >
                      <InterfaceText source={"Connected"} />
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <InterfaceText source={"Not configured"} />
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  <InterfaceText source={"Forward notifications through a self-hosted"} />{" "}
                  <span className="font-medium">
                    <InterfaceText source={"Apprise API"} />
                  </span>{" "}
                  <InterfaceText source={"server or the local"} />{" "}
                  <span className="font-medium">
                    <InterfaceText source={"Apprise CLI"} />
                  </span>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="apprise-mode">
                    <InterfaceText source={"Mode"} />
                  </Label>
                  <Select
                    value={appriseMode}
                    onValueChange={(value) => {
                      if (value === "api" || value === "cli") setAppriseMode(value);
                    }}
                  >
                    <SelectTrigger id="apprise-mode" className="w-full sm:w-56">
                      <SelectValue
                        placeholder="Select mode"
                        data-i18n-placeholder={"Select mode"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api">
                        <InterfaceText source={"API"} />
                      </SelectItem>
                      <SelectItem value="cli">
                        <InterfaceText source={"CLI"} />
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText
                      source={
                        "API mode sends notifications to a remote Apprise server. CLI mode runs the local"
                      }
                    />{" "}
                    <code className="px-1">apprise</code>{" "}
                    <InterfaceText source={"command inside QuestarrNG."} />
                  </p>
                </div>
                {appriseMode === "api" && (
                  <div className="space-y-2">
                    <Label htmlFor="apprise-api-url">
                      <InterfaceText source={"API URL"} />{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="apprise-api-url"
                      type="text"
                      placeholder="http://apprise:8000"
                      value={appriseApiUrl}
                      onChange={(e) => setAppriseApiUrl(e.target.value)}
                    />
                  </div>
                )}
                {appriseMode === "api" && (
                  <div className="space-y-2">
                    <Label htmlFor="apprise-key">
                      <InterfaceText source={"Config Key"} />{" "}
                      <span className="text-xs text-muted-foreground font-normal">
                        <InterfaceText source={"(optional)"} />
                      </span>
                    </Label>
                    <Input
                      id="apprise-key"
                      type="text"
                      placeholder="my-config-key"
                      value={appriseKey}
                      onChange={(e) => setAppriseKey(e.target.value)}
                      data-i18n-placeholder={"my-config-key"}
                    />
                    <p className="text-xs text-muted-foreground">
                      <InterfaceText
                        source={
                          "Persistent mode: a config key pre-configured in your Apprise API server."
                        }
                      />
                    </p>
                  </div>
                )}
                {appriseMode === "api" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="apprise-username">
                        <InterfaceText source={"Username"} />{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          <InterfaceText source={"(optional)"} />
                        </span>
                      </Label>
                      <Input
                        id="apprise-username"
                        type="text"
                        autoComplete="off"
                        value={appriseUsername}
                        onChange={(e) => setAppriseUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apprise-password">
                        <InterfaceText source={"Password"} />{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          <InterfaceText source={"(optional)"} />
                        </span>
                      </Label>
                      <Input
                        id="apprise-password"
                        type="password"
                        autoComplete="new-password"
                        value={apprisePassword}
                        onChange={(e) => setApprisePassword(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      <InterfaceText
                        source={"Only needed when your Apprise API server requires a login:"}
                      />{" "}
                      <code className="px-1">APPRISE_AUTH_REQUIRED=yes</code>.
                    </p>
                    {(appriseUsername.trim() || apprisePassword) && isHttpUrl(appriseApiUrl) && (
                      <p className="text-xs text-amber-700 in-[.dark]:text-amber-500 sm:col-span-2">
                        <InterfaceText
                          source={
                            "This API URL uses http://, so the login is sent unencrypted. Use https:// unless Apprise runs on a network you trust."
                          }
                        />
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="apprise-urls">
                    <InterfaceText source={"Notification URLs"} />{" "}
                    <span className="text-xs text-muted-foreground font-normal">
                      {appriseMode === "cli" ? (
                        <InterfaceText source={"(required)"} />
                      ) : (
                        <InterfaceText source={"(optional)"} />
                      )}
                    </span>
                  </Label>
                  <Textarea
                    id="apprise-urls"
                    placeholder={"discord://webhook/...\npushover://token@user/"}
                    value={appriseUrls}
                    onChange={(e) => setAppriseUrls(e.target.value)}
                    className="font-mono text-sm"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText source={"One Apprise URL per line. Build URLs at"} />{" "}
                    <a
                      href="https://appriseit.com/url-builder"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      appriseit.com/url-builder
                    </a>
                    .
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={() =>
                      updateAppriseMutation.mutate(
                        appriseMode === "cli"
                          ? { mode: appriseMode, urls: appriseUrls.trim() }
                          : {
                              mode: appriseMode,
                              apiUrl: appriseApiUrl.trim(),
                              key: appriseKey.trim(),
                              urls: appriseUrls.trim(),
                              username: appriseUsername.trim(),
                              password: apprisePassword,
                            }
                      )
                    }
                    disabled={appriseSaveDisabled}
                  >
                    {updateAppriseMutation.isPending ? (
                      "Saving..."
                    ) : (
                      <InterfaceText source={"Save"} />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => testAppriseMutation.mutate()}
                    disabled={testAppriseMutation.isPending || !appriseSettings?.configured}
                  >
                    {testAppriseMutation.isPending ? (
                      <InterfaceText source={"Sending..."} />
                    ) : (
                      <InterfaceText source={"Send Test Notification"} />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Notification Preferences Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  <InterfaceText source={"Notification Preferences"} />
                </CardTitle>
                <CardDescription>
                  <InterfaceText
                    source={"Control which events create notifications and where they are sent."}
                  />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left text-sm font-medium text-muted-foreground pb-3 pr-2 sm:pr-4">
                          <InterfaceText source={"Event"} />
                        </th>
                        <th className="text-center text-sm font-medium text-muted-foreground pb-3 px-3 sm:px-6 w-14 sm:w-24">
                          <InterfaceText source={"In-App"} />
                        </th>
                        <th className="text-center text-sm font-medium text-muted-foreground pb-3 pl-3 sm:pl-6 w-14 sm:w-24">
                          <InterfaceText source={"Apprise"} />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {NOTIFICATION_EVENT_ROWS.map(({ key, label, group }, idx, arr) => {
                        const isGroupStart = idx > 0 && arr[idx - 1]!.group !== group;
                        return (
                          <tr
                            key={key}
                            className={`border-b last:border-0 ${isGroupStart ? "border-t-2 border-t-muted" : ""}`}
                          >
                            <td className="py-3 pr-2 sm:pr-4 text-sm">{label}</td>
                            <td className="py-3 px-3 sm:px-6 text-center">
                              <Switch
                                aria-label={formatInterfaceMessage("In-App: {label}", {
                                  label: String(label ?? ""),
                                })}
                                checked={notifPrefs[key].inApp}
                                onCheckedChange={(checked) =>
                                  handleNotifPrefChange(key, "inApp", checked)
                                }
                              />
                            </td>
                            <td className="py-3 pl-3 sm:pl-6 text-center">
                              <div
                                title={
                                  !appriseSettings?.configured
                                    ? "Configure Apprise above to enable"
                                    : undefined
                                }
                              >
                                <Switch
                                  aria-label={formatInterfaceMessage("Apprise: {label}", {
                                    label: String(label ?? ""),
                                  })}
                                  checked={notifPrefs[key].apprise}
                                  onCheckedChange={(checked) =>
                                    handleNotifPrefChange(key, "apprise", checked)
                                  }
                                  disabled={!appriseSettings?.configured}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 space-y-4 border-t pt-4">
                  <div>
                    <h3 className="text-sm font-medium">
                      <InterfaceText source={"Game updates and new packs/add-ons"} />
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      <InterfaceText
                        source={
                          "Choose whether shelved and completed games send these notifications. Applies to both In-App and Apprise. Games are still checked for available content."
                        }
                      />
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="notify-updates-shelved">
                      <InterfaceText source={"Notify for shelved games"} />
                    </Label>
                    <Switch
                      id="notify-updates-shelved"
                      checked={notifPrefs.gameUpdates.includeShelved !== false}
                      onCheckedChange={(checked) =>
                        handleNotifPrefChange("gameUpdates", "includeShelved", checked)
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="notify-updates-completed">
                      <InterfaceText source={"Notify for completed games"} />
                    </Label>
                    <Switch
                      id="notify-updates-completed"
                      checked={notifPrefs.gameUpdates.includeCompleted !== false}
                      onCheckedChange={(checked) =>
                        handleNotifPrefChange("gameUpdates", "includeCompleted", checked)
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            {/* API keys for external clients (Playnite extension, scripts) */}
            <ApiKeysCard />

            {/* Steam Integration Card */}
            <Card id="steam-config">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Gamepad2 className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">
                    <InterfaceText source={"Steam Integration"} />
                  </CardTitle>
                </div>
                <CardDescription>
                  <InterfaceText source={"Sync your Steam Wishlist with QuestarrNG."} />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="steam-id">
                      <InterfaceText source={"Steam ID (64-bit)"} />
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="steam-id"
                        placeholder="76561198..."
                        value={steamIdInput}
                        onChange={(e) => setSteamIdInput(e.target.value)}
                      />
                      <Button
                        onClick={handleSaveSteamId}
                        disabled={updateSteamIdMutation.isPending}
                      >
                        {updateSteamIdMutation.isPending ? (
                          "Saving..."
                        ) : (
                          <InterfaceText source={"Save ID"} />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <InterfaceText
                        source={"Enter your SteamID64 to sync your wishlist. You can find it on"}
                      />{" "}
                      <a
                        href="https://steamid.io"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        steamid.io
                      </a>
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="space-y-0.5">
                      <Label htmlFor="steam-sync-enabled" className="text-sm font-medium">
                        <InterfaceText source={"Auto-Sync Wishlist"} />
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={"Periodically import new games from your Steam Wishlist"}
                        />
                      </p>
                    </div>
                    <Switch
                      id="steam-sync-enabled"
                      checked={steamSyncEnabled}
                      onCheckedChange={setSteamSyncEnabled}
                    />
                  </div>

                  {steamSyncEnabled && (
                    <div className="space-y-2 pl-4 border-l-2">
                      <Label htmlFor="steam-sync-interval" className="text-sm font-medium">
                        <InterfaceText source={"Sync Interval (hours)"} />
                      </Label>
                      <Input
                        id="steam-sync-interval"
                        type="number"
                        min="1"
                        max="168"
                        value={steamSyncIntervalHours}
                        onChange={(e) =>
                          setSteamSyncIntervalHours(
                            Math.min(168, Math.max(1, Number.parseInt(e.target.value) || 24))
                          )
                        }
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={
                            "How often to check your Steam Wishlist for new games (1-168 hours)"
                          }
                        />
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end pt-2 border-t">
                    <Button
                      onClick={handleSaveSteamSync}
                      disabled={updateSettingsMutation.isPending}
                      className="gap-2"
                    >
                      {updateSettingsMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <InterfaceText source={"Saving..."} />
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          <InterfaceText source={"Save Sync Settings"} />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Nexus Mods Card */}
            <Card id="nexusmods-config">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <NexusModsIcon className="h-5 w-5 text-amber-500" />
                    <CardTitle className="text-lg">
                      <InterfaceText source={"Nexus Mods"} />
                    </CardTitle>
                  </div>
                  {nexusmodsSettings?.configured ? (
                    <Badge
                      variant={nexusmodsSettings.source === "database" ? "default" : "secondary"}
                    >
                      {nexusmodsSettings.source === "database" ? (
                        <InterfaceText source={"Database (Active)"} />
                      ) : (
                        <InterfaceText source={"Environment Variable"} />
                      )}
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <InterfaceText source={"Not Configured"} />
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  <InterfaceText
                    source={
                      "Display trending mods and verify if your games have a Nexus Mods section."
                    }
                  />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nexus-api-key">
                    <InterfaceText source={"Personal API Key"} />
                  </Label>
                  <div className="relative">
                    <Input
                      id="nexus-api-key"
                      type={showNexusApiKey ? "text" : "password"}
                      placeholder={
                        nexusmodsSettings?.configured
                          ? "Enter a new key to override the current one"
                          : "Enter your Nexus Mods API key"
                      }
                      value={nexusApiKey}
                      onChange={(e) => setNexusApiKey(e.target.value)}
                      className="pr-10"
                    />
                    {nexusApiKey && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowNexusApiKey(!showNexusApiKey)}
                        aria-label={showNexusApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showNexusApiKey ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText source={"Get your personal API key on the"} />{" "}
                    <a
                      href="https://www.nexusmods.com/users/myaccount?tab=api"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      <InterfaceText source={"Nexus Mods account page"} />
                    </a>
                    <InterfaceText source={". Rate limits: 500 req/hour, 20,000 req/day."} />
                    {nexusmodsSettings?.source === "env" && (
                      <span className="block mt-1">
                        <InterfaceText
                          source={
                            "The {key} environment variable is set. Saving a key here will override it."
                          }
                          values={{ key: "NEXUSMODS_API_KEY" }}
                        />
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <Button
                    onClick={handleSaveNexus}
                    disabled={updateNexusMutation.isPending || !nexusApiKey.trim()}
                    className="gap-2"
                  >
                    {updateNexusMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <InterfaceText source={"Saving..."} />
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4" />
                        <InterfaceText source={"Save API Key"} />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* TypeSafe (Jev) AI Card */}
            <Card id="typesafe-config">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Sparkles className="h-5 w-5 shrink-0 text-blue-500" />
                    <CardTitle className="text-lg">
                      <InterfaceText source={"AI Release Analysis (TypeSafe)"} />
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-600/50 text-amber-700 in-[.dark]:border-amber-500/50 in-[.dark]:text-amber-500"
                      title="Experimental feature: behavior and results may change between releases"
                      data-i18n-title={
                        "Experimental feature: behavior and results may change between releases"
                      }
                    >
                      <FlaskConical className="h-3 w-3" aria-hidden="true" />
                      <InterfaceText source={"Experimental"} />
                    </Badge>
                  </div>
                  {typesafeSettings?.configured ? (
                    <Badge variant="default">
                      <InterfaceText source={"Enabled"} />
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <InterfaceText source={"Not Configured"} />
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  <InterfaceText
                    source={
                      "Optional. Uses TypeSafe's Jev model to classify release types (full game, DLC, update, repack...) and flag suspiciously small files in search results. Entirely optional and off by default — QuestarrNG works normally without it. Bring your own API key and endpoint (TypeSafe, OpenRouter, a self-hosted proxy, etc.)."
                    }
                  />{" "}
                  <span className="mt-2 block text-amber-700 in-[.dark]:text-amber-500">
                    <InterfaceText
                      source={
                        "Experimental: Jev classifications can be wrong, and how they are used may change between releases. Check flagged results before relying on them."
                      }
                    />
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="typesafe-api-url">
                    <InterfaceText source={"API URL"} />
                  </Label>
                  <Input
                    id="typesafe-api-url"
                    type="text"
                    placeholder="https://api.typesafe.ai/v1/systemone"
                    value={typesafeApiUrl}
                    onChange={(e) => setTypesafeApiUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText source={"Leave blank to use TypeSafe's default endpoint."} />
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="typesafe-api-key">
                    <InterfaceText source={"API Key"} />
                  </Label>
                  <div className="relative">
                    <Input
                      id="typesafe-api-key"
                      type={showTypesafeApiKey ? "text" : "password"}
                      placeholder={
                        typesafeSettings?.configured
                          ? "Enter a new key to override the current one"
                          : "Enter your API key"
                      }
                      value={typesafeApiKey}
                      onChange={(e) => setTypesafeApiKey(e.target.value)}
                      className="pr-10"
                    />
                    {typesafeApiKey && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowTypesafeApiKey(!showTypesafeApiKey)}
                        aria-label={showTypesafeApiKey ? "Hide API key" : "Show API key"}
                      >
                        {showTypesafeApiKey ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="typesafe-model">
                    <InterfaceText source={"Model"} />
                  </Label>
                  <Input
                    id="typesafe-model"
                    type="text"
                    placeholder="jev-latest"
                    value={typesafeModel}
                    onChange={(e) => setTypesafeModel(e.target.value)}
                    data-i18n-placeholder={"jev-latest"}
                  />
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText
                      source={
                        "Leave blank for TypeSafe's default model. Routing through OpenRouter? Set the API URL to"
                      }
                    />{" "}
                    <code className="text-[10px]">https://openrouter.ai/api/alpha/decisions</code>{" "}
                    <InterfaceText source={"and the model to"} />{" "}
                    <code className="text-[10px]">typesafe/jev-1.13</code>.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  {typesafeSettings?.configured && (
                    <Button
                      variant="outline"
                      onClick={() => clearTypesafeMutation.mutate()}
                      disabled={clearTypesafeMutation.isPending}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      <InterfaceText source={"Disable"} />
                    </Button>
                  )}
                  <Button
                    onClick={handleSaveTypesafe}
                    disabled={
                      updateTypesafeMutation.isPending ||
                      (!typesafeApiKey.trim() && !typesafeSettings?.configured)
                    }
                    className="gap-2"
                  >
                    {updateTypesafeMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 motion-safe:animate-spin" />
                        <InterfaceText source={"Saving..."} />
                      </>
                    ) : (
                      <>
                        <Key className="h-4 w-4" />
                        <InterfaceText source={"Save API Key"} />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* IGDB Card */}
            <Card id="igdb-config">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-lg">
                      <InterfaceText source={"IGDB API"} />
                    </CardTitle>
                    <IgdbHelpPopover />
                  </div>
                </div>
                <CardDescription>
                  <InterfaceText source={"Twitch/IGDB API integration for game metadata."} />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col space-y-2 pb-4 border-b">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">
                      <InterfaceText source={"Status"} />
                    </span>
                    {config?.igdb.configured ? (
                      <Badge variant={config.igdb.source === "database" ? "default" : "secondary"}>
                        {config.igdb.source === "database" ? (
                          <InterfaceText source={"Database (Active)"} />
                        ) : (
                          <InterfaceText source={"Environment Variable"} />
                        )}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <InterfaceText source={"Not Configured"} />
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText
                      source={
                        "Credentials configured here will override environment variables (IGDB_CLIENT_ID, IGDB_CLIENT_SECRET)."
                      }
                    />
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="igdb-client-id">
                      <InterfaceText source={"Client ID"} />
                    </Label>
                    <Input
                      id="igdb-client-id"
                      placeholder="Enter your IGDB Client ID"
                      value={igdbClientId}
                      onChange={(e) => setIgdbClientId(e.target.value)}
                      data-i18n-placeholder={"Enter your IGDB Client ID"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="igdb-client-secret">
                      <InterfaceText source={"Client Secret"} />
                    </Label>
                    <div className="relative">
                      <Input
                        id="igdb-client-secret"
                        type={showClientSecret ? "text" : "password"}
                        placeholder={
                          config?.igdb.configured ? "********" : "Enter your IGDB Client Secret"
                        }
                        value={igdbClientSecret}
                        onChange={(e) => setIgdbClientSecret(e.target.value)}
                        className="pr-10"
                      />
                      {igdbClientSecret && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowClientSecret(!showClientSecret)}
                          aria-label={
                            showClientSecret ? "Hide client secret" : "Show client secret"
                          }
                        >
                          {showClientSecret ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <IgdbTestConnectionButton
                  clientId={igdbClientId}
                  clientSecret={igdbClientSecret || (config?.igdb.configured ? "********" : "")}
                  testEndpoint="/api/settings/igdb/test"
                />

                {/* Rate limit (formerly a standalone "Advanced" card) */}
                <div className="space-y-3 pt-4 border-t">
                  <Label htmlFor="igdb-rate-limit" className="text-sm font-medium">
                    <InterfaceText source={"IGDB API Rate Limit (requests/second)"} />
                  </Label>
                  <Input
                    id="igdb-rate-limit"
                    type="number"
                    min="1"
                    max="4"
                    value={igdbRateLimitPerSecond}
                    onChange={(e) => {
                      const parsed = Number.parseInt(e.target.value);
                      setIgdbRateLimitPerSecond(
                        Number.isNaN(parsed) ? 3 : Math.min(4, Math.max(1, parsed))
                      );
                    }}
                    className="w-32"
                  />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <strong>
                        <InterfaceText source={"IGDB allows 4 requests per second."} />
                      </strong>{" "}
                      <InterfaceText source={"Default is 3 to be conservative."} />
                    </p>
                    <p>
                      <InterfaceText
                        source={
                          "Only increase if you experience slow loading times and are confident your usage won't exceed the limit."
                        }
                      />
                    </p>
                    <p className="text-amber-500">
                      <InterfaceText
                        source={"⚠️ Setting too high may result in API blacklisting."}
                      />
                    </p>
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleSaveIgdb}
                    disabled={
                      updateIgdbMutation.isPending || updateAdvancedSettingsMutation.isPending
                    }
                    className="gap-2"
                  >
                    {updateIgdbMutation.isPending || updateAdvancedSettingsMutation.isPending ? (
                      <span role="status" className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 motion-safe:animate-spin" />
                        <InterfaceText source={"Saving..."} />
                      </span>
                    ) : (
                      <>
                        <Key className="h-4 w-4" />
                        <InterfaceText source={"Save"} />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* xREL.to Search Options */}
            <Card id="xrel-settings">
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Newspaper className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">xREL.to</CardTitle>
                </div>
                <CardDescription>
                  <InterfaceText
                    source={
                      "Alert when a wanted game appears on xREL.to (scene/P2P release list). API base URL and search options for the auto-check."
                    }
                  />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="xrel-api-base" className="text-sm font-medium">
                      <InterfaceText source={"API base URL"} />
                    </Label>
                    <Select value={xrelApiBase} onValueChange={setXrelApiBase}>
                      <SelectTrigger id="xrel-api-base" className="w-full font-mono text-sm">
                        <SelectValue
                          placeholder="Select API base URL"
                          data-i18n-placeholder={"Select API base URL"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="https://xrel-api.nfos.to">
                          <span lang="und" dir="auto">
                            https://xrel-api.nfos.to
                          </span>{" "}
                          (
                          <InterfaceText source={"Mirror — recommended"} />)
                        </SelectItem>
                        <SelectItem value="https://api.xrel.to">
                          <span lang="und" dir="auto">
                            https://api.xrel.to
                          </span>{" "}
                          (
                          <InterfaceText source={"Official — often blocked"} />)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      <InterfaceText
                        source={
                          "Use the mirror if your IP is blocked by Cloudflare on the official API."
                        }
                      />
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="xrel-scene" className="text-sm font-medium">
                        <InterfaceText source={"Include scene releases"} />
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={"Search scene releases when checking for wanted games on xREL.to"}
                        />
                      </p>
                    </div>
                    <Switch
                      id="xrel-scene"
                      checked={xrelSceneReleases}
                      onCheckedChange={setXrelSceneReleases}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="xrel-p2p" className="text-sm font-medium">
                        <InterfaceText source={"Include P2P releases"} />
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={"Search P2P releases when checking for wanted games on xREL.to"}
                        />
                      </p>
                    </div>
                    <Switch
                      id="xrel-p2p"
                      checked={xrelP2pReleases}
                      onCheckedChange={setXrelP2pReleases}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleSaveXrel}
                    disabled={saveXrelMutation.isPending}
                    className="gap-2"
                  >
                    {saveXrelMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <InterfaceText source={"Saving..."} />
                      </>
                    ) : (
                      <>
                        <Newspaper className="h-4 w-4" />
                        <InterfaceText source={"Save xREL.to options"} />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="import" className="space-y-6">
            <ImportSettings />
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  <InterfaceText source={"Support QuestarrNG"} />
                </CardTitle>
                <CardDescription>
                  <InterfaceText source={"Help maintain this fork."} />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  href="https://ko-fi.com/snapetech"
                  target="_blank"
                  rel="noreferrer"
                >
                  <InterfaceText source={"Support on Ko-fi"} />
                </a>
              </CardContent>
            </Card>
            {/* Application Management */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Server className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">
                    <InterfaceText source={"Maintenance"} />
                  </CardTitle>
                </div>
                <CardDescription>
                  <InterfaceText source={"Application maintenance and data management tasks"} />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        <InterfaceText source={"Clear Downloads Cache"} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={
                            "Clear cached torrent/NZB search results so the next search fetches fresh data from all configured indexers."
                          }
                        />
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        clearSearchCache();
                        toast({
                          title: "Downloads Cache Cleared",
                          description:
                            "Search results cache has been cleared. New searches will fetch fresh data.",
                        });
                      }}
                      className="gap-2 w-full sm:w-auto shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                      <InterfaceText source={"Clear Cache"} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        <InterfaceText source={"Refresh Metadata"} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={
                            "Update all games in your library with the latest information from IGDB."
                          }
                        />
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshMetadataMutation.mutate()}
                      disabled={refreshMetadataMutation.isPending}
                      className="gap-2 w-full sm:w-auto shrink-0"
                    >
                      {refreshMetadataMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <InterfaceText source={"Refresh All"} />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">
                        <InterfaceText source={"Check Library Health"} />
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={
                            "Find games whose library files have gone missing, and library folders that no longer match any game."
                          }
                        />
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => libraryHealthMutation.mutate()}
                      disabled={libraryHealthMutation.isPending}
                      className="gap-2 w-full sm:w-auto shrink-0"
                    >
                      {libraryHealthMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <InterfaceText source={"Check Library"} />
                    </Button>
                  </div>
                  {libraryHealthResult &&
                    (libraryHealthResult.drifted.length > 0 ||
                      libraryHealthResult.orphaned.length > 0) && (
                      <div className="mt-2 space-y-3 rounded-md border border-border p-3 text-xs">
                        {libraryHealthResult.drifted.length > 0 && (
                          <div>
                            <p className="font-medium text-amber-500">
                              <InterfaceText source={"Drifted ("} />
                              {libraryHealthResult.drifted.length})
                            </p>
                            <ul className="mt-1 space-y-1 text-muted-foreground">
                              {libraryHealthResult.drifted.map((g) => (
                                <li key={g.id}>
                                  {g.title} — {g.libraryPath}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {libraryHealthResult.orphaned.length > 0 && (
                          <div>
                            <p className="font-medium text-amber-500">
                              <InterfaceText source={"Orphaned ("} />
                              {libraryHealthResult.orphaned.length})
                            </p>
                            <ul className="mt-1 space-y-1 text-muted-foreground">
                              {libraryHealthResult.orphaned.map((o) => (
                                <li key={o.path}>{o.path}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* Telemetry */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Radio className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">
                    <InterfaceText source={"Telemetry"} />
                  </CardTitle>
                </div>
                <CardDescription>
                  <InterfaceText
                    source={
                      "Help improve QuestarrNG by automatically sharing diagnostic data when something goes wrong"
                    }
                  />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5 pr-4">
                    <Label htmlFor="telemetry-enabled" className="text-sm font-medium">
                      <InterfaceText source={"Automatically send error reports"} />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      <InterfaceText
                        source={
                          "Off by default. When QuestarrNG detects an unexpected server error, it will normally ask you first (see the 'Error Detected' notification below). Turn this on to skip that prompt and send a scrubbed diagnostic report automatically instead — no personal data, IP addresses, or file paths are included. Reports help the maintainer catch bugs users don't otherwise report. You can still send a one-off report manually from the Logs page at any time, whatever this setting is."
                        }
                      />
                    </p>
                  </div>
                  <Switch
                    id="telemetry-enabled"
                    checked={telemetryEnabled}
                    onCheckedChange={setTelemetryEnabled}
                  />
                </div>
                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={handleSaveTelemetry}
                    disabled={updateSettingsMutation.isPending}
                    className="gap-2"
                  >
                    {updateSettingsMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <InterfaceText source={"Saving..."} />
                      </>
                    ) : (
                      <>
                        <Radio className="h-4 w-4" />
                        <InterfaceText source={"Save Telemetry"} />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Downloader Debug Logging */}
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Server className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">
                    <InterfaceText source={"Downloader Debug Logging"} />
                  </CardTitle>
                </div>
                <CardDescription>
                  <InterfaceText
                    source={
                      "Log downloader response status, headers, and body (up to 10KB) from download clients (qBittorrent, Transmission, rTorrent, Deluge, Synology Download Station, sabnzbd, nzbget) at debug level. Response headers and bodies can contain sensitive data - enable this only while debugging and review logs carefully. Useful when diagnosing why a download isn't being added or tracked correctly - leave this off otherwise, as it can be noisy."
                    }
                  />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="downloader-debug-logging" className="text-sm font-medium">
                      <InterfaceText source={"Log full downloader responses"} />
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      <InterfaceText
                        source={
                          "Applies immediately and affects all configured downloaders. View the results on the Logs page."
                        }
                      />
                    </p>
                    {isDownloaderDebugLoggingError && (
                      <p className="text-xs text-destructive">
                        <InterfaceText
                          source={
                            "Failed to load the current setting. Refresh the page to try again."
                          }
                        />
                      </p>
                    )}
                  </div>
                  <Switch
                    id="downloader-debug-logging"
                    checked={downloaderDebugLogging?.enabled ?? false}
                    disabled={
                      isDownloaderDebugLoggingLoading ||
                      isDownloaderDebugLoggingError ||
                      updateDownloaderDebugLoggingMutation.isPending
                    }
                    onCheckedChange={(checked) =>
                      updateDownloaderDebugLoggingMutation.mutate(checked)
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account-security" className="space-y-6">
            <PasswordSettings />

            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">
                    <InterfaceText source={"SSL/HTTPS Configuration"} />
                  </CardTitle>
                </div>
                <CardDescription>
                  <InterfaceText
                    source={
                      "Configure secure access to QuestarrNG. Requires server restart to apply changes."
                    }
                  />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {sslSettings && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="ssl-enabled" className="text-sm font-medium">
                          <InterfaceText source={"Enable SSL"} />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          <InterfaceText source={"Turn on HTTPS support"} />
                        </p>
                      </div>
                      <Switch
                        id="ssl-enabled"
                        checked={sslEnabled}
                        onCheckedChange={setSslEnabled}
                      />
                    </div>

                    {sslEnabled && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="ssl-port">
                            <InterfaceText source={"SSL Port"} />
                          </Label>
                          <Input
                            id="ssl-port"
                            type="number"
                            value={sslPort}
                            disabled
                            className="w-32 bg-muted"
                          />
                          <p className="text-xs text-muted-foreground">
                            <InterfaceText
                              source={
                                "Configured via SSL_PORT environment variable (e.g., in docker-compose.yml) - Default: 9898"
                              }
                            />
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="cert-path">
                            <InterfaceText source={"Certificate Path (.crt/.pem)"} />
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="cert-path"
                              value={sslCertPath}
                              onChange={(e) => setSslCertPath(e.target.value)}
                              placeholder="/path/to/server.crt"
                            />
                            <Button variant="outline" onClick={() => setIsCertBrowserOpen(true)}>
                              <InterfaceText source={"Browse"} />
                            </Button>
                          </div>
                          <PathBrowser
                            isOpen={isCertBrowserOpen}
                            onClose={() => setIsCertBrowserOpen(false)}
                            onSelect={(path) => setSslCertPath(path)}
                            initialPath={sslCertPath}
                            title="Select Certificate File"
                            extensions={[".crt", ".pem", ".cer"]}
                            data-i18n-title={"Select Certificate File"}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="key-path">
                            <InterfaceText source={"Private Key Path (.key)"} />
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="key-path"
                              value={sslKeyPath}
                              onChange={(e) => setSslKeyPath(e.target.value)}
                              placeholder="/path/to/server.key"
                            />
                            <Button variant="outline" onClick={() => setIsKeyBrowserOpen(true)}>
                              <InterfaceText source={"Browse"} />
                            </Button>
                          </div>
                          <PathBrowser
                            isOpen={isKeyBrowserOpen}
                            onClose={() => setIsKeyBrowserOpen(false)}
                            onSelect={(path) => setSslKeyPath(path)}
                            initialPath={sslKeyPath}
                            title="Select Private Key File"
                            extensions={[".key", ".pem"]}
                            data-i18n-title={"Select Private Key File"}
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="ssl-redirect">
                                <InterfaceText source={"Force HTTPS"} />
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                <InterfaceText source={"Redirect all HTTP traffic to HTTPS"} />
                              </p>
                            </div>
                            <Switch
                              id="ssl-redirect"
                              checked={sslRedirectHttp}
                              onCheckedChange={setSslRedirectHttp}
                            />
                          </div>

                          {sslRedirectHttp && (
                            <Alert className="border-orange-500/50 bg-orange-500/10">
                              <AlertCircle className="h-4 w-4 text-orange-500" />
                              <AlertTitle>
                                <InterfaceText source={"HTTP Port Will Be Disabled"} />
                              </AlertTitle>
                              <AlertDescription>
                                <InterfaceText
                                  source={
                                    "When HTTPS redirect is enabled, the HTTP port will be disabled on the next server restart. Make sure you can access the server via HTTPS before restarting to avoid losing access."
                                  }
                                />
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>

                        <div className="pt-4 border-t">
                          <h4 className="text-sm font-medium mb-4">
                            <InterfaceText source={"Certificate Status"} />
                          </h4>

                          {certInfo ? (
                            <div className="rounded-md border bg-card text-card-foreground shadow-sm mb-6 p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-2">
                                {certInfo.valid ? (
                                  <ShieldCheck className="h-5 w-5 text-green-500" />
                                ) : (
                                  <ShieldAlert className="h-5 w-5 text-red-500" />
                                )}
                                <span className="font-semibold">
                                  {certInfo.selfSigned ? (
                                    <InterfaceText source={"Self-Signed Certificate"} />
                                  ) : (
                                    <InterfaceText source={"Valid Certificate"} />
                                  )}
                                </span>
                              </div>

                              <div className="grid gap-1 text-sm text-muted-foreground">
                                <div className="flex justify-between">
                                  <span>
                                    <InterfaceText source={"Issued To:"} />
                                  </span>
                                  <span className="font-mono text-xs">
                                    {certInfo.subject ? (
                                      certInfo.subject.split(",")[0]
                                    ) : (
                                      <InterfaceText source={"Unknown"} />
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span>
                                    <InterfaceText source={"Issued By:"} />
                                  </span>
                                  <span className="font-mono text-xs">
                                    {certInfo.issuer ? (
                                      certInfo.issuer.split(",")[0]
                                    ) : (
                                      <InterfaceText source={"Unknown"} />
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    <span>
                                      <InterfaceText source={"Valid Until:"} />
                                    </span>
                                  </div>
                                  <span>
                                    {certInfo.validTo ? (
                                      new Date(certInfo.validTo).toLocaleDateString(
                                        getRegionalLocale()
                                      )
                                    ) : (
                                      <InterfaceText source={"Unknown"} />
                                    )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground mb-4">
                              <InterfaceText source={"No valid certificate information found."} />
                            </p>
                          )}

                          <div className="space-y-4">
                            {certInfo?.selfSigned ? (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">
                                  <InterfaceText
                                    source={
                                      "You are using a self-signed certificate. You can renew it if it's expired or about to expire."
                                    }
                                  />
                                </p>
                                <Button
                                  variant="outline"
                                  onClick={() => generateCertMutation.mutate()}
                                  disabled={generateCertMutation.isPending}
                                >
                                  {generateCertMutation.isPending ? (
                                    <InterfaceText source={"Renewing..."} />
                                  ) : (
                                    <InterfaceText source={"Renew Self-Signed Certificate"} />
                                  )}
                                </Button>
                              </div>
                            ) : (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">
                                  <InterfaceText
                                    source={
                                      "Generate a self-signed certificate if you don't have one."
                                    }
                                  />
                                  <br />
                                  <span className="text-amber-500 font-semibold">
                                    <InterfaceText source={"Warning:"} />
                                  </span>{" "}
                                  <InterfaceText
                                    source={
                                      "Browsers will show a security warning for self-signed certificates."
                                    }
                                  />
                                </p>
                                <Button
                                  variant="outline"
                                  onClick={() => generateCertMutation.mutate()}
                                  disabled={
                                    generateCertMutation.isPending ||
                                    (!!certInfo && !certInfo.selfSigned)
                                  }
                                >
                                  {generateCertMutation.isPending ? (
                                    <InterfaceText source={"Generating..."} />
                                  ) : (
                                    <InterfaceText source={"Generate Self-Signed Certificate"} />
                                  )}
                                </Button>
                                {!!certInfo && !certInfo.selfSigned && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    <InterfaceText
                                      source={
                                        "Certificate generation disabled because a non-self-signed certificate is detected."
                                      }
                                    />
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="pt-4 border-t space-y-4">
                          <h4 className="text-sm font-medium">
                            <InterfaceText source={"Upload Certificate"} />
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="cert-upload">
                                <InterfaceText source={"Certificate File (.crt/.pem)"} />
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  id="cert-upload"
                                  type="file"
                                  accept=".crt,.pem,.cer"
                                  className="hidden"
                                  ref={certInputRef}
                                  onChange={(e) => setSelectedCert(e.target.files?.[0] || null)}
                                />
                                <Label
                                  htmlFor="cert-upload"
                                  className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${selectedCert ? "text-primary border-primary" : "text-muted-foreground"}`}
                                >
                                  <Upload className="mr-2 h-4 w-4" />
                                  {selectedCert ? (
                                    selectedCert.name
                                  ) : (
                                    <InterfaceText source={"Select Certificate File"} />
                                  )}
                                </Label>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="key-upload">
                                <InterfaceText source={"Private Key File (.key/.pem)"} />
                              </Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  id="key-upload"
                                  type="file"
                                  accept=".key,.pem"
                                  className="hidden"
                                  ref={keyInputRef}
                                  onChange={(e) => setSelectedKey(e.target.files?.[0] || null)}
                                />
                                <Label
                                  htmlFor="key-upload"
                                  className={`flex h-10 w-full cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${selectedKey ? "text-primary border-primary" : "text-muted-foreground"}`}
                                >
                                  <Upload className="mr-2 h-4 w-4" />
                                  {selectedKey ? (
                                    selectedKey.name
                                  ) : (
                                    <InterfaceText source={"Select Private Key File"} />
                                  )}
                                </Label>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() => uploadCertMutation.mutate()}
                            disabled={!selectedCert || !selectedKey || uploadCertMutation.isPending}
                          >
                            {uploadCertMutation.isPending ? (
                              <InterfaceText source={"Uploading..."} />
                            ) : (
                              <InterfaceText source={"Upload Certificate & Key"} />
                            )}
                          </Button>
                        </div>
                      </>
                    )}

                    <div className="flex justify-end pt-4 border-t">
                      <Button onClick={handleSaveSsl} disabled={updateSslMutation.isPending}>
                        {updateSslMutation.isPending ? (
                          "Saving..."
                        ) : (
                          <InterfaceText source={"Save SSL Settings"} />
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
