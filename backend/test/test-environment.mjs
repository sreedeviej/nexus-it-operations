import { readFileSync } from "node:fs";
import { parse } from "dotenv";

function readUniqueValue(source, key) {
  const definitions = source
    .split(/\r?\n/)
    .filter((line) =>
      new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line),
    );

  if (definitions.length !== 1) {
    throw new Error(`backend/.env.test must define ${key} exactly once.`);
  }
}

function parseDatabaseUrl(value, label) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL URL.`);
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username
  ) {
    throw new Error(`${label} must be a PostgreSQL connection URL.`);
  }

  let database;
  let username;

  try {
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
  } catch {
    throw new Error(`${label} contains an invalid database or role name.`);
  }

  return { database, username };
}

export function validateTestDatabaseUrls(
  testDatabaseUrl,
  shadowDatabaseUrl,
) {
  const test = parseDatabaseUrl(testDatabaseUrl, "TEST_DATABASE_URL");
  const shadow = parseDatabaseUrl(shadowDatabaseUrl, "SHADOW_DATABASE_URL");

  if (test.database !== "nexus_test" || test.username !== "nexus_test_user") {
    throw new Error(
      "TEST_DATABASE_URL must target nexus_test as nexus_test_user.",
    );
  }

  if (
    shadow.database !== "nexus_test_shadow" ||
    shadow.username !== "nexus_test_admin"
  ) {
    throw new Error(
      "SHADOW_DATABASE_URL must target nexus_test_shadow as nexus_test_admin.",
    );
  }

  if (test.database === shadow.database) {
    throw new Error("Test and shadow database targets must be different.");
  }

  return { testDatabaseUrl, shadowDatabaseUrl };
}

export function loadTestEnvironment(testEnvPath) {
  let source;
  let values;

  try {
    source = readFileSync(testEnvPath, "utf8");
    values = parse(source);
  } catch {
    throw new Error("Unable to read backend/.env.test.");
  }

  readUniqueValue(source, "TEST_DATABASE_URL");
  readUniqueValue(source, "SHADOW_DATABASE_URL");
  readUniqueValue(source, "JWT_ACCESS_SECRET");

  const { testDatabaseUrl, shadowDatabaseUrl } = validateTestDatabaseUrls(
    values.TEST_DATABASE_URL,
    values.SHADOW_DATABASE_URL,
  );

  return { values, testDatabaseUrl, shadowDatabaseUrl };
}
