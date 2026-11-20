import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";

process.env.BACKEND_API_URL = "http://127.0.0.1:5000";
process.env.CSRF_SECRET = "test-only-csrf-secret-with-more-than-32-characters";
Reflect.set(process.env, "NODE_ENV", "test");

const userId = "2e0d9e7f-4fa2-4e16-bd7d-75f181da3d2c";
const accessToken = createToken(userId);
const originalFetch = globalThis.fetch;

function createToken(id: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: id,
      role: "USER",
      iat: issuedAt,
      exp: issuedAt + 900,
    }),
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

function okLoginResponse() {
  return Response.json({
    accessToken,
    tokenType: "Bearer",
    expiresIn: "15m",
    user: {
      id: userId,
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      role: "USER",
    },
  });
}

async function csrfCredentials(origin = "http://localhost:3000") {
  const { POST } = await import("../app/api/csrf/route");
  const response = await POST(
    new Request(`${origin}/api/csrf`, {
      method: "POST",
      headers: { Host: new URL(origin).host, Origin: origin },
    }),
  );
  const body = (await response.json()) as { csrfToken: string };
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return {
    token: body.csrfToken,
    cookie: cookie.split(";", 1)[0],
    origin,
  };
}

function mutationRequest(
  url: string,
  method: string,
  csrf: Awaited<ReturnType<typeof csrfCredentials>>,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return new Request(url, {
    method,
    headers: {
      Origin: csrf.origin,
      Host: new URL(url).host,
      Cookie: csrf.cookie,
      "X-CSRF-Token": csrf.token,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.BACKEND_API_URL = "http://127.0.0.1:5000";
  Reflect.set(process.env, "NODE_ENV", "test");
});

test("CSRF endpoint issues a signed double-submit token and rejects invalid Origin", async () => {
  const { POST } = await import("../app/api/csrf/route");
  const valid = await POST(
    new Request("http://localhost:3000/api/csrf", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
      },
    }),
  );
  const responseBody = (await valid.json()) as { csrfToken: string };
  assert.equal(valid.status, 200);
  assert.match(responseBody.csrfToken, /^[A-Za-z0-9_-]{43}\.\d{10}\.[A-Za-z0-9_-]{43}$/);
  assert.match(valid.headers.get("set-cookie") ?? "", /SameSite=Lax/);
  assert.match(valid.headers.get("cache-control") ?? "", /no-store/);

  const { validateOrigin } = await import("../lib/server/bff");
  assert.equal(
    validateOrigin({
      url: "http://localhost:3000/api/csrf",
      headers: new Headers({
        Host: "127.0.0.1:3000",
        Origin: "http://127.0.0.1:3000",
      }),
    }),
    true,
  );

  const invalid = await POST(
    new Request("http://localhost:3000/api/csrf", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "https://attacker.example",
      },
    }),
  );
  assert.equal(invalid.status, 403);
});

test("CSRF validation rejects expired signed tokens", async () => {
  const { POST } = await import("../app/api/auth/logout/route");
  const nonce = Buffer.alloc(32, 7).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000) - 60 * 60 * 3;
  const payload = `${nonce}.${issuedAt}`;
  const csrfSecret = process.env.CSRF_SECRET;
  assert.ok(csrfSecret);
  const signature = createHmac("sha256", csrfSecret)
    .update(payload)
    .digest("base64url");
  const token = `${payload}.${signature}`;
  const response = await POST(
    new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        Cookie: `nexus_csrf=${token}`,
        "X-CSRF-Token": token,
      },
    }),
  );
  assert.equal(response.status, 403);
});

test("login rejects missing or invalid CSRF tokens before reaching Express", async () => {
  const { POST } = await import("../app/api/auth/login/route");
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return okLoginResponse();
  };
  const url = "http://localhost:3000/api/auth/login";
  const missing = await POST(
    new Request(url, {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "ada@example.com", password: "pass" }),
    }),
  );
  assert.equal(missing.status, 403);

  const csrf = await csrfCredentials();
  const invalid = await POST(
    mutationRequest(
      url,
      "POST",
      { ...csrf, token: `x${csrf.token.slice(1)}` },
      { email: "ada@example.com", password: "pass" },
    ),
  );
  assert.equal(invalid.status, 403);
  assert.equal(called, false);
});

test("login forwards credentials server-side and returns only a secure session cookie", async () => {
  const { POST } = await import("../app/api/auth/login/route");
  const csrf = await csrfCredentials();
  let forwardedUrl = "";
  let forwardedBody = "";
  let forwardedAuthorization = "";
  globalThis.fetch = async (input, init) => {
    forwardedUrl = String(input);
    forwardedBody = String(init?.body);
    forwardedAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    return okLoginResponse();
  };

  const response = await POST(
    mutationRequest(
      "http://localhost:3000/api/auth/login",
      "POST",
      csrf,
      { email: "ada@example.com", password: "correct-horse" },
      { Authorization: "Bearer attacker-supplied" },
    ),
  );
  const body = await response.text();
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.equal(response.status, 200);
  assert.equal(forwardedUrl, "http://127.0.0.1:5000/api/auth/login");
  assert.equal(forwardedAuthorization, "");
  assert.deepEqual(JSON.parse(forwardedBody), {
    email: "ada@example.com",
    password: "correct-horse",
  });
  assert.doesNotMatch(body, /accessToken|signature/);
  assert.equal(body.includes(accessToken), false);
  assert.match(setCookie, /nexus_session=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);
  const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie)?.[1]);
  const tokenExpiry = Number(
    JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString()).exp,
  );
  assert.ok(maxAge > 0 && maxAge <= 900);
  assert.match(setCookie, new RegExp(`Expires=${new Date(tokenExpiry * 1000).toUTCString()}`));
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});

test("production session cookies use Secure and the __Host- prefix", async () => {
  const { POST } = await import("../app/api/auth/login/route");
  const origin = "https://nexus.example";
  process.env.BACKEND_API_URL = "https://api.example";
  Reflect.set(process.env, "NODE_ENV", "production");
  const csrf = await csrfCredentials(origin);
  globalThis.fetch = async () => okLoginResponse();

  const response = await POST(
    mutationRequest(
      `${origin}/api/auth/login`,
      "POST",
      csrf,
      { email: "ada@example.com", password: "correct-horse" },
    ),
  );
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.equal(response.status, 200);
  assert.match(setCookie, /__Host-nexus_session=/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /HttpOnly/);
});

test("login preserves generic invalid-credential errors without setting a session", async () => {
  const { POST } = await import("../app/api/auth/login/route");
  const csrf = await csrfCredentials();
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } },
      { status: 401 },
    );

  const response = await POST(
    mutationRequest(
      "http://localhost:3000/api/auth/login",
      "POST",
      csrf,
      { email: "ada@example.com", password: "wrong" },
    ),
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(await response.text(), /Invalid email or password/);
});

test("registration proxies validated fields and rejects client-supplied roles", async () => {
  const { POST } = await import("../app/api/auth/register/route");
  const csrf = await csrfCredentials();
  let forwardedBody = "";
  globalThis.fetch = async (_input, init) => {
    forwardedBody = String(init?.body);
    return Response.json(
      {
        message: "Account created successfully.",
        user: {
          id: userId,
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          role: "USER",
        },
      },
      { status: 201 },
    );
  };

  const url = "http://localhost:3000/api/auth/register";
  const valid = await POST(
    mutationRequest(url, "POST", csrf, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      password: "correct-horse",
    }),
  );
  assert.equal(valid.status, 201);
  assert.deepEqual(JSON.parse(forwardedBody), {
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    password: "correct-horse",
  });

  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists." } },
      { status: 409 },
    );
  const duplicate = await POST(
    mutationRequest(url, "POST", csrf, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      password: "correct-horse",
    }),
  );
  assert.equal(duplicate.status, 409);

  const privileged = await POST(
    mutationRequest(url, "POST", csrf, {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      password: "correct-horse",
      role: "ADMIN",
    }),
  );
  assert.equal(privileged.status, 400);
});

test("me forwards the HttpOnly cookie as a Bearer token and clears expired sessions", async () => {
  const { GET } = await import("../app/api/auth/me/route");
  let authorization = "";
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json(
      {
        user: {
          id: userId,
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          role: "USER",
        },
      },
    );
  };

  const response = await GET(
    new Request("http://localhost:3000/api/auth/me", {
      headers: { Cookie: `nexus_session=${accessToken}` },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(authorization, `Bearer ${accessToken}`);
  assert.doesNotMatch(await response.text(), /accessToken/);

  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired." } },
      { status: 401 },
    );
  const expired = await GET(
    new Request("http://localhost:3000/api/auth/me", {
      headers: { Cookie: `nexus_session=${accessToken}` },
    }),
  );
  assert.equal(expired.status, 401);
  assert.match(expired.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("logout requires valid CSRF and expires both cookies", async () => {
  const { POST } = await import("../app/api/auth/logout/route");
  const csrf = await csrfCredentials();
  const rejected = await POST(
    new Request("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: {
        Host: "localhost:3000",
        Origin: "http://localhost:3000",
      },
    }),
  );
  assert.equal(rejected.status, 403);

  const response = await POST(
    mutationRequest("http://localhost:3000/api/auth/logout", "POST", csrf),
  );
  const cookies = response.headers.get("set-cookie") ?? "";
  assert.equal(response.status, 200);
  assert.match(cookies, /nexus_session=/);
  assert.match(cookies, /nexus_csrf=/);
  assert.match(cookies, /Max-Age=0/);
});

test("ticket BFF rejects unauthenticated requests and preserves backend 403/404", async () => {
  const { GET } = await import("../app/api/tickets/route");
  const unauthenticated = await GET(new Request("http://localhost:3000/api/tickets"));
  assert.equal(unauthenticated.status, 401);

  const { GET: getTicket } = await import("../app/api/tickets/[ticketId]/route");
  const id = "8afc0a08-283f-4321-81c6-551d6156172b";
  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "FORBIDDEN", message: "You cannot access this ticket." } },
      { status: 403 },
    );
  const forbidden = await getTicket(
    new Request(`http://localhost:3000/api/tickets/${id}`, {
      headers: { Cookie: `nexus_session=${accessToken}` },
    }),
    { params: Promise.resolve({ ticketId: id }) },
  );
  assert.equal(forbidden.status, 403);

  globalThis.fetch = async () =>
    Response.json(
      { error: { code: "TICKET_NOT_FOUND", message: "The ticket was not found." } },
      { status: 404 },
    );
  const notFound = await getTicket(
    new Request(`http://localhost:3000/api/tickets/${id}`, {
      headers: { Cookie: `nexus_session=${accessToken}` },
    }),
    { params: Promise.resolve({ ticketId: id }) },
  );
  assert.equal(notFound.status, 404);
});

test("ticket mutations forward the token and invalid Origin is rejected", async () => {
  const { POST } = await import("../app/api/tickets/route");
  const csrf = await csrfCredentials();
  let authorization = "";
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json(
      {
        ticket: {
          id: "8afc0a08-283f-4321-81c6-551d6156172b",
          requesterId: userId,
          title: "VPN issue",
          description: "Cannot connect",
          category: "INCIDENT",
          priority: "NORMAL",
          status: "OPEN",
          createdAt: "2026-11-20T00:00:00.000Z",
          updatedAt: "2026-11-20T00:00:00.000Z",
        },
      },
      { status: 201 },
    );
  };
  const response = await POST(
    mutationRequest(
      "http://localhost:3000/api/tickets",
      "POST",
      csrf,
      {
        title: "VPN issue",
        description: "Cannot connect",
        category: "INCIDENT",
        priority: "NORMAL",
      },
      { Cookie: `${csrf.cookie}; nexus_session=${accessToken}` },
    ),
  );
  assert.equal(response.status, 201);
  assert.equal(authorization, `Bearer ${accessToken}`);

  const { PATCH } = await import("../app/api/tickets/[ticketId]/status/route");
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json({
      ticket: {
        id: "8afc0a08-283f-4321-81c6-551d6156172b",
        requesterId: userId,
        title: "VPN issue",
        description: "Cannot connect",
        category: "INCIDENT",
        priority: "NORMAL",
        status: "IN_PROGRESS",
        createdAt: "2026-11-20T00:00:00.000Z",
        updatedAt: "2026-11-20T00:01:00.000Z",
      },
    });
  };
  const updated = await PATCH(
    mutationRequest(
      "http://localhost:3000/api/tickets/8afc0a08-283f-4321-81c6-551d6156172b/status",
      "PATCH",
      csrf,
      { status: "IN_PROGRESS" },
      { Cookie: `${csrf.cookie}; nexus_session=${accessToken}` },
    ),
    { params: Promise.resolve({ ticketId: "8afc0a08-283f-4321-81c6-551d6156172b" }) },
  );
  assert.equal(updated.status, 200);
  assert.equal(authorization, `Bearer ${accessToken}`);
  assert.match(await updated.text(), /IN_PROGRESS/);

  const badOrigin = await PATCH(
    mutationRequest(
      "http://localhost:3000/api/tickets/8afc0a08-283f-4321-81c6-551d6156172b/status",
      "PATCH",
      { ...csrf, origin: "https://attacker.example" },
      { status: "IN_PROGRESS" },
      { Cookie: `${csrf.cookie}; nexus_session=${accessToken}` },
    ),
    { params: Promise.resolve({ ticketId: "8afc0a08-283f-4321-81c6-551d6156172b" }) },
  );
  assert.equal(badOrigin.status, 403);
});

test("unavailable backend returns an explicit 503", async () => {
  const { GET } = await import("../app/api/tickets/route");
  globalThis.fetch = async () => {
    throw new TypeError("backend unavailable");
  };
  const response = await GET(
    new Request("http://localhost:3000/api/tickets", {
      headers: { Cookie: `nexus_session=${accessToken}` },
    }),
  );
  assert.equal(response.status, 503);
  assert.match(await response.text(), /BACKEND_UNAVAILABLE/);
});
