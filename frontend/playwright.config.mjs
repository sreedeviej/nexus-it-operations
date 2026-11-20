import "./test/require-e2e-runner.mjs";
import { defineConfig } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendDirectory = path.resolve(frontendDirectory, "..", "backend");
const baseURL = process.env.NEXUS_E2E_BASE_URL;
const backendURL = process.env.NEXUS_E2E_BACKEND_URL;
const backendEnvPath = process.env.NEXUS_E2E_BACKEND_ENV_PATH;
const frontendPort = process.env.NEXUS_E2E_FRONTEND_PORT;
const backendPort = process.env.NEXUS_E2E_BACKEND_PORT;

if (
  !baseURL ||
  !backendURL ||
  !backendEnvPath ||
  !frontendPort ||
  !backendPort ||
  !process.env.CSRF_SECRET
) {
  throw new Error("The authorized NEXUS E2E environment is incomplete.");
}

const quote = (value) => `"${value.replace(/"/g, '\\"')}"`;
const nextCli = path.join(
  frontendDirectory,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 120_000,
  use: {
    baseURL,
    trace: "off",
  },
  webServer: [
    {
      command: `${quote(process.execPath)} --import tsx src/server.ts`,
      cwd: backendDirectory,
      url: `${backendURL}/api/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        DOTENV_CONFIG_PATH: backendEnvPath,
        NODE_ENV: "test",
        PORT: backendPort,
        CORS_ORIGINS: baseURL,
      },
    },
    {
      command: `${quote(process.execPath)} ${quote(nextCli)} dev --hostname 127.0.0.1 --port ${frontendPort}`,
      cwd: frontendDirectory,
      url: `${baseURL}/login`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        BACKEND_API_URL: backendURL,
        CSRF_SECRET: process.env.CSRF_SECRET,
        NODE_ENV: "development",
      },
    },
  ],
});
