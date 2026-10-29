import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import app from "../src/app.js";

test("GET /api/health returns service status", async () => {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const body: unknown = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      status: "ok",
      service: "NEXUS API",
      timestamp: (body as { timestamp: string }).timestamp,
    });
    assert.match((body as { timestamp: string }).timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
