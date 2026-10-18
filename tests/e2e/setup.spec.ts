import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../../server/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, "../../playwright/.auth/user.json");

test.describe("Initial Setup", () => {
  test("should perform initial setup and save auth state", async ({ page, request }) => {
    // Check if system is set up (should be false on clean DB)
    const statusRes = await request.get("/api/auth/status");
    const { hasUsers } = await statusRes.json();

    // On a clean DB, hasUsers should be false.
    // If it's true, our clean script failed or something is wrong.
    // We proceed anyway to handle potential re-runs if config persists but DB was wiped.

    if (!hasUsers) {
      await page.addInitScript(() => {
        const seededKey = "questarr.e2e-initial-language-seeded";
        if (sessionStorage.getItem(seededKey)) return;
        sessionStorage.setItem(seededKey, "true");
        localStorage.setItem("questarr.interface-language", "ar");
      });
      await page.goto("/");
      await expect(page).toHaveURL("/setup");

      const interfaceLanguage = page.locator("#setup-interface-language");
      await expect(interfaceLanguage.locator('[lang="ar"][dir="rtl"]')).toHaveText("العربية");
      await expect(interfaceLanguage.locator('[lang="en"][dir="ltr"]')).toContainText("Arabic");
      await interfaceLanguage.click();
      const arabicOption = page.getByRole("option", { name: "العربية — Arabic", exact: true });
      await expect(arabicOption.locator('[lang="ar"][dir="rtl"]')).toHaveText("العربية");
      await expect(arabicOption.locator('[lang="en"][dir="ltr"]')).toContainText("Arabic");
      await page.getByRole("option", { name: "English", exact: true }).click();
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("questarr.interface-language")))
        .toBe("en");

      await page.fill('input[name="username"]', "admin");
      await page.fill('input[name="password"]', "password123");
      await page.fill('input[name="confirmPassword"]', "password123");

      // Wait for config to load so we know if fields are needed
      const submitBtn = page.getByRole("button", { name: "Create Account" });
      await expect(submitBtn).toBeEnabled();

      // Fill IGDB Creds if requested (fresh setup)
      const igdbIdInput = page.locator('input[name="igdbClientId"]');
      if (await igdbIdInput.isVisible()) {
        await igdbIdInput.fill("dummyclientid0000000000000000");
        await page.fill('input[name="igdbClientSecret"]', "dummyclientsecret000000000000");
      }

      // Wait for successful setup response
      await Promise.all([
        page.waitForResponse(
          (resp) => resp.url().includes("/api/auth/setup") && resp.status() === 200
        ),
        submitBtn.click(),
      ]);

      await expect(page.getByText("Your QuestarrNG setup is ready", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: /Browse game catalog/ }).click();
      await expect(page).toHaveURL(/\/discover$/);

      // The first-use choice navigates into the authenticated app. The Arabic
      // seed above only applies to the first document so it cannot overwrite
      // the selected language during this navigation.
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("questarr.interface-language")))
        .toBe("en");

      // Save storage state to be used by other tests
      await page.context().storageState({ path: authFile });
    } else {
      // If users exist, we might be in a dirty state or re-run.
      // We fundamentally expect a clean DB for this "Setup" project step.
      logger.info("Setup already completed, unexpected for clean run.");
    }
  });
});
