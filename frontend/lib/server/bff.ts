import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import type { ApiError, Ticket, User } from "../contracts";

const SESSION_COOKIE = "nexus_session";
const CSRF_COOKIE = "nexus_csrf";
const CSRF_TTL_SECONDS = 60 * 60 * 2;

const backendErrorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
    details: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional(),
  }),
});

const userSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  role: z.enum(["USER", "SUPPORT_AGENT", "TEAM_LEAD", "ADMIN"]),
  createdAt: z.string().optional(),
});

const ticketSchema = z.object({
  id: z.string().uuid(),
  requesterId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  category: z.enum([
    "INCIDENT",
    "SERVICE_REQUEST",
    "ACCESS_REQUEST",
    "HARDWARE",
    "SOFTWARE",
    "NETWORK",
    "OTHER",
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const loginResponseSchema = z.object({
  accessToken: z
    .string()
    .min(1)
    .max(8192)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  expiresIn: z.string().min(1).max(32),
  user: userSchema,
});

const tokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(["USER", "SUPPORT_AGENT", "TEAM_LEAD", "ADMIN"]),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function sessionCookieName() {
  return isProduction() ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
}

function csrfCookieName() {
  return isProduction() ? `__Host-${CSRF_COOKIE}` : CSRF_COOKIE;
}

function csrfSecret() {
  const secret = process.env.CSRF_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CSRF_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

function backendBaseUrl() {
  const value = process.env.BACKEND_API_URL;
  if (!value) {
    throw new Error("BACKEND_API_URL must be configured.");
  }

  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (isProduction() && url.protocol !== "https:")
  ) {
    throw new Error("BACKEND_API_URL must be a trusted API origin.");
  }
  return url.origin;
}

export function backendUrl(path: string) {
  if (!path.startsWith("/api/") || path.startsWith("//")) {
    throw new Error("Backend paths must be fixed API paths.");
  }
  return new URL(path, backendBaseUrl()).toString();
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "private, no-store, max-age=0");
  responseHeaders.set("Pragma", "no-cache");
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: ApiError["error"]["details"],
) {
  const error: ApiError["error"] = { code, message };
  if (details) error.details = details;
  return jsonResponse({ error }, status);
}

export async function readJson(request: Request): Promise<unknown | Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 20_000) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
  }
  if (!request.body) {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 20_000) {
        await reader.cancel();
        return errorResponse(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  } finally {
    reader.releaseLock();
  }
}

export function validationError(issues: z.ZodIssue[]) {
  return errorResponse(
    400,
    "VALIDATION_ERROR",
    "Please check the request details.",
    issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  );
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function csrfSignature(nonce: string) {
  // Signing the double-submit value prevents an attacker from planting a valid CSRF cookie.
  return createHmac("sha256", csrfSecret()).update(nonce).digest("base64url");
}

function makeCsrfToken() {
  const nonce = randomBytes(32).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const payload = `${nonce}.${issuedAt}`;
  return `${payload}.${csrfSignature(payload)}`;
}

function validCsrfToken(token: string) {
  const [nonce, issuedAt, signature, extra] = token.split(".");
  if (
    !nonce ||
    !issuedAt ||
    !signature ||
    extra ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
    !/^\d{10}$/.test(issuedAt)
  ) {
    return false;
  }
  const issuedAtSeconds = Number(issuedAt);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    issuedAtSeconds > nowSeconds + 60 ||
    nowSeconds - issuedAtSeconds > CSRF_TTL_SECONDS
  ) {
    return false;
  }
  return constantTimeEqual(signature, csrfSignature(`${nonce}.${issuedAt}`));
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge: number; expires: Date; httpOnly: boolean },
) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    `Expires=${options.expires.toUTCString()}`,
    "SameSite=Lax",
  ];
  if (options.httpOnly) attributes.push("HttpOnly");
  if (isProduction()) attributes.push("Secure");
  return attributes.join("; ");
}

export function appendSessionCookie(
  response: Response,
  token: string,
  expiresAt: Date,
) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  response.headers.append(
    "Set-Cookie",
    serializeCookie(sessionCookieName(), token, {
      maxAge,
      expires: expiresAt,
      httpOnly: true,
    }),
  );
}

export function clearSessionCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    serializeCookie(sessionCookieName(), "", {
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
    }),
  );
}

function appendCsrfCookie(response: Response, token: string) {
  response.headers.append(
    "Set-Cookie",
    serializeCookie(csrfCookieName(), token, {
      maxAge: CSRF_TTL_SECONDS,
      expires: new Date(Date.now() + CSRF_TTL_SECONDS * 1000),
      httpOnly: false,
    }),
  );
}

export function clearCsrfCookie(response: Response) {
  response.headers.append(
    "Set-Cookie",
    serializeCookie(csrfCookieName(), "", {
      maxAge: 0,
      expires: new Date(0),
      httpOnly: false,
    }),
  );
}

export function csrfTokenResponse() {
  const token = makeCsrfToken();
  const response = jsonResponse({ csrfToken: token });
  appendCsrfCookie(response, token);
  return response;
}

export function validateOrigin(request: Pick<Request, "headers" | "url">) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const requestUrl = new URL(request.url);
    const hostUrl = new URL(`${requestUrl.protocol}//${host}`);
    if (
      hostUrl.username ||
      hostUrl.password ||
      hostUrl.pathname !== "/" ||
      hostUrl.search ||
      hostUrl.hash
    ) {
      return false;
    }
    return new URL(origin).origin === hostUrl.origin;
  } catch {
    return false;
  }
}

export function validateCsrf(request: Request) {
  const cookieToken = readCookie(request, csrfCookieName());
  const headerToken = request.headers.get("x-csrf-token");
  return Boolean(
    cookieToken &&
      headerToken &&
      constantTimeEqual(cookieToken, headerToken) &&
      validCsrfToken(cookieToken),
  );
}

export function validateMutation(request: Request) {
  if (!validateOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "This request is not allowed.");
  }
  if (!validateCsrf(request)) {
    return errorResponse(403, "CSRF_REJECTED", "The security token is missing or invalid.");
  }
  return undefined;
}

export async function sessionToken(request: Request) {
  return readCookie(request, sessionCookieName());
}

export async function currentSessionToken() {
  const store = await cookies();
  return store.get(sessionCookieName())?.value;
}

function parseExpiresIn(value: string) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|y)$/.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
    y: 31_557_600_000,
  };
  const milliseconds = amount * multipliers[match[2]];
  return Number.isFinite(milliseconds) && milliseconds >= 1000
    ? milliseconds
    : undefined;
}

export async function callBackend(path: string, init?: RequestInit) {
  try {
    return await fetch(backendUrl(path), {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return undefined;
  }
}

export async function callAuthenticatedBackend(
  path: string,
  token: string,
  init?: RequestInit,
) {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  // The bearer token is attached only by this server-side proxy.
  headers.set("Authorization", `Bearer ${token}`);
  return callBackend(path, {
    ...init,
    headers,
  });
}

export async function backendJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

export function backendError(response: Response, body: unknown) {
  const parsed = backendErrorSchema.safeParse(body);
  const status = [400, 401, 403, 404, 409, 422, 429].includes(response.status)
    ? response.status
    : 502;
  const code =
    parsed.success && parsed.data.error.code
      ? parsed.data.error.code
      : status === 502
        ? "BACKEND_ERROR"
        : "REQUEST_FAILED";
  const message =
    status === 502
      ? "The request could not be completed."
      : parsed.success && parsed.data.error.message
        ? parsed.data.error.message
        : "The request could not be completed.";
  return errorResponse(
    status,
    code,
    message,
    parsed.success ? parsed.data.error.details : undefined,
  );
}

export function parseLoginResponse(body: unknown) {
  const parsed = loginResponseSchema.safeParse(body);
  if (!parsed.success) return undefined;
  const lifetime = parseExpiresIn(parsed.data.expiresIn);
  if (!lifetime) return undefined;
  try {
    const payload = parsed.data.accessToken.split(".")[1];
    const claims = tokenClaimsSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    if (
      !claims.success ||
        claims.data.iat > Math.floor(Date.now() / 1000) + 60 ||
        claims.data.sub !== parsed.data.user.id ||
      claims.data.role !== parsed.data.user.role ||
      claims.data.exp <= claims.data.iat ||
      Math.abs((claims.data.exp - claims.data.iat) * 1000 - lifetime) > 1000 ||
      claims.data.exp * 1000 <= Date.now()
    ) {
      return undefined;
    }
    return { ...parsed.data, expiresAt: new Date(claims.data.exp * 1000) };
  } catch {
    return undefined;
  }
}

export function parseUser(value: unknown): User | undefined {
  const parsed = userSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseTickets(value: unknown): Ticket[] | undefined {
  const parsed = z.array(ticketSchema).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseTicket(value: unknown): Ticket | undefined {
  const parsed = ticketSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
