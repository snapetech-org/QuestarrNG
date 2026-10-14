import { getRegionalLocale } from "@/lib/regional-format";
import { formatXrelSize } from "@/lib/xrel-format";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, throwIfResNotOk } from "@/lib/queryClient";
import type { XrelReleaseListItem } from "@shared/xrel-types";
import { InterfaceText } from "@/components/InterfaceText";
import { formatInterfaceMessage } from "@/lib/interface-locale";

// The transport fields (id, dirname, nukeReason, ...) come from the
// server's XrelReleaseListItem DTO; these are page-only fields the server
// attaches/derives for display and aren't part of that shared contract.
interface XrelRelease extends XrelReleaseListItem {
  isWanted?: boolean;
  libraryStatus?: string;
  gameId?: string;
  matchCandidate?: {
    title: string;
    igdbId: number;
    // other fields if needed for UI
  };
}

interface XrelLatestResponse {
  list: XrelRelease[];
  pagination: { current_page: number; per_page: number; total_pages: number };
  total_count: number;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString(getRegionalLocale(), {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function safeUrl(url: string | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}

export default function XrelReleasesPage() {
  const [page, setPage] = useState(1);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isFetching, refetch } = useQuery<XrelLatestResponse>({
    queryKey: ["/api/xrel/latest", page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) });
      const res = await apiFetch(`/api/xrel/latest?${params}`);
      await throwIfResNotOk(res);
      return res.json();
    },
  });

  // XRL-2: sync local page state to what the server actually returned
  useEffect(() => {
    if (data?.pagination?.current_page && data.pagination.current_page < page) {
      setPage(data.pagination.current_page);
    }
  }, [data, page]);

  const addGameMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiFetch("/api/games/match-and-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      await throwIfResNotOk(res);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Game added",
        description: formatInterfaceMessage('Added "{title}" to your wanted list', {
          title: String(data.title ?? ""),
        }),
      });
      // Iterate over the list and update the item that was added to avoid full refetch if possible,
      // but simpler to just invalidates queries
      queryClient.invalidateQueries({ queryKey: ["/api/xrel/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to add game",
        description: error.message,
      });
    },
  });

  const list = data?.list ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.total_pages ?? 1;

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4 md:mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            <InterfaceText source={"xREL.to Releases"} />
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            <InterfaceText
              source={
                "Latest game releases listed on xREL.to (scene/P2P). No download links — for reference only."
              }
            />
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
            data-i18n-aria-label={"Refresh"}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            <InterfaceText source={"Latest game releases"} />
          </CardTitle>
          <CardDescription>
            <InterfaceText source={"Filtered to games only (master_game). Data from"} />{" "}
            <a
              href="https://www.xrel.to"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              xREL.to
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin mr-2" />
              <InterfaceText source={"Loading…"} />
            </div>
          ) : !isFetching && list.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                <InterfaceText source={"No game releases found on this page."} />
              </p>
              {page < totalPages && (
                <p className="text-xs text-muted-foreground mt-2">
                  <InterfaceText
                    source={
                      "Note: Results are filtered to games only, so some pages may appear empty."
                    }
                  />
                </p>
              )}
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {list.map((rel) => (
                  <li key={rel.id} className="py-2.5 border-b border-border/50 last:border-0">
                    {/* Title row: dirname + view link anchored top-right */}
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div
                          className="font-medium text-sm truncate leading-snug"
                          title={rel.dirname}
                        >
                          {rel.dirname}
                        </div>
                        {rel.ext_info?.title && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {rel.ext_info.title}
                          </div>
                        )}
                      </div>
                      <a
                        href={safeUrl(rel.link_href)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-primary hover:underline inline-flex items-center gap-0.5 text-sm"
                        aria-label={formatInterfaceMessage("View {value} on xREL", {
                          value: String(rel.ext_info?.title ?? rel.dirname ?? ""),
                        })}
                        data-i18n-aria-label={"View {value} on xREL"}
                        data-i18n-aria-label-values={JSON.stringify({
                          value: String(rel.ext_info?.title ?? rel.dirname ?? ""),
                        })}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          <InterfaceText source={"View"} />
                        </span>
                      </a>
                    </div>
                    {/* Meta row: date · size · badges · action — wraps naturally on mobile */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(rel.time)}
                      </span>
                      {rel.sizeMb != null && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatXrelSize(rel.sizeMb, rel.sizeUnit)}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {rel.source}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                        {rel.group_name || "—"}
                      </Badge>
                      {rel.nukeReason && (
                        <>
                          <Badge
                            variant="destructive"
                            className="text-[10px] h-4 px-1.5"
                            title={formatInterfaceMessage("Nuked: {reason}", {
                              reason: String(rel.nukeReason ?? ""),
                            })}
                          >
                            <InterfaceText source={"Nuked"} />
                          </Badge>
                          {/* Also shown as visible text, not just the hover title above --
                              touch/mobile users can't reliably reach a native tooltip. */}
                          <span className="text-xs text-destructive break-all">
                            {rel.nukeReason}
                          </span>
                        </>
                      )}
                      {rel.libraryStatus ? (
                        <Badge
                          variant={rel.libraryStatus === "wanted" ? "default" : "secondary"}
                          className={`text-[10px] h-4 px-1.5 ${rel.libraryStatus === "wanted" ? "bg-primary text-primary-foreground" : ""}`}
                        >
                          {rel.libraryStatus.charAt(0).toUpperCase() + rel.libraryStatus.slice(1)}
                        </Badge>
                      ) : rel.matchCandidate ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => {
                            if (rel.matchCandidate) {
                              addGameMutation.mutate(rel.matchCandidate.title);
                            }
                          }}
                          disabled={
                            addGameMutation.isPending &&
                            addGameMutation.variables === rel.matchCandidate?.title
                          }
                          title={formatInterfaceMessage('Add "{value}" to wanted list', {
                            value: String(rel.matchCandidate?.title ?? ""),
                          })}
                        >
                          {addGameMutation.isPending &&
                          addGameMutation.variables === rel.matchCandidate?.title ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          <InterfaceText source={"Add"} />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              {(page > 1 || totalPages > 1) && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <InterfaceText source={"Previous"} />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    <InterfaceText
                      source={"Page {page} of {total}"}
                      values={{ page: pagination?.current_page ?? page, total: totalPages }}
                    />
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <InterfaceText source={"Next"} />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
