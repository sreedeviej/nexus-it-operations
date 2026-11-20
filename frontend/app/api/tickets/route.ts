import { createTicketInputSchema } from "@/lib/validation";
import {
  backendError,
  backendJson,
  callAuthenticatedBackend,
  clearSessionCookie,
  errorResponse,
  jsonResponse,
  parseTicket,
  parseTickets,
  readJson,
  sessionToken,
  validateMutation,
  validationError,
} from "@/lib/server/bff";

export async function GET(request: Request) {
  const token = await sessionToken(request);
  if (!token) {
    return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const response = await callAuthenticatedBackend("/api/tickets", token);
  if (!response) {
    return errorResponse(503, "BACKEND_UNAVAILABLE", "Tickets are temporarily unavailable.");
  }

  const result = await backendJson(response);
  if (!response.ok) {
    const error = backendError(response, result);
    if (response.status === 401) clearSessionCookie(error);
    return error;
  }

  const tickets =
    typeof result === "object" && result !== null && "tickets" in result
      ? parseTickets(result.tickets)
      : undefined;
  if (!tickets) {
    return errorResponse(502, "INVALID_BACKEND_RESPONSE", "Could not load tickets.");
  }
  return jsonResponse({ tickets });
}

export async function POST(request: Request) {
  const protectionError = validateMutation(request);
  if (protectionError) return protectionError;

  const token = await sessionToken(request);
  if (!token) {
    return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const parsed = createTicketInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues);

  const response = await callAuthenticatedBackend("/api/tickets", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return errorResponse(503, "BACKEND_UNAVAILABLE", "Tickets are temporarily unavailable.");
  }

  const result = await backendJson(response);
  if (!response.ok) {
    const error = backendError(response, result);
    if (response.status === 401) clearSessionCookie(error);
    return error;
  }
  const ticket =
    typeof result === "object" && result !== null && "ticket" in result
      ? parseTicket(result.ticket)
      : undefined;
  if (!ticket) {
    return errorResponse(502, "INVALID_BACKEND_RESPONSE", "Could not create the ticket.");
  }
  return jsonResponse({ ticket }, response.status);
}
