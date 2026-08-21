import { expect, test } from "@playwright/test";

test.describe("Wiki links and knowledge graph", () => {
  test("links notebooks with autocomplete, backlinks, and graph navigation", async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const username = `graph_user_${Date.now()}_${testInfo.parallelIndex}`;

    await page.goto("/login");
    await page.getByRole("button", { name: "Register" }).click();
    await page.fill('input[type="text"]', username);
    await page.fill('input[type="password"]', "Password123!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/", { timeout: 30000 });

    await page.click("#new-notebook-btn");
    await page.fill('input[placeholder*="Notebook title"]', "Neural Networks");
    await page.fill('input[placeholder*="Subject"]', "Machine Learning");
    await page.click("#create-notebook-submit");
    await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 10000 });
    const neuralNetworksUrl = page.url();
    await page.click("#back-btn");

    await page.click("#new-notebook-btn");
    await page.fill('input[placeholder*="Notebook title"]', "Linear Algebra");
    await page.fill('input[placeholder*="Subject"]', "Mathematics");
    await page.click("#create-notebook-submit");
    await expect(page).toHaveURL(/\/notebook\/.+/, { timeout: 10000 });

    await page.click("#links-toggle-btn");
    const editor = page.locator("#wiki-link-editor");
    await editor.fill("Matrices power [[Neu");
    await expect(page.getByRole("option", { name: /Neural Networks/ })).toBeVisible();
    await page.getByRole("option", { name: /Neural Networks/ }).click();
    await expect(editor).toHaveValue("Matrices power [[Neural Networks]]");
    await page.click("#save-wiki-links-btn");
    await expect(page.locator("text=Outgoing").first()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "Neural Networks" }).last()).toBeVisible();

    await page.locator("button").filter({ hasText: "Neural Networks" }).last().click();
    await expect(page).toHaveURL(neuralNetworksUrl, { timeout: 10000 });
    await page.click("#links-toggle-btn");
    await expect(page.locator("button").filter({ hasText: "Linear Algebra" }).last()).toBeVisible();

    await page.click("#back-btn");
    await page.click("#knowledge-graph-btn");
    await expect(page).toHaveURL("/graph");
    await expect(page.getByRole("img", { name: "Interactive force-directed knowledge graph" })).toBeVisible();
    await expect(page.getByText("Neural Networks", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Linear Algebra", { exact: true }).first()).toBeVisible();
  });
});
