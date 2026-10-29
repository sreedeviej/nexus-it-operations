import morgan from "morgan";

export const requestLogger = morgan((tokens, req, res) => {
  const requestUrl = tokens.url(req, res) ?? "/";
  const path = new URL(requestUrl, "http://localhost").pathname;

  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "http_request",
    method: tokens.method(req, res),
    path,
    statusCode: Number(tokens.status(req, res)),
    durationMs: Number(tokens["response-time"](req, res)),
  });
});
