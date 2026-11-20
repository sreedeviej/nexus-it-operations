import { z } from "zod";

export const registerInputSchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter your first name.").max(100),
    lastName: z.string().trim().min(1, "Enter your last name.").max(100),
    email: z.string().trim().email("Enter a valid email address.").max(254),
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Password must be 72 characters or fewer."),
  })
  .strict();

export const loginInputSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address.").max(254),
    password: z
      .string()
      .min(1, "Enter your password.")
      .max(72, "Password must be 72 characters or fewer."),
  })
  .strict();

export const createTicketInputSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a ticket title.").max(200),
    description: z
      .string()
      .trim()
      .min(1, "Describe the issue.")
      .max(10_000),
    category: z.enum([
      "INCIDENT",
      "SERVICE_REQUEST",
      "ACCESS_REQUEST",
      "HARDWARE",
      "SOFTWARE",
      "NETWORK",
      "OTHER",
    ]),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  })
  .strict();

export const updateTicketStatusInputSchema = z
  .object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  })
  .strict();

export const ticketIdSchema = z.string().uuid();
