import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  DATABASE_URL: z.string().url().optional(),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .refine((origins) => origins.length > 0, {
      message: "At least one CORS origin must be configured.",
    }),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error(
    JSON.stringify({
      level: "error",
      event: "invalid_environment_configuration",
      fields: parsedEnvironment.error.flatten().fieldErrors,
    }),
  );
  process.exit(1);
}

export const env = parsedEnvironment.data;
