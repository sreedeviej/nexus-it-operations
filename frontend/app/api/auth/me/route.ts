import {
  backendError,
  backendJson,
  callAuthenticatedBackend,
  clearSessionCookie,
  errorResponse,
  jsonResponse,
  parseUser,
  sessionToken,
} from "@/lib/server/bff";

export async function GET(request: Request) {
  const token = await sessionToken(request);
  if (!token) {
    return errorResponse(401, "UNAUTHORIZED", "Authentication is required.");
  }

  const response = await callAuthenticatedBackend("/api/auth/me", token);
  if (!response) {
    return errorResponse(
      503,
      "BACKEND_UNAVAILABLE",
      "The service is temporarily unavailable. Please try again.",
    );
  }

  const result = await backendJson(response);
  if (!response.ok) {
    const error = backendError(response, result);
    if (response.status === 401) clearSessionCookie(error);
    return error;
  }

  const user =
    typeof result === "object" && result !== null && "user" in result
      ? parseUser(result.user)
      : undefined;
  if (!user) {
    return errorResponse(502, "INVALID_BACKEND_RESPONSE", "Could not load the profile.");
  }

  return jsonResponse({ user });
}
