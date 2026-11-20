import { lstatSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isInside(root, target) {
  const relativePath = path.relative(path.resolve(root), path.resolve(target));
  return (
    relativePath === "" ||
    (!path.isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`))
  );
}

function rejectUnauthorizedExecution() {
  throw new Error(
    "Backend test files must be run through npm test; runner authorization is missing or invalid.",
  );
}

const authorizationFile = process.env.NEXUS_TEST_RUNNER_AUTH_FILE;
const authorizationToken = process.env.NEXUS_TEST_RUNNER_AUTH_TOKEN;
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

if (
  !authorizationFile ||
  !authorizationToken ||
  !/^[a-f0-9]{64}$/.test(authorizationToken) ||
  !path.isAbsolute(authorizationFile) ||
  !isInside(os.tmpdir(), authorizationFile) ||
  isInside(repositoryRoot, authorizationFile)
) {
  rejectUnauthorizedExecution();
}

try {
  if (
    !lstatSync(authorizationFile).isFile() ||
    readFileSync(authorizationFile, "utf8") !== authorizationToken
  ) {
    rejectUnauthorizedExecution();
  }
} catch {
  rejectUnauthorizedExecution();
}
