import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/use-debounce";
import type { Game } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Gamepad2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatInterfaceMessage, useInterfaceLanguage } from "@/lib/interface-locale";

interface LinkGameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloadId: string;
  downloadTitle: string;
}

export default function LinkGameModal({
  open,
  onOpenChange,
  downloadId,
  downloadTitle,
}: Readonly<LinkGameModalProps>) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { language, t, languageFor, directionFor } = useInterfaceLanguage();
  const localizedText = (source: string, values: Record<string, string | number> = {}) => {
    const text = formatInterfaceMessage(source, values, language);
    // The document already identifies English. Keep English toast payloads as
    // strings so consumers and tests don't receive redundant direction wrappers.
    if (language === "en") return text;
    return (
      <span lang={languageFor(source)} dir={directionFor(source)}>
        {text}
      </span>
    );
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { data: games = [], isFetching } = useQuery<Game[]>({
    queryKey: ["/api/games", "link-search", debouncedSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearchQuery.trim()) params.set("search", debouncedSearchQuery.trim());
      const response = await apiRequest("GET", `/api/games?${params}`);
      return response.json();
    },
    enabled: open,
  });

  const linkMutation = useMutation({
    mutationFn: async (gameId: string) => {
      await apiRequest("POST", `/api/imports/${downloadId}/link`, { gameId });
    },
    onSuccess: () => {
      toast({
        title: localizedText("interface.game_linked_5437aae0"),
        description: localizedText("interface.continue_by_reviewing_the_import_s_a709a813"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/imports/pending"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: localizedText("interface.failed_to_link_game_87d41db3"),
        description: (
          <span lang="und" dir="auto">
            {error.message}
          </span>
        ),
        variant: "destructive",
      });
    },
  });

  let resultsContent: ReactNode;
  if (isFetching && games.length === 0) {
    resultsContent = (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        <Loader2 className="me-2 h-4 w-4 animate-spin" />
        {localizedText("interface.searching_2713de23")}
      </div>
    );
  } else if (games.length === 0) {
    resultsContent = (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-4 text-center">
        {localizedText("interface.no_games_found_try_a_different_sea_f654fc2c")}
      </div>
    );
  } else {
    resultsContent = (
      <div className="p-1">
        {games.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => setSelectedGameId(game.id)}
            className={cn(
              "flex items-center gap-3 w-full rounded-sm p-2 text-start hover:bg-accent transition-colors",
              selectedGameId === game.id && "bg-accent"
            )}
          >
            {game.coverUrl ? (
              <img
                src={game.coverUrl}
                alt=""
                className="h-10 w-8 rounded-sm object-cover shrink-0"
              />
            ) : (
              <div className="h-10 w-8 rounded-sm bg-muted flex items-center justify-center shrink-0">
                <Gamepad2 className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm font-medium truncate" lang="und" dir="auto">
              {game.title}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSearchQuery("");
          setSelectedGameId(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle
            lang={languageFor("interface.link_to_a_game_b17ad089")}
            dir={directionFor("interface.link_to_a_game_b17ad089")}
          >
            {t("interface.link_to_a_game_b17ad089")}
          </DialogTitle>
          <DialogDescription
            lang={languageFor("interface.the_game_originally_linked_to_titl_4fda6a26")}
            dir={directionFor("interface.the_game_originally_linked_to_titl_4fda6a26")}
          >
            {formatInterfaceMessage(
              "interface.the_game_originally_linked_to_titl_4fda6a26",
              { title: downloadTitle },
              language
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label
              htmlFor="link-game-search"
              lang={languageFor("interface.search_your_library_e2317bf3")}
              dir={directionFor("interface.search_your_library_e2317bf3")}
            >
              {t("interface.search_your_library_e2317bf3")}
            </Label>
            <div className="relative">
              <Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="link-game-search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // A previously selected game may no longer be in the result
                  // list once the search changes — don't let a stale selection
                  // submit silently.
                  setSelectedGameId(null);
                }}
                placeholder={t("interface.search_by_title_612ec3e6")}
                lang={languageFor("interface.search_by_title_612ec3e6")}
                dir={directionFor("interface.search_by_title_612ec3e6")}
                className="ps-8"
                autoFocus
              />
            </div>
          </div>

          <ScrollArea className="h-64 rounded-md border">{resultsContent}</ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <span
              lang={languageFor("interface.cancel_35afca3b")}
              dir={directionFor("interface.cancel_35afca3b")}
            >
              {t("interface.cancel_35afca3b")}
            </span>
          </Button>
          <Button
            disabled={!selectedGameId || linkMutation.isPending}
            onClick={() => selectedGameId && linkMutation.mutate(selectedGameId)}
          >
            {linkMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            <span
              lang={languageFor("interface.link_game_167e02e9")}
              dir={directionFor("interface.link_game_167e02e9")}
            >
              {t("interface.link_game_167e02e9")}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
