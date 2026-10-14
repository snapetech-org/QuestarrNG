import { createElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type GameStatus } from "@/components/StatusBadge";
import { useInterfaceLanguage } from "@/lib/interface-locale";

/** Mutation for PATCHing a game's status, shared by the Wishlist and Playing pages. */
export function useGameStatusMutation() {
  const { toast } = useToast();
  const { t, languageFor, directionFor } = useInterfaceLanguage();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ gameId, status }: { gameId: string; status: GameStatus }) => {
      const response = await apiRequest("PATCH", `/api/games/${gameId}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      const message = "Game status updated successfully";
      toast({
        description: createElement(
          "span",
          { lang: languageFor(message), dir: directionFor(message) },
          t(message)
        ),
      });
    },
    onError: () => {
      const message = "Failed to update game status";
      toast({
        description: createElement(
          "span",
          { lang: languageFor(message), dir: directionFor(message) },
          t(message)
        ),
        variant: "destructive",
      });
    },
  });
}
