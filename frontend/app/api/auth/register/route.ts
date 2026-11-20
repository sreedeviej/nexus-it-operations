import { registerInputSchema } from "@/lib/validation";
import {
  backendError,
  backendJson,
  callBackend,
  errorResponse,
  jsonResponse,
  readJson,
  validateMutation,
  validationError,
} from "@/lib/server/bff";
import { z } from "zod";

export async function POST(request: Request) {
  const protectionError = validateMutation(request);
  if (protectionError) return protectionError;

  const body = await readJson(request);
  if (body instanceof Response) return body;

  const parsed = registerInputSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error.issues);

  const response = await callBackend("/api/auth/register", {
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

  const result = await backendJson(response);
  if (!response.ok) return backendError(response, result);

  const registeredUserSchema = z.object({
    user: z.object({
      id: z.string().uuid(),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email(),
      role: z.enum(["USER", "SUPPORT_AGENT", "TEAM_LEAD", "ADMIN"]),
      createdAt: z.string().optional(),
    }),
  });
  const registeredUser = registeredUserSchema.safeParse(result);
  if (!registeredUser.success) {
    return errorResponse(502, "INVALID_BACKEND_RESPONSE", "Account creation failed.");
  }

  return jsonResponse(
    {
      message: "Account created successfully.",
      user: registeredUser.data.user,
    },
    response.status,
  );
}
