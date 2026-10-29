import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../src/config/prisma.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import app from "../src/app.js";

test("POST /api/auth/register validates invalid input", async () => {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "",
          lastName: "User",
          email: "not-an-email",
          password: "short",
        }),
      },
    );

    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("registration creates a user securely and rejects duplicate emails", async () => {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const email = `nexus-test-${randomUUID()}@example.com`;
  const password = "LocalTestPass123!";
  const payload = {
    firstName: "Test",
    lastName: "User",
    email,
    password,
    role: "ADMIN",
  };

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const url = `http://127.0.0.1:${address.port}/api/auth/register`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.user.email, email);
    assert.equal(body.user.role, "USER");
    assert.equal("passwordHash" in body.user, false);
    assert.equal("password" in body.user, false);

    const storedUser = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });

    assert.ok(storedUser);
    assert.notEqual(storedUser.passwordHash, password);
    assert.equal(
      await bcrypt.compare(password, storedUser.passwordHash),
      true,
    );

    const duplicateResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    assert.equal(duplicateResponse.status, 409);
  } finally {
    server.closeAllConnections();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    await prisma.user.deleteMany({ where: { email } });
  }
});

test("login issues a valid JWT and rejects incorrect credentials", async () => {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const email = `nexus-login-${randomUUID()}@example.com`;
  const password = "LocalTestPass123!";
  const address = server.address();
  assert.ok(address && typeof address !== "string");

const url = `http://127.0.0.1:${address.port}/api/auth`;

  try {
    assert.ok(url, "Test server should have a URL");

    const registration = await fetch(`${url}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Login",
        lastName: "Test",
        email,
        password,
      }),
    });

    assert.equal(registration.status, 201);

    const loginResponse = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const body = await loginResponse.json();

    assert.equal(loginResponse.status, 200);
    assert.equal(body.tokenType, "Bearer");
    assert.equal(body.expiresIn, "15m");
    assert.equal(body.user.email, email);
    assert.equal("passwordHash" in body.user, false);

    const claims = jwt.verify(body.accessToken, env.JWT_ACCESS_SECRET);
    assert.equal(typeof claims, "object");
    assert.equal(claims.sub, body.user.id);
    assert.equal(claims.role, "USER");

    const unauthenticatedMeResponse = await fetch(`${url}/me`);
    assert.equal(unauthenticatedMeResponse.status, 401);

    const invalidTokenMeResponse = await fetch(`${url}/me`, {
      headers: { Authorization: "Bearer not-a-valid-token" },
    });
    assert.equal(invalidTokenMeResponse.status, 401);

    const meResponse = await fetch(`${url}/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    const meBody = await meResponse.json();

    assert.equal(meResponse.status, 200);
    assert.equal(meBody.user.id, body.user.id);
    assert.equal(meBody.user.firstName, "Login");
    assert.equal(meBody.user.lastName, "Test");
    assert.equal(meBody.user.email, email);
    assert.equal(meBody.user.role, "USER");
    assert.deepEqual(Object.keys(meBody.user).sort(), [
      "createdAt",
      "email",
      "firstName",
      "id",
      "lastName",
      "role",
    ]);
    assert.equal(Number.isNaN(Date.parse(meBody.user.createdAt)), false);
    assert.equal("passwordHash" in meBody.user, false);
    assert.equal("accessToken" in meBody, false);

    await prisma.user.update({
      where: { email },
      data: { isActive: false },
    });

    const inactiveMeResponse = await fetch(`${url}/me`, {
      headers: { Authorization: `Bearer ${body.accessToken}` },
    });
    assert.equal(inactiveMeResponse.status, 401);

    const wrongPasswordResponse = await fetch(`${url}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "WrongPassword123!",
      }),
    });

    assert.equal(wrongPasswordResponse.status, 401);
    assert.deepEqual(await wrongPasswordResponse.json(), {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      },
    });
  } finally {
    server.closeAllConnections();

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    await prisma.user.deleteMany({ where: { email } });
  }
});
