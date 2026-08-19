import { test, expect } from "@playwright/test";

test.describe("Authentication Flows", () => {
  const testUser = `user_${Date.now()}`;
  const testPass = "TestPass123!";

  test("should register a new user and redirect to dashboard", async ({ page }) => {
    await page.goto("/signup");
    await page.fill('input[type="text"]', testUser);
    await page.fill('input[type="password"]', testPass);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/", { timeout: 10000 });
    await expect(page.locator("text=My Notebooks")).toBeVisible();
  });

  test("should log in an existing user successfully", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', testUser);
    await page.fill('input[type="password"]', testPass);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/", { timeout: 10000 });
    await expect(page.locator("text=My Notebooks")).toBeVisible();
  });

  test("should reject invalid login credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="text"]', "nonexistent_user_9999");
    await page.fill('input[type="password"]', "WrongPassword");
    await page.click('button[type="submit"]');

    await expect(page.locator(".error, [role='alert'], p")).toBeVisible();
  });
});
