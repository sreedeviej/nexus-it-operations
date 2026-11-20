import {
  csrfTokenResponse,
  errorResponse,
  validateOrigin,
} from "@/lib/server/bff";

export async function POST(request: Request) {
  if (!validateOrigin(request)) {
    return errorResponse(403, "INVALID_ORIGIN", "This request is not allowed.");
  }
  return csrfTokenResponse();
}
