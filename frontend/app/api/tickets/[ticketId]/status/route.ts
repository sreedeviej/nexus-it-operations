import { updateTicketStatusInputSchema, ticketIdSchema } from "@/lib/validation";
import {
  backendError,
  backendJson,
  callAuthenticatedBackend,
  clearSessionCookie,
  errorResponse,
  jsonResponse,
  parseTicket,
  readJson,
  sessionToken,
  validateMutation,
  validationError,
} from "@/lib/server/bff";

type RouteContext = { params: Promise<{ ticketId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const protectionError = validateMutation(request);
  if (protectionError) return protectionError;

  const { ticketId } = await context.params;
  const parsedId = ticketIdSchema.safeParse(ticketId);
  if (!parsedId.success) {
    return errorResponse(400, "VALIDATION_ERROR", "The ticket ID is invalid.");
  }

  const token = await sessionToken(request);
  if (!token) {
    return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsedBody = updateTicketStatusInputSchema.safeParse(body);
  if (!parsedBody.success) return validationError(parsedBody.error.issues);

  const response = await callAuthenticatedBackend(
    `/api/tickets/${parsedId.data}/status`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsedBody.data),
    },
  );
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
    return errorResponse(502, "INVALID_BACKEND_RESPONSE", "Could not update the ticket.");
  }
  return jsonResponse({ ticket }, response.status);
}
