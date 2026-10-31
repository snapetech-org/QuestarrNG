import { test, expect } from "@playwright/test";

test("explains when the indexer category list is a fallback suggestion", async ({ page }, testInfo) => {
  const indexer = {
    id: "fallback-category-indexer",
    name: "Fallback category test",
    protocol: "torznab",
    url: "https://indexer.example/api",
    apiKey: "",
    enabled: true,
    priority: 1,
    categories: [],
    rssEnabled: true,
    autoSearchEnabled: true,
    allowInsecureLan: false,
  };

  await page.route("**/api/indexers", (route) => route.fulfill({ json: [indexer] }));
  await page.route("**/api/indexers/fallback-category-indexer/categories", (route) =>
    route.fulfill({
      status: 200,
      headers: { "X-Questarr-Category-Source": "fallback" },
      json: [
        { id: "1000", name: "Console" },
        { id: "4000", name: "PC" },
        { id: "4050", name: "PC > Games" },
      ],
    })
  );

  await page.goto("/indexers");
  await page.getByTestId("button-edit-indexer-fallback-category-indexer").click();
  await expect(page.getByTestId("category-fallback-notice")).toBeVisible();
  await expect(page.getByTestId("category-fallback-notice")).toContainText(
    "These are suggestions"
  );
  await page.screenshot({ path: testInfo.outputPath("indexer-category-fallback.png") });
});
