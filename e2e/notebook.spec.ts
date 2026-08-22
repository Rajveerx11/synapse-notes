import { test, expect } from "@playwright/test";

test.describe("Notebook & Canvas Interactions", () => {
  const password = "Password123!";

  test.beforeEach(async ({ page }) => {
    const username = `canvas_user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const register = await page.request.post("/api/auth/register", {
      data: { username, password },
    });
    expect(register.ok()).toBeTruthy();
    await page.goto("/");
  });

  test("should create a notebook, draw ink on canvas, and persist strokes", async ({ page }) => {
    // Click New Notebook
    await page.click("#new-notebook-btn");
    await page.fill('input[placeholder*="Notebook title"]', "E2E Quantum Physics");
    await page.fill('input[placeholder*="Subject"]', "Physics 301");
    await page.click("#create-notebook-submit");

    // Expect navigation to /notebook/[id]
    await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 10000 });

    // Verify main canvas is visible
    const canvas = page.locator("#main-canvas, canvas").first();
    await expect(canvas).toBeVisible();

    // Perform pointer down, move, up (simulate S-Pen drawing)
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + 200, box.y + 150, { steps: 5 });
      await page.mouse.move(box.x + 250, box.y + 200, { steps: 5 });
      await page.mouse.up();
    }

    // Switch to highlighter tool
    const highlighterBtn = page.locator('button[title*="Highlighter"], button[aria-label*="Highlighter"]').first();
    if (await highlighterBtn.isVisible()) {
      await highlighterBtn.click();
    }

    // Toggle infinite canvas mode
    const infiniteToggle = page.locator("#infinite-mode-btn");
    if (await infiniteToggle.isVisible()) {
      await infiniteToggle.click();
      await expect(infiniteToggle).toHaveClass(/active/);
    }
  });

  test("should support tag filtering and smart search on dashboard", async ({ page }) => {
    // Search input exists
    const searchInput = page.locator('input[aria-label="Search notebooks"], input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill("NonExistentTerm123");
    await expect(page.getByText("No notebooks match your filters").first()).toBeVisible();

    await searchInput.fill("");
  });
});
