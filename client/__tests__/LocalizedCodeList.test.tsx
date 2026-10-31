/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it } from "vitest";
import { LocalizedCodeList } from "@/components/LocalizedCodeList";
import { setInterfaceLanguage } from "@/lib/interface-locale";

afterEach(() => {
  cleanup();
  act(() => setInterfaceLanguage("en"));
});

describe("LocalizedCodeList", () => {
  it("updates conjunctions and direction while preserving literal code paths", () => {
    act(() => setInterfaceLanguage("en"));
    render(
      <div data-testid="list">
        <LocalizedCodeList values={["dlc/", "update/", "extra/"]} />
      </div>
    );
    const list = screen.getByTestId("list");
    expect(list).toHaveTextContent("dlc/, update/, and extra/");

    act(() => setInterfaceLanguage("fr"));
    expect(list).toHaveTextContent("dlc/, update/ et extra/");
    expect(list.firstElementChild).toHaveAttribute("lang", "fr");

    act(() => setInterfaceLanguage("ar"));
    expect(list).toHaveTextContent("dlc/ وupdate/ وextra/");
    expect(list.firstElementChild).toHaveAttribute("dir", "rtl");
    for (const path of ["dlc/", "update/", "extra/"]) {
      const code = screen.getByText(path);
      expect(code.tagName).toBe("CODE");
      expect(code.parentElement).toHaveAttribute("dir", "ltr");
      expect(code.parentElement).toHaveAttribute("translate", "no");
    }
  });
});
