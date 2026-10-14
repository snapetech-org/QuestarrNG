import { getRegionalLocale } from "@/lib/regional-format";
import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { copyToClipboard } from "@/lib/utils";
import {
  apiKeyListResponseSchema,
  apiKeyCreatedResponseSchema,
  type ApiKeyPublicResponse,
  type ApiKeyCreatedResponse,
} from "@shared/schema";
import { InterfaceText } from "@/components/InterfaceText";
import { formatInterfaceMessage } from "@/lib/interface-locale";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString(getRegionalLocale());
}

/**
 * Manages the long-lived API keys used by external clients (the Playnite
 * extension, scripts). The raw key is shown only in the panel that appears
 * right after creation — the server stores a hash and cannot show it again.
 */
export function ApiKeysCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScope, setNewKeyScope] =
    useState<ApiKeyPublicResponse["scope"]>("integration:seerrng");
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreatedResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyPublicResponse | null>(null);

  const {
    data: keys = [],
    isLoading,
    isError,
  } = useQuery<ApiKeyPublicResponse[]>({
    queryKey: ["/api/api-keys"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/api-keys");
      return apiKeyListResponseSchema.parse(await res.json());
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      name: string;
      scope: ApiKeyPublicResponse["scope"];
      expiresInDays: number;
    }) => {
      const res = await apiRequest("POST", "/api/api-keys", input);
      return apiKeyCreatedResponseSchema.parse(await res.json());
    },
    onSuccess: (created) => {
      setCreatedKey(created);
      setCopied(false);
      setNewKeyName("");
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not create API key",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      toast({ title: "API key revoked" });
    },
    onError: (error: Error) => {
      toast({
        title: "Could not revoke API key",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => setPendingRevoke(null),
  });

  const handleCopy = useCallback(async () => {
    if (!createdKey) return;
    const ok = await copyToClipboard(createdKey.key);
    if (ok) {
      setCopied(true);
      return;
    }
    toast({
      title: "Copy failed",
      description: "Select the key and copy it manually.",
      variant: "destructive",
    });
  }, [createdKey, toast]);

  const trimmedName = newKeyName.trim();

  return (
    <Card id="api-keys">
      <CardHeader>
        <div className="flex items-center space-x-3">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-lg">
            <InterfaceText source={"API Keys"} />
          </CardTitle>
        </div>
        <CardDescription>
          <InterfaceText
            source={
              "Connect SeerrNG or another integration client with a dedicated key. New keys expire automatically and can be restricted to the SeerrNG provider routes."
            }
          />
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.5fr)_minmax(12rem,1fr)_minmax(9rem,.7fr)_auto] xl:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmedName) {
              createMutation.mutate({
                name: trimmedName,
                scope: newKeyScope,
                expiresInDays,
              });
            }
          }}
        >
          <div className="space-y-2 sm:col-span-2 xl:col-span-1">
            <Label htmlFor="api-key-name">
              <InterfaceText source={"Name"} />
            </Label>
            <Input
              id="api-key-name"
              placeholder="SeerrNG on my home server"
              value={newKeyName}
              maxLength={100}
              onChange={(e) => setNewKeyName(e.target.value)}
              data-i18n-placeholder={"SeerrNG on my home server"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-scope">
              <InterfaceText source={"Access"} />
            </Label>
            <Select
              value={newKeyScope}
              onValueChange={(value) => setNewKeyScope(value as ApiKeyPublicResponse["scope"])}
            >
              <SelectTrigger
                id="api-key-scope"
                aria-label="API key access"
                data-i18n-aria-label={"API key access"}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="integration:seerrng">
                  <InterfaceText source={"SeerrNG provider only"} />
                </SelectItem>
                <SelectItem value="integration:all">
                  <InterfaceText source={"All integration routes"} />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-expiry">
              <InterfaceText source={"Expires after"} />
            </Label>
            <Select
              value={String(expiresInDays)}
              onValueChange={(value) => setExpiresInDays(Number(value))}
            >
              <SelectTrigger
                id="api-key-expiry"
                aria-label="API key expiration"
                data-i18n-aria-label={"API key expiration"}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">
                  <InterfaceText source={"30 days"} />
                </SelectItem>
                <SelectItem value="90">
                  <InterfaceText source={"90 days"} />
                </SelectItem>
                <SelectItem value="180">
                  <InterfaceText source={"180 days"} />
                </SelectItem>
                <SelectItem value="365">
                  <InterfaceText source={"1 year"} />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            className="sm:col-span-2 xl:col-span-1"
            disabled={!trimmedName || createMutation.isPending}
          >
            <Plus className="mr-2 h-4 w-4" />
            {createMutation.isPending ? (
              <InterfaceText source={"Creating..."} />
            ) : (
              <InterfaceText source={"Create key"} />
            )}
          </Button>
        </form>

        {createdKey && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-4">
            <p className="text-sm font-medium">
              <InterfaceText source={"Copy your new key now — it will not be shown again."} />
            </p>
            <p className="text-xs text-muted-foreground">
              {createdKey.scope === "integration:seerrng" ? (
                <InterfaceText source={"SeerrNG provider only"} />
              ) : (
                <InterfaceText source={"All integration routes"} />
              )}{" "}
              <InterfaceText source={"· Expires"} /> {formatDate(createdKey.expiresAt)}
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={createdKey.key}
                aria-label="New API key"
                className="font-mono"
                data-i18n-aria-label={"New API key"}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                aria-label="Copy API key"
                data-i18n-aria-label={"Copy API key"}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreatedKey(null)}>
              <InterfaceText source={"Done"} />
            </Button>
          </div>
        )}

        <section aria-labelledby="api-keys-list-heading" className="space-y-2">
          <h3 id="api-keys-list-heading" className="text-sm font-medium">
            <InterfaceText source={"Active keys"} />
          </h3>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              <InterfaceText source={"Loading..."} />
            </p>
          ) : isError ? (
            <p className="text-sm text-destructive">
              <InterfaceText source={"Could not load API keys. Refresh the page to try again."} />
            </p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <InterfaceText
                source={
                  "No API keys yet. Create one to connect SeerrNG or another integration client."
                }
              />
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{key.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{key.prefix}…</span>{" "}
                      <InterfaceText source={"· Created"} /> {formatDate(key.createdAt)}{" "}
                      <InterfaceText source={"· Last used"} /> {formatDate(key.lastUsedAt)}
                      {" · "}
                      {key.scope === "integration:seerrng" ? (
                        <InterfaceText source={"SeerrNG only"} />
                      ) : (
                        <InterfaceText source={"All integrations"} />
                      )}{" "}
                      <InterfaceText source={"· Expires"} /> {formatDate(key.expiresAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={formatInterfaceMessage("Revoke API key {name}", {
                      name: String(key.name ?? ""),
                    })}
                    onClick={() => setPendingRevoke(key)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>

      <AlertDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <InterfaceText source={"Revoke this API key?"} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <InterfaceText source={"Any client using “"} />
              {pendingRevoke?.name}
              <InterfaceText source={"” will stop working immediately. This cannot be undone."} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <InterfaceText source={"Cancel"} />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingRevoke && revokeMutation.mutate(pendingRevoke.id)}
            >
              <InterfaceText source={"Revoke"} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
