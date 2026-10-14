import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import TagListEditor from "@/components/TagListEditor";
import { setInterfaceLanguage } from "@/lib/interface-locale";

describe("TagListEditor localized copy", () => {
  it("translates field copy and keeps entered release-group names unchanged", () => {
    act(() => setInterfaceLanguage("es"));
    render(<ControlledTagListEditor />);

    const input = screen.getByLabelText("Nombres de los grupos de lanzamiento");
    expect(input).toHaveAttribute("placeholder", "Por ejemplo, CODEX, SKIDROW, EMPRESS...");
    expect(input).toHaveAttribute("lang", "es");
    expect(
      screen.getByText(
        "No hay grupos preferidos configurados. Todos los grupos tendrán la misma prioridad."
      )
    ).toHaveAttribute("lang", "es");
    expect(
      screen.getByRole("button", { name: "Añadir grupo de lanzamiento preferido" })
    ).toHaveAttribute("lang", "es");

    fireEvent.change(input, { target: { value: "FitGirl" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const tag = screen.getByText("FitGirl");
    expect(tag).toHaveAttribute("lang", "und");
    expect(tag).toHaveAttribute("dir", "auto");
    expect(screen.getByRole("button", { name: "Quitar FitGirl" })).toHaveAttribute("lang", "es");

    act(() => setInterfaceLanguage("en"));
  });
});

function ControlledTagListEditor() {
  const [tags, setTags] = useState<string[]>([]);
  return (
    <TagListEditor
      tags={tags}
      onChange={setTags}
      inputId="release-group"
      label="Release Group Names"
      placeholder="e.g. CODEX, SKIDROW, EMPRESS..."
      helperText="Press Enter or click + to add a group. Comparison is case-insensitive."
      emptyText="No preferred groups configured. All groups will be considered equally."
      addAriaLabel="Add preferred release group"
    />
  );
}
