import "server-only";

import { redirect } from "next/navigation";
import {
  backendJson,
  callAuthenticatedBackend,
  currentSessionToken,
  parseTickets,
  parseUser,
} from "./bff";

export async function loadDashboard() {
  const token = await currentSessionToken();
  if (!token) redirect("/login");

  const profileResponse = await callAuthenticatedBackend("/api/auth/me", token);
  if (!profileResponse || profileResponse.status === 503) {
    return {
      user: undefined,
      tickets: undefined,
      error: "The service is temporarily unavailable. Please try again.",
    };
  }
  if (profileResponse.status === 401) redirect("/login?expired=1");
  if (!profileResponse.ok) {
    return {
      user: undefined,
      tickets: undefined,
      error: "Could not verify your account. Please try again.",
    };
  }

  const profileBody = await backendJson(profileResponse);
  const user =
    typeof profileBody === "object" &&
    profileBody !== null &&
    "user" in profileBody
      ? parseUser(profileBody.user)
      : undefined;
  if (!user) {
    return {
      user: undefined,
      tickets: undefined,
      error: "Could not load your account profile.",
    };
  }

  const ticketsResponse = await callAuthenticatedBackend("/api/tickets", token);
  if (!ticketsResponse || ticketsResponse.status === 503) {
    return {
      user,
      tickets: undefined,
      error: "Tickets are temporarily unavailable. Please try again.",
    };
  }
  if (ticketsResponse.status === 401) redirect("/login?expired=1");
  if (!ticketsResponse.ok) {
    return {
      user,
      tickets: undefined,
      error: "Could not load tickets. Please try again.",
    };
  }

  const ticketBody = await backendJson(ticketsResponse);
  const tickets =
    typeof ticketBody === "object" &&
    ticketBody !== null &&
    "tickets" in ticketBody
      ? parseTickets(ticketBody.tickets)
      : undefined;

  return {
    user,
    tickets,
    error: tickets ? undefined : "The service returned an invalid ticket list.",
  };
}
