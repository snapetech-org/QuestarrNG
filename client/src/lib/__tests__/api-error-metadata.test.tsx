/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "@testing-library/jest-dom";
import { ApiError, throwIfResNotOk } from "@/lib/queryClient";
import { ApiErrorDescription } from "@/components/ApiErrorDescription";
import { setInterfaceLanguage } from "@/lib/interface-locale";
import {
  localizeServiceMessage,
  serializeServiceMessageDescriptor,
  serviceMessage,
  ServiceMessageError,
} from "@shared/service-messages";

afterEach(() => {
  cleanup();
  act(() => setInterfaceLanguage("en"));
});

async function reject(body: object) {
  try {
    await throwIfResNotOk(new Response(JSON.stringify(body), { status: 400 }));
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("Expected an API error");
}

describe("source-bound API error metadata", () => {
  it.each([true, false])(
    "preserves ownership for local fixed errors versus provider lookalikes: %s",
    (typed) => {
      const app = new ServiceMessageError("service.both_certificate_files_required", {});
      setInterfaceLanguage("ar");
      render(
        <ApiErrorDescription
          error={typed ? app : new Error(app.message)}
          fallbackSource="interface.unknown_error_ce512b43"
        />
      );
      expect(screen.getByText(app.message)).toHaveAttribute("lang", typed ? "en" : "und");
    }
  );
  it("retains mutated local errors verbatim without translating an unrelated key", () => {
    const error = new ServiceMessageError("service.claim_game_required", {});
    error.message = "Could not resolve game";
    setInterfaceLanguage("es");
    render(<ApiErrorDescription error={error} fallbackSource="interface.unknown_error_ce512b43" />);
    expect(screen.getByText(error.message)).toHaveAttribute("lang", "und");
  });

  it("localizes exact descriptors and preserves status, code and original payload", async () => {
    setInterfaceLanguage("ar");
    const fragment = serviceMessage("service.connected_named", { name: "Provider /srv/Test" });
    const body = {
      error: fragment.message,
      errorI18n: serializeServiceMessageDescriptor(fragment),
      errorCode: "api.bad_request",
    };
    const error = await reject(body);
    expect(error.message).toBe(localizeServiceMessage(fragment.message, fragment, "ar"));
    expect(error.message).toContain("\u2068Provider /srv/Test\u2069");
    expect(error.status).toBe(400);
    expect(error.code).toBe("api.bad_request");
    expect(error.data).toEqual(body);
    render(<ApiErrorDescription error={error} fallbackSource="Try again." />);
    expect(screen.getByText(error.message)).toHaveAttribute("lang", "ar");
  });

  it.each([
    { errorI18n: null },
    { errorI18n: "not JSON" },
    { errorI18n: { messageKey: "unknown", messageValues: {} } },
    { errorI18n: serviceMessage("service.connected_named", { name: "UNRELATED" }) },
    { messageKey: "unknown", messageValues: {} },
  ])("keeps provider/mismatched metadata raw without legacy matching: %j", async (metadata) => {
    setInterfaceLanguage("es");
    const error = await reject({ error: "Could not resolve game", ...metadata });
    expect(error.message).toBe("Could not resolve game");
    render(<ApiErrorDescription error={error} fallbackSource="Try again." />);
    expect(screen.getByText("Could not resolve game")).toHaveAttribute("lang", "und");
    expect(screen.queryByText(/UNRELATED/)).not.toBeInTheDocument();
  });

  it("accepts existing flat descriptors and treats an explicit null as authoritative", async () => {
    setInterfaceLanguage("de");
    const fragment = serviceMessage("service.connected_named", { name: "Provider" });
    const flat = await reject({ error: fragment.message, ...fragment });
    expect(flat.message).not.toBe(fragment.message);
    const raw = await reject({ error: fragment.message, ...fragment, errorI18n: null });
    expect(raw.message).toBe(fragment.message);
  });

  it("retains untagged legacy API localization and English source fallbacks", async () => {
    setInterfaceLanguage("es");
    expect((await reject({ error: "Invalid query parameters" })).message).toBe(
      "Los parámetros de consulta no son válidos"
    );
    const fragment = serviceMessage("service.realdebrid_authorization_code_expired", {});
    const error = await reject({ error: fragment.message, errorI18n: fragment });
    expect(error.message).toBe(fragment.message);
    render(<ApiErrorDescription error={error} fallbackSource="Try again." />);
    expect(screen.getByText(fragment.message)).toHaveAttribute("lang", "en");
  });
});
