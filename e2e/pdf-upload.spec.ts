import { test, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

test("creates a notebook and opens an uploaded PDF", async ({ page }) => {
  const username = `pdf_user_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const register = await page.request.post("/api/auth/register", {
    data: { username, password: "Password123!" },
  });
  expect(register.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "New Notebook" }).click();
  await page.getByPlaceholder(/Notebook title/).fill("PDF Regression");

  const createResponse = page.waitForResponse(
    response => response.url().endsWith("/api/notebooks") && response.request().method() === "POST"
  );
  await page.locator("#create-notebook-submit").click();
  expect((await createResponse).status()).toBe(201);
  await expect(page).toHaveURL(/\/notebook\/.+/);

  const document = await PDFDocument.create();
  document.addPage([320, 240]);
  const bytes = await document.save();

  const uploadResponse = page.waitForResponse(
    response => response.url().endsWith("/api/pdf") && response.request().method() === "POST"
  );
  await page.locator("#pdf-file-input").setInputFiles({
    name: "lecture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(bytes),
  });
  expect((await uploadResponse).status()).toBe(201);

  await expect(page.getByText("Slide 1 / 1")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("PDF could not be opened")).toHaveCount(0);
});
