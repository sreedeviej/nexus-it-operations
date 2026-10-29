
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";

const tokenClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(["USER", "SUPPORT_AGENT", "TEAM_LEAD", "ADMIN"]),
});

export const authenticate: RequestHandler = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
    });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const claims = tokenClaimsSchema.safeParse(decoded);

    if (!claims.success) {
      res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "The access token is invalid.",
        },
      });
      return;
    }

    req.auth = {
      userId: claims.data.sub,
      role: claims.data.role,
    };

    next();
  } catch {
    res.status(401).json({
      error: {
        code: "INVALID_TOKEN",
        message: "The access token is invalid or expired.",
      },
    });
  }
};
