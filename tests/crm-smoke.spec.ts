import { expect, test } from "@playwright/test";

test("renders CRM shell, exports contacts, and queues investment status", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Main menu" })).toBeVisible();
  await page.getByRole("link", { name: /^Companies$/ }).click();
  await expect(page).toHaveURL(/\/companies\?view=companies$/);
  await expect(page.getByRole("heading", { name: "Company golden source" })).toBeVisible();
  await expect(page.getByText(/contacts match/)).toBeVisible();
  await page.getByPlaceholder("Search companies, people, tags, domains").fill("goldman contacted");
  await expect(page.locator("tbody tr", { hasText: "Goldman Sachs" })).toHaveCount(1);
  await expect(page.locator("tbody tr", { hasText: "Morgan Stanley" })).toHaveCount(0);
  await page.getByPlaceholder("Search companies, people, tags, domains").fill("");

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

test("accounting view supports demo document workflow and filtering", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: /^Accounting$/ }).click();
  await expect(page).toHaveURL(/\/companies\?view=accounting$/);
  await expect(page.getByRole("heading", { name: "Accounting and payments" })).toBeVisible();
  await expect(page.getByText("Retainers").first()).toBeVisible();
  await expect(page.getByText("GBP").first()).toBeVisible();

  const form = page.locator(".accounting-form").first();
  await form.getByLabel("Company").selectOption({ label: "Goldman Sachs" });
  await form.getByLabel("Title").fill("May retainer");
  await form.getByLabel("Amount").fill("12500.00");
  await form.getByLabel("Currency").fill("GBP");
  await form.getByRole("button", { name: /Save document/ }).click();

  await expect(page.getByText("Demo accounting document saved locally.")).toBeVisible();
  await expect(page.locator("tr", { hasText: "May retainer" })).toBeVisible();

  await page.getByPlaceholder("Search accounting").fill("May retainer");
  await expect(page.locator("tr", { hasText: "May retainer" })).toHaveCount(1);

  await page.locator("tr", { hasText: "May retainer" }).getByRole("button", { name: /Edit/ }).click();
  await form.getByLabel("Title").fill("May retainer revised");
  await form.getByRole("button", { name: /Save document/ }).click();
  await expect(page.locator("tr", { hasText: "May retainer revised" })).toBeVisible();

  await page.locator("tr", { hasText: "May retainer revised" }).getByRole("button", { name: "Void" }).click();
  const voidDialog = page.getByRole("dialog", { name: "Void accounting record" });
  await expect(voidDialog).toBeVisible();
  await voidDialog.getByLabel("Void reason").fill("Duplicate test entry");
  await voidDialog.getByRole("button", { name: "Void record" }).click();
  await expect(page.getByText("Demo accounting document voided locally.")).toBeVisible();
  await expect(page.locator("tr", { hasText: "May retainer revised" }).locator(".accounting-status-pill")).toHaveText("Void");

  await page.locator("tr", { hasText: "May retainer revised" }).getByRole("button", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete accounting record" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByLabel("Delete reason").fill("Entered in error");
  await deleteDialog.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("Demo accounting document deleted locally.")).toBeVisible();
  await expect(page.locator("tr", { hasText: "May retainer revised" })).toHaveCount(0);
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
