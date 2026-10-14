import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiFetch, throwIfResNotOk, queryClient } from "@/lib/queryClient";
import { asZodType, cn, compareEnabledPriorityName } from "@/lib/utils";
import {
  getInterfaceCollator,
  useInterfaceLanguage,
  formatInterfaceMessage,
} from "@/lib/interface-locale";
import { Plus, Edit, Trash2, Check, X, Activity, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RequiredFormLabel } from "@/components/ui/required-form-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertDownloaderSchema, type Downloader, type InsertDownloader } from "@shared/schema";
import { isUsenetDownloaderType } from "@shared/downloader-types";
import { parseJsonObject } from "@shared/json-object-utils";
import { useToast } from "@/hooks/use-toast";
import { getDownloadTypeColor } from "@/lib/downloads-utils";
import PageHeader from "@/components/PageHeader";
import { InterfaceText } from "@/components/InterfaceText";

const downloaderTypes = [
  { value: "transmission", label: "Transmission", protocol: "torrent" },
  { value: "rtorrent", label: "rTorrent", protocol: "torrent" },
  { value: "qbittorrent", label: "qBittorrent", protocol: "torrent" },
  { value: "synology", label: "Synology Download Station", protocol: "torrent" },
  { value: "deluge", label: "Deluge", protocol: "torrent" },
  { value: "realdebrid", label: "Real-Debrid", protocol: "torrent" },
  { value: "sabnzbd", label: "SABnzbd", protocol: "usenet" },
  { value: "nzbget", label: "NZBGet", protocol: "usenet" },
] as const;

function isUsenetDownloader(type: string): boolean {
  return isUsenetDownloaderType(type);
}

function getDefaultDownloaderPort(type: string, useSsl: boolean): number | undefined {
  switch (type) {
    case "qbittorrent":
      return 8080;
    case "transmission":
      return 9091;
    case "sabnzbd":
      return 8080;
    case "nzbget":
      return 6789;
    case "synology":
      return useSsl ? 5001 : 5000;
    case "deluge":
      return 8112;
    default:
      return undefined;
  }
}

function getDownloaderPortPlaceholder(type: string, useSsl: boolean): string {
  const defaultPort = getDefaultDownloaderPort(type, useSsl);
  return defaultPort ? String(defaultPort) : "80 or 443";
}

function parseIntegerInput(value: string): number | undefined {
  if (value.trim() === "") {
    return undefined;
  }

  const parsedValue = Number.parseInt(value, 10);
  return Number.isNaN(parsedValue) ? undefined : parsedValue;
}

/**
 * Parses a priority input and uses a fallback when the value is invalid or empty.
 *
 * @param value - The priority input to parse
 * @param fallback - The value to use when parsing fails
 * @returns The parsed integer or the fallback value
 */
function parsePriorityInput(value: string, fallback: number): number {
  const parsedValue = parseIntegerInput(value);
  return parsedValue ?? fallback;
}

// SABnzbd's default archive password lives in the free-form per-type `settings`
// JSON blob, alongside qBittorrent's `initialState`. Kept as pure functions so
/**
 * Reads the archive password from serialized downloader settings.
 *
 * @param settingsJson - The serialized settings object.
 * @returns The archive password, or an empty string when none is configured.
 */

export function getArchivePasswordFromSettings(settingsJson: string | undefined | null): string {
  const settings = parseJsonObject(settingsJson);
  return typeof settings.archivePassword === "string" ? settings.archivePassword : "";
}

/**
 * Updates the archive password in serialized downloader settings.
 *
 * @param settingsJson - The serialized settings to update.
 * @param password - The archive password to store; an empty value removes it.
 * @returns The updated settings serialized as JSON.
 */
export function setArchivePasswordInSettings(
  settingsJson: string | undefined | null,
  password: string
): string {
  const settings = parseJsonObject(settingsJson);
  if (password) {
    settings.archivePassword = password;
  } else {
    delete settings.archivePassword;
  }
  return JSON.stringify(settings);
}

interface ArchivePasswordFieldProps {
  readonly form: UseFormReturn<InsertDownloader>;
}

/**
 * Renders an optional archive-password field for a downloader form.
 *
 * @param form - The downloader form whose serialized settings contain the archive password
 * @returns The archive-password form field and its explanatory description
 */
export function ArchivePasswordField({ form }: ArchivePasswordFieldProps) {
  return (
    <FormItem>
      <FormLabel>
        <InterfaceText source={"Default Archive Password (Optional)"} />
      </FormLabel>
      <FormControl>
        <Input
          type="password"
          placeholder="e.g. 404"
          value={getArchivePasswordFromSettings(form.watch("settings"))}
          onChange={(e) => {
            form.setValue(
              "settings",
              setArchivePasswordInSettings(form.getValues("settings"), e.target.value)
            );
          }}
          data-testid="input-downloader-archive-password"
          data-i18n-placeholder={"e.g. 404"}
        />
      </FormControl>
      <FormDescription className="text-xs">
        <InterfaceText
          source={
            "Applied automatically to every download sent to this client. Some indexers (e.g. G4U) ship releases as password-protected archives — SABnzbd and NZBGet will use this to unpack them. You can still override it per-download in the search dialog."
          }
        />
      </FormDescription>
    </FormItem>
  );
}

/**
 * Provides an editable priority control constrained to values from 1 through 100.
 *
 * @param id - Identifier of the downloader whose priority is being edited
 * @param priority - Current downloader priority
 * @param onSave - Callback invoked when the priority changes
 */
function PriorityControl({
  id,
  priority,
  onSave,
}: {
  id: string;
  priority: number;
  onSave: (id: string, priority: number) => void;
}) {
  const [value, setValue] = useState(priority);

  useEffect(() => {
    setValue(priority);
  }, [priority]);

  const save = (next: number) => {
    const clamped = Math.max(1, Math.min(100, next));
    if (clamped !== priority) onSave(id, clamped);
    setValue(clamped);
  };

  return (
    <div className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold">
      <span className="text-muted-foreground">
        <InterfaceText source={"Priority"} />
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground w-3.5 text-center leading-none"
        onClick={() => save(value - 1)}
        aria-label="Decrease priority"
        data-i18n-aria-label={"Decrease priority"}
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={100}
        value={value}
        onChange={(e) => setValue(parsePriorityInput(e.target.value, 1))}
        onBlur={(e) => save(parsePriorityInput(e.target.value, 1))}
        onKeyDown={(e) => e.key === "Enter" && save(value)}
        className="w-7 bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        aria-label="Priority value"
        data-i18n-aria-label={"Priority value"}
      />
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground w-3.5 text-center leading-none"
        onClick={() => save(value + 1)}
        aria-label="Increase priority"
        data-i18n-aria-label={"Increase priority"}
      >
        +
      </button>
    </div>
  );
}

/**
 * Manages configured downloader clients, including creation, editing, deletion, status changes, priority updates, and connection testing.
 */
export default function DownloadersPage() {
  const { language: interfaceLanguage } = useInterfaceLanguage();
  const nameCollator = useMemo(() => getInterfaceCollator(interfaceLanguage), [interfaceLanguage]);
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDownloader, setEditingDownloader] = useState<Downloader | null>(null);
  const [testingDownloaderId, setTestingDownloaderId] = useState<string | null>(null);
  const [realDebridAuth, setRealDebridAuth] = useState<{
    downloaderId: string;
    handle: string;
    userCode: string;
    verificationUrl: string;
    intervalSeconds: number;
  } | null>(null);
  const [connectedRealDebridId, setConnectedRealDebridId] = useState<string | null>(null);

  const { data: downloaders = [], isLoading } = useQuery<Downloader[]>({
    queryKey: ["/api/downloaders"],
  });

  const sortedActiveDownloaders = useMemo(() => {
    return [...downloaders].sort((a, b) => compareEnabledPriorityName(a, b, nameCollator));
  }, [downloaders, nameCollator]);

  const addMutation = useMutation({
    mutationFn: async (data: InsertDownloader) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await apiFetch("/api/downloaders", {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });
      await throwIfResNotOk(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downloaders"] });
      setIsDialogOpen(false);
      setEditingDownloader(null);
      toast({ title: "Downloader added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add downloader", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertDownloader> }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await apiFetch(`/api/downloaders/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(data),
      });
      await throwIfResNotOk(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downloaders"] });
      setIsDialogOpen(false);
      setEditingDownloader(null);
      toast({ title: "Downloader updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update downloader", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiFetch(`/api/downloaders/${id}`, {
        method: "DELETE",
      });
      await throwIfResNotOk(response);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downloaders"] });
      toast({ title: "Downloader deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete downloader", variant: "destructive" });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await apiFetch(`/api/downloaders/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled }),
      });
      await throwIfResNotOk(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downloaders"] });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: number }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const response = await apiFetch(`/api/downloaders/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ priority }),
      });
      await throwIfResNotOk(response);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/downloaders"] });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (data: { id?: string; formData?: InsertDownloader }) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (data.id) {
        // Test existing downloader by ID
        const response = await apiFetch(`/api/downloaders/${data.id}/test`, {
          method: "POST",
          headers,
        });
        await throwIfResNotOk(response);
        return response.json() as Promise<{ success: boolean; message: string }>;
      } else if (data.formData) {
        // Test with form data (new downloader)
        const response = await apiFetch(`/api/downloaders/test`, {
          method: "POST",
          headers,
          body: JSON.stringify(data.formData),
        });
        await throwIfResNotOk(response);
        return response.json() as Promise<{ success: boolean; message: string }>;
      } else {
        throw new Error("Either id or formData must be provided");
      }
    },
    onMutate: (data) => {
      setTestingDownloaderId(data.id || "new");
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error) => {
      toast({
        title: "Test failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setTestingDownloaderId(null);
    },
  });

  const startRealDebridAuthMutation = useMutation({
    mutationFn: async (downloaderId: string) => {
      const response = await apiFetch(`/api/downloaders/${downloaderId}/realdebrid/auth/start`, {
        method: "POST",
      });
      await throwIfResNotOk(response);
      const body = await response.json();
      return { downloaderId, ...body } as {
        downloaderId: string;
        handle: string;
        userCode: string;
        verificationUrl: string;
        intervalSeconds: number;
      };
    },
    onSuccess: setRealDebridAuth,
    onError: (error) => {
      toast({
        title: "Could not link Real-Debrid",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!realDebridAuth) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await apiFetch(
          `/api/downloaders/${realDebridAuth.downloaderId}/realdebrid/auth/poll`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle: realDebridAuth.handle }),
          }
        );
        await throwIfResNotOk(response);
        const body = await response.json();
        if (cancelled) return;
        if (body.status === "connected") {
          setConnectedRealDebridId(realDebridAuth.downloaderId);
          setRealDebridAuth(null);
          queryClient.invalidateQueries({ queryKey: ["/api/downloaders"] });
          toast({
            title: "Real-Debrid connected",
            description: "The account is ready for downloads.",
          });
          return;
        }
        const waitSeconds = Math.max(realDebridAuth.intervalSeconds, Number(body.waitSeconds) || 0);
        timer = setTimeout(poll, waitSeconds * 1000);
      } catch (error) {
        if (cancelled) return;
        setRealDebridAuth(null);
        toast({
          title: "Real-Debrid account linking stopped",
          description: error instanceof Error ? error.message : "Start the connection again.",
          variant: "destructive",
        });
      }
    };
    timer = setTimeout(poll, realDebridAuth.intervalSeconds * 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [realDebridAuth, toast]);

  const form = useForm<InsertDownloader>({
    resolver: zodResolver(asZodType<InsertDownloader>(insertDownloaderSchema)),
    defaultValues: {
      name: "",
      type: "transmission",
      url: "",
      port: undefined,
      useSsl: false,
      urlPath: "",
      username: "",
      password: "",
      enabled: true,
      priority: 1,
      downloadPath: "",
      category: "games",
      addStopped: false,
      removeCompleted: false,
      postImportCategory: "",
      settings: "",
      allowSelfSignedCertificate: false,
      allowInsecureLan: false,
    },
  });
  const isRealDebrid = form.watch("type") === "realdebrid";
  const isRealDebridConnected = Boolean(
    (editingDownloader?.type === "realdebrid" && editingDownloader.password) ||
    (editingDownloader && connectedRealDebridId === editingDownloader.id)
  );
  const activeRealDebridAuth =
    realDebridAuth && realDebridAuth.downloaderId === editingDownloader?.id ? realDebridAuth : null;

  const onSubmit = (data: InsertDownloader) => {
    if (editingDownloader) {
      updateMutation.mutate({ id: editingDownloader.id, data });
    } else {
      addMutation.mutate(data);
    }
  };

  const handleEdit = (downloader: Downloader) => {
    setEditingDownloader(downloader);
    setRealDebridAuth(null);
    form.reset({
      name: downloader.name,
      type: downloader.type,
      url: downloader.url,
      port: downloader.port ?? undefined,
      useSsl: downloader.useSsl ?? false,
      urlPath: downloader.urlPath ?? "",
      username: downloader.username ?? "",
      password: downloader.password ?? "",
      enabled: downloader.enabled,
      priority: downloader.priority,
      downloadPath: downloader.downloadPath ?? "",
      category: downloader.category ?? "games",
      addStopped: downloader.addStopped ?? false,
      removeCompleted: downloader.removeCompleted ?? false,
      postImportCategory: downloader.postImportCategory ?? "",
      settings: downloader.settings ?? "",
      allowSelfSignedCertificate: downloader.allowSelfSignedCertificate ?? false,
      allowInsecureLan: downloader.allowInsecureLan ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingDownloader(null);
    setRealDebridAuth(null);
    form.reset({
      name: "",
      type: "transmission",
      url: "",
      port: undefined,
      useSsl: false,
      urlPath: "",
      username: "",
      password: "",
      enabled: true,
      priority: 1,
      downloadPath: "",
      category: "games",
      addStopped: false,
      removeCompleted: false,
      postImportCategory: "",
      settings: "",
      allowSelfSignedCertificate: false,
      allowInsecureLan: false,
    });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto p-4 md:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 sm:h-9 sm:w-36" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-4 rounded-lg border bg-card p-4 md:p-6">
            <div className="flex justify-between items-start gap-3">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-32" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-11 w-11 md:h-9 md:w-9" />
                <Skeleton className="h-11 w-11 md:h-9 md:w-9" />
                <Skeleton className="h-11 w-11 md:h-9 md:w-9" />
                <Skeleton className="h-11 w-11 md:h-9 md:w-9" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <PageHeader
        title="Downloaders"
        data-i18n-title={"Downloaders"}
        description="Manage download clients for automated downloads. Downloads use priority order with automatic fallback; Real-Debrid files are copied back to QuestarrNG before import."
        actions={
          <Button
            className="h-10 justify-center sm:h-9"
            onClick={handleAdd}
            data-testid="button-add-downloader"
          >
            <Plus className="h-4 w-4 mr-2" />
            <InterfaceText source={"Add Downloader"} />
          </Button>
        }
      />

      <div className="grid gap-4">
        {sortedActiveDownloaders.length > 0 ? (
          sortedActiveDownloaders.map((downloader: Downloader) => (
            <Card
              key={downloader.id}
              className={cn(!downloader.enabled && "bg-muted/30")}
              data-testid={`card-downloader-${downloader.id}`}
            >
              <CardHeader className="space-y-2">
                {/* Row 1: name + action buttons */}
                <div className="flex items-center justify-between gap-3">
                  <CardTitle
                    className={cn(
                      "min-w-0 truncate text-base md:text-lg",
                      !downloader.enabled && "text-muted-foreground"
                    )}
                  >
                    {downloader.name}
                  </CardTitle>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => testConnectionMutation.mutate({ id: downloader.id })}
                      disabled={testingDownloaderId === downloader.id}
                      title="Test connection"
                      aria-label={formatInterfaceMessage("Test connection for {name}", {
                        name: String(downloader.name ?? ""),
                      })}
                      className="h-11 w-11 md:h-9 md:w-9"
                      data-testid={`button-test-downloader-${downloader.id}`}
                      data-i18n-title={"Test connection"}
                    >
                      <Activity className="h-4 w-4" />
                    </Button>
                    <Switch
                      checked={downloader.enabled}
                      onCheckedChange={(enabled) =>
                        toggleEnabledMutation.mutate({ id: downloader.id, enabled })
                      }
                      data-testid={`switch-downloader-enabled-${downloader.id}`}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(downloader)}
                      aria-label={formatInterfaceMessage("Edit {name}", {
                        name: String(downloader.name ?? ""),
                      })}
                      className="h-11 w-11 md:h-9 md:w-9"
                      data-testid={`button-edit-downloader-${downloader.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => deleteMutation.mutate(downloader.id)}
                      aria-label={formatInterfaceMessage("Delete {name}", {
                        name: String(downloader.name ?? ""),
                      })}
                      className="h-11 w-11 md:h-9 md:w-9"
                      data-testid={`button-delete-downloader-${downloader.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* Row 2: type / protocol / status / priority */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="capitalize">
                    {downloaderTypes.find((type) => type.value === downloader.type)?.label ??
                      downloader.type}
                  </Badge>
                  <Badge
                    className={`text-xs border-none ${getDownloadTypeColor(isUsenetDownloader(downloader.type) ? "usenet" : "torrent")}`}
                  >
                    {isUsenetDownloader(downloader.type) ? (
                      <InterfaceText source={"USENET"} />
                    ) : (
                      <InterfaceText source={"TORRENT"} />
                    )}
                  </Badge>
                  <Badge
                    variant={downloader.enabled ? "default" : "secondary"}
                    data-testid={`status-downloader-${downloader.id}`}
                  >
                    {downloader.enabled ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        <InterfaceText source={"Enabled"} />
                      </>
                    ) : (
                      <>
                        <X className="h-3 w-3 mr-1" />
                        <InterfaceText source={"Disabled"} />
                      </>
                    )}
                  </Badge>
                  {downloader.type === "realdebrid" && (
                    <Badge variant={downloader.password ? "default" : "outline"}>
                      {downloader.password ? (
                        <InterfaceText source={"Account linked"} />
                      ) : (
                        <InterfaceText source={"Account needs linking"} />
                      )}
                    </Badge>
                  )}
                  <PriorityControl
                    id={downloader.id}
                    priority={downloader.priority}
                    onSave={(id, priority) => updatePriorityMutation.mutate({ id, priority })}
                  />
                </div>
                {/* Row 3: URL */}
                <p
                  className={cn(
                    "truncate text-sm text-muted-foreground",
                    !downloader.enabled && "opacity-60"
                  )}
                >
                  {downloader.type === "realdebrid" ? (
                    <InterfaceText
                      source={"Local staging: {value}"}
                      values={{
                        value: String((downloader.downloadPath || "not configured") ?? ""),
                      }}
                    />
                  ) : (
                    downloader.url
                  )}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {!isUsenetDownloader(downloader.type) &&
                    downloader.type !== "realdebrid" &&
                    downloader.downloadPath && (
                      <Badge variant="outline">
                        <InterfaceText source={"Path:"} /> {downloader.downloadPath}
                      </Badge>
                    )}
                  {downloader.category && (
                    <Badge variant="outline">
                      <InterfaceText source={"Category:"} /> {downloader.category}
                    </Badge>
                  )}
                  {downloader.username && (
                    <Badge variant="outline">
                      <InterfaceText source={"Authenticated"} />
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                <InterfaceText source={"No Downloaders Configured"} />
              </CardTitle>
              <CardDescription>
                <InterfaceText
                  source={
                    "Add your first downloader client to enable automated downloads. Supported clients include Transmission, rTorrent, qBittorrent, Synology Download Station, Real-Debrid, SABnzbd, and NZBGet."
                  }
                />
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleAdd} data-testid="button-add-downloader-empty">
                <InterfaceText source={"Add Downloader"} />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setRealDebridAuth(null);
        }}
      >
        <DialogContent className="w-full md:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingDownloader ? (
                <InterfaceText source={"Edit Downloader"} />
              ) : (
                <InterfaceText source={"Add Downloader"} />
              )}
            </DialogTitle>
            <DialogDescription>
              {isRealDebrid ? (
                <InterfaceText
                  source={
                    "Link Real-Debrid with its account authorization flow, then choose a local path for QuestarrNG to stage completed files."
                  }
                />
              ) : (
                <InterfaceText
                  source={"Configure a torrent or Usenet client for automated game downloads."}
                />
              )}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4 overflow-hidden"
            >
              <div className="overflow-y-auto px-1 space-y-3 max-h-[calc(90vh-12rem)]">
                <p className="text-sm text-muted-foreground">
                  <InterfaceText source={"Fields marked * are required."} />
                </p>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredFormLabel required>
                        <InterfaceText source={"Name"} />
                      </RequiredFormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            downloaderTypes.find((t) => t.value === form.watch("type"))?.label ??
                            "Downloader"
                          }
                          required
                          {...field}
                          data-testid="input-downloader-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <RequiredFormLabel required>
                        <InterfaceText source={"Type"} />
                      </RequiredFormLabel>
                      <Select
                        onValueChange={(nextType) => {
                          const previousType = field.value;
                          const useSsl = !!form.getValues("useSsl");
                          const currentPort = form.getValues("port");
                          const previousDefaultPort = getDefaultDownloaderPort(
                            previousType,
                            useSsl
                          );
                          const nextDefaultPort = getDefaultDownloaderPort(nextType, useSsl);

                          field.onChange(nextType);

                          if (nextType === "realdebrid") {
                            form.setValue("url", "https://api.real-debrid.com/rest/1.0");
                            form.setValue("port", undefined);
                            form.setValue("useSsl", true);
                            form.setValue("urlPath", "");
                            form.setValue("username", "");
                            form.setValue("password", "");
                            form.setValue("allowInsecureLan", false);
                            form.setValue("category", "Questarr");
                          } else if (previousType === "realdebrid") {
                            form.setValue("url", "");
                            form.setValue("useSsl", false);
                          }

                          if (
                            nextDefaultPort !== undefined &&
                            (currentPort == null || currentPort === previousDefaultPort)
                          ) {
                            form.setValue("port", nextDefaultPort);
                          }

                          // Only SABnzbd reads this flag. Clear it when
                          // switching away from SABnzbd so it can't
                          // silently carry a stale "true" into a saved
                          // record for another downloader type, or
                          // reappear pre-checked if the user switches back
                          // to SABnzbd without re-confirming it.
                          if (
                            nextType !== "sabnzbd" &&
                            form.getValues("allowSelfSignedCertificate")
                          ) {
                            form.setValue("allowSelfSignedCertificate", false);
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger aria-required="true" data-testid="select-downloader-type">
                            <SelectValue
                              placeholder="Select client type"
                              data-i18n-placeholder={"Select client type"}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {downloaderTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem className={cn(isRealDebrid && "hidden")}>
                      <RequiredFormLabel required={!isRealDebrid}>
                        <InterfaceText source={"Host"} />
                      </RequiredFormLabel>
                      <FormControl>
                        <Input
                          placeholder="http://localhost or https://192.168.1.100"
                          required={!isRealDebrid}
                          {...field}
                          data-testid="input-downloader-url"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <>
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem className={cn(isRealDebrid && "hidden")}>
                        <FormLabel>
                          <InterfaceText source={"Port"} />
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder={getDownloaderPortPlaceholder(
                              form.watch("type"),
                              !!form.watch("useSsl")
                            )}
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(parseIntegerInput(e.target.value))}
                            data-testid="input-downloader-port"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="useSsl"
                    render={({ field }) => (
                      <FormItem
                        className={cn(
                          "flex flex-row items-center justify-between rounded-lg border p-2",
                          isRealDebrid && "hidden"
                        )}
                      >
                        <div className="space-y-0">
                          <FormLabel className="text-sm">
                            <InterfaceText source={"Use SSL"} />
                          </FormLabel>
                          <FormDescription className="text-xs">
                            {form.watch("type") === "qbittorrent" ? (
                              <InterfaceText
                                source={
                                  "See Options → Web UI → 'Use HTTPS instead of HTTP' in qBittorrent"
                                }
                              />
                            ) : form.watch("type") === "transmission" ? (
                              "Enable HTTPS (see Settings → Web in Transmission)"
                            ) : form.watch("type") === "synology" ? (
                              "DSM 7 commonly uses HTTPS on port 5001"
                            ) : form.watch("type") === "sabnzbd" ? (
                              "Enable HTTPS in SABnzbd (Config → General)"
                            ) : form.watch("type") === "nzbget" ? (
                              "Enable HTTPS in NZBGet (Settings → Security)"
                            ) : (
                              "Enable HTTPS"
                            )}
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Checkbox
                            checked={!!field.value}
                            onCheckedChange={(checked) => {
                              const nextUseSsl = !!checked;
                              const type = form.getValues("type");
                              const currentPort = form.getValues("port");
                              const previousDefaultPort = getDefaultDownloaderPort(
                                type,
                                !nextUseSsl
                              );
                              const nextDefaultPort = getDefaultDownloaderPort(type, nextUseSsl);

                              field.onChange(checked);

                              if (
                                nextDefaultPort !== undefined &&
                                (currentPort == null || currentPort === previousDefaultPort)
                              ) {
                                form.setValue("port", nextDefaultPort);
                              }

                              // Enabling SSL makes the insecure-LAN opt-in irrelevant — clear it
                              // so it can't carry a stale true into a saved record.
                              if (nextUseSsl) {
                                form.setValue("allowInsecureLan", false);
                              }
                            }}
                            data-testid="checkbox-downloader-usessl"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("type") === "sabnzbd" && (
                    <p className="text-xs text-muted-foreground">
                      <InterfaceText
                        source={
                          "TLS certificate checks stay enabled. To trust a private certificate authority, configure the Questarr service with"
                        }
                      />
                      <code>NODE_EXTRA_CA_CERTS</code>.
                    </p>
                  )}
                  {!form.watch("useSsl") && (
                    <FormField
                      control={form.control}
                      name="allowInsecureLan"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border border-amber-600/50 bg-amber-950/20 p-2">
                          <div className="space-y-0">
                            <FormLabel className="text-sm text-amber-400">
                              <InterfaceText source={"Allow insecure LAN"} />
                            </FormLabel>
                            <FormDescription className="text-xs">
                              <InterfaceText
                                source={
                                  "Permits sending passwords and API keys over plain HTTP. Only enable this if the downloader is on a trusted LAN without TLS support and you accept the risk of credentials being intercepted."
                                }
                              />
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Checkbox
                              checked={!!field.value}
                              onCheckedChange={(checked) => field.onChange(!!checked)}
                              data-testid="checkbox-downloader-allow-insecure-lan"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                </>
                <FormField
                  control={form.control}
                  name="urlPath"
                  render={({ field }) => (
                    <FormItem className={cn(isRealDebrid && "hidden")}>
                      <FormLabel>
                        <InterfaceText source={"URL Path (Optional)"} />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            form.watch("type") === "rtorrent"
                              ? "RPC2"
                              : form.watch("type") === "sabnzbd"
                                ? "sabnzbd"
                                : form.watch("type") === "synology"
                                  ? "downloadstation"
                                  : ""
                          }
                          {...field}
                          value={field.value || ""}
                          data-testid="input-downloader-urlpath"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        <InterfaceText
                          source={'Base path or endpoint (e.g. "/sabnzbd" for reverse proxy)'}
                        />
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem className={cn(isRealDebrid && "hidden")}>
                      <RequiredFormLabel
                        required={
                          form.watch("type") === "sabnzbd" || form.watch("type") === "synology"
                        }
                      >
                        {form.watch("type") === "sabnzbd" ? (
                          <InterfaceText source={"API Key"} />
                        ) : form.watch("type") === "qbittorrent" ||
                          form.watch("type") === "transmission" ||
                          form.watch("type") === "nzbget" ||
                          form.watch("type") === "synology" ? (
                          "Username"
                        ) : (
                          "Username (Optional)"
                        )}
                      </RequiredFormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            form.watch("type") === "sabnzbd"
                              ? "Enter SABnzbd API key"
                              : "Enter username"
                          }
                          required={
                            form.watch("type") === "sabnzbd" || form.watch("type") === "synology"
                          }
                          {...field}
                          value={field.value || ""}
                          data-testid="input-downloader-username"
                        />
                      </FormControl>
                      {form.watch("type") === "sabnzbd" && (
                        <FormDescription className="text-xs">
                          <InterfaceText
                            source={"Required. Found in SABnzbd Config → General → API Key."}
                          />
                        </FormDescription>
                      )}
                      {(form.watch("type") === "qbittorrent" ||
                        form.watch("type") === "transmission" ||
                        form.watch("type") === "nzbget" ||
                        form.watch("type") === "synology") && (
                        <FormDescription className="text-xs">
                          {form.watch("type") === "synology" ? (
                            <InterfaceText source={"Required for DSM login."} />
                          ) : (
                            <InterfaceText
                              source={"Only required if this client's web UI uses authentication."}
                            />
                          )}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className={cn(isRealDebrid && "hidden")}>
                      <RequiredFormLabel
                        required={
                          form.watch("type") === "synology" ||
                          form.watch("type") === "qbittorrent" ||
                          form.watch("type") === "transmission" ||
                          form.watch("type") === "nzbget"
                        }
                      >
                        {form.watch("type") === "qbittorrent" ||
                        form.watch("type") === "transmission" ||
                        form.watch("type") === "nzbget" ||
                        form.watch("type") === "synology" ? (
                          "Password"
                        ) : (
                          <InterfaceText source={"Password (Optional)"} />
                        )}
                      </RequiredFormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter password"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-downloader-password"
                          data-i18n-placeholder={"Enter password"}
                        />
                      </FormControl>
                      {(form.watch("type") === "qbittorrent" ||
                        form.watch("type") === "transmission" ||
                        form.watch("type") === "nzbget" ||
                        form.watch("type") === "synology") && (
                        <FormDescription className="text-xs">
                          {form.watch("type") === "synology" ? (
                            <InterfaceText source={"Required for DSM login."} />
                          ) : (
                            <InterfaceText
                              source={"Only required if this client's web UI uses authentication."}
                            />
                          )}
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {!isUsenetDownloader(form.watch("type")) && (
                  <FormField
                    control={form.control}
                    name="downloadPath"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {isRealDebrid ? (
                            <InterfaceText source={"QuestarrNG Local Staging Path (Required)"} />
                          ) : (
                            "Download Path (Optional)"
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={
                              form.watch("type") === "synology"
                                ? "video/downloads"
                                : "/home/downloads/games"
                            }
                            required={isRealDebrid}
                            {...field}
                            value={field.value || ""}
                            data-testid="input-downloader-path"
                          />
                        </FormControl>
                        {isRealDebrid ? (
                          <FormDescription className="text-xs">
                            <InterfaceText
                              source={
                                "This path is on the QuestarrNG server and must be writable by its process. Real-Debrid completes downloads in the cloud; QuestarrNG copies the selected files here before importing them. A premium account may be required for torrent downloads."
                              }
                            />
                          </FormDescription>
                        ) : form.watch("type") === "synology" ? (
                          <FormDescription className="text-xs">
                            <InterfaceText
                              source={"Use a shared-folder-relative destination such as"}
                            />{" "}
                            <code>video/downloads</code>
                            <InterfaceText source={"; avoid absolute"} /> <code>/volume1/...</code>{" "}
                            <InterfaceText source={"paths."} />
                          </FormDescription>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {isRealDebrid && (
                  <div className="space-y-3 rounded-lg border border-sky-800 bg-sky-950/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          <InterfaceText source={"Real-Debrid account"} />
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {isRealDebridConnected ? (
                            <InterfaceText
                              source={
                                "Connected. Account credentials are stored encrypted by QuestarrNG."
                              }
                            />
                          ) : (
                            <InterfaceText
                              source={"Authorize QuestarrNG through Real-Debrid's device sign-in."}
                            />
                          )}
                        </p>
                      </div>
                      {editingDownloader && (
                        <Button
                          type="button"
                          variant={isRealDebridConnected ? "outline" : "default"}
                          size="sm"
                          onClick={() => startRealDebridAuthMutation.mutate(editingDownloader.id)}
                          disabled={startRealDebridAuthMutation.isPending || !!realDebridAuth}
                        >
                          {startRealDebridAuthMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ExternalLink className="mr-2 h-4 w-4" />
                          )}
                          {isRealDebridConnected ? (
                            <InterfaceText source={"Reconnect"} />
                          ) : (
                            <InterfaceText source={"Connect account"} />
                          )}
                        </Button>
                      )}
                    </div>
                    {!editingDownloader && (
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText
                          source={
                            "Save this downloader first, then open it again to link the account."
                          }
                        />
                      </p>
                    )}
                    {activeRealDebridAuth && (
                      <div className="space-y-2 rounded-md bg-background/70 p-3 text-sm">
                        <p>
                          <InterfaceText
                            source={"Open Real-Debrid and enter this one-time code:"}
                          />
                        </p>
                        <p className="font-mono text-lg font-bold tracking-widest">
                          {activeRealDebridAuth.userCode}
                        </p>
                        <a
                          className="inline-flex items-center gap-1 text-sky-300 underline"
                          href={activeRealDebridAuth.verificationUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <InterfaceText source={"Open device authorization"} />
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <p className="text-xs text-muted-foreground">
                          <InterfaceText
                            source={
                              "QuestarrNG checks for approval automatically. This code expires after about 30 minutes."
                            }
                          />
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setRealDebridAuth(null)}
                        >
                          <InterfaceText source={"Cancel account linking"} />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem className={cn(isRealDebrid && "hidden")}>
                      <FormLabel>
                        <InterfaceText source={"Category"} />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="games"
                          {...field}
                          value={field.value || ""}
                          data-testid="input-downloader-category"
                          data-i18n-placeholder={"games"}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        {form.watch("type") === "qbittorrent" ? (
                          <InterfaceText
                            source={"Adding a category avoids conflicts with unrelated downloads"}
                          />
                        ) : form.watch("type") === "transmission" ? (
                          "Creates a subdirectory in the output directory. Label for downloads in downloader"
                        ) : form.watch("type") === "synology" ? (
                          "Optional Questarr label only. Synology stores downloads by destination path."
                        ) : form.watch("type") === "sabnzbd" || form.watch("type") === "nzbget" ? (
                          "Category for NZBs in downloader (path is managed by category settings)"
                        ) : (
                          "Label for downloads in downloader"
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(form.watch("type") === "sabnzbd" || form.watch("type") === "nzbget") && (
                  <ArchivePasswordField form={form} />
                )}
                {form.watch("type") === "qbittorrent" && (
                  <FormField
                    control={form.control}
                    name="addStopped"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          <InterfaceText source={"Initial State"} />
                        </FormLabel>
                        <Select
                          onValueChange={(value) => {
                            if (value === "stopped") {
                              field.onChange(true);
                              // Store "stopped" in settings
                              const currentSettings = form.getValues("settings") || "{}";
                              const settings = JSON.parse(currentSettings);
                              settings.initialState = "stopped";
                              form.setValue("settings", JSON.stringify(settings));
                            } else if (value === "force-started") {
                              field.onChange(false);
                              // Store "force-started" in settings
                              const currentSettings = form.getValues("settings") || "{}";
                              const settings = JSON.parse(currentSettings);
                              settings.initialState = "force-started";
                              form.setValue("settings", JSON.stringify(settings));
                            } else {
                              // "started" - default
                              field.onChange(false);
                              // Remove initialState from settings
                              const currentSettings = form.getValues("settings") || "{}";
                              const settings = JSON.parse(currentSettings);
                              delete settings.initialState;
                              form.setValue("settings", JSON.stringify(settings));
                            }
                          }}
                          value={(() => {
                            try {
                              const settings = JSON.parse(form.watch("settings") || "{}");
                              return settings.initialState || (field.value ? "stopped" : "started");
                            } catch {
                              return field.value ? "stopped" : "started";
                            }
                          })()}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-initial-state">
                              <SelectValue
                                placeholder="Select initial state"
                                data-i18n-placeholder={"Select initial state"}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="started">
                              <InterfaceText source={"Started"} />
                            </SelectItem>
                            <SelectItem value="force-started">
                              <InterfaceText source={"Force started"} />
                            </SelectItem>
                            <SelectItem value="stopped">
                              <InterfaceText source={"Stopped"} />
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          <InterfaceText
                            source={"Forced downloads do not abide by seed restrictions"}
                          />
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <InterfaceText source={"Priority"} />
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          {...field}
                          onChange={(e) => field.onChange(parsePriorityInput(e.target.value, 1))}
                          data-testid="input-downloader-priority"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        <InterfaceText
                          source={"Lower = higher priority. Auto-fallback if fails."}
                        />
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(form.watch("type") === "rtorrent" || form.watch("type") === "transmission") && (
                  <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
                    <h3 className="text-sm font-semibold mb-2">
                      <InterfaceText source={"Advanced Settings"} />
                    </h3>
                    {form.watch("type") === "transmission" && (
                      <FormField
                        control={form.control}
                        name="useSsl"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2 bg-background">
                            <div className="space-y-0">
                              <FormLabel className="text-sm">
                                <InterfaceText source={"Use SSL"} />
                              </FormLabel>
                              <FormDescription className="text-xs">
                                <InterfaceText
                                  source={"Enable HTTPS (see Settings → Web in Transmission)"}
                                />
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={field.onChange}
                                data-testid="checkbox-downloader-usessl"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                    {form.watch("type") === "rtorrent" && (
                      <>
                        <FormField
                          control={form.control}
                          name="addStopped"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2 bg-background">
                              <div className="space-y-0">
                                <FormLabel className="text-sm">
                                  <InterfaceText source={"Add Stopped"} />
                                </FormLabel>
                                <FormDescription className="text-xs">
                                  <InterfaceText source={"Add downloads in paused state"} />
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Checkbox
                                  checked={!!field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-downloader-addstopped"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="removeCompleted"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-2 bg-background">
                              <div className="space-y-0">
                                <FormLabel className="text-sm">
                                  <InterfaceText source={"Remove Completed"} />
                                </FormLabel>
                                <FormDescription className="text-xs">
                                  <InterfaceText
                                    source={"Remove downloads from downloader after completion"}
                                  />
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Checkbox
                                  checked={!!field.value}
                                  onCheckedChange={field.onChange}
                                  data-testid="checkbox-downloader-removecompleted"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="postImportCategory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                <InterfaceText source={"Post-Import Category (Optional)"} />
                              </FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="completed-games"
                                  {...field}
                                  value={field.value || ""}
                                  data-testid="input-downloader-postimportcategory"
                                  data-i18n-placeholder={"completed-games"}
                                />
                              </FormControl>
                              <FormDescription className="text-xs">
                                <InterfaceText source={"Category after download completes"} />
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancel"
                >
                  <InterfaceText source={"Cancel"} />
                </Button>
                {!isRealDebrid ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const isValid = await form.trigger();
                      if (!isValid) return;
                      testConnectionMutation.mutate({ formData: form.getValues() });
                    }}
                    disabled={testingDownloaderId !== null}
                    data-testid="button-test-connection-dialog"
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    {testingDownloaderId === "new" ? (
                      <InterfaceText source={"Testing..."} />
                    ) : (
                      <InterfaceText source={"Test Connection"} />
                    )}
                  </Button>
                ) : editingDownloader && isRealDebridConnected ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testConnectionMutation.mutate({ id: editingDownloader.id })}
                    disabled={testingDownloaderId !== null}
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    {testingDownloaderId === editingDownloader.id ? (
                      <InterfaceText source={"Testing..."} />
                    ) : (
                      <InterfaceText source={"Test Connection"} />
                    )}
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  disabled={addMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-downloader"
                >
                  {addMutation.isPending || updateMutation.isPending
                    ? "Saving..."
                    : editingDownloader
                      ? "Update"
                      : "Add"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
