import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { localizeNotificationMessage } from "@/lib/notification-messages";
import { NOTIFICATION_LOCALES, getNotificationTitle } from "@/lib/notification-locale";

describe("localizeNotificationMessage", () => {
  it("localizes the fixed unknown-error fallback but preserves arbitrary backend details", () => {
    const fallback = localizeNotificationMessage(
      "Auto-delete failed",
      '"Game" was imported successfully, but removing it from the download client failed: unknown error. Please remove it manually.',
      "es"
    );
    const fallbackMarkup = renderToStaticMarkup(<>{fallback.content}</>);

    expect(fallbackMarkup).toContain("error desconocido");
    expect(fallbackMarkup).not.toContain(">unknown error<");

    const providerDetail = localizeNotificationMessage(
      "Auto-delete failed",
      '"Game" was imported successfully, but removing it from the download client failed: Transmission: connection reset. Please remove it manually.',
      "es"
    );
    const providerMarkup = renderToStaticMarkup(<>{providerDetail.content}</>);

    expect(providerMarkup).toContain("Transmission: connection reset");
    expect(providerMarkup).toContain('lang="en"');
  });

  it.each([
    {
      title: "Game Delayed",
      message: "Super Mario has been delayed",
      dynamic: "Super Mario",
      english: "has been delayed",
    },
    {
      title: "Content Available",
      message: "Metroid Prime 4 is available for Super Mario 3D World. Review and choose.",
      dynamic: "Metroid Prime 4",
      secondDynamic: "Super Mario 3D World",
      english: "Review and choose",
    },
    {
      title: "Import needs attention",
      message:
        'The import of "Super Mario" was interrupted. Review it in Pending Imports to run it again.',
      dynamic: "Super Mario",
      english: "Pending Imports",
    },
    {
      title: "Import needs attention",
      message:
        '"Super Mario" finished downloading but the download client removed it before Questarr could import it. Review it in Pending Imports and select the downloaded files.',
      dynamic: "Super Mario",
      english: "Pending Imports",
    },
  ])(
    "localizes server notification: $title",
    ({ title, message, dynamic, secondDynamic, english }) => {
      for (const locale of NOTIFICATION_LOCALES) {
        const localized = localizeNotificationMessage(title, message, locale);
        const markup = renderToStaticMarkup(<>{localized.content}</>);

        expect(markup).toContain(dynamic);
        if (secondDynamic) expect(markup).toContain(secondDynamic);
        expect(markup).not.toContain(english);
        expect(markup).not.toMatch(/\{(?:game|content|date)\}/);
      }
    }
  );

  it("localizes the Content Available notification title", () => {
    expect(getNotificationTitle("Content Available", "es")).toBe("Contenido disponible");
  });

  it("localizes the Release Flagged for Review notification title", () => {
    for (const locale of NOTIFICATION_LOCALES) {
      expect(getNotificationTitle("Release Flagged for Review", locale)).not.toBe(
        "Release Flagged for Review"
      );
    }
  });
});
