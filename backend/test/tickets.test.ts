import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import test from "node:test";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/config/prisma.js";

async function startServer() {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    server,
    url: `http://127.0.0.1:${address.port}/api/tickets`,
  };
}

async function createUser(role: Role, userIds: string[]) {
  const user = await prisma.user.create({
    data: {
      email: `nexus-ticket-${randomUUID()}@example.com`,
      passwordHash: await bcrypt.hash("test-only-password", 4),
      firstName: "Ticket",
      lastName: "Test",
      role,
    },
  });

  userIds.push(user.id);
  return user;
}

function tokenFor(userId: string, role: Role) {
  return jwt.sign({ sub: userId, role }, env.JWT_ACCESS_SECRET, {
    expiresIn: "5m",
  });
}

async function cleanup(server: Server, userIds: string[]) {
  server.closeAllConnections();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  } finally {
    if (userIds.length > 0) {
      await prisma.ticket.deleteMany({
        where: { requesterId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  }
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const validTicket = {
  title: "Unable to connect to VPN",
  description: "The VPN client fails to connect from the office.",
  category: "INCIDENT",
  priority: "HIGH",
};

test("authenticated users can create, list, and retrieve their tickets", async () => {
  const { server, url } = await startServer();
  const userIds: string[] = [];

  try {
    const user = await createUser("USER", userIds);
    const token = tokenFor(user.id, user.role);

    const createResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validTicket),
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(created.ticket.requesterId, user.id);
    assert.equal(created.ticket.title, validTicket.title);
    assert.equal(created.ticket.description, validTicket.description);
    assert.equal(created.ticket.category, "INCIDENT");
    assert.equal(created.ticket.priority, "HIGH");
    assert.equal(created.ticket.status, "OPEN");

    const listResponse = await fetch(url, {
      headers: authHeaders(token),
    });
    const listed = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(listed.tickets.length, 1);
    assert.equal(listed.tickets[0].id, created.ticket.id);

    const detailResponse = await fetch(`${url}/${created.ticket.id}`, {
      headers: authHeaders(token),
    });
    const detail = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.equal(detail.ticket.id, created.ticket.id);
    assert.equal(detail.ticket.requesterId, user.id);
  } finally {
    await cleanup(server, userIds);
  }
});

test("support roles can progress tickets through valid status transitions", async () => {
  const { server, url } = await startServer();
  const userIds: string[] = [];

  try {
    const requester = await createUser("USER", userIds);
    const supportAgent = await createUser("SUPPORT_AGENT", userIds);
    const requesterToken = tokenFor(requester.id, requester.role);
    const supportToken = tokenFor(supportAgent.id, supportAgent.role);

    const createResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(requesterToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validTicket),
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);

    const listResponse = await fetch(url, {
      headers: authHeaders(supportToken),
    });
    const supportList = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.ok(
      supportList.tickets.some(
        (ticket: { id: string }) => ticket.id === created.ticket.id,
      ),
    );

    const progressResponse = await fetch(
      `${url}/${created.ticket.id}/status`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(supportToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      },
    );
    const progressed = await progressResponse.json();
    assert.equal(progressResponse.status, 200);
    assert.equal(progressed.ticket.status, "IN_PROGRESS");

    const invalidTransitionResponse = await fetch(
      `${url}/${created.ticket.id}/status`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(supportToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "CLOSED" }),
      },
    );
    assert.equal(invalidTransitionResponse.status, 409);

    const resolveResponse = await fetch(
      `${url}/${created.ticket.id}/status`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(supportToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "RESOLVED" }),
      },
    );
    assert.equal(resolveResponse.status, 200);

    const closeResponse = await fetch(
      `${url}/${created.ticket.id}/status`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(requesterToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "CLOSED" }),
      },
    );
    const closed = await closeResponse.json();
    assert.equal(closeResponse.status, 200);
    assert.equal(closed.ticket.status, "CLOSED");
  } finally {
    await cleanup(server, userIds);
  }
});

test("ticket endpoints require authentication and prevent cross-user access", async () => {
  const { server, url } = await startServer();
  const userIds: string[] = [];

  try {
    const owner = await createUser("USER", userIds);
    const otherUser = await createUser("USER", userIds);
    const ownerToken = tokenFor(owner.id, owner.role);
    const otherToken = tokenFor(otherUser.id, otherUser.role);

    const createResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(ownerToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validTicket),
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201);

    assert.equal((await fetch(url)).status, 401);
    assert.equal(
      (
        await fetch(`${url}/${created.ticket.id}`, {
          headers: { Authorization: "Bearer invalid-token" },
        })
      ).status,
      401,
    );

    const otherListResponse = await fetch(url, {
      headers: authHeaders(otherToken),
    });
    const otherList = await otherListResponse.json();
    assert.equal(otherListResponse.status, 200);
    assert.deepEqual(otherList.tickets, []);

    const staleElevatedToken = tokenFor(otherUser.id, "ADMIN");
    const elevatedListResponse = await fetch(url, {
      headers: authHeaders(staleElevatedToken),
    });
    const elevatedList = await elevatedListResponse.json();
    assert.equal(elevatedListResponse.status, 200);
    assert.deepEqual(elevatedList.tickets, []);

    const otherDetailResponse = await fetch(
      `${url}/${created.ticket.id}`,
      {
        headers: authHeaders(otherToken),
      },
    );
    assert.equal(otherDetailResponse.status, 404);

    const otherStatusResponse = await fetch(
      `${url}/${created.ticket.id}/status`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(otherToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      },
    );
    assert.equal(otherStatusResponse.status, 404);

    await prisma.user.update({
      where: { id: otherUser.id },
      data: { isActive: false },
    });
    const inactiveListResponse = await fetch(url, {
      headers: authHeaders(otherToken),
    });
    assert.equal(inactiveListResponse.status, 401);

    const unauthenticatedCreate = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validTicket),
    });
    assert.equal(unauthenticatedCreate.status, 401);
  } finally {
    await cleanup(server, userIds);
  }
});

test("ticket creation and status updates reject invalid or privileged input", async () => {
  const { server, url } = await startServer();
  const userIds: string[] = [];

  try {
    const user = await createUser("USER", userIds);
    const token = tokenFor(user.id, user.role);

    const invalidCreateResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...validTicket,
        category: "INVALID",
        role: "ADMIN",
        requesterId: randomUUID(),
      }),
    });
    assert.equal(invalidCreateResponse.status, 400);

    const createResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validTicket),
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201);

    const invalidStatusResponse = await fetch(
      `${url}/${created.ticket.id}/status`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "ESCALATED" }),
      },
    );
    assert.equal(invalidStatusResponse.status, 400);

    const unauthorizedStatusResponse = await fetch(
      `${url}/${created.ticket.id}/status`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      },
    );
    assert.equal(unauthorizedStatusResponse.status, 403);
  } finally {
    await cleanup(server, userIds);
  }
});
