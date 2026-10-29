import app from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.PORT, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "server_started",
      port: env.PORT,
      environment: env.NODE_ENV,
    }),
  );
});

server.on("error", (error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "server_start_failed",
      errorType: error.name,
    }),
  );
  process.exit(1);
});
