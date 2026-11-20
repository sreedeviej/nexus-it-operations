import { lstatSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function rejectUnauthorizedExecution() {
  throw new Error(
    "Browser tests must be started with npm run e2e; runner authorization is missing or invalid.",
  );
}

const authorizationFile = process.env.NEXUS_E2E_AUTH_FILE;
const authorizationToken = process.env.NEXUS_E2E_AUTH_TOKEN;
const temporaryRoot = path.resolve(os.tmpdir());
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const authorizationPath = authorizationFile
  ? path.resolve(authorizationFile)
  : "";
const temporaryRelativePath = authorizationPath
  ? path.relative(temporaryRoot, authorizationPath)
  : "";
const repositoryRelativePath = authorizationPath
  ? path.relative(repositoryRoot, authorizationPath)
  : "";

if (
  !authorizationFile ||
  !authorizationToken ||
  !/^[a-f0-9]{64}$/.test(authorizationToken) ||
  !path.isAbsolute(authorizationFile) ||
  !temporaryRelativePath ||
  path.isAbsolute(temporaryRelativePath) ||
  temporaryRelativePath === ".." ||
  temporaryRelativePath.startsWith(`..${path.sep}`) ||
  repositoryRelativePath === "" ||
  (!path.isAbsolute(repositoryRelativePath) &&
    repositoryRelativePath !== ".." &&
    !repositoryRelativePath.startsWith(`..${path.sep}`))
) {
  rejectUnauthorizedExecution();
}

try {
  if (
    !lstatSync(authorizationPath).isFile() ||
    readFileSync(authorizationPath, "utf8") !== authorizationToken
  ) {
    rejectUnauthorizedExecution();
  }
} catch {
  rejectUnauthorizedExecution();
}
