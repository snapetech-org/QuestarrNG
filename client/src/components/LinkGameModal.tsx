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
        title: localizedText("Game Linked"),
        description: localizedText(
          "Continue by reviewing the import's source and destination paths."
        ),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/imports/pending"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: localizedText("Failed to Link Game"),
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
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {localizedText("Searching…")}
      </div>
    );
  } else if (games.length === 0) {
    resultsContent = (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground px-4 text-center">
        {localizedText(
          "No games found. Try a different search, or add the game to your library first."
        )}
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
              "flex items-center gap-3 w-full rounded-sm p-2 text-left hover:bg-accent transition-colors",
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
          <DialogTitle lang={languageFor("Link to a Game")} dir={directionFor("Link to a Game")}>
            {t("Link to a Game")}
          </DialogTitle>
          <DialogDescription
            lang={languageFor(
              "The game originally linked to {title} could no longer be found. Select the correct game to continue importing this download."
            )}
            dir={directionFor(
              "The game originally linked to {title} could no longer be found. Select the correct game to continue importing this download."
            )}
          >
            {formatInterfaceMessage(
              "The game originally linked to {title} could no longer be found. Select the correct game to continue importing this download.",
              { title: downloadTitle },
              language
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label
              htmlFor="link-game-search"
              lang={languageFor("Search your library")}
              dir={directionFor("Search your library")}
            >
              {t("Search your library")}
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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
                placeholder={t("Search by title…")}
                lang={languageFor("Search by title…")}
                dir={directionFor("Search by title…")}
                className="pl-8"
                autoFocus
              />
            </div>
          </div>

          <ScrollArea className="h-64 rounded-md border">{resultsContent}</ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <span lang={languageFor("Cancel")} dir={directionFor("Cancel")}>
              {t("Cancel")}
            </span>
          </Button>
          <Button
            disabled={!selectedGameId || linkMutation.isPending}
            onClick={() => selectedGameId && linkMutation.mutate(selectedGameId)}
          >
            {linkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <span lang={languageFor("Link Game")} dir={directionFor("Link Game")}>
              {t("Link Game")}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
