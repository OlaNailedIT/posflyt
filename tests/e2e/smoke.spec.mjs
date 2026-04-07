import { expect, test } from "@playwright/test";

const backendBaseUrl = "http://127.0.0.1:4000";

async function createAdminViaApi(request, suffix) {
  const email = `smoke_admin_${suffix}@posflyt.test`;
  const password = "secret12";
  const register = await request.post(`${backendBaseUrl}/auth/register`, {
    data: {
      businessName: `Smoke Biz ${suffix}`,
      name: "Smoke Admin",
      email,
      password,
    },
  });
  expect(register.ok()).toBeTruthy();
  return { email, password };
}

async function loginFromUi(page, { email, password }) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("admin can access staff page and add cashier", async ({ page, request }) => {
  const suffix = Date.now();
  const adminCreds = await createAdminViaApi(request, suffix);
  await loginFromUi(page, adminCreds);

  await page.getByRole("button", { name: "More" }).first().click();
  await page.getByRole("link", { name: "Staff", exact: true }).first().click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(page.getByRole("heading", { name: "Staff" })).toBeVisible();

  const cashierEmail = `smoke_cashier_${suffix}@posflyt.test`;
  await page.getByPlaceholder("Full name").fill("Smoke Cashier");
  await page.getByPlaceholder("Email").fill(cashierEmail);
  await page.getByPlaceholder("Password").fill("secret12");
  await page.getByRole("button", { name: "Add staff" }).click();

  await expect(page.getByText(cashierEmail)).toBeVisible();
});

test("cashier cannot access staff route", async ({ page, request }) => {
  const suffix = Date.now();
  const adminCreds = await createAdminViaApi(request, suffix);
  await loginFromUi(page, adminCreds);

  await page.getByRole("button", { name: "More" }).first().click();
  await page.getByRole("link", { name: "Staff", exact: true }).first().click();
  const cashierEmail = `smoke_cashier_${suffix}@posflyt.test`;
  await page.getByPlaceholder("Full name").fill("Blocked Cashier");
  await page.getByPlaceholder("Email").fill(cashierEmail);
  await page.getByPlaceholder("Password").fill("secret12");
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(page.getByText(cashierEmail)).toBeVisible();

  await page.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);

  await loginFromUi(page, { email: cashierEmail, password: "secret12" });
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("desktop and mobile nav behavior", async ({ page, browser, request }) => {
  const suffix = Date.now();
  const adminCreds = await createAdminViaApi(request, suffix);

  await loginFromUi(page, adminCreds);
  await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "POS" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Inventory" }).first()).toBeVisible();
  await page.getByRole("button", { name: "More" }).first().click();
  await expect(page.getByRole("link", { name: "Customers", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Staff", exact: true }).first()).toBeVisible();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const mobilePage = await mobileContext.newPage();
  await loginFromUi(mobilePage, adminCreds);

  const mobileBottomNav = mobilePage.locator("nav").last();
  await expect(mobileBottomNav.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(mobileBottomNav.getByRole("link", { name: /POS/ })).toBeVisible();
  await expect(mobileBottomNav.getByRole("link", { name: "Stock" })).toBeVisible();
  await mobilePage.getByRole("button", { name: "More" }).last().click();
  await expect(mobilePage.getByRole("link", { name: "Customers", exact: true }).first()).toBeVisible();
  await expect(mobilePage.getByRole("link", { name: "Staff", exact: true }).first()).toBeVisible();
  await mobileContext.close();
});

test("core loop sanity with sync visibility", async ({ page, request }) => {
  const suffix = Date.now();
  const adminCreds = await createAdminViaApi(request, suffix);
  await loginFromUi(page, adminCreds);

  await page.getByRole("link", { name: "Inventory" }).first().click();
  await expect(page).toHaveURL(/\/inventory$/);
  await page.getByPlaceholder("Name").fill(`Smoke Product ${suffix}`);
  await page.getByPlaceholder("Selling price").fill("100");
  await page.getByPlaceholder("Cost price").fill("40");
  await page.getByPlaceholder("Stock", { exact: true }).fill("10");
  await page.getByPlaceholder("Low stock threshold").fill("2");
  await page.getByRole("button", { name: "Add product" }).click();
  await expect(page.getByRole("status")).toContainText("Product created.");

  await page.locator("header nav").first().getByRole("link", { name: "POS", exact: true }).click();
  await expect(page).toHaveURL(/\/pos$/);
  await page.getByRole("button", { name: new RegExp(`Smoke Product ${suffix}`) }).click();
  await page.getByRole("button", { name: "Checkout" }).click();
  await expect(page.getByRole("status")).toContainText("Sale completed.");

  await expect(page.getByText(/Plan: .* · Online/)).toBeVisible();
});

test("backend GET /health returns ok", async ({ request }) => {
  const res = await request.get(`${backendBaseUrl}/health`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.data?.service).toBe("backend");
});

