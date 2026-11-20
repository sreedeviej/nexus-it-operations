import { loginInputSchema } from "@/lib/validation";
import {
  appendSessionCookie,
  backendError,
  backendJson,
  callBackend,
  errorResponse,
  jsonResponse,
  parseLoginResponse,
  readJson,
  validateMutation,
  validationError,
} from "@/lib/server/bff";

export async function POST(request: Request) {
  const protectionError = validateMutation(request);
  if (protectionError) return protectionError;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues);

  const response = await callBackend("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });
  if (!response) {
    return errorResponse(
      503,
      "BACKEND_UNAVAILABLE",
      "The service is temporarily unavailable. Please try again.",
    );
  }

  const bodyFromBackend = await backendJson(response);
  if (!response.ok) return backendError(response, bodyFromBackend);

  const login = parseLoginResponse(bodyFromBackend);
  if (!login) {
    return errorResponse(502, "INVALID_BACKEND_RESPONSE", "Sign-in failed.");
  }

  const result = jsonResponse({ user: login.user });
  appendSessionCookie(result, login.accessToken, login.expiresAt);
  return result;
}
