import type { RequestHandler } from "express";
import { prisma } from "../config/prisma.js";

export const requireActiveUser: RequestHandler = async (req, res, next) => {
  const auth = req.auth;

  if (!auth) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
      },
    });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true, isActive: true },
    });

    if (!user?.isActive) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required.",
        },
      });
      return;
    }

    req.auth = { userId: auth.userId, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
};
