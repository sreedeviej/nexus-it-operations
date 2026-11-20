import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTestEnvironment } from "../../backend/test/test-environment.mjs";

const frontendDirectory = fileURLToPath(new URL("../", import.meta.url));
const backendDirectory = path.resolve(frontendDirectory, "..", "backend");
const testEnvPath = path.join(backendDirectory, ".env.test");
const backendRequire = createRequire(path.join(backendDirectory, "package.json"));
const frontendRequire = createRequire(path.join(frontendDirectory, "package.json"));
const { PrismaClient } = backendRequire("@prisma/client");
const bcrypt = backendRequire("bcrypt");
const databaseOverride =
  /^(DATABASE_URL|TEST_DATABASE_URL|SHADOW_DATABASE_URL|TEST_DATABASE_ADMIN_URL|DIRECT_URL|PGSERVICE|PGSERVICEFILE|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PGSSLMODE)$/i;
let protectedOutputValues = [];

function redactOutput(output, extraValues = []) {
  let redacted = output;
  const secrets = [...protectedOutputValues, ...extraValues]
    .filter((value) => typeof value === "string" && value.length > 0)
    .sort((left, right) => right.length - left.length);

  for (const secret of secrets) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

function createSafeEnvironment() {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (
      databaseOverride.test(key) ||
      key.startsWith("NEXUS_E2E_") ||
      key.startsWith("NEXUS_TEST_RUNNER_AUTH_") ||
      key === "JWT_ACCESS_SECRET" ||
      key === "NODE_OPTIONS" ||
      key === "DOTENV_CONFIG_PATH"
    ) {
      delete environment[key];
    }
  }
  return environment;
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local E2E port."));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function quoteEnv(value) {
  return JSON.stringify(value);
}

function writePrivateFile(filePath, contents) {
  writeFileSync(filePath, contents, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

async function verifyDatabaseIdentity(prisma) {
  let identity;
  try {
    [identity] = await prisma.$queryRaw`
      SELECT current_database() AS "databaseName", current_user AS "roleName"
    `;
  } catch {
    throw new Error("E2E database identity could not be verified; no fixture was created.");
  }
  if (
    identity?.databaseName !== "nexus_test" ||
    identity?.roleName !== "nexus_test_user"
  ) {
    throw new Error(
      "E2E safety preflight failed; expected nexus_test as nexus_test_user.",
    );
  }
}

async function createFixtures(prisma, runId) {
  const supportEmail = `nexus-e2e-support-${runId}@example.test`;
  const userEmail = `nexus-e2e-user-${runId}@example.test`;
  const supportPassword = randomBytes(24).toString("base64url");
  const existingFixtures = await prisma.user.count({
    where: { email: { in: [supportEmail, userEmail] } },
  });
  if (existingFixtures !== 0) {
    throw new Error("Run-specific E2E fixture identifiers were not unique.");
  }
  let supportUser;
  try {
    supportUser = await prisma.user.create({
      data: {
        email: supportEmail,
        firstName: "Support",
        lastName: "E2E",
        passwordHash: await bcrypt.hash(supportPassword, 12),
        role: "SUPPORT_AGENT",
      },
      select: { id: true },
    });
  } catch {
    throw new Error("The isolated support-role E2E fixture could not be created.");
  }
  return {
    runId,
    supportUserId: supportUser.id,
    supportEmail,
    supportPassword,
    userEmail,
    userPassword: randomBytes(24).toString("base64url"),
  };
}

function readCreatedRecordIds(filePath) {
  const userIds = new Set();
  const ticketIds = new Set();
  let invalidEntry = false;
  let contents;

  try {
    contents = filePath ? readFileSync(filePath, "utf8") : "";
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error("Could not read the run-specific record ID file.");
    }
    contents = "";
  }

  for (const line of contents.split(/\r?\n/).filter(Boolean)) {
    const match =
      /^(user|ticket):([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i.exec(
        line,
      );
    if (!match) {
      invalidEntry = true;
      continue;
    }
    (match[1].toLowerCase() === "user" ? userIds : ticketIds).add(match[2]);
  }

  return {
    userIds: [...userIds],
    ticketIds: [...ticketIds],
    invalidEntry,
  };
}

async function cleanFixtures(prisma, fixtures, createdRecordIdsPath) {
  const createdRecords = readCreatedRecordIds(createdRecordIdsPath);
  const userIds = [...new Set([fixtures.supportUserId, ...createdRecords.userIds])];
  const ticketIds = createdRecords.ticketIds;
  await prisma.$transaction(async (transaction) => {
    const deletedTickets = await transaction.ticket.deleteMany({
      where: {
        id: { in: ticketIds },
        requesterId: { in: userIds },
      },
    });
    if (deletedTickets.count !== ticketIds.length) {
      throw new Error("A run-specific ticket ID could not be verified for cleanup.");
    }

    const deletedUsers = await transaction.user.deleteMany({
      where: { id: { in: userIds } },
    });
    if (deletedUsers.count !== userIds.length) {
      throw new Error("A run-specific user ID could not be verified for cleanup.");
    }
  });

  const [remainingUsers, remainingTickets] = await Promise.all([
    prisma.user.count({ where: { id: { in: userIds } } }),
    prisma.ticket.count({ where: { id: { in: ticketIds } } }),
  ]);
  if (
    createdRecords.invalidEntry ||
    remainingUsers !== 0 ||
    remainingTickets !== 0
  ) {
    throw new Error("Run-specific E2E fixture cleanup could not be verified.");
  }
}

function runPlaywright(cliPath, environment, secrets) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "test"], {
      cwd: frontendDirectory,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    playwrightProcess = child;
    child.once("error", reject);
    child.once("close", (code) => {
      playwrightProcess = undefined;
      const standardOutput = redactOutput(
        Buffer.concat(stdout).toString("utf8"),
        secrets,
      );
      const standardError = redactOutput(
        Buffer.concat(stderr).toString("utf8"),
        secrets,
      );
      if (standardOutput) process.stdout.write(standardOutput);
      if (standardError) process.stderr.write(standardError);
      resolve(code ?? 1);
    });
  });
}

let playwrightProcess;
let receivedSignal;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    receivedSignal = signal;
    playwrightProcess?.kill(signal);
  });
}

async function main() {
  if (process.env.npm_lifecycle_event !== "e2e" || process.argv.length !== 2) {
    throw new Error("Run browser tests only with npm run e2e and no extra options.");
  }
  if (receivedSignal) {
    throw new Error("The E2E runner was interrupted before startup.");
  }

  const { values, testDatabaseUrl } = loadTestEnvironment(testEnvPath);
  protectedOutputValues = Object.entries(values)
    .filter(([key]) => /(PASSWORD|SECRET|URL|TOKEN)/i.test(key))
    .map(([, value]) => value);
  if (
    typeof values.JWT_ACCESS_SECRET !== "string" ||
    values.JWT_ACCESS_SECRET.length < 32
  ) {
    throw new Error("The test JWT secret in backend/.env.test is invalid.");
  }

  const prisma = new PrismaClient({
    datasourceUrl: testDatabaseUrl,
    log: ["error"],
  });
  const runId = randomUUID();
  let fixtures;
  let temporaryDirectory;
  let backendEnvPath;
  let authorizationPath;
  let createdRecordIdsPath;
  let cleanupFailed = false;
  let exitCode = 1;

  try {
    await verifyDatabaseIdentity(prisma);
    if (receivedSignal) throw new Error("The E2E runner was interrupted.");
    fixtures = await createFixtures(prisma, runId);
    if (receivedSignal) throw new Error("The E2E runner was interrupted.");

    temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "nexus-e2e-"));
    backendEnvPath = path.join(temporaryDirectory, "backend-env");
    authorizationPath = path.join(temporaryDirectory, "runner-token");
    createdRecordIdsPath = path.join(temporaryDirectory, "created-record-ids");
    const frontendPort = await reservePort();
    const backendPort = await reservePort();
    const baseURL = `http://127.0.0.1:${frontendPort}`;
    const backendURL = `http://127.0.0.1:${backendPort}`;
    const backendEnv = [
      `DATABASE_URL=${quoteEnv(testDatabaseUrl)}`,
      `JWT_ACCESS_SECRET=${quoteEnv(values.JWT_ACCESS_SECRET)}`,
      ...(typeof values.JWT_ACCESS_EXPIRES_IN === "string"
        ? [`JWT_ACCESS_EXPIRES_IN=${quoteEnv(values.JWT_ACCESS_EXPIRES_IN)}`]
        : []),
    ].join("\n");
    const authorizationToken = randomBytes(32).toString("hex");
    const csrfSecret = randomBytes(32).toString("hex");
    writePrivateFile(backendEnvPath, `${backendEnv}\n`);
    writePrivateFile(authorizationPath, authorizationToken);
    writePrivateFile(createdRecordIdsPath, "");
    protectedOutputValues.push(
      fixtures.userEmail,
      fixtures.userPassword,
      fixtures.supportEmail,
      fixtures.supportPassword,
      authorizationToken,
      csrfSecret,
      "incorrect-password",
    );

    const safeEnvironment = createSafeEnvironment();
    Object.assign(safeEnvironment, {
      NEXUS_E2E_AUTH_FILE: authorizationPath,
      NEXUS_E2E_AUTH_TOKEN: authorizationToken,
      NEXUS_E2E_BASE_URL: baseURL,
      NEXUS_E2E_BACKEND_URL: backendURL,
      NEXUS_E2E_BACKEND_ENV_PATH: backendEnvPath,
      NEXUS_E2E_FRONTEND_PORT: String(frontendPort),
      NEXUS_E2E_BACKEND_PORT: String(backendPort),
      NEXUS_E2E_RUN_ID: runId,
      NEXUS_E2E_CREATED_RECORD_IDS_FILE: createdRecordIdsPath,
      NEXUS_E2E_USER_EMAIL: fixtures.userEmail,
      NEXUS_E2E_USER_PASSWORD: fixtures.userPassword,
      NEXUS_E2E_SUPPORT_EMAIL: fixtures.supportEmail,
      NEXUS_E2E_SUPPORT_PASSWORD: fixtures.supportPassword,
      BACKEND_API_URL: backendURL,
      CSRF_SECRET: csrfSecret,
    });

    const playwrightCli = frontendRequire.resolve("@playwright/test/cli");
    if (receivedSignal) throw new Error("The E2E runner was interrupted.");
    exitCode = await runPlaywright(
      playwrightCli,
      safeEnvironment,
      protectedOutputValues,
    );
  } finally {
    if (fixtures) {
      try {
        await cleanFixtures(prisma, fixtures, createdRecordIdsPath);
      } catch {
        cleanupFailed = true;
        console.error(
          "E2E cleanup failed; only the run-specific fixture records may remain.",
        );
      }
    }
    try {
      await prisma.$disconnect();
    } catch {
      cleanupFailed = true;
      console.error("E2E database connection cleanup failed.");
    }
    for (const filePath of [
      authorizationPath,
      backendEnvPath,
      createdRecordIdsPath,
    ]) {
      if (filePath) {
        try {
          unlinkSync(filePath);
        } catch (error) {
          if (error?.code !== "ENOENT") {
            cleanupFailed = true;
            console.error("E2E temporary configuration cleanup failed.");
          }
        }
      }
    }
    if (temporaryDirectory) {
      try {
        rmdirSync(temporaryDirectory);
      } catch {
        cleanupFailed = true;
        console.error("E2E temporary directory cleanup failed.");
      }
    }
  }

  if (receivedSignal) {
    process.exitCode = receivedSignal === "SIGINT" ? 130 : 143;
  } else {
    process.exitCode = cleanupFailed ? 1 : exitCode;
  }
}

main().catch((error) => {
  const diagnostic =
    error instanceof Error ? error.stack ?? error.message : "Unknown E2E runner error.";
  console.error(redactOutput(diagnostic));
  process.exitCode = 1;
});
