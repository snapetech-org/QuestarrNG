/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game, GameList } from "@shared/schema";
import GameListsPage from "@/pages/game-lists";
import {
  applyInitialInterfaceLanguage,
  getInterfaceTextLanguage,
  INTERFACE_LANGUAGE_OPTIONS,
  setInterfaceLanguage,
  translateInterfaceLabel,
} from "@/lib/interface-locale";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(),
}));

const GAME_LIST_SOURCES = [
  "Custom Lists",
  "Make your own collections for co-op nights, favorites, or whatever you want to play next.",
  "Create list",
  "Your lists",
  "Only you can see and edit these lists.",
  "Loading lists…",
  "Your lists will show up here. Start with one for a group, mood, or goal.",
  "Rename {list}",
  "Delete {list}",
  "{count} game",
  "{count} games",
  "Add games",
  "Loading games…",
  "Couldn't load games for this list. Try again in a moment.",
  "This list is ready for games",
  "Add games from your library. You can keep them in other lists too.",
  "Browse library",
  "Remove {game} from {list}",
  "Start a custom list",
  "Collect games for a co-op night, a backlog goal, or any theme you like.",
  "Create your first list",
  "Rename list",
  "Create a list",
  "Give it a short name so you can find the right games later.",
  "List name",
  "e.g. Co-op with friends",
  "Save name",
  "Add games to {list}",
  "Add games to your list",
  "Select games from your library. A game can be in more than one list.",
  "Search library games",
  "Search your games…",
  "Loading library…",
  "Add games to your library before building a list.",
  "No games match that search.",
  "Add {game} to {list}",
  "Delete this list?",
  "The games stay in your library. Only this list and its membership are removed.",
  "Delete list",
  "List saved",
  "“{name}” is ready.",
  "Couldn't save list",
  "Check the name and try again. List names must be unique.",
  "Couldn't delete list",
  "Couldn't update this list",
  "your list",
] as const;

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const list = {
    id: "list-1",
    userId: "user-1",
    name: "Co-op with friends",
    createdAt: null,
    updatedAt: null,
  } as GameList;
  const game = {
    id: "game-1",
    title: "Portal 2",
    status: "owned",
    coverUrl: null,
  } as Game;
  queryClient.setQueryData(["/api/game-lists"], [list]);
  queryClient.setQueryData(["/api/games"], [game]);
  queryClient.setQueryData(["/api/game-lists", list.id, "games"], []);
  return queryClient;
}

describe("custom game list localization", () => {
  beforeEach(() => {
    setInterfaceLanguage("es");
    applyInitialInterfaceLanguage();
  });

  afterEach(() => {
    setInterfaceLanguage("en");
  });

  it("provides every fixed game list string in all supported locales", () => {
    for (const source of GAME_LIST_SOURCES) {
      for (const { value: language } of INTERFACE_LANGUAGE_OPTIONS) {
        if (language === "en") continue;
        expect(getInterfaceTextLanguage(source, language)).toBe(language);
        const translated = translateInterfaceLabel(source, language);
        const expected = [...source.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)]
          .map((match) => match[1])
          .sort();
        expect(translated).not.toBe(source);
        expect(
          [...translated.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort()
        ).toEqual(expected);
      }
    }
  });

  it("renders translated controls and keeps user supplied list and game names intact", async () => {
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <GameListsPage />
      </QueryClientProvider>
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Listas personalizadas" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cambiar el nombre de Co-op with friends" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Eliminar Co-op with friends" })).toBeInTheDocument();
    expect(screen.getByText("0 juegos")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Añadir juegos" }));
    expect(
      await screen.findByRole("heading", { name: "Añadir juegos a Co-op with friends" })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Buscar tus juegos…")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Añadir Portal 2 a Co-op with friends" })
    ).toBeInTheDocument();
  });
});
