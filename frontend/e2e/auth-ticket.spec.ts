import { appendFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const baseURL = process.env.NEXUS_E2E_BASE_URL;
const email = process.env.NEXUS_E2E_USER_EMAIL;
const password = process.env.NEXUS_E2E_USER_PASSWORD;
const supportEmail = process.env.NEXUS_E2E_SUPPORT_EMAIL;
const supportPassword = process.env.NEXUS_E2E_SUPPORT_PASSWORD;
const runId = process.env.NEXUS_E2E_RUN_ID;
const createdRecordIdsFile = process.env.NEXUS_E2E_CREATED_RECORD_IDS_FILE;
const firstName = "Nexus";
const lastName = "E2E";
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

if (
  !baseURL ||
  !email ||
  !password ||
  !supportEmail ||
  !supportPassword ||
  !runId ||
  !createdRecordIdsFile
) {
  throw new Error("The authorized NEXUS E2E fixture is incomplete.");
}

function recordCreatedId(kind: "user" | "ticket", id: string) {
  if (!uuidPattern.test(id)) {
    throw new Error(`The E2E ${kind} response did not contain a valid ID.`);
  }
  appendFileSync(createdRecordIdsFile!, `${kind}:${id}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function responseRecordId(body: unknown, recordName: "user" | "ticket") {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const record =
    recordName === "user"
      ? "user" in body
        ? body.user
        : undefined
      : "ticket" in body
        ? body.ticket
        : undefined;
  if (
    typeof record !== "object" ||
    record === null ||
    !("id" in record) ||
    typeof record.id !== "string"
  ) {
    return undefined;
  }
  return record.id;
}

test("register, manage a ticket, and end the browser session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  const registrationResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/register") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create account" }).click();
  const registrationResponse = await registrationResponsePromise;
  const registrationBody: unknown = await registrationResponse.json();
  const userId = responseRecordId(registrationBody, "user");
  if (userId) recordCreatedId("user", userId);
  expect(registrationResponse.ok()).toBe(true);
  if (!userId) {
    throw new Error("Registration response did not include the created user ID.");
  }
  await expect(page).toHaveURL(/\/login\?registered=1$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(password);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.ok()).toBe(true);
  const loginBody: unknown = await loginResponse.json();
  const exposesAccessToken =
    typeof loginBody === "object" &&
    loginBody !== null &&
    "accessToken" in loginBody;
  expect(exposesAccessToken).toBe(false);

  await expect(page.getByRole("heading", { name: "Welcome, Nexus" })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByText("No tickets yet. Create one to get started.")).toBeVisible();

  const context = page.context();
  const sessionCookie = (await context.cookies(baseURL)).find(
    (cookie) => cookie.name === "nexus_session",
  );
  expect(sessionCookie?.httpOnly).toBe(true);
  expect(sessionCookie?.sameSite).toBe("Lax");
  expect(sessionCookie?.secure).toBe(false);
  expect(await page.evaluate(() => document.cookie)).not.toContain("nexus_session");
  expect(
    await page.evaluate(() => {
      const entries: Array<[string, string]> = [];
      for (const storage of [localStorage, sessionStorage]) {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (key) entries.push([key, storage.getItem(key) ?? ""]);
        }
      }
      return entries.some(
        ([key, value]) =>
          /access.?token/i.test(key) ||
          /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value),
      );
    }),
  ).toBe(false);

  const ticketsURL = new URL("/api/tickets", baseURL).toString();
  const sameOrigin = new URL(baseURL).origin;
  const missingCsrf = await context.request.post(ticketsURL, {
    headers: { Origin: sameOrigin, "Content-Type": "application/json" },
    data: {},
  });
  expect(missingCsrf.status()).toBe(403);
  const invalidCsrf = await context.request.post(ticketsURL, {
    headers: {
      Origin: sameOrigin,
      "Content-Type": "application/json",
      "X-CSRF-Token": "invalid",
    },
    data: {},
  });
  expect(invalidCsrf.status()).toBe(403);
  const csrfResponse = await context.request.post(
    new URL("/api/csrf", baseURL).toString(),
    { headers: { Origin: sameOrigin, Accept: "application/json" } },
  );
  expect(csrfResponse.ok()).toBe(true);
  const csrfBody: unknown = await csrfResponse.json();
  const csrfToken =
    typeof csrfBody === "object" &&
    csrfBody !== null &&
    "csrfToken" in csrfBody &&
    typeof csrfBody.csrfToken === "string"
      ? csrfBody.csrfToken
      : undefined;
  if (!csrfToken) {
    throw new Error("The CSRF endpoint did not return a valid token.");
  }
  const validCsrf = await context.request.post(ticketsURL, {
    headers: {
      Origin: sameOrigin,
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    data: {},
  });
  expect(validCsrf.status()).toBe(400);
  const invalidOrigin = await context.request.post(ticketsURL, {
    headers: {
      Origin: "https://attacker.invalid",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    data: {},
  });
  expect(invalidOrigin.status()).toBe(403);
  const invalidOriginBody: unknown = await invalidOrigin.json();
  const invalidOriginCode =
    typeof invalidOriginBody === "object" &&
    invalidOriginBody !== null &&
    "error" in invalidOriginBody &&
    typeof invalidOriginBody.error === "object" &&
    invalidOriginBody.error !== null &&
    "code" in invalidOriginBody.error &&
    typeof invalidOriginBody.error.code === "string"
      ? invalidOriginBody.error.code
      : undefined;
  expect(invalidOriginCode).toBe("INVALID_ORIGIN");

  const title = `E2E ticket ${runId}`;
  await page.getByRole("button", { name: "Create a ticket" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Created by the isolated NEXUS E2E journey.");
  const createTicketResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tickets") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Submit ticket" }).click();
  const createTicketResponse = await createTicketResponsePromise;
  const createdTicketBody: unknown = await createTicketResponse.json();
  const ticketId = responseRecordId(createdTicketBody, "ticket");
  if (ticketId) recordCreatedId("ticket", ticketId);
  expect(createTicketResponse.ok()).toBe(true);
  if (!ticketId) {
    throw new Error("Ticket response did not include the created ticket ID.");
  }
  const userTicketRow = page.getByRole("row").filter({ hasText: title });
  await expect(userTicketRow).toBeVisible();
  await expect(userTicketRow).toContainText("Open");
  await page.reload();
  await expect(userTicketRow).toBeVisible();

  await page.getByLabel("Search tickets").fill("not a matching ticket");
  await expect(
    page.getByText("No tickets match your search or filter."),
  ).toBeVisible();
  await page.getByLabel("Search tickets").fill(title);
  await expect(userTicketRow).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("IN_PROGRESS");
  await expect(
    page.getByText("No tickets match your search or filter."),
  ).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("ALL");
  await expect(userTicketRow).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies(baseURL)).some(
      (cookie) => cookie.name === "nexus_session",
    ),
  ).toBe(false);
  expect(
    (
      await context.request.get(new URL("/api/auth/me", baseURL).toString())
    ).status(),
  ).toBe(401);
  expect(
    (
      await context.request.get(ticketsURL)
    ).status(),
  ).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(supportEmail);
  await page.getByLabel("Password", { exact: true }).fill(supportPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Support" }),
  ).toBeVisible();
  const supportTicketRow = page.getByRole("row").filter({ hasText: title });
  await expect(supportTicketRow).toBeVisible();
  await page
    .getByLabel(`Change status for ${title}`)
    .selectOption("IN_PROGRESS");
  await expect(supportTicketRow).toContainText(/In progress/i);

  await page.getByLabel("Search tickets").fill(title);
  await page.getByLabel("Filter by status").selectOption("IN_PROGRESS");
  await expect(supportTicketRow).toBeVisible();
  await page.getByLabel("Filter by status").selectOption("OPEN");
  await expect(
    page.getByText("No tickets match your search or filter."),
  ).toBeVisible();

  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
