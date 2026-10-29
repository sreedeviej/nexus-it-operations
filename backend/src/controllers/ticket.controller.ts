import type { RequestHandler } from "express";
import { ZodError } from "zod";
import {
  createTicket,
  createTicketSchema,
  getTicket,
  listTickets,
  ticketIdSchema,
  updateTicketStatus,
  updateTicketStatusSchema,
} from "../services/ticket.service.js";

function sendUnauthorized(res: Parameters<RequestHandler>[1]) {
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    },
  });
}

function sendValidationError(res: Parameters<RequestHandler>[1], error: ZodError) {
  res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Please check the ticket details.",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    },
  });
}

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const input = createTicketSchema.parse(req.body);
    const ticket = await createTicket(req.auth.userId, input);

    res.status(201).json({ ticket });
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(res, error);
      return;
    }

    next(error);
  }
};

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const tickets = await listTickets(req.auth.userId, req.auth.role);
    res.status(200).json({ tickets });
  } catch (error) {
    next(error);
  }
};

export const get: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const ticketId = ticketIdSchema.parse(req.params.ticketId);
    const ticket = await getTicket(
      ticketId,
      req.auth.userId,
      req.auth.role,
    );

    if (!ticket) {
      res.status(404).json({
        error: {
          code: "TICKET_NOT_FOUND",
          message: "The ticket was not found.",
        },
      });
      return;
    }

    res.status(200).json({ ticket });
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(res, error);
      return;
    }

    next(error);
  }
};

export const updateStatus: RequestHandler = async (req, res, next) => {
  try {
    if (!req.auth) {
      sendUnauthorized(res);
      return;
    }

    const ticketId = ticketIdSchema.parse(req.params.ticketId);
    const { status } = updateTicketStatusSchema.parse(req.body);
    const result = await updateTicketStatus(
      ticketId,
      req.auth.userId,
      req.auth.role,
      status,
    );

    if (result.kind === "NOT_FOUND") {
      res.status(404).json({
        error: {
          code: "TICKET_NOT_FOUND",
          message: "The ticket was not found.",
        },
      });
      return;
    }

    if (result.kind === "FORBIDDEN") {
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: "You are not allowed to change this ticket's status.",
        },
      });
      return;
    }

    if (result.kind === "INVALID_TRANSITION") {
      res.status(409).json({
        error: {
          code: "INVALID_STATUS_TRANSITION",
          message: "The ticket cannot transition to that status.",
        },
      });
      return;
    }

    if (result.kind === "CONCURRENT_UPDATE") {
      res.status(409).json({
        error: {
          code: "TICKET_CHANGED",
          message: "The ticket changed while the update was being applied.",
        },
      });
      return;
    }

    res.status(200).json({ ticket: result.ticket });
  } catch (error) {
    if (error instanceof ZodError) {
      sendValidationError(res, error);
      return;
    }

    next(error);
  }
};
