import {
  clearCsrfCookie,
  clearSessionCookie,
  jsonResponse,
  validateMutation,
} from "@/lib/server/bff";

export async function POST(request: Request) {
  const protectionError = validateMutation(request);
  if (protectionError) return protectionError;

  const response = jsonResponse({ message: "Signed out." });
  clearSessionCookie(response);
  clearCsrfCookie(response);
  return response;
}
