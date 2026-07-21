import { test, expect } from "@playwright/test";

// docs/02 §8.3 critical flow 1: login.
test.describe("login", () => {
  test("unauthenticated visitors are redirected to /login", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Afterlight Edge" })).toBeVisible();
  });

  test("wrong credentials show an error and keep the user on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL ?? "admin@afterlight.local");
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
  });

  test("correct credentials sign in and land on /opportunities", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.ADMIN_EMAIL!);
    await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/opportunities/);
    await expect(page.getByRole("heading", { name: "Opportunities" })).toBeVisible();
  });
});
