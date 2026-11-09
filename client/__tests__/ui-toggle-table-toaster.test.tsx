/** @vitest-environment jsdom */
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toggle } from "../src/components/ui/toggle";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../src/components/ui/table";
import { Toaster } from "../src/components/ui/toaster";
import { setInterfaceLanguage } from "../src/lib/interface-locale";
import { ServiceMessageText } from "../src/components/ServiceMessageText";
import { serviceMessage } from "../../shared/service-messages";

const mockToasts = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toasts: mockToasts.current }),
}));

describe("Toggle", () => {
  it("toggles pressed state on click and calls onPressedChange", () => {
    const onPressedChange = vi.fn();
    render(
      <Toggle aria-label="Bold" onPressedChange={onPressedChange}>
        B
      </Toggle>
    );

    const button = screen.getByRole("button", { name: "Bold" });
    expect(button).toHaveAttribute("data-state", "off");

    fireEvent.click(button);
    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it("applies outline variant and size classes", () => {
    render(
      <Toggle aria-label="Italic" variant="outline" size="sm">
        I
      </Toggle>
    );
    const button = screen.getByRole("button", { name: "Italic" });
    expect(button.className).toContain("border-input");
    expect(button.className).toContain("h-9");
  });
});

describe("Table", () => {
  it("renders a full table structure with header, body, footer, and caption", () => {
    render(
      <Table>
        <TableCaption>My caption</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Row value</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Footer value</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    expect(screen.getByText("My caption")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Row value")).toBeInTheDocument();
    expect(screen.getByText("Footer value")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("Toaster", () => {
  afterEach(() => {
    act(() => setInterfaceLanguage("en"));
    mockToasts.current = [];
  });

  it("renders nothing when there are no toasts", () => {
    mockToasts.current = [];
    const { container } = render(<Toaster />);
    expect(container.querySelectorAll("[data-testid]").length).toBe(0);
  });

  it("renders a toast with title, description, and action", () => {
    mockToasts.current = [
      {
        id: "t1",
        title: "Saved",
        description: "Your changes were saved.",
        action: <button>Undo</button>,
        open: true,
      },
    ];
    render(<Toaster />);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.getByText("Your changes were saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("renders a toast without a title or description", () => {
    mockToasts.current = [{ id: "t2", open: true }];
    const { container } = render(<Toaster />);
    expect(container.querySelector(".font-semibold")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("undefined");
  });

  it("updates the toast controls and tagged content with the interface language, preserving provider text", async () => {
    const result = serviceMessage("service.connected_named", { name: "Settings" });
    mockToasts.current = [
      {
        id: "localized",
        title: <ServiceMessageText message="Settings" />,
        description: <ServiceMessageText message={result.message} metadata={result} />,
        open: true,
        duration: Infinity,
      },
    ];
    act(() => setInterfaceLanguage("ar"));
    const { container } = render(<Toaster />);
    expect(screen.getByRole("region", { name: "الإشعارات (F8)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إغلاق" })).toBeInTheDocument();
    const raw = container.querySelector('bdi[lang="und"]');
    expect(raw).toHaveTextContent("Settings");
    expect(raw).toHaveAttribute("dir", "auto");
    expect(container.querySelector('bdi[lang="ar"]')).toHaveTextContent(/Settings/);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("إشعار"));

    act(() => setInterfaceLanguage("en"));
    expect(screen.getByRole("region", { name: "Notifications (F8)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(container.querySelector('bdi[lang="en"]')).toHaveTextContent(result.message);
    expect(raw).toHaveTextContent("Settings");
  });
});
