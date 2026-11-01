import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, List, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import type { Game, GameList } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { InterfaceText } from "@/components/InterfaceText";
import { getStatusSourceLabel } from "@/components/StatusBadge";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";
import { formatRegionalNumber, useRegionalPreference } from "@/lib/regional-format";

type ListDialogMode = "create" | "rename" | null;

function GameStatusText({ status }: { status: string }) {
  const source = getStatusSourceLabel(status);
  return source === status ? (
    <bdi lang="und" dir="auto">{status}</bdi>
  ) : (
    <InterfaceText source={source} />
  );
}

interface SaveListInput {
  mode: Exclude<ListDialogMode, null>;
  listId?: string;
  name: string;
}

interface MembershipInput {
  listId: string;
  gameId: string;
  add: boolean;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await apiRequest("GET", url);
  return response.json() as Promise<T>;
}

export default function GameListsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { language } = useInterfaceLanguage();
  const regionalPreference = useRegionalPreference();
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listDialogMode, setListDialogMode] = useState<ListDialogMode>(null);
  const [editingListId, setEditingListId] = useState<string | undefined>();
  const [listName, setListName] = useState("");
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const [addGamesOpen, setAddGamesOpen] = useState(false);
  const [gameSearch, setGameSearch] = useState("");

  const { data: lists = [], isLoading: listsLoading } = useQuery<GameList[]>({
    queryKey: ["/api/game-lists"],
    queryFn: () => fetchJson<GameList[]>("/api/game-lists"),
  });

  const { data: libraryGames = [], isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    queryFn: () => fetchJson<Game[]>("/api/games"),
  });

  const {
    data: listGames = [],
    isLoading: listGamesLoading,
    isError: listGamesError,
  } = useQuery<Game[]>({
    queryKey: ["/api/game-lists", selectedListId, "games"],
    queryFn: () => fetchJson<Game[]>(`/api/game-lists/${selectedListId}/games`),
    enabled: selectedListId !== null,
  });

  useEffect(() => {
    if (lists.length === 0) {
      if (selectedListId !== null) setSelectedListId(null);
      return;
    }
    if (!selectedListId || !lists.some((list) => list.id === selectedListId)) {
      setSelectedListId(lists[0]!.id);
    }
  }, [lists, selectedListId]);

  const selectedList = lists.find((list) => list.id === selectedListId);
  const memberIds = useMemo(() => new Set(listGames.map((game) => game.id)), [listGames]);
  const filteredLibraryGames = useMemo(() => {
    const query = gameSearch.trim().toLocaleLowerCase();
    return libraryGames.filter((game) => !query || game.title.toLocaleLowerCase().includes(query));
  }, [gameSearch, libraryGames]);

  const saveListMutation = useMutation<GameList, Error, SaveListInput>({
    mutationFn: async ({ mode, listId, name }) => {
      const response = await apiRequest(
        mode === "create" ? "POST" : "PATCH",
        mode === "create" ? "/api/game-lists" : `/api/game-lists/${listId}`,
        { name }
      );
      return response.json() as Promise<GameList>;
    },
    onSuccess: async (list) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/game-lists"] });
      setSelectedListId(list.id);
      setListDialogMode(null);
      setEditingListId(undefined);
      setListName("");
      toast({
        title: formatInterfaceMessage("interface.list_saved_e24d07fe", {}, language),
        description: formatInterfaceMessage(
          "interface.name_is_ready_d506004a",
          { name: list.name },
          language
        ),
      });
    },
    onError: () => {
      toast({
        title: formatInterfaceMessage("interface.couldn_t_save_list_b61bfc7c", {}, language),
        description: formatInterfaceMessage(
          "interface.check_the_name_and_try_again_list_d0830084",
          {},
          language
        ),
        variant: "destructive",
      });
    },
  });

  const deleteListMutation = useMutation<void, Error, string>({
    mutationFn: async (listId) => {
      await apiRequest("DELETE", `/api/game-lists/${listId}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/game-lists"] });
      setDeleteListId(null);
    },
    onError: () => {
      toast({
        title: formatInterfaceMessage("interface.couldn_t_delete_list_21203c26", {}, language),
        variant: "destructive",
      });
    },
  });

  const membershipMutation = useMutation<void, Error, MembershipInput>({
    mutationFn: async ({ listId, gameId, add }) => {
      await apiRequest(
        add ? "POST" : "DELETE",
        add ? `/api/game-lists/${listId}/games` : `/api/game-lists/${listId}/games/${gameId}`,
        add ? { gameId } : undefined
      );
    },
    onSuccess: async (_result, input) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["/api/game-lists", input.listId, "games"],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/game-lists"] }),
      ]);
    },
    onError: () => {
      toast({
        title: formatInterfaceMessage("interface.couldn_t_update_this_list_bb74b78c", {}, language),
        variant: "destructive",
      });
    },
  });

  const openRename = (list: GameList) => {
    setEditingListId(list.id);
    setListName(list.name);
    setListDialogMode("rename");
  };

  const saveList = () => {
    const name = listName.trim();
    if (!name) return;
    saveListMutation.mutate({
      mode: listDialogMode ?? "create",
      ...(editingListId ? { listId: editingListId } : {}),
      name,
    });
  };

  const toggleMembership = (gameId: string, checked: boolean) => {
    if (!selectedListId) return;
    membershipMutation.mutate({ listId: selectedListId, gameId, add: checked });
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <List className="h-6 w-6 text-primary" aria-hidden="true" />
            <InterfaceText source="navigation.custom_lists" />
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            <InterfaceText source="interface.make_your_own_collections_for_co_o_f9b430b2" />
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingListId(undefined);
            setListName("");
            setListDialogMode("create");
          }}
        >
          <Plus className="me-2 h-4 w-4" aria-hidden="true" />
          <InterfaceText source="interface.create_list_68a5e16f" />
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              <InterfaceText source="interface.your_lists_e6b69d5b" />
            </CardTitle>
            <CardDescription>
              <InterfaceText source="interface.only_you_can_see_and_edit_these_li_5290448c" />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {listsLoading ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />{" "}
                <InterfaceText source="interface.loading_lists_0f5444e0" />
              </div>
            ) : lists.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <InterfaceText source="interface.your_lists_will_show_up_here_start_54f8f253" />
              </p>
            ) : (
              lists.map((list) => (
                <div
                  key={list.id}
                  className={`flex items-center gap-1 rounded-md border p-1 ${
                    list.id === selectedListId
                      ? "border-primary/50 bg-primary/5"
                      : "border-transparent"
                  }`}
                >
                  <Button
                    variant="ghost"
                    className="min-w-0 flex-1 justify-start truncate text-start"
                    aria-pressed={list.id === selectedListId}
                    onClick={() => setSelectedListId(list.id)}
                  >
                    <Archive className="me-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{list.name}</span>
                    {list.id === selectedListId && !listGamesLoading && (
                      <span className="ms-auto ps-2 text-xs text-muted-foreground">
                        {listGames.length}
                      </span>
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={formatInterfaceMessage(
                      "interface.rename_list_9ff4b40d",
                      { list: list.name },
                      language
                    )}
                    data-i18n-aria-label="interface.rename_list_9ff4b40d"
                    data-i18n-aria-label-values={JSON.stringify({ list: list.name })}
                    onClick={() => openRename(list)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={formatInterfaceMessage(
                      "interface.delete_list_0b1eb62e",
                      { list: list.name },
                      language
                    )}
                    data-i18n-aria-label="interface.delete_list_0b1eb62e"
                    data-i18n-aria-label-values={JSON.stringify({ list: list.name })}
                    onClick={() => setDeleteListId(list.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[360px]">
          {selectedList ? (
            <>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle>{selectedList.name}</CardTitle>
                  <CardDescription className="mt-1">
                    <InterfaceText
                      source={listGames.length === 1 ? "{count} game" : "{count} games"}
                      values={{
                        count: formatRegionalNumber(
                          listGames.length,
                          undefined,
                          regionalPreference
                        ),
                      }}
                    />
                  </CardDescription>
                </div>
                <Button onClick={() => setAddGamesOpen(true)}>
                  <Plus className="me-2 h-4 w-4" aria-hidden="true" />
                  <InterfaceText source="interface.add_games_4d93bb5f" />
                </Button>
              </CardHeader>
              <CardContent>
                {listGamesLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="me-2 h-5 w-5 animate-spin" />
                    <InterfaceText source="interface.loading_games_178e383e" />
                  </div>
                ) : listGamesError ? (
                  <p role="alert" className="py-12 text-center text-sm text-destructive">
                    <InterfaceText source="interface.couldn_t_load_games_for_this_list_aacfefce" />
                  </p>
                ) : listGames.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center">
                    <Archive className="mb-3 h-9 w-9 text-muted-foreground/60" aria-hidden="true" />
                    <h2 className="font-semibold">
                      <InterfaceText source="interface.this_list_is_ready_for_games_24fa08c2" />
                    </h2>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      <InterfaceText source="interface.add_games_from_your_library_you_ca_7f35b7ff" />
                    </p>
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() => setAddGamesOpen(true)}
                    >
                      <Plus className="me-2 h-4 w-4" aria-hidden="true" />
                      <InterfaceText source="interface.browse_library_940383f0" />
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y rounded-md border">
                    {listGames.map((game) => (
                      <div key={game.id} className="flex items-center gap-3 p-3">
                        {game.coverUrl ? (
                          <img
                            src={game.coverUrl}
                            alt=""
                            className="h-14 w-11 rounded object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-14 w-11 items-center justify-center rounded bg-muted">
                            <Archive className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{game.title}</p>
                          <p className="text-xs capitalize text-muted-foreground">
                            <GameStatusText status={game.status} />
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={formatInterfaceMessage(
                            "interface.remove_game_from_list_6de06d01",
                            { game: game.title, list: selectedList.name },
                            language
                          )}
                          data-i18n-aria-label="interface.remove_game_from_list_6de06d01"
                          data-i18n-aria-label-values={JSON.stringify({
                            game: game.title,
                            list: selectedList.name,
                          })}
                          disabled={membershipMutation.isPending}
                          onClick={() => toggleMembership(game.id, false)}
                        >
                          <X className="me-1 h-4 w-4" aria-hidden="true" />
                          <InterfaceText source="interface.remove_21a5901d" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <List className="mb-3 h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
              <h2 className="font-semibold">
                <InterfaceText source="interface.start_a_custom_list_3ba74c41" />
              </h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                <InterfaceText source="interface.collect_games_for_a_co_op_night_a_4ed84827" />
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setListDialogMode("create")}
              >
                <Plus className="me-2 h-4 w-4" aria-hidden="true" />
                <InterfaceText source="interface.create_your_first_list_bba74742" />
              </Button>
            </CardContent>
          )}
        </Card>
      </div>

      <Dialog
        open={listDialogMode !== null}
        onOpenChange={(open) => !open && setListDialogMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <InterfaceText
                source={listDialogMode === "rename" ? "Rename list" : "Create a list"}
              />
            </DialogTitle>
            <DialogDescription>
              <InterfaceText source="interface.give_it_a_short_name_so_you_can_fi_200b9475" />
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            aria-label={formatInterfaceMessage("interface.list_name_cf572358", {}, language)}
            data-i18n-aria-label="interface.list_name_cf572358"
            maxLength={80}
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && saveList()}
            placeholder={formatInterfaceMessage(
              "interface.e_g_co_op_with_friends_fd21bcaa",
              {},
              language
            )}
            data-i18n-placeholder="interface.e_g_co_op_with_friends_fd21bcaa"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setListDialogMode(null)}>
              <InterfaceText source="interface.cancel_35afca3b" />
            </Button>
            <Button onClick={saveList} disabled={!listName.trim() || saveListMutation.isPending}>
              {saveListMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <InterfaceText source={listDialogMode === "rename" ? "Save name" : "Create list"} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addGamesOpen}
        onOpenChange={(open) => {
          setAddGamesOpen(open);
          if (!open) setGameSearch("");
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {selectedList ? (
                <InterfaceText
                  source="interface.add_games_to_list_d3414d8c"
                  values={{ list: selectedList.name }}
                />
              ) : (
                <InterfaceText source="interface.add_games_to_your_list_da32a1b9" />
              )}
            </DialogTitle>
            <DialogDescription>
              <InterfaceText source="interface.select_games_from_your_library_a_g_c2400527" />
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={formatInterfaceMessage(
                "interface.search_library_games_af5524b1",
                {},
                language
              )}
              data-i18n-aria-label="interface.search_library_games_af5524b1"
              className="ps-9"
              placeholder={formatInterfaceMessage(
                "interface.search_your_games_d29b6007",
                {},
                language
              )}
              data-i18n-placeholder="interface.search_your_games_d29b6007"
              value={gameSearch}
              onChange={(event) => setGameSearch(event.target.value)}
            />
          </div>
          <ScrollArea className="h-[min(55vh,420px)] pe-3">
            {gamesLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="me-2 h-5 w-5 animate-spin" />
                <InterfaceText source="interface.loading_library_13afcbb2" />
              </div>
            ) : filteredLibraryGames.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {libraryGames.length === 0 ? (
                  <InterfaceText source="interface.add_games_to_your_library_before_b_711c63e0" />
                ) : (
                  <InterfaceText source="interface.no_games_match_that_search_bc31a1df" />
                )}
              </div>
            ) : (
              <div className="divide-y">
                {filteredLibraryGames.map((game) => {
                  const checked = memberIds.has(game.id);
                  const source = checked ? "Remove {game} from {list}" : "Add {game} to {list}";
                  const values = {
                    game: game.title,
                    list:
                      selectedList?.name ??
                      formatInterfaceMessage("interface.your_list_10c6b14a", {}, language),
                  };
                  return (
                    <label key={game.id} className="flex cursor-pointer items-center gap-3 py-2.5">
                      <Checkbox
                        checked={checked}
                        disabled={!selectedListId || membershipMutation.isPending}
                        onCheckedChange={(value) => toggleMembership(game.id, value === true)}
                        aria-label={formatInterfaceMessage(source, values, language)}
                        data-i18n-aria-label={source}
                        data-i18n-aria-label-values={JSON.stringify(values)}
                      />
                      {game.coverUrl ? (
                        <img src={game.coverUrl} alt="" className="h-12 w-9 rounded object-cover" />
                      ) : (
                        <div className="flex h-12 w-9 items-center justify-center rounded bg-muted">
                          <Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {game.title}
                      </span>
                      <span className="text-xs capitalize text-muted-foreground">
                        <GameStatusText status={game.status} />
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGamesOpen(false)}>
              <InterfaceText source="interface.done_8dd31791" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteListId !== null}
        onOpenChange={(open) => !open && setDeleteListId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <InterfaceText source="interface.delete_this_list_9365d423" />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <InterfaceText source="interface.the_games_stay_in_your_library_onl_370dbede" />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <InterfaceText source="interface.cancel_35afca3b" />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (deleteListId) deleteListMutation.mutate(deleteListId);
              }}
              disabled={deleteListMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteListMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              <InterfaceText source="interface.delete_list_4e0c098a" />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
