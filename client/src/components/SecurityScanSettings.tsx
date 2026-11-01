import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { InterfaceText } from "@/components/InterfaceText";
import { ApiErrorDescription } from "@/components/ApiErrorDescription";

const REDACTED_PLACEHOLDER = "********";

interface SecurityScanSettingsData {
  virusTotal: {
    enabled: boolean;
    apiKey: string;
    threshold: number;
    blockUnknownHashes: boolean;
  };
  clamav: {
    enabled: boolean;
    host: string;
    port: number;
  };
}

export default function SecurityScanSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<SecurityScanSettingsData>({
    queryKey: ["/api/settings/security-scan"],
  });

  const [local, setLocal] = useState<SecurityScanSettingsData | null>(null);

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: SecurityScanSettingsData) => {
      await apiRequest("POST", "/api/settings/security-scan", data);
    },
    onSuccess: () => {
      toast({
        title: <InterfaceText source="interface.settings_saved_def3ff63" />,
        description: (
          <InterfaceText source="interface.security_scan_configuration_update_8f7246b1" />
        ),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/security-scan"] });
    },
    onError: () => {
      if (settings) setLocal(settings);
      toast({
        title: <InterfaceText source="interface.save_failed_4c98b2ad" />,
        description: (
          <InterfaceText source="interface.could_not_update_security_scan_set_dd061326" />
        ),
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (provider: "virustotal" | "clamav") => {
      await apiRequest("POST", "/api/settings/security-scan/test", { provider });
    },
    onSuccess: (_data, provider) => {
      toast({
        title: <InterfaceText source="interface.test_successful_346dec55" />,
        description:
          provider === "virustotal" ? (
            <InterfaceText source="interface.virustotal_api_key_is_valid_779c8347" />
          ) : (
            <InterfaceText source="interface.successfully_connected_to_clamav_6d0986a8" />
          ),
      });
    },
    onError: (error: Error) => {
      toast({
        title: <InterfaceText source="interface.test_failed_938cf28a" />,
        description: error.message ? (
          <ApiErrorDescription error={error} fallbackSource="Unknown error" />
        ) : (
          <InterfaceText source="interface.could_not_reach_the_provider_e93d694a" />
        ),
        variant: "destructive",
      });
    },
  });

  if (isLoading || !local) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The Test buttons hit the server's saved configuration, not these local,
  // possibly-unsaved edits — disable them (rather than silently testing stale
  // values) whenever the form has diverged from what's actually persisted.
  const isDirty = !!settings && JSON.stringify(local) !== JSON.stringify(settings);
  const testDisabled = testMutation.isPending || isDirty;
  const testTitle = isDirty ? "Save your changes before testing" : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">
              <InterfaceText
                source={
                  "Scans downloads for malware before they're unpacked or moved into your library."
                }
              />
            </p>
          </div>

          <Separator />

          {/* ── VirusTotal ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  <InterfaceText source={"VirusTotal (Hash-Based)"} />
                </Label>
                <p className="text-xs text-muted-foreground">
                  <InterfaceText
                    source={
                      "Looks up the SHA-256 hash of the downloaded file against VirusTotal before import. Requires a free VirusTotal API key."
                    }
                  />
                </p>
              </div>
              <Switch
                checked={local.virusTotal.enabled}
                onCheckedChange={(c) =>
                  setLocal({ ...local, virusTotal: { ...local.virusTotal, enabled: c } })
                }
              />
            </div>

            <div
              className={
                local.virusTotal.enabled ? "space-y-4" : "space-y-4 opacity-50 pointer-events-none"
              }
            >
              <div className="space-y-1.5">
                <Label htmlFor="vt-api-key">
                  <InterfaceText source={"API Key"} />
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="vt-api-key"
                    type="password"
                    placeholder="Your VirusTotal API key"
                    value={local.virusTotal.apiKey}
                    onFocus={() => {
                      if (local.virusTotal.apiKey === REDACTED_PLACEHOLDER) {
                        setLocal({ ...local, virusTotal: { ...local.virusTotal, apiKey: "" } });
                      }
                    }}
                    onChange={(e) =>
                      setLocal({
                        ...local,
                        virusTotal: { ...local.virusTotal, apiKey: e.target.value },
                      })
                    }
                    className="flex-1"
                    data-i18n-placeholder={"Your VirusTotal API key"}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testDisabled}
                    title={testTitle}
                    onClick={() => testMutation.mutate("virustotal")}
                  >
                    <InterfaceText source={"Test"} />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vt-threshold">
                  <InterfaceText source={"Detection Threshold"} />
                </Label>
                <Input
                  id="vt-threshold"
                  type="number"
                  min={0}
                  value={local.virusTotal.threshold}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      virusTotal: {
                        ...local.virusTotal,
                        threshold: Number.parseInt(e.target.value, 10) || 0,
                      },
                    })
                  }
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  <InterfaceText
                    source={
                      "Abort the import if more than this many VirusTotal engines flag the file."
                    }
                  />
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>
                    <InterfaceText source={"Block Unknown Hashes"} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    <InterfaceText
                      source={
                        "Block files VirusTotal has never scanned before. Disabled by default so new legitimate releases aren't blocked."
                      }
                    />
                  </p>
                </div>
                <Switch
                  checked={local.virusTotal.blockUnknownHashes}
                  onCheckedChange={(c) =>
                    setLocal({
                      ...local,
                      virusTotal: { ...local.virusTotal, blockUnknownHashes: c },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── ClamAV ── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  <InterfaceText source={"Local ClamAV (Deep Scan)"} />
                </Label>
                <p className="text-xs text-muted-foreground">
                  <InterfaceText
                    source={
                      "Streams downloaded files through a ClamAV daemon for signature-based scanning."
                    }
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  <InterfaceText source="interface.downloads_clamav_cannot_fully_scan_e84e5a81" />
                </p>
              </div>
              <Switch
                checked={local.clamav.enabled}
                onCheckedChange={(c) =>
                  setLocal({ ...local, clamav: { ...local.clamav, enabled: c } })
                }
              />
            </div>

            <div
              className={
                local.clamav.enabled ? "flex gap-4" : "flex gap-4 opacity-50 pointer-events-none"
              }
            >
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="clamav-host">
                  <InterfaceText source={"Host"} />
                </Label>
                <Input
                  id="clamav-host"
                  placeholder="clamav"
                  value={local.clamav.host}
                  onChange={(e) =>
                    setLocal({ ...local, clamav: { ...local.clamav, host: e.target.value } })
                  }
                  data-i18n-placeholder={"clamav"}
                />
              </div>
              <div className="space-y-1.5 w-32">
                <Label htmlFor="clamav-port">
                  <InterfaceText source={"Port"} />
                </Label>
                <Input
                  id="clamav-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={local.clamav.port}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      clamav: {
                        ...local.clamav,
                        port: Number.parseInt(e.target.value, 10) || 3310,
                      },
                    })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={testDisabled}
                  title={testTitle}
                  onClick={() => testMutation.mutate("clamav")}
                >
                  <InterfaceText source={"Test"} />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => saveMutation.mutate(local)} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              <InterfaceText source={"Save Changes"} />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
