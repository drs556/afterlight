import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./fixtures/auth";

// docs/02 §8.3 critical flow 3: market detail render.
test("market detail renders for a market linked from Opportunities", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/opportunities");

  const firstMarketLink = page.locator('a[href^="/markets/"]').first();
  await expect(firstMarketLink).toBeVisible({ timeout: 10_000 });
  await firstMarketLink.click();

  await expect(page).toHaveURL(/\/markets\//);
  // Market facts and the price-history chart are always present once a
  // market exists, regardless of enrichment/scoring state.
  await expect(page.getByText("Market facts")).toBeVisible();
  await expect(page.getByText("View on Kalshi")).toBeVisible();
});
