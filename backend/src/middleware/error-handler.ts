import type { ErrorRequestHandler, RequestHandler } from "express";

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} was not found.`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const invalidJson =
    error instanceof SyntaxError &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status === 400;

  const statusCode = invalidJson ? 400 : 500;
  const code = invalidJson ? "INVALID_JSON" : "INTERNAL_SERVER_ERROR";

  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "request_error",
      code,
      statusCode,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );

  res.status(statusCode).json({
    error: {
      code,
      message: invalidJson ? "Malformed JSON request body." : "Internal server error.",
    },
  });
};
