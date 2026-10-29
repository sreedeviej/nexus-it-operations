import { Role, TicketStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";

export const createTicketSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(10_000),
    category: z.enum([
      "INCIDENT",
      "SERVICE_REQUEST",
      "ACCESS_REQUEST",
      "HARDWARE",
      "SOFTWARE",
      "NETWORK",
      "OTHER",
    ]),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  })
  .strict();

export const ticketIdSchema = z.string().uuid();

export const updateTicketStatusSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  })
  .strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;

const ticketSelect = {
  id: true,
  requesterId: true,
  title: true,
  description: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

type TicketRecord = Prisma.TicketGetPayload<{ select: typeof ticketSelect }>;

const supportRoles: readonly Role[] = ["SUPPORT_AGENT", "TEAM_LEAD", "ADMIN"];

const allowedTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["OPEN", "RESOLVED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

function isSupportRole(role: Role) {
  return supportRoles.includes(role);
}

export async function createTicket(
  requesterId: string,
  input: CreateTicketInput,
) {
  return prisma.ticket.create({
    data: {
      requesterId,
      title: input.title,
      description: input.description,
      category: input.category,
      priority: input.priority,
    },
    select: ticketSelect,
  });
}

export async function listTickets(userId: string, role: Role) {
  return prisma.ticket.findMany({
    where: isSupportRole(role) ? undefined : { requesterId: userId },
    orderBy: { createdAt: "desc" },
    select: ticketSelect,
  });
}

export async function getTicket(
  ticketId: string,
  userId: string,
  role: Role,
) {
  return prisma.ticket.findFirst({
    where: {
      id: ticketId,
      ...(isSupportRole(role) ? {} : { requesterId: userId }),
    },
    select: ticketSelect,
  });
}

export type UpdateTicketStatusResult =
  | { kind: "NOT_FOUND" }
  | { kind: "FORBIDDEN" }
  | { kind: "INVALID_TRANSITION" }
  | { kind: "CONCURRENT_UPDATE" }
  | { kind: "UPDATED"; ticket: TicketRecord };

export async function updateTicketStatus(
  ticketId: string,
  userId: string,
  role: Role,
  status: TicketStatus,
): Promise<UpdateTicketStatusResult> {
  return prisma.$transaction(async (transaction) => {
    const isSupport = isSupportRole(role);
    const ticket = await transaction.ticket.findFirst({
      where: {
        id: ticketId,
        ...(isSupport ? {} : { requesterId: userId }),
      },
    });

    if (!ticket) {
      return { kind: "NOT_FOUND" };
    }

    const requesterCanClose =
      ticket.requesterId === userId &&
      status === "CLOSED" &&
      ticket.status === "RESOLVED";

    if (!isSupport && !requesterCanClose) {
      return { kind: "FORBIDDEN" };
    }

    if (!allowedTransitions[ticket.status].includes(status)) {
      return { kind: "INVALID_TRANSITION" };
    }

    const result = await transaction.ticket.updateMany({
      where: {
        id: ticket.id,
        status: ticket.status,
      },
      data: { status },
    });

    if (result.count !== 1) {
      return { kind: "CONCURRENT_UPDATE" };
    }

    const updatedTicket = await transaction.ticket.findUnique({
      where: { id: ticket.id },
      select: ticketSelect,
    });

    if (!updatedTicket) {
      return { kind: "NOT_FOUND" };
    }

    return { kind: "UPDATED", ticket: updatedTicket };
  });
}
