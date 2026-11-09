// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlayPage from "@/pages/play";
import { setInterfaceLanguage } from "@/lib/interface-locale";

const mockState = vi.hoisted(() => ({
  callbacks: null as null | {
    onPauseChange: (paused: boolean) => void;
    onObjectiveChange: (objective: {
      inside: boolean;
      needsKeycard: boolean;
      hasKeycard: boolean;
    }) => void;
    onCaught: () => void;
    onWin: () => void;
    onStealthChange: (state: {
      stance: "standing" | "crouched";
      awareness: number;
      illumination: number;
    }) => void;
    onHackProgress: (progress: number, canInteract: boolean) => void;
  },
  seed: undefined as number | undefined,
  start: vi.fn(),
  dispose: vi.fn(),
  setPaused: vi.fn(),
  regenerate: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
  setGhostUnlocked: vi.fn(),
}));

vi.mock("wouter", () => ({ useLocation: () => ["/play", mockState.navigate] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mockState.toast }) }));
vi.mock("@/hooks/use-local-storage-state", () => ({
  useLocalStorageState: () => [false, mockState.setGhostUnlocked],
}));
vi.mock("@/game/infiltration-game", () => ({
  InfiltrationGame: class MockInfiltrationGame {
    constructor(
      _canvas: HTMLCanvasElement,
      seed: number,
      callbacks: NonNullable<typeof mockState.callbacks>
    ) {
      mockState.seed = seed;
      mockState.callbacks = callbacks;
    }

    start() {
      mockState.start();
    }

    dispose() {
      mockState.dispose();
    }

    setPaused(paused: boolean) {
      mockState.setPaused(paused);
      mockState.callbacks?.onPauseChange(paused);
    }

    regenerate(seed: number) {
      mockState.regenerate(seed);
    }
  },
}));

function callbacks() {
  if (!mockState.callbacks) throw new Error("The game did not receive its callbacks");
  return mockState.callbacks;
}

function setUrl(url: string) {
  window.history.replaceState({}, "", url);
}

describe("PlayPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setInterfaceLanguage("en");
    mockState.callbacks = null;
    mockState.seed = undefined;
    vi.stubGlobal("crypto", {
      getRandomValues: (values: Uint32Array) => {
        values[0] = 1234;
        return values;
      },
    });
    setUrl("/play");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    setUrl("/");
  });

  it("starts, pauses, exits, and uses a generated seed when no replay seed is supplied", () => {
    render(<PlayPage />);

    expect(mockState.seed).toBe(1234);
    expect(screen.getByRole("heading", { name: "Ghost the Terminal" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Cross the approach and get through the gate");

    fireEvent.click(screen.getByRole("button", { name: "Begin infiltration" }));
    expect(mockState.setPaused).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Pause the infiltration" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause the infiltration" }));
    expect(mockState.setPaused).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("heading", { name: "Ghost the Terminal" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Exit to Questarr" }));
    expect(mockState.navigate).toHaveBeenCalledWith("/");
  });

  it("replays parsed seeds, updates objectives and stealth, reports detection, and handles wins", async () => {
    setUrl("/play?seed=77");
    const first = render(<PlayPage />);
    expect(mockState.seed).toBe(77);
    first.unmount();

    setUrl("/play?seed=not-a-number");
    const view = render(<PlayPage />);
    expect(mockState.seed).toBe(1234);
    const game = callbacks();

    act(() => {
      game.onObjectiveChange({ inside: true, needsKeycard: true, hasKeycard: false });
    });
    await waitFor(() => {
      expect(document.body).toHaveTextContent("Find the keycard, then reach the console");
      expect(document.body).toHaveTextContent("Keycard");
    });

    act(() => {
      game.onObjectiveChange({ inside: true, needsKeycard: true, hasKeycard: true });
    });
    expect(document.body).toHaveTextContent("Keycard acquired");
    expect(document.body).toHaveTextContent("Reach the console and hack it unseen");

    act(() => {
      game.onObjectiveChange({ inside: true, needsKeycard: false, hasKeycard: false });
    });
    expect(document.body).not.toHaveTextContent("Keycard acquired");

    const stealth = {
      stance: "crouched" as const,
      awareness: 0.8,
      illumination: 0.1,
    };
    act(() => {
      game.onStealthChange(stealth);
      game.onStealthChange(stealth);
    });
    const detection = screen.getByRole("progressbar", { name: "Guard detection" });
    expect(detection).toHaveAttribute("aria-valuenow", "80");
    expect(detection.firstElementChild).toHaveStyle({ width: "80%" });
    expect(screen.getByText("Crouched")).toBeInTheDocument();
    expect(screen.getByText("In shadow")).toHaveClass("text-sky-300");

    act(() => {
      game.onStealthChange({ stance: "standing", awareness: 0.4, illumination: 0.9 });
    });
    expect(detection).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("Standing")).toBeInTheDocument();
    expect(screen.getByText("In the open")).toHaveClass("text-white/40");
    act(() => {
      game.onStealthChange({ stance: "standing", awareness: 0.1, illumination: 0.9 });
    });
    expect(detection).toHaveAttribute("aria-valuenow", "10");

    act(() => {
      game.onHackProgress(0.5, true);
    });
    const hackPrompt = screen.getByText("Hacking — stay in range").closest("div.rounded-md");
    expect(hackPrompt).toHaveStyle({ opacity: "1" });
    act(() => {
      game.onHackProgress(1, true);
    });
    expect(hackPrompt).toHaveStyle({ opacity: "0" });
    act(() => {
      game.onHackProgress(0.5, false);
      game.onCaught();
    });
    expect(mockState.toast).toHaveBeenCalledWith({
      description: "Spotted. Incident report filed — back to the entry point.",
    });

    act(() => game.onWin());
    expect(screen.getByRole("heading", { name: "Terminal hacked" })).toBeInTheDocument();
    expect(mockState.setGhostUnlocked).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Play again (new layout)" }));
    expect(mockState.regenerate).toHaveBeenCalledWith(1234);
    expect(mockState.setPaused).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole("heading", { name: "Terminal hacked" })).not.toBeInTheDocument();

    mockState.dispose.mockClear();
    view.unmount();
    act(() => {
      game.onStealthChange({ stance: "standing", awareness: 0, illumination: 1 });
      game.onHackProgress(0, false);
    });
    expect(mockState.dispose).toHaveBeenCalledOnce();
  });
});
