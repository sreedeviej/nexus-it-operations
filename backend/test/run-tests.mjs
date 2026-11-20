import { randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadTestEnvironment } from "./test-environment.mjs";

const backendDirectory = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = path.resolve(backendDirectory, "..");
const testDirectory = fileURLToPath(new URL("./", import.meta.url));
const authorizationModule = path.join(
  testDirectory,
  "require-test-runner.mjs",
);
const testEnvPath = path.join(backendDirectory, ".env.test");
const preflightOnly = process.argv.slice(2).includes("--preflight-only");

function isInside(root, target) {
  const relativePath = path.relative(path.resolve(root), path.resolve(target));
  return (
    relativePath === "" ||
    (!path.isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`))
  );
}

function removeDatabaseOverrides(environment) {
  for (const key of Object.keys(environment)) {
    if (
      /^(DATABASE_URL|TEST_DATABASE_URL|SHADOW_DATABASE_URL|TEST_DATABASE_ADMIN_URL|DIRECT_URL|PGSERVICE|PGSERVICEFILE|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PGSSLMODE)$/i.test(
        key,
      )
    ) {
      delete environment[key];
    }
  }
}

function applyTestEnvironment(values, testDatabaseUrl, shadowDatabaseUrl) {
  removeDatabaseOverrides(process.env);
  Object.assign(process.env, values);
  removeDatabaseOverrides(process.env);
  process.env.TEST_DATABASE_URL = testDatabaseUrl;
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.SHADOW_DATABASE_URL = shadowDatabaseUrl;
  process.env.NODE_ENV = "test";
  process.env.DOTENV_CONFIG_PATH = testEnvPath;
}

function createTestChildEnvironment(
  values,
  testDatabaseUrl,
  shadowDatabaseUrl,
) {
  const childEnvironment = { ...process.env };
  removeDatabaseOverrides(childEnvironment);
  delete childEnvironment.NEXUS_TEST_RUNNER_AUTH_FILE;
  delete childEnvironment.NEXUS_TEST_RUNNER_AUTH_TOKEN;
  Object.assign(childEnvironment, values);
  removeDatabaseOverrides(childEnvironment);
  childEnvironment.TEST_DATABASE_URL = testDatabaseUrl;
  childEnvironment.DATABASE_URL = testDatabaseUrl;
  childEnvironment.SHADOW_DATABASE_URL = shadowDatabaseUrl;
  childEnvironment.NODE_ENV = "test";
  childEnvironment.DOTENV_CONFIG_PATH = testEnvPath;

  return childEnvironment;
}

async function verifyDatabaseIdentity(PrismaClient, databaseUrl, expected) {
  const client = new PrismaClient({
    datasourceUrl: databaseUrl,
    log: ["error"],
  });
  let identity;

  try {
    [identity] = await client.$queryRaw`
      SELECT current_database() AS "databaseName", current_user AS "roleName"
    `;
  } catch {
    throw new Error(
      `Unable to verify the isolated ${expected.database} database; no tests were run.`,
    );
  } finally {
    await client.$disconnect();
  }

  if (
    identity?.databaseName !== expected.database ||
    identity?.roleName !== expected.role
  ) {
    throw new Error(
      `The ${expected.database} connection has an unexpected identity; no tests were run.`,
    );
  }
}

function withRunnerAuthorization(childEnvironment, callback) {
  const token = randomBytes(32).toString("hex");
  const authorizationFile = path.join(
    os.tmpdir(),
    `nexus-test-runner-${process.pid}-${randomBytes(16).toString("hex")}.token`,
  );

  try {
    writeFileSync(authorizationFile, token, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });

    if (
      !path.isAbsolute(authorizationFile) ||
      !existsSync(authorizationFile) ||
      !isInside(os.tmpdir(), authorizationFile) ||
      isInside(repositoryRoot, authorizationFile)
    ) {
      throw new Error("Unable to establish test-runner authorization.");
    }

    return callback({
      ...childEnvironment,
      NEXUS_TEST_RUNNER_AUTH_FILE: authorizationFile,
      NEXUS_TEST_RUNNER_AUTH_TOKEN: token,
    });
  } finally {
    if (existsSync(authorizationFile)) {
      unlinkSync(authorizationFile);
    }
  }
}

async function main() {
  if (process.env.npm_lifecycle_event !== "test") {
    throw new Error("Backend tests must be started with npm test.");
  }

  const arguments_ = process.argv.slice(2);
  if (
    arguments_.some((argument) => argument !== "--preflight-only") ||
    arguments_.length > 1
  ) {
    throw new Error("Unsupported backend test-runner option.");
  }

  const preflightOnly = arguments_[0] === "--preflight-only";
  const { values, testDatabaseUrl, shadowDatabaseUrl } =
    loadTestEnvironment(testEnvPath);
  applyTestEnvironment(values, testDatabaseUrl, shadowDatabaseUrl);

  if (
    typeof values.JWT_ACCESS_SECRET !== "string" ||
    values.JWT_ACCESS_SECRET.length < 32
  ) {
    throw new Error(
      "Set a JWT_ACCESS_SECRET of at least 32 characters in backend/.env.test.",
    );
  }

  const { PrismaClient } = await import("@prisma/client");
  await verifyDatabaseIdentity(PrismaClient, testDatabaseUrl, {
    database: "nexus_test",
    role: "nexus_test_user",
  });
  await verifyDatabaseIdentity(PrismaClient, shadowDatabaseUrl, {
    database: "nexus_test_shadow",
    role: "nexus_test_admin",
  });

  const testFiles = readdirSync(testDirectory)
    .filter((file) => file.endsWith(".test.ts"))
    .sort()
    .map((file) => path.join(testDirectory, file));

  if (testFiles.length === 0) {
    throw new Error("No backend test files were found.");
  }

  for (const testFile of testFiles) {
    const source = readFileSync(testFile, "utf8");
    if (!/^\s*import\s+["']\.\/require-test-runner\.mjs["'];/m.test(source)) {
      throw new Error(
        "A backend test file is missing the test-runner authorization bootstrap.",
      );
    }
  }

  const childEnvironment = createTestChildEnvironment(
    values,
    testDatabaseUrl,
    shadowDatabaseUrl,
  );

  if (preflightOnly) {
    const authorizationProbe = withRunnerAuthorization(
      childEnvironment,
      (authorizedEnvironment) =>
        spawnSync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `await import(${JSON.stringify(pathToFileURL(authorizationModule).href)})`,
          ],
          {
            cwd: backendDirectory,
            env: authorizedEnvironment,
            encoding: "utf8",
            windowsHide: true,
          },
        ),
    );

    if (authorizationProbe.error || authorizationProbe.status !== 0) {
      throw new Error("The test-runner authorization check failed.");
    }

    console.log(
      "Read-only preflight and test-runner authorization passed; no tests were run.",
    );
    return;
  }

  const result = withRunnerAuthorization(
    childEnvironment,
    (authorizedEnvironment) =>
      spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--test",
          "--test-concurrency=1",
          ...testFiles,
        ],
        {
          cwd: backendDirectory,
          stdio: "inherit",
          env: authorizedEnvironment,
        },
      ),
  );

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Backend test runner failed.";
  console.error(
    message
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URL]")
      .replace(
        /((?:password|token|secret|authorization)\s*[:=]\s*)[^\s,;]+/gi,
        "$1[redacted]",
      ),
  );
  process.exitCode = 1;
});
