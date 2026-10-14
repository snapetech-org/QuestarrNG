import { useLayoutEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ImportReviewModal from "./ImportReviewModal";
import LinkGameModal from "./LinkGameModal";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GAME_LINK_REQUIRED_STATUS, QUARANTINED_STATUS } from "@shared/schema";
import { RegionalRelativeTime } from "./RegionalRelativeTime";
import { InterfaceText } from "@/components/InterfaceText";

interface PendingImport {
  id: string;
  gameTitle: string;
  downloadTitle: string;
  status: string;
  createdAt: string;
  errorMessage?: string | null;
  passwordRequired?: boolean;
}

function describeImportError(item: PendingImport): string | null | undefined {
  if (!item.errorMessage) return item.errorMessage;
  if (item.status === QUARANTINED_STATUS) return `Security alert: ${item.errorMessage}`;
  if (item.status === GAME_LINK_REQUIRED_STATUS) return item.errorMessage;
  if (item.passwordRequired) return `Password required: ${item.errorMessage}`;
  return `Import failed: ${item.errorMessage}`;
}

export default function PendingImportsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingImports = [] } = useQuery<PendingImport[]>({
    queryKey: ["/api/imports/pending"],
    refetchInterval: 30000, // Poll every 30s
  });

  const [selectedImport, setSelectedImport] = useState<PendingImport | null>(null);
  // Collapsed by default once there's more than one item, so a growing review
  // queue doesn't push the game grid down the page — one item stays expanded
  // since there's nothing to collapse away.
  const [collapsed, setCollapsed] = useState(false);
  const multiple = pendingImports.length > 1;

  useLayoutEffect(() => {
    setCollapsed(multiple);
  }, [multiple]);

  const skipMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/imports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/imports/pending"] });
      toast({ description: "Import skipped" });
    },
    onError: () => {
      toast({ variant: "destructive", description: "Failed to skip import" });
    },
  });

  if (pendingImports.length === 0) return null;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <CardTitle className="text-lg">
                {multiple ? (
                  <InterfaceText
                    source="Pending manual imports: {count}"
                    values={{ count: pendingImports.length }}
                  />
                ) : (
                  <InterfaceText source={"Pending Manual Import"} />
                )}
              </CardTitle>
            </div>
            {multiple && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-amber-600 dark:text-amber-500"
                aria-label={collapsed ? "Show pending imports" : "Hide pending imports"}
                onClick={(e) => {
                  e.stopPropagation();
                  setCollapsed((c) => !c);
                }}
              >
                {collapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
          <CardDescription>
            {multiple ? (
              <InterfaceText
                source={
                  "These downloads require your attention before they can be added to your library."
                }
              />
            ) : (
              <InterfaceText
                source={
                  "This download requires your attention before it can be added to your library."
                }
              />
            )}
          </CardDescription>
        </CardHeader>
        {!collapsed && (
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {pendingImports.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-background p-3 rounded-md border shadow-sm"
                >
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{item.gameTitle || item.downloadTitle}</p>
                    <p
                      className="text-xs text-muted-foreground truncate max-w-[300px]"
                      title={item.downloadTitle}
                    >
                      {item.downloadTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.createdAt &&
                        (() => {
                          const d = new Date(item.createdAt);
                          return Number.isNaN(d.getTime()) ? null : (
                            <RegionalRelativeTime date={d} />
                          );
                        })()}
                    </p>
                    {item.errorMessage && (
                      <p
                        className="text-xs text-destructive truncate max-w-[300px]"
                        title={item.errorMessage}
                      >
                        {describeImportError(item)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={skipMutation.isPending && skipMutation.variables === item.id}
                      onClick={() => skipMutation.mutate(item.id)}
                    >
                      {item.status === QUARANTINED_STATUS ? (
                        <InterfaceText source={"Dismiss"} />
                      ) : (
                        <InterfaceText source={"Skip"} />
                      )}
                    </Button>
                    {item.status !== QUARANTINED_STATUS && (
                      <Button size="sm" onClick={() => setSelectedImport(item)}>
                        {(() => {
                          if (item.status === GAME_LINK_REQUIRED_STATUS) return "Link Game";
                          if (item.passwordRequired) return "Enter Password";
                          return "Review";
                        })()}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {selectedImport?.status === GAME_LINK_REQUIRED_STATUS && (
        <LinkGameModal
          open={!!selectedImport}
          onOpenChange={(open) => !open && setSelectedImport(null)}
          downloadId={selectedImport.id}
          downloadTitle={selectedImport.downloadTitle}
        />
      )}
      {selectedImport && selectedImport.status !== GAME_LINK_REQUIRED_STATUS && (
        <ImportReviewModal
          open={!!selectedImport}
          onOpenChange={(open) => !open && setSelectedImport(null)}
          downloadId={selectedImport.id}
          downloadTitle={selectedImport.downloadTitle}
          passwordRequired={!!selectedImport.passwordRequired}
        />
      )}
    </>
  );
}
