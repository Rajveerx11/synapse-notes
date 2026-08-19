import { test, expect } from "@playwright/test";

test.describe("Code Note-Taking Mode", () => {
  const username = `code_user_${Date.now()}`;
  const password = "Password123!";

  test.beforeEach(async ({ page }) => {
    await page.goto("/signup");
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 10000 });
  });

  test("should switch to Code Mode, edit code, select language, adjust line height, and copy raw code", async ({ page }) => {
    // Create new notebook
    await page.click("#new-notebook-btn");
    await page.fill('input[placeholder*="Notebook title"]', "Algorithms & LeetCode");
    await page.fill('input[placeholder*="Subject"]', "CS 204");
    await page.click("#create-notebook-submit");

    await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 10000 });

    // Switch to Code Mode
    const codeModeBtn = page.locator("#code-mode-btn");
    await expect(codeModeBtn).toBeVisible();
    await codeModeBtn.click();
    await expect(codeModeBtn).toHaveClass(/active/);

    // Verify code snippet editor container and margin lane exist
    await expect(page.locator("text=Code Snippet")).toBeVisible();
    await expect(page.locator("text=Line-by-Line Notes & Explanations")).toBeVisible();

    // Select language
    const langSelect = page.locator('select[aria-label="Code language"]');
    await expect(langSelect).toBeVisible();
    await langSelect.selectOption("typescript");

    // Change line spacing
    const spacing3x = page.locator('button[title*="Line spacing 3.0x"]');
    if (await spacing3x.isVisible()) {
      await spacing3x.click();
    }

    // Toggle edit mode and type code
    const editToggle = page.locator('button[title*="Toggle between typing"]');
    await editToggle.click();

    const textarea = page.locator('textarea[placeholder*="Type or paste"]');
    await expect(textarea).toBeVisible();
    await textarea.fill("function binarySearch(arr: number[], target: number): number {\n  return -1;\n}");

    // Copy raw code
    const copyBtn = page.locator('button[title*="Copy clean formatted code"]');
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(page.locator("text=Copied!")).toBeVisible();
  });
});
