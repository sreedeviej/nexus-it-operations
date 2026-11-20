import {
  backendError,
  backendJson,
  callAuthenticatedBackend,
  clearSessionCookie,
  errorResponse,
  jsonResponse,
  parseTicket,
  sessionToken,
} from "@/lib/server/bff";
import { ticketIdSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ ticketId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { ticketId } = await context.params;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) {
    return errorResponse(400, "VALIDATION_ERROR", "The ticket ID is invalid.");
  }

  const token = await sessionToken(request);
  if (!token) {
    return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const response = await callAuthenticatedBackend(
    `/api/tickets/${parsedId.data}`,
    token,
  );
  if (!response) {
    return errorResponse(503, "BACKEND_UNAVAILABLE", "Tickets are temporarily unavailable.");
  }

  const body = await backendJson(response);
  if (!response.ok) {
    const error = backendError(response, body);
    if (response.status === 401) clearSessionCookie(error);
    return error;
  }
  const ticket =
    typeof body === "object" && body !== null && "ticket" in body
      ? parseTicket(body.ticket)
      : undefined;
  if (!ticket) {
    return errorResponse(502, "INVALID_BACKEND_RESPONSE", "Could not load the ticket.");
  }
  return jsonResponse({ ticket }, response.status);
}
