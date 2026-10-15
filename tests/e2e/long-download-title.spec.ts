import { test, expect } from "@playwright/test";

test("long release titles leave the download action visible inside the dialog", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("questarr.interface-language", "en"));
  const longTitle = `Example.Game.${"Exceptional-International-Edition-With-A-Very-Long-Release-Name-".repeat(4)}-RUNE`;

  await page.route("**/api/games*", async (route) => {
    await route.fulfill({
      json: [
        {
          id: "test-game-id-123",
          title: "Cyberpunk 2077",
          coverUrl: null,
          platforms: ["PC"],
          genres: ["RPG"],
          status: "wanted",
          addedAt: new Date().toISOString(),
          igdbId: 1877,
          hidden: false,
        },
      ],
    });
  });
  await page.route("**/api/settings", async (route) => route.fulfill({ json: {} }));
  await page.route("**/api/indexers/enabled", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/downloaders/enabled", async (route) => route.fulfill({ json: [] }));
  await page.route("**/api/search?*", async (route) => {
    await route.fulfill({
      json: {
        items: [
          {
            title: longTitle,
            link: "https://example.com/releases/example.torrent",
            pubDate: new Date().toISOString(),
            category: "1000",
            size: 8_000_000_000,
            seeders: 57,
            leechers: 4,
            guid: "release-1",
            indexerId: "indexer-1",
            indexerName: "Example Indexer",
            downloadType: "torrent",
          },
        ],
        total: 1,
        offset: 0,
      },
    });
  });

  await page.goto("/");
  await page.getByTestId("card-game-test-game-id-123").click();
  await page.getByTestId("button-download-game").click();

  const downloadDialog = page.getByRole("dialog").last();
  await expect(downloadDialog.getByText(longTitle, { exact: true })).toBeVisible();

  const downloadAction = downloadDialog.getByRole("button", {
    name: /Download Torrent file for/,
  });
  await expect(downloadAction).toBeVisible();

  const dialogBounds = await downloadDialog.boundingBox();
  const actionBounds = await downloadAction.boundingBox();
  expect(dialogBounds).not.toBeNull();
  expect(actionBounds).not.toBeNull();
  expect(actionBounds!.x).toBeGreaterThanOrEqual(dialogBounds!.x);
  expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(
    dialogBounds!.x + dialogBounds!.width
  );

  await downloadDialog.screenshot({
    path: testInfo.outputPath("long-download-title.png"),
  });
});
