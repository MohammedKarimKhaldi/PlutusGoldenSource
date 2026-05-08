import { expect, test } from "@playwright/test";

test("renders CRM shell, exports contacts, and queues investment status", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Main menu" })).toBeVisible();
  await page.getByRole("link", { name: /^Companies$/ }).click();
  await expect(page).toHaveURL(/\/companies\?view=companies$/);
  await expect(page.getByRole("heading", { name: "Company golden source" })).toBeVisible();
  await expect(page.getByText(/contacts match/)).toBeVisible();

  const exportResponse = await request.get("/api/export/contacts?criterion=sector_category&value=Financial%20Services");
  expect(exportResponse.ok()).toBe(true);
  const csv = await exportResponse.text();
  expect(csv).toContain("company_name,company_domain");
  expect(csv).toContain("investment_status,capacity_status,past_deals,current_deals,last_invested_date");

  await expect(page.getByRole("button", { name: "Refresh company table" })).toBeVisible();
  await page.locator("tbody tr", { hasText: "Morgan Stanley" }).dblclick();
  await expect(page.getByRole("dialog", { name: "Company details" })).toBeVisible();
  await expect(page.getByText("Investment history")).toBeVisible();
  await page.getByRole("button", { name: /Queue status/ }).click();
  await expect(page.getByText(/pending change/).first()).toBeVisible();

  await expect(page.getByRole("button", { name: /^Enrich$/ }).first()).toBeDisabled();
});

test("mobile layout keeps primary CRM controls reachable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Main menu" })).toBeVisible();
  await page.getByRole("link", { name: /^Companies$/ }).click();
  await expect(page.getByRole("heading", { name: "Company golden source" })).toBeVisible();
  await expect(page.locator(".brand-mark")).toBeVisible();
  await expect(page.getByText(/contacts match/)).toBeVisible();
});

test("login page shows safe auth feedback", async ({ page }) => {
  await page.goto("/login?error=invalid_credentials");
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  await page.goto("/login?error=auth_unavailable");
  await expect(page.getByText("Authentication is not configured on this deployment.")).toBeVisible();

  await page.goto("/login?error=something_else");
  await expect(page.getByText("Sign in failed. Please try again.")).toBeVisible();
});

test("login form shows pending submit state", async ({ page }) => {
  await page.route("**/login**", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("wrong@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("button", { name: "Signing in..." })).toBeDisabled();
});
