import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { InterfaceDirectionProvider } from "../InterfaceDirectionProvider";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { setInterfaceLanguage } from "@/lib/interface-locale";

afterEach(() => {
  cleanup();
  act(() => setInterfaceLanguage("en"));
});

function Controls() {
  return (
    <InterfaceDirectionProvider>
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">First</TabsTrigger>
          <TabsTrigger value="two">Second</TabsTrigger>
        </TabsList>
      </Tabs>
    </InterfaceDirectionProvider>
  );
}

describe("interface direction for Radix controls", () => {
  it.each([
    ["ar", "ArrowLeft", "rtl"],
    ["en", "ArrowRight", "ltr"],
  ] as const)(
    "uses %s direction for layout and keyboard focus",
    async (language, key, direction) => {
      act(() => setInterfaceLanguage(language));
      render(<Controls />);
      expect(screen.getByRole("tablist").parentElement).toHaveAttribute("dir", direction);
      act(() => screen.getByRole("tab", { name: "First" }).focus());
      fireEvent.keyDown(screen.getByRole("tab", { name: "First" }), { key });
      await waitFor(() => expect(screen.getByRole("tab", { name: "Second" })).toHaveFocus());
    }
  );
  it("updates existing controls when the interface language changes", () => {
    render(<Controls />);
    act(() => setInterfaceLanguage("ar"));
    expect(screen.getByRole("tablist").parentElement).toHaveAttribute("dir", "rtl");
    act(() => setInterfaceLanguage("de"));
    expect(screen.getByRole("tablist").parentElement).toHaveAttribute("dir", "ltr");
  });
});
