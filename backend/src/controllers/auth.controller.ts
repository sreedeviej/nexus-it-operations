
import type { RequestHandler } from "express";
import { ZodError } from "zod";
import {
  loginSchema,
  loginUser,
  registerSchema,
  registerUser,
  getCurrentUser,
} from "../services/auth.service.js";

export const me: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required.",
        },
      });
      return;
    }

    const user = await getCurrentUser(req.auth.userId);

    if (!user) {
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required.",
        },
      });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

export const register: RequestHandler = async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const user = await registerUser(input);

    res.status(201).json({
      message: "Account created successfully.",
      user,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Please check the registration details.",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
      return;
    }

    if (
      error instanceof Error &&
      error.name === "EMAIL_ALREADY_EXISTS"
    ) {
      res.status(409).json({
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await loginUser(input);

    res.status(200).json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Please check the login details.",
        },
      });
      return;
    }

    if (
      error instanceof Error &&
      error.message === "INVALID_CREDENTIALS"
    ) {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
      });
      return;
    }

    next(error);
  }
};
