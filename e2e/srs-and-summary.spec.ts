import { test, expect } from "@playwright/test";

test.describe("SRS Flashcards and AI Features", () => {
  const username = `srs_user_${Date.now()}`;
  const password = "Password123!";

  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 10000 });
  });

  test("should open Flashcard SRS review modal from dashboard", async ({ page }) => {
    const studyBtn = page.locator("#study-flashcards-btn");
    await expect(studyBtn).toBeVisible();
    await studyBtn.click();

    // Verify modal appears
    await expect(page.locator("text=Spaced Repetition Review")).toBeVisible();
  });

  test("should create notebook and toggle AI summary / export options", async ({ page }) => {
    await page.click("#new-notebook-btn");
    await page.fill('input[placeholder*="Notebook title"]', "BioChem Lecture 1");
    await page.click("#create-notebook-submit");

    await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 10000 });

    // AI Summary toggle button
    const summaryBtn = page.locator("#summary-toggle-btn");
    await expect(summaryBtn).toBeVisible();
    await summaryBtn.click();
    await expect(page.locator("text=AI Lecture Summary")).toBeVisible();

    // Export dropdown
    const exportBtn = page.locator("#export-dropdown-btn");
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();
    await expect(page.locator("#export-menu-list, text=PDF Document")).toBeVisible();
  });
});
