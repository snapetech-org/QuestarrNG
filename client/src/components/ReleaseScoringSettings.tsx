import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import type { UserSettings } from "@shared/schema";
import {
  BUILT_IN_RULES,
  DEFAULT_RELEASE_PROFILE,
  parseSavedReleaseScoringConfig,
  validateSavedReleaseScoringConfig,
  type CustomFormat,
  type FormatField,
  type FormatMatchMode,
  type ReleaseProfile,
} from "@shared/release-scoring";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { InterfaceText } from "@/components/InterfaceText";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import {
  RELEASE_FORMAT_FIELD_LABELS,
  RELEASE_FORMAT_MATCH_MODE_LABELS,
} from "@/lib/release-scoring-labels";

const FORMAT_FIELDS: FormatField[] = [
  "title",
  "group",
  "uploader",
  "category",
  "protocol",
  "indexer",
];
const MATCH_MODES: FormatMatchMode[] = ["contains", "exact", "regex"];
function termsText(terms: string[]): string {
  return terms.join("\n");
}

function parseTerms(value: string): string[] {
  return value
    .split("\n")
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function newFormat(name: string): CustomFormat {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `format-${Date.now()}`;
  return {
    id,
    name,
    specs: [{ field: "title", mode: "contains", value: "", required: false }],
    score: 25,
    hardReject: false,
    enabled: true,
  };
}

export default function ReleaseScoringSettings({
  settings,
}: Readonly<{ settings?: UserSettings | undefined }>) {
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [profile, setProfile] = useState<ReleaseProfile>(DEFAULT_RELEASE_PROFILE);
  const [formats, setFormats] = useState<CustomFormat[]>([]);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settings || initialized.current) return;
    initialized.current = true;
    setEnabled(settings.releaseScoringEnabled ?? false);
    const saved = parseSavedReleaseScoringConfig(settings.releaseScoringProfile);
    if (saved) {
      setProfile(saved.profile);
      setFormats(saved.formats);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async () => {
      const releaseScoringProfile = JSON.stringify({ profile, formats });
      if (!validateSavedReleaseScoringConfig(releaseScoringProfile)) {
        throw new Error(t("Check the scoring profile and custom format conditions before saving."));
      }
      const response = await apiRequest("PATCH", "/api/settings", {
        releaseScoringEnabled: enabled,
        releaseScoringProfile,
      });
      return response.json();
    },
    onSuccess: () => {
      setValidationMessage(null);
      toast({
        title: t("Release scoring saved"),
        description: enabled
          ? t("Manual and automatic searches will use this profile.")
          : t("Your profile is saved and scoring remains disabled."),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
    onError: (error: Error) => {
      setValidationMessage(t(error.message));
      toast({
        title: t("Could not save release scoring"),
        description: t(error.message),
        variant: "destructive",
      });
    },
  });

  const updateProfile = (patch: Partial<ReleaseProfile>) =>
    setProfile((current) => ({ ...current, ...patch }));

  const updateFormat = (id: string, patch: Partial<CustomFormat>) =>
    setFormats((current) =>
      current.map((format) => (format.id === id ? { ...format, ...patch } : format))
    );

  const updateSpec = (
    formatId: string,
    index: number,
    patch: Partial<CustomFormat["specs"][number]>
  ) =>
    setFormats((current) =>
      current.map((format) =>
        format.id === formatId
          ? {
              ...format,
              specs: format.specs.map((spec, specIndex) =>
                specIndex === index ? { ...spec, ...patch } : spec
              ),
            }
          : format
      )
    );

  const serializedProfile = JSON.stringify({ profile, formats });
  const isValid = validateSavedReleaseScoringConfig(serializedProfile);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <CardTitle className="text-lg">
              <InterfaceText source="Release Scoring" />
            </CardTitle>
            <CardDescription>
              <InterfaceText source="Rank releases by title match, quality, platform, and your own rules. Rejected releases remain visible in manual search with the reason." />
            </CardDescription>
          </div>
          <Badge variant={enabled ? "default" : "outline"}>
            {enabled ? <InterfaceText source="Enabled" /> : <InterfaceText source="Off" />}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-7">
        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="space-y-1">
            <Label htmlFor="release-scoring-enabled">
              <InterfaceText source="Use this profile" />
            </Label>
            <p className="text-xs text-muted-foreground">
              <InterfaceText source="Auto-search will only consider accepted releases while this is enabled." />
            </p>
          </div>
          <Switch id="release-scoring-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <section className="space-y-4">
          <h3 className="font-semibold">
            <InterfaceText source="Profile limits and preferences" />
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="release-min-score">
                <InterfaceText source="Minimum score" />
              </Label>
              <Input
                id="release-min-score"
                type="number"
                min={-5000}
                max={5000}
                value={profile.minScore}
                onChange={(event) => updateProfile({ minScore: Number(event.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-protocol">
                <InterfaceText source="Preferred protocol" />
              </Label>
              <select
                id="release-protocol"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={profile.protocolPreference}
                onChange={(event) =>
                  updateProfile({
                    protocolPreference: event.target.value as ReleaseProfile["protocolPreference"],
                  })
                }
              >
                <option value="either">{t("Torrent or Usenet")}</option>
                <option value="torrent">{t("Torrent")}</option>
                <option value="usenet">{t("Usenet")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-min-seeders">
                <InterfaceText source="Minimum torrent seeders" />
              </Label>
              <Input
                id="release-min-seeders"
                type="number"
                min={0}
                max={1_000_000}
                value={profile.minSeeders}
                onChange={(event) => updateProfile({ minSeeders: Number(event.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-max-size">
                <InterfaceText source="Maximum size (GiB)" />
              </Label>
              <Input
                id="release-max-size"
                type="number"
                min={0}
                step="0.1"
                value={
                  profile.maxSizeBytes == null ? "" : (profile.maxSizeBytes / 1024 ** 3).toFixed(1)
                }
                onChange={(event) => {
                  const value = Number(event.target.value);
                  updateProfile({
                    maxSizeBytes:
                      event.target.value === "" || !Number.isFinite(value)
                        ? null
                        : Math.min(
                            Number.MAX_SAFE_INTEGER,
                            Math.max(0, Math.round(value * 1024 ** 3))
                          ),
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                <InterfaceText source="Leave blank to allow any size." />
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="release-required-terms">
                <InterfaceText source="Required title terms" />
              </Label>
              <Textarea
                id="release-required-terms"
                rows={3}
                placeholder={`${t("One per line, e.g.")}\nGOG\n/\\bportable\\b/i`}
                value={termsText(profile.requiredTerms)}
                onChange={(event) =>
                  updateProfile({ requiredTerms: parseTerms(event.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release-ignored-terms">
                <InterfaceText source="Ignored title terms" />
              </Label>
              <Textarea
                id="release-ignored-terms"
                rows={3}
                placeholder={`${t("One per line, e.g.")}\ncrackfix\n/\\bmultiplayer\\b/i`}
                value={termsText(profile.ignoredTerms)}
                onChange={(event) =>
                  updateProfile({ ignoredTerms: parseTerms(event.target.value) })
                }
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <InterfaceText source="Terms are whole words. Use /pattern/ for a bounded RE2 regular expression." />
          </p>
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="font-semibold">
              <InterfaceText source="Built-in rule weights" />
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              <InterfaceText source="Locked title mismatch and sequel checks always reject their matches." />
            </p>
          </div>
          <div className="divide-y rounded-md border">
            {BUILT_IN_RULES.map((rule) => {
              const override = profile.builtInOverrides[rule.id];
              return (
                <div
                  key={rule.id}
                  className="grid items-center gap-3 p-3 sm:grid-cols-[1fr_110px_130px]"
                >
                  <div>
                    <p className="text-sm font-medium">
                      <InterfaceText source={rule.label} />
                    </p>
                    {rule.locked && (
                      <p className="text-xs text-muted-foreground">
                        <InterfaceText source="Always enforced" />
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`score-${rule.id}`} className="text-xs">
                      <InterfaceText source="Points" />
                    </Label>
                    <Input
                      id={`score-${rule.id}`}
                      type="number"
                      min={-1000}
                      max={1000}
                      value={override?.points ?? rule.points}
                      onChange={(event) =>
                        updateProfile({
                          builtInOverrides: {
                            ...profile.builtInOverrides,
                            [rule.id]: { ...override, points: Number(event.target.value) || 0 },
                          },
                        })
                      }
                    />
                  </div>
                  {!rule.locked ? (
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`enable-${rule.id}`} className="text-xs">
                        <InterfaceText source={"Enabled"} />
                      </Label>
                      <Switch
                        id={`enable-${rule.id}`}
                        checked={override?.enabled !== false}
                        onCheckedChange={(checked) =>
                          updateProfile({
                            builtInOverrides: {
                              ...profile.builtInOverrides,
                              [rule.id]: { ...override, enabled: checked },
                            },
                          })
                        }
                      />
                    </div>
                  ) : (
                    <span className="text-right text-xs text-muted-foreground">
                      <InterfaceText source="Required" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                <InterfaceText source="Custom formats" />
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                <InterfaceText source="Each format adds points when its conditions match; hard rejects exclude the release." />
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={formats.length >= 50}
              onClick={() => setFormats((current) => [...current, newFormat(t("New format"))])}
            >
              <Plus className="mr-2 h-4 w-4" /> <InterfaceText source="Add format" />
            </Button>
          </div>
          {formats.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              <InterfaceText source="No custom formats yet." />
            </p>
          ) : (
            <div className="space-y-3">
              {formats.map((format) => (
                <div key={format.id} className="space-y-4 rounded-md border p-4">
                  <div className="grid items-end gap-3 sm:grid-cols-[1fr_120px_auto_auto_auto]">
                    <div className="space-y-2">
                      <Label htmlFor={`format-name-${format.id}`}>
                        <InterfaceText source={"Name"} />
                      </Label>
                      <Input
                        id={`format-name-${format.id}`}
                        maxLength={100}
                        value={format.name}
                        onChange={(event) => updateFormat(format.id, { name: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`format-score-${format.id}`}>
                        <InterfaceText source="Points" />
                      </Label>
                      <Input
                        id={`format-score-${format.id}`}
                        type="number"
                        min={-1000}
                        max={1000}
                        value={format.score}
                        onChange={(event) =>
                          updateFormat(format.id, { score: Number(event.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                      <Label htmlFor={`format-enabled-${format.id}`}>
                        <InterfaceText source={"Enabled"} />
                      </Label>
                      <Switch
                        id={`format-enabled-${format.id}`}
                        checked={format.enabled}
                        onCheckedChange={(checked) => updateFormat(format.id, { enabled: checked })}
                      />
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                      <Label htmlFor={`format-reject-${format.id}`}>
                        <InterfaceText source="Hard reject" />
                      </Label>
                      <Switch
                        id={`format-reject-${format.id}`}
                        checked={format.hardReject}
                        onCheckedChange={(checked) =>
                          updateFormat(format.id, { hardReject: checked })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={formatInterfaceMessage(
                        "Remove {name}",
                        { name: format.name || t("Custom format") },
                        language
                      )}
                      lang={languageFor("Remove {name}")}
                      dir={directionFor("Remove {name}")}
                      onClick={() =>
                        setFormats((current) => current.filter((item) => item.id !== format.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {format.specs.map((spec, index) => (
                      <div
                        key={`${format.id}-spec-${index}`}
                        className="grid items-end gap-2 sm:grid-cols-[140px_120px_1fr_auto_auto_auto]"
                      >
                        <div className="space-y-1">
                          <Label htmlFor={`${format.id}-field-${index}`} className="text-xs">
                            <InterfaceText source="Field" />
                          </Label>
                          <select
                            id={`${format.id}-field-${index}`}
                            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={spec.field}
                            onChange={(event) =>
                              updateSpec(format.id, index, {
                                field: event.target.value as FormatField,
                              })
                            }
                          >
                            {FORMAT_FIELDS.map((field) => (
                              <option key={field} value={field}>
                                {t(RELEASE_FORMAT_FIELD_LABELS[field])}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${format.id}-mode-${index}`} className="text-xs">
                            <InterfaceText source="Match" />
                          </Label>
                          <select
                            id={`${format.id}-mode-${index}`}
                            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={spec.mode}
                            onChange={(event) =>
                              updateSpec(format.id, index, {
                                mode: event.target.value as FormatMatchMode,
                              })
                            }
                          >
                            {MATCH_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {t(RELEASE_FORMAT_MATCH_MODE_LABELS[mode])}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${format.id}-value-${index}`} className="text-xs">
                            <InterfaceText source="Value" />
                          </Label>
                          <Input
                            id={`${format.id}-value-${index}`}
                            maxLength={500}
                            value={spec.value}
                            placeholder={
                              spec.mode === "regex" ? t("e.g. (GOG|DRM-free)") : t("Text to match")
                            }
                            onChange={(event) =>
                              updateSpec(format.id, index, { value: event.target.value })
                            }
                          />
                        </div>
                        <div className="flex items-center gap-1 pb-2">
                          <Switch
                            id={`${format.id}-negate-${index}`}
                            checked={spec.negate ?? false}
                            onCheckedChange={(checked) =>
                              updateSpec(format.id, index, { negate: checked })
                            }
                          />
                          <Label htmlFor={`${format.id}-negate-${index}`} className="text-xs">
                            <InterfaceText source="Negate" />
                          </Label>
                        </div>
                        <div className="flex items-center gap-1 pb-2">
                          <Switch
                            id={`${format.id}-required-${index}`}
                            checked={spec.required ?? false}
                            onCheckedChange={(checked) =>
                              updateSpec(format.id, index, { required: checked })
                            }
                          />
                          <Label htmlFor={`${format.id}-required-${index}`} className="text-xs">
                            <InterfaceText source="Required" />
                          </Label>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("Remove condition")}
                          lang={languageFor("Remove condition")}
                          dir={directionFor("Remove condition")}
                          disabled={format.specs.length === 1}
                          onClick={() =>
                            updateFormat(format.id, {
                              specs: format.specs.filter((_item, i) => i !== index),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={format.specs.length >= 20}
                      onClick={() =>
                        updateFormat(format.id, {
                          specs: [
                            ...format.specs,
                            { field: "title", mode: "contains", value: "", required: false },
                          ],
                        })
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" /> <InterfaceText source="Add condition" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {(validationMessage || !isValid) && (
          <p role="alert" className="text-sm text-destructive">
            {validationMessage ??
              t("Complete each custom format condition with a valid value before saving.")}
          </p>
        )}
        <div className="flex justify-end border-t pt-4">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !isValid}
            className="gap-2"
          >
            {mutation.isPending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <SlidersHorizontal className="h-4 w-4" />
            )}
            {mutation.isPending ? (
              <InterfaceText source="Saving..." />
            ) : (
              <InterfaceText source="Save Release Scoring" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
