import { test, expect } from "@playwright/test";

test.describe("Real-Time Collaboration & Presence", () => {
  const username = `collab_user_${Date.now()}`;
  const password = "Password123!";

  test("should show live collaborator presence badge in notebook header", async ({ page }) => {
    await page.goto("/signup");
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 10000 });

    await page.click("#new-notebook-btn");
    await page.fill('input[placeholder*="Notebook title"]', "Collab Study Room");
    await page.click("#create-notebook-submit");

    await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 10000 });

    // Verify presence badge renders
    const presenceBadge = page.locator("text=online").first();
    await expect(presenceBadge).toBeVisible();
  });
});
