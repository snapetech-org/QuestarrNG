import { test, expect, type Locator, type Page } from "@playwright/test";

const game = {
  id: "test-game-id-123",
  title: "Localization Demo",
  coverUrl: "",
  platforms: ["PC"],
  genres: ["Adventure"],
  status: "wanted",
  addedAt: "2026-10-01T00:00:00.000Z",
  igdbId: 1877,
  hidden: false,
};

async function openLocalizedBundle(
  page: Page,
  updateCount: number,
  regionalFormat?: string,
  ageDays?: number,
  gameTitle = game.title
) {
  const pubDate =
    ageDays === undefined
      ? "2026-10-01T00:00:00.000Z"
      : new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();

  await page.addInitScript((format) => {
    localStorage.setItem("questarr.interface-language", "ar");
    if (format) localStorage.setItem("questarrng.regional-format", format);
  }, regionalFormat);

  await page.route("/api/games*", async (route) => {
    await route.fulfill({ json: [{ ...game, title: gameTitle }] });
  });
  await page.route("**/api/indexers/enabled", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/downloaders/enabled", async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route("**/api/search?*", async (route) => {
    const updates = Array.from({ length: updateCount }, (_, index) => ({
      title: gameTitle + " Update " + (index + 1),
      link: "magnet:?xt=urn:btih:UPDATE" + (index + 1),
      pubDate,
      seeders: 10,
      group: "Example Group",
      indexerName: "Example Indexer",
    }));
    await route.fulfill({
      json: {
        items: [
          {
            title: gameTitle + " Full",
            link: "magnet:?xt=urn:btih:MAIN",
            pubDate,
            seeders: 12345,
            age: ageDays,
            group: "Example Group",
            indexerName: "Example Indexer",
          },
          ...updates,
        ],
        total: updateCount + 1,
        offset: 0,
      },
    });
  });

  await page.goto("/");
  await page.getByTestId(`card-game-${game.id}`).click();
  await page.getByTestId("button-download-game").click();
  const downloadDialog = page.getByRole("dialog", {
    name: "تنزيل " + gameTitle,
    exact: true,
  });
  await expect(downloadDialog).toHaveAttribute("dir", "rtl");
  const dialogTitle = downloadDialog.getByRole("heading", {
    name: "تنزيل " + gameTitle,
    exact: true,
  });
  await expect(dialogTitle.locator('span[lang="und"][dir="auto"]')).toHaveText(gameTitle);
  const downloadButton = downloadDialog.getByRole("button", {
    name: "تنزيل " + gameTitle + " Full",
  });
  await downloadButton.waitFor();
  return downloadButton;
}

async function expectSeparatedDownloadAccessibleName(
  page: Page,
  button: Locator,
  actionText: string,
  gameTitle = "Localization Demo"
) {
  const labelIds = (await button.getAttribute("aria-labelledby"))?.split(/\s+/) ?? [];
  expect(labelIds).toHaveLength(2);
  const [actionLabelId, titleLabelId] = labelIds;
  const actionLabel = page.locator(`[id="${actionLabelId}"]`);
  const titleLabel = page.locator(`[id="${titleLabelId}"]`);

  const fullTitle = `${gameTitle} Full`;
  await expect(button).toHaveAccessibleName(`${actionText} ${fullTitle}`);
  await expect(button).not.toHaveAttribute("lang");
  await expect(button).not.toHaveAttribute("dir");
  await expect(actionLabel).toHaveText(actionText);
  await expect(actionLabel).toHaveAttribute("lang", "ar");
  await expect(actionLabel).toHaveAttribute("dir", "rtl");
  await expect(titleLabel).toHaveText(fullTitle);
  await expect(titleLabel).toHaveAttribute("lang", "und");
  await expect(titleLabel).toHaveAttribute("dir", "auto");
}

test.describe("Game download interface language", () => {
  test("formats sidebar badges with the selected regional digits", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("questarr.interface-language", "ar");
      localStorage.setItem("questarrng.regional-format", "ar");
    });
    await page.route("**/api/games*", async (route) =>
      route.fulfill({
        json: Array.from({ length: 2 }, (_, index) => ({
          ...game,
          id: `wishlist-${index + 1}`,
          title: `Wishlist game ${index + 1}`,
          status: "wanted",
        })),
      })
    );
    await page.route("**/api/downloads*", async (route) =>
      route.fulfill({
        json: {
          downloads: [{ id: "active-download", status: "downloading" }],
          errors: [],
        },
      })
    );

    await page.goto("/");
    const wishlistButton = page.getByTestId("nav-wishlist");
    const downloadsButton = page.getByTestId("nav-downloads");
    const arabicTwo = await page.evaluate(() => new Intl.NumberFormat("ar").format(2));
    const arabicOne = await page.evaluate(() => new Intl.NumberFormat("ar").format(1));
    await expect(wishlistButton.getByText(arabicTwo, { exact: true })).toBeVisible();
    await expect(wishlistButton).toHaveAttribute("aria-label", new RegExp(`\\(${arabicTwo}\\)$`));
    await expect(downloadsButton.getByText(arabicOne, { exact: true })).toBeVisible();
    await expect(downloadsButton).toHaveAttribute("aria-label", new RegExp(`\\(${arabicOne}\\)$`));
    await expect(page.getByTestId("card-game-wishlist-1")).toBeVisible();

    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-sidebar-regional-counts-ar.png`,
        fullPage: true,
      });
    }
  });

  test("keeps English when it is the highest-priority browser language", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("questarr.interface-language");
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: ["en-US", "es"],
      });
    });

    await page.goto("/");

    await expect(page.getByTestId("nav-library")).toContainText("Library");
  });

  test("marks native and English locale names in selectors", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("questarr.interface-language", "ar");
      localStorage.setItem("questarrng.regional-format", "ar");
    });
    await page.goto("/settings");

    const interfaceLanguage = page.locator("#interface-language");
    await expect(interfaceLanguage.locator('[lang="ar"][dir="rtl"]')).toHaveText("العربية");
    await expect(interfaceLanguage.locator('[lang="en"][dir="ltr"]')).toContainText("Arabic");
    await interfaceLanguage.click();
    const interfaceArabicOption = page.getByRole("option", {
      name: "العربية — Arabic",
      exact: true,
    });
    await expect(interfaceArabicOption.locator('[lang="ar"][dir="rtl"]')).toHaveText("العربية");
    await expect(interfaceArabicOption.locator('[lang="en"][dir="ltr"]')).toContainText("Arabic");
    await page.keyboard.press("Escape");

    const regionalFormat = page.locator("#regional-format");
    await expect(regionalFormat.locator('[lang="ar"][dir="rtl"]')).toHaveText("العربية");
    await expect(regionalFormat.locator('[lang="en"][dir="ltr"]')).toContainText("Arabic");
    await regionalFormat.click();
    const regionalArabicOption = page.getByRole("option", {
      name: "العربية — Arabic",
      exact: true,
    });
    await expect(regionalArabicOption.locator('[lang="ar"][dir="rtl"]')).toHaveText("العربية");
    await expect(regionalArabicOption.locator('[lang="en"][dir="ltr"]')).toContainText("Arabic");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-bilingual-locale-options-ar.png`,
        fullPage: true,
      });
    }
  });

  test("marks translated calendar labels and release counts with their language", async ({
    page,
  }) => {
    const year = new Date().getFullYear();
    await page.addInitScript(() => {
      localStorage.setItem("questarr.interface-language", "ar");
      localStorage.setItem("questarrng.regional-format", "ja");
    });
    await page.route("**/api/config", async (route) =>
      route.fulfill({ json: { igdb: { configured: true } } })
    );
    await page.route("**/api/games*", async (route) =>
      route.fulfill({
        json: [
          {
            ...game,
            id: "calendar-game",
            title: "Calendar Localization Demo",
            releaseDate: `${year}-12-15`,
          },
          {
            ...game,
            id: "calendar-game-two",
            title: "Calendar Localization Demo Two",
            releaseDate: `${year}-12-15`,
          },
        ],
      })
    );

    await page.goto("/calendar");
    const previousPeriod = page.getByRole("button", { name: "الفترة السابقة" });
    await expect(previousPeriod).toHaveAttribute("lang", "ar");
    await expect(previousPeriod).toHaveAttribute("dir", "rtl");

    const emptyMonthLabel = page.getByText("لا توجد إصدارات", { exact: true }).first();
    await expect(emptyMonthLabel).toBeVisible();
    await expect(emptyMonthLabel).toHaveAttribute("lang", "ar");
    await expect(emptyMonthLabel).toHaveAttribute("dir", "rtl");

    await page.getByRole("combobox").click();
    await page.getByRole("option").nth(1).click();
    const monthsToDecember = (11 - new Date().getMonth() + 12) % 12;
    for (let index = 0; index < monthsToDecember; index += 1) {
      await page.getByRole("button", { name: "الفترة التالية" }).click();
    }
    const calendarSearch = page.getByRole("textbox");
    await expect(calendarSearch).toHaveAttribute("lang", "ar");
    await expect(calendarSearch).toHaveAttribute("dir", "rtl");
    await expect(calendarSearch).toHaveCSS("direction", "rtl");
    await calendarSearch.fill("Calendar Localization Demo");
    await expect(calendarSearch).toHaveAttribute("lang", "und");
    await expect(calendarSearch).toHaveAttribute("dir", "auto");
    await expect(calendarSearch).toHaveCSS("direction", "ltr");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-calendar-search-latin-text-und-ar.png`,
        fullPage: true,
      });
    }
    const clearCalendarSearch = page.getByRole("button", { name: "مسح البحث", exact: true });
    await expect(clearCalendarSearch).toHaveAttribute("lang", "ar");
    await expect(clearCalendarSearch).toHaveAttribute("dir", "rtl");
    await clearCalendarSearch.click();
    await expect(calendarSearch).toHaveValue("");
    await expect(calendarSearch).toHaveAttribute("lang", "ar");
    await calendarSearch.fill("لعبة");
    await expect(calendarSearch).toHaveAttribute("lang", "und");
    await expect(calendarSearch).toHaveCSS("direction", "rtl");
    await calendarSearch.clear();
    await expect(calendarSearch).toHaveAttribute("lang", "ar");
    await expect(calendarSearch).toHaveAttribute("dir", "rtl");
    await expect(calendarSearch).toHaveCSS("direction", "rtl");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-calendar-search-direction.png`,
        fullPage: true,
      });
    }
    const releaseCountLabel = page.locator('span[id$="-releases"]').first();
    await expect(releaseCountLabel).not.toBeEmpty();
    await expect(releaseCountLabel).toHaveText("إصداران");
    await expect(releaseCountLabel).toHaveAttribute("lang", "ar");
    await expect(releaseCountLabel).toHaveAttribute("dir", "rtl");
    const releaseCountLabelId = await releaseCountLabel.getAttribute("id");
    expect(releaseCountLabelId).toBeTruthy();
    const releaseCountButton = page.locator(`button[aria-labelledby~="${releaseCountLabelId}"]`);
    await expect(releaseCountButton).toHaveCount(1);
    await expect(releaseCountButton).toHaveAccessibleName(/إصدار/u);
    await expect(releaseCountButton).not.toHaveAttribute("lang");
    await expect(releaseCountButton).toHaveAttribute("dir", "auto");
    const labelledByIds = (await releaseCountButton.getAttribute("aria-labelledby"))
      ?.split(/\s+/)
      .filter(Boolean);
    expect(labelledByIds).toContain(releaseCountLabelId);
    const dateLabelId = labelledByIds?.find((id) => id.endsWith("-date"));
    expect(dateLabelId).toBeTruthy();
    const calendarDate = dateLabelId?.match(/-(\d{4}-\d{2}-\d{2})-date$/u)?.[1];
    expect(calendarDate).toBeTruthy();
    if (!calendarDate) throw new Error("Calendar date label did not include a date.");
    const dateLabel = page.locator(`[id="${dateLabelId}"]`);
    await expect(dateLabel).toHaveAttribute("lang", "ja");
    await expect(dateLabel).toHaveAttribute("dir", "ltr");
    const expectedDateLabel = await page.evaluate((dateKey) => {
      const [year, month, day] = dateKey.split("-").map(Number);
      return new Date(year, month - 1, day).toLocaleDateString("ja", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }, calendarDate);
    await expect(dateLabel).toHaveText(expectedDateLabel);
    await expect(releaseCountButton).toHaveAccessibleName(new RegExp(expectedDateLabel, "u"));
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-calendar-arabic-dual.png`,
        fullPage: true,
      });
    }
  });

  test.describe("calendar under a Persian browser locale", () => {
    test.use({ locale: "fa-IR" });

    test("formats the Gregorian calendar grid with the Gregorian month and year", async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem("questarr.interface-language", "en");
        localStorage.setItem("questarrng.regional-format", "system");
      });
      await page.route("**/api/config", async (route) =>
        route.fulfill({ json: { igdb: { configured: true } } })
      );
      const calendarYear = await page.evaluate(() => new Date().getFullYear());
      await page.route("**/api/games*", async (route) =>
        route.fulfill({
          json: [
            { ...game, releaseDate: `${calendarYear}-10-15` },
            {
              ...game,
              id: "undated-calendar-game",
              title: "Mystery Release Date",
              releaseDate: `${calendarYear}-12-31`,
            },
          ],
        })
      );

      await page.goto("/calendar");
      const [expectedOctober, expectedPersianMonth, expectedYear, groupedYear] =
        await page.evaluate(
          (year) => [
            new Intl.DateTimeFormat(undefined, { calendar: "gregory", month: "long" }).format(
              new Date(year, 9, 1)
            ),
            new Intl.DateTimeFormat(undefined, { month: "long" }).format(new Date(year, 9, 1)),
            new Intl.NumberFormat(undefined, { useGrouping: false }).format(year),
            new Intl.NumberFormat(undefined).format(year),
          ],
          calendarYear
        );
      expect(expectedOctober).not.toBe(expectedPersianMonth);
      await expect(page.getByRole("heading", { name: expectedOctober, exact: true })).toBeVisible();
      const undatedYearHeading = page.getByRole("heading", { name: /No Release Date/u });
      await expect(undatedYearHeading).toContainText(expectedYear);
      await expect(undatedYearHeading).not.toContainText(groupedYear);
      if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
        await page.screenshot({
          path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-calendar-gregorian-year-view-fa-IR.png`,
          fullPage: true,
        });
      }

      await page.getByRole("combobox").click();
      await page.getByRole("option").nth(1).click();

      const expectedTitle = await page.evaluate(() =>
        new Intl.DateTimeFormat(undefined, {
          calendar: "gregory",
          month: "long",
          year: "numeric",
        }).format(new Date())
      );
      const title = page.locator("span.text-base.font-semibold");
      await expect(title).toHaveText(expectedTitle);
      await expect(title).toHaveAttribute("lang", "fa-IR");
      const firstDateLabel = page.locator('span[id$="-date"]').first();
      const firstDateLabelId = await firstDateLabel.getAttribute("id");
      const firstDateKey = firstDateLabelId?.match(/-(\d{4}-\d{2}-\d{2})-date$/u)?.[1];
      expect(firstDateKey).toBeTruthy();
      if (!firstDateKey) throw new Error("Calendar date label did not include a date.");
      const [expectedGridDateLabel, defaultGridDateLabel] = await page.evaluate((dateKey) => {
        const [year, month, day] = dateKey.split("-").map(Number);
        const date = new Date(year, month - 1, day);
        const options: Intl.DateTimeFormatOptions = {
          weekday: "long",
          month: "long",
          day: "numeric",
        };
        return [
          new Intl.DateTimeFormat(undefined, { ...options, calendar: "gregory" }).format(date),
          new Intl.DateTimeFormat(undefined, options).format(date),
        ];
      }, firstDateKey);
      expect(expectedGridDateLabel).not.toBe(defaultGridDateLabel);
      await expect(firstDateLabel).toHaveText(expectedGridDateLabel);
      await expect(firstDateLabel).toHaveAttribute("lang", "fa-IR");
      if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
        await page.screenshot({
          path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-calendar-gregorian-grid-fa-IR.png`,
          fullPage: true,
        });
      }
    });
  });

  test("localizes download ages on the Downloads and Search pages", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("questarr.interface-language", "ar");
      localStorage.setItem("questarrng.regional-format", "es");
    });
    await page.route("**/api/downloads", async (route) =>
      route.fulfill({
        json: {
          downloads: [
            {
              id: "e2e-age-download",
              name: "Localized age fixture",
              status: "completed",
              progress: 100,
              downloaderId: "downloader-1",
              downloaderName: "SABnzbd",
              downloadType: "usenet",
              age: 5,
              grabs: 12,
            },
          ],
          errors: [],
        },
      })
    );

    await page.goto("/downloads");
    const expectedAge = await page.evaluate(() =>
      new Intl.RelativeTimeFormat("ar")
        .format(-5, "day")
        .replace(new Intl.NumberFormat("ar").format(5), new Intl.NumberFormat("es").format(5))
    );
    const downloadsAge = page.getByTestId("badge-age-e2e-age-download");
    await expect(downloadsAge).toContainText(expectedAge);
    const ageValue = downloadsAge.getByText(expectedAge, { exact: true });
    await expect(ageValue).toHaveText(expectedAge);
    await expect(ageValue).toHaveAttribute("lang", "ar");
    await expect(ageValue).toHaveAttribute("dir", "rtl");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-downloads-localized-age.png`,
        fullPage: true,
      });
    }

    await page.route("**/api/games*", async (route) => route.fulfill({ json: [game] }));
    await page.route("**/api/indexers/enabled", async (route) => route.fulfill({ json: [] }));
    await page.route("**/api/downloaders/enabled", async (route) => route.fulfill({ json: [] }));
    await page.route("**/api/search?*", async (route) =>
      route.fulfill({
        json: {
          items: [
            {
              title: "Localized Search Age",
              link: "https://example.com/release/age",
              guid: "e2e-age-search",
              pubDate: "2026-10-01T00:00:00.000Z",
              size: 1024,
              grabs: 12,
              age: 5,
              downloadType: "usenet",
            },
          ],
          total: 1,
          offset: 0,
        },
      })
    );

    await page.goto("/search");
    await page.getByTestId("input-search-query").fill("Localized");
    const searchAge = page.getByText(expectedAge, { exact: true });
    await expect(searchAge).toHaveAttribute("lang", "ar");
    await expect(searchAge).toHaveAttribute("dir", "rtl");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-search-localized-age.png`,
        fullPage: true,
      });
    }
  });

  test("formats translated calendar counts with regional digits", async ({ page }) => {
    const year = new Date().getFullYear();
    await page.addInitScript(() => {
      localStorage.setItem("questarr.interface-language", "es");
      localStorage.setItem("questarrng.regional-format", "ar");
    });
    await page.route("**/api/config", async (route) =>
      route.fulfill({ json: { igdb: { configured: true } } })
    );
    await page.route("**/api/games*", async (route) =>
      route.fulfill({
        json: [
          {
            ...game,
            id: "spanish-calendar-game-one",
            title: "Spanish Calendar Localization Demo One",
            releaseDate: `${year}-12-15`,
          },
          {
            ...game,
            id: "spanish-calendar-game-two",
            title: "Spanish Calendar Localization Demo Two",
            releaseDate: `${year}-12-15`,
          },
        ],
      })
    );

    await page.goto("/calendar");
    await page.getByRole("combobox").click();
    await page.getByRole("option").nth(1).click();
    const monthsToDecember = (11 - new Date().getMonth() + 12) % 12;
    for (let index = 0; index < monthsToDecember; index += 1) {
      await page.getByRole("button", { name: "Período siguiente" }).click();
    }

    const releaseCountLabel = page.locator('span[id$="-releases"]').first();
    const regionalTwo = await page.evaluate(() => new Intl.NumberFormat("ar").format(2));
    await expect(releaseCountLabel).toHaveText(`${regionalTwo} lanzamientos`);
    await expect(releaseCountLabel).toHaveAttribute("lang", "es");
    await expect(releaseCountLabel).toHaveAttribute("dir", "ltr");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-calendar-spanish-regional-count.png`,
        fullPage: true,
      });
    }
  });

  test("formats xREL megabyte sizes with regional digits", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("questarrng.regional-format", "ar");
    });
    await page.route("**/api/xrel/latest*", async (route) =>
      route.fulfill({
        json: {
          list: [
            {
              id: "xrel-regional-mb-size",
              dirname: "Example.Release-P2P",
              time: Math.floor(Date.now() / 1000),
              sizeMb: 1536.5,
              sizeUnit: "MB",
              source: "P2P",
              link_href: "https://xrel.to/example",
              group_name: "Example",
            },
          ],
          pagination: { current_page: 1, per_page: 10, total_pages: 1 },
          total_count: 1,
        },
      })
    );

    await page.goto("/xrel");
    const regionalSize = await page.evaluate(() =>
      new Intl.NumberFormat("ar", { maximumFractionDigits: 1 }).format(1536.5)
    );
    await expect(page.getByText(`${regionalSize} MB`, { exact: true })).toBeVisible();
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-xrel-regional-mb-size.png`,
        fullPage: true,
      });
    }
  });

  test("keeps RSS relative-time wording in the interface language", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("questarr.interface-language", "en");
      localStorage.setItem("questarrng.regional-format", "ja");
    });
    await page.route("**/api/rss/items", async (route) =>
      route.fulfill({
        json: [
          {
            id: "localized-relative-time",
            feedId: "localization-demo-feed",
            guid: "localized-relative-time-guid",
            title: "Relative time localization demo",
            link: "https://example.com/relative-time",
            pubDate: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            sourceName: "Example feed",
            igdbGameId: null,
            igdbGameName: null,
            coverUrl: null,
          },
        ],
      })
    );
    await page.route("**/api/rss/feeds*", async (route) => route.fulfill({ json: [] }));

    await page.goto("/rss");

    const relativeTime = page.locator("time").filter({ hasText: "about" });
    await expect(relativeTime).toHaveText("about 1 hour ago");
    await expect(relativeTime).toHaveAttribute("lang", "en");
    await expect(relativeTime).toHaveAttribute("dir", "ltr");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-relative-time-interface-language.png`,
        fullPage: true,
      });
    }
  });

  test("marks download search queries with undetermined language metadata", async ({ page }) => {
    await openLocalizedBundle(page, 1);
    const downloadSearch = page.getByPlaceholder("ابحث عن التنزيلات...");
    await downloadSearch.clear();
    await expect(downloadSearch).toHaveAttribute("lang", "ar");
    await downloadSearch.fill("FitGirl");
    await expect(downloadSearch).toHaveAttribute("lang", "und");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-download-search-latin-und-ar.png`,
        fullPage: true,
      });
    }
    await downloadSearch.fill("لعبة");
    await expect(downloadSearch).toHaveAttribute("lang", "und");
    await downloadSearch.clear();
    await expect(downloadSearch).toHaveAttribute("lang", "ar");
  });

  test("localizes nested filter controls and singular update copy", async ({ page }) => {
    const downloadButton = await openLocalizedBundle(page, 1);
    await expect(downloadButton).toBeVisible();
    await expectSeparatedDownloadAccessibleName(page, downloadButton, "تنزيل");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-download-action-language-segments.png`,
        fullPage: true,
      });
    }

    await page.getByRole("button", { name: "إظهار عوامل التصفية" }).click();
    await page.getByText("اختر المجموعات...").click();
    const filterPopover = page.locator('[data-radix-popper-content-wrapper] [role="dialog"]');
    await expect(filterPopover).toHaveAttribute("dir", "rtl");
    const filterSearch = page.getByPlaceholder("بحث...");
    await expect(filterSearch).toHaveAttribute("lang", "ar");
    await expect(filterSearch).toHaveAttribute("dir", "rtl");
    await expect(filterSearch).toHaveCSS("direction", "rtl");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-multiselect-empty-search-rtl-ar.png`,
        fullPage: true,
      });
    }
    await filterSearch.fill("no matching group");
    await expect(filterSearch).toHaveAttribute("lang", "und");
    await expect(filterSearch).toHaveAttribute("dir", "auto");
    await expect(filterSearch).toHaveCSS("direction", "ltr");
    const emptyState = page.getByText("لم يتم العثور على عناصر.");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toHaveAttribute("lang", "ar");
    await expect(emptyState).toHaveAttribute("dir", "rtl");
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-multiselect-auto-search-direction-ar.png`,
        fullPage: true,
      });
    }
    await page.keyboard.press("Escape");

    await downloadButton.click();
    const bundleDialog = page.getByRole("alertdialog");
    await expect(bundleDialog).toBeVisible();
    await expect(bundleDialog).toHaveAttribute("dir", "rtl");
    await expect(bundleDialog).toContainText(
      "يتوفر تحديث واحد لهذه اللعبة. اختر ما إذا كنت تريد تنزيله مع اللعبة الأساسية."
    );
    const latinUpdateTitle = bundleDialog.getByText("Localization Demo Update 1", { exact: true });
    await expect(latinUpdateTitle).toHaveAttribute("lang", "und");
    await expect(latinUpdateTitle).toHaveAttribute("dir", "auto");
    await expect(bundleDialog.getByRole("button", { name: "تنزيل مع تحديث واحد" })).toBeVisible();
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: `${process.env.PR47_VISUAL_EVIDENCE_DIR}/pr47-bundle-dialog-latin-update-ar.png`,
        fullPage: true,
      });
    }
  });

  test("isolates Latin game-title direction in the desktop RTL download dialog", async ({
    page,
  }) => {
    const gameTitle = "Portal: The Lost Crown (PC)";
    const downloadButton = await openLocalizedBundle(page, 0, "ar", undefined, gameTitle);
    await expect(downloadButton).toBeVisible();

    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: process.env.PR47_VISUAL_EVIDENCE_DIR + "/pr47-rtl-download-title-desktop.png",
        fullPage: true,
      });
    }
  });

  test("localizes category headings, metrics, and relative ages", async ({ page }) => {
    await openLocalizedBundle(page, 1, "ar");

    const updateHeading = page.getByRole("heading", {
      name: "التحديثات والتصحيحات",
      exact: true,
    });
    await expect(updateHeading).toBeVisible();
    const localizedHeading = updateHeading.locator('span[lang="ar"][dir="rtl"]');
    await expect(localizedHeading).toBeVisible();

    const seedersLabel = page.getByText("بذور", { exact: true }).first();
    await expect(seedersLabel).toBeVisible();
    await expect(seedersLabel).toHaveAttribute("lang", "ar");
    await expect(seedersLabel).toHaveAttribute("dir", "rtl");
    const regionalSeeders = await page.evaluate(() => new Intl.NumberFormat("ar").format(12345));
    const regionalOne = await page.evaluate(() => new Intl.NumberFormat("ar").format(1));
    await expect(page.getByText(regionalSeeders, { exact: true })).toBeVisible();
    await expect(updateHeading.locator("..").getByText(regionalOne, { exact: true })).toBeVisible();

    const relativeAge = page.locator('span[lang="ar"][dir="rtl"]').filter({ hasText: "قبل" });
    await expect(relativeAge.first()).toBeVisible();
  });

  test("uses the dual form when two updates are available and selected", async ({ page }) => {
    const downloadButton = await openLocalizedBundle(page, 2, "ar");
    await expect(downloadButton).toBeVisible();
    await downloadButton.click();

    const bundleDialog = page.getByRole("alertdialog");
    await expect(bundleDialog).toBeVisible();
    await expect(bundleDialog).toContainText(
      "يتوفر تحديثان لهذه اللعبة. اختر ما إذا كنت تريد تنزيلهما مع اللعبة الأساسية."
    );
    const regionalTwo = await page.evaluate(() => new Intl.NumberFormat("ar").format(2));
    await expect(bundleDialog.getByText(`التحديد: ${regionalTwo}/${regionalTwo}`)).toBeVisible();
    await expect(bundleDialog.getByRole("button", { name: "تنزيل مع تحديثين" })).toBeVisible();
  });

  test("sets RTL direction on the mobile download drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const gameTitle = "Portal: The Lost Crown (PC)";
    const downloadButton = await openLocalizedBundle(page, 1, "ar", undefined, gameTitle);
    await expectSeparatedDownloadAccessibleName(page, downloadButton, "تنزيل", gameTitle);

    const downloadDrawer = page.getByRole("dialog", {
      name: "تنزيل " + gameTitle,
      exact: true,
    });
    await expect(downloadDrawer).toHaveAttribute("dir", "rtl");
    const regionalSeeders = await page.evaluate(() => new Intl.NumberFormat("ar").format(12345));
    await expect(downloadDrawer.getByText(regionalSeeders, { exact: false })).toBeVisible();
    if (process.env.PR47_VISUAL_EVIDENCE_DIR) {
      await page.screenshot({
        path: process.env.PR47_VISUAL_EVIDENCE_DIR + "/pr47-rtl-download-title-mobile.png",
        fullPage: true,
      });
    }
  });

  test("keeps numeric formatting tied to the regional preference", async ({ page }) => {
    await openLocalizedBundle(page, 1, "es", 12345);

    const downloadDialog = page.getByRole("dialog", {
      name: "تنزيل Localization Demo",
      exact: true,
    });
    await expect(downloadDialog.getByText("بذور", { exact: true }).first()).toBeVisible();
    const regionalSeeders = await page.evaluate(() => new Intl.NumberFormat("es").format(12345));
    await expect(downloadDialog.getByText(regionalSeeders, { exact: true })).toBeVisible();
    await expect(downloadDialog.getByText("12345", { exact: true })).toHaveCount(0);
    const regionalAge = await page.evaluate(() =>
      new Intl.RelativeTimeFormat("ar", { numeric: "always" })
        .format(-12345, "day")
        .replace(
          new Intl.NumberFormat("ar").format(12345),
          new Intl.NumberFormat("es").format(12345)
        )
    );
    await expect(downloadDialog.getByText(regionalAge, { exact: true }).first()).toBeVisible();
  });

  test("formats interpolated result counts with the regional preference", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("questarr.interface-language", "ar");
      localStorage.setItem("questarrng.regional-format", "es");
    });
    await page.route("/api/games*", async (route) => route.fulfill({ json: [game] }));
    await page.route("**/api/indexers/enabled", async (route) => route.fulfill({ json: [] }));
    await page.route("**/api/downloaders/enabled", async (route) => route.fulfill({ json: [] }));
    await page.route("**/api/search?*", async (route) =>
      route.fulfill({
        json: {
          items: [],
          total: 12345,
          offset: 0,
          blacklistedCount: 12345,
        },
      })
    );

    await page.goto("/");
    await page.getByTestId(`card-game-${game.id}`).click();
    await page.getByTestId("button-download-game").click();

    const dialog = page.getByRole("dialog", {
      name: "تنزيل Localization Demo",
      exact: true,
    });
    const regionalCount = await page.evaluate(() => new Intl.NumberFormat("es").format(12345));
    await expect(dialog.getByText(regionalCount, { exact: false })).toBeVisible();
    await expect(dialog.getByText("12345", { exact: false })).toHaveCount(0);
  });

  test("formats successful download toast counts regionally", async ({ page }) => {
    const downloadButton = await openLocalizedBundle(page, 2, "ar");
    await page.route("**/api/downloads", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({ json: [] });
        return;
      }

      await route.fulfill({
        json: {
          success: true,
          downloaderName: "Example Downloader",
        },
      });
    });

    await downloadButton.click();
    const bundleDialog = page.getByRole("alertdialog");
    await bundleDialog.getByRole("button", { name: "تنزيل مع تحديثين" }).click();

    const regionalThree = await page.evaluate(() => new Intl.NumberFormat("ar").format(3));
    const successToast = page.getByRole("status").filter({ hasText: "تم إرسال" });
    await expect(successToast).toContainText(regionalThree);
    await expect(successToast).toContainText("Example Downloader");
    const additionToast = page.getByRole("status").filter({ hasText: "تمت إضافة" });
    await expect(additionToast).toContainText(regionalThree);
  });

  test("formats failed download toast counts regionally", async ({ page }) => {
    const downloadButton = await openLocalizedBundle(page, 2, "ar");
    let requestIndex = 0;
    await page.route("**/api/downloads", async (route) => {
      if (route.request().method() !== "POST") {
        await route.fulfill({ json: [] });
        return;
      }

      requestIndex += 1;
      await route.fulfill({
        json: {
          success: requestIndex === 1,
          downloaderName: "Example Downloader",
        },
      });
    });

    await downloadButton.click();
    const bundleDialog = page.getByRole("alertdialog");
    await bundleDialog.getByRole("button", { name: "تنزيل مع تحديثين" }).click();

    const regionalTwo = await page.evaluate(() => new Intl.NumberFormat("ar").format(2));
    const failureToast = page.getByRole("status").filter({ hasText: "وفشلت" });
    await expect(failureToast).toContainText(regionalTwo);
  });
});
