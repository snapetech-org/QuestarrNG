import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WantedContentCard from "../src/components/WantedContentCard";

const { mockUseQuery } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
}));

vi.mock("@/components/InterfaceText", () => ({
  InterfaceText: ({ source }: { source: string }) => <span>{source}</span>,
}));

describe("WantedContentCard", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it("does not render a card while there is no wanted content", () => {
    mockUseQuery.mockReturnValue({ data: [] });

    render(<WantedContentCard />);

    expect(screen.queryByTestId("wanted-content-card")).toBeNull();
  });

  it("renders each game and its outstanding requested editions", () => {
    mockUseQuery.mockReturnValue({
      data: [
        {
          id: "game-1",
          gameTitle: "Portal 2",
          mode: "edition",
          pending: [{ id: 7, title: "The Lost Chapter" }],
          acquiredCount: 0,
        },
      ],
    });

    render(<WantedContentCard />);

    expect(screen.getByTestId("wanted-content-card")).toBeTruthy();
    expect(screen.getByTestId("wanted-content-game-1")).toBeTruthy();
    expect(screen.getByText("Portal 2")).toBeTruthy();
    expect(screen.getByText("The Lost Chapter")).toBeTruthy();
  });

  it("defaults to an empty list before query data is available", () => {
    mockUseQuery.mockReturnValue({ data: undefined });

    render(<WantedContentCard />);

    expect(screen.queryByTestId("wanted-content-card")).toBeNull();
  });
});
