import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./fixtures/auth";

// docs/02 §8.3 critical flow 2: opportunities render with seeded data.
test("opportunities page renders with seeded fixture data", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/opportunities");

  await expect(page.getByRole("heading", { name: "Opportunities" })).toBeVisible();
  // With fixtures ingested/scored in earlier tests or by the seed, at least
  // one of the two views (scored table or market-data fallback) must render
  // real content — never a hard error.
  const hasScoredOrFallback = page
    .getByText(/scored|markets/i)
    .first();
  await expect(hasScoredOrFallback).toBeVisible();
});
