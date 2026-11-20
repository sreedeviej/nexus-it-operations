"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import type {
  Ticket,
  TicketCategory,
  TicketStatus,
  User,
} from "@/lib/contracts";
import {
  createTicketInputSchema,
  updateTicketStatusInputSchema,
} from "@/lib/validation";

const transitions: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["OPEN", "RESOLVED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

const categories: TicketCategory[] = [
  "INCIDENT",
  "SERVICE_REQUEST",
  "ACCESS_REQUEST",
  "HARDWARE",
  "SOFTWARE",
  "NETWORK",
  "OTHER",
];

function label(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function messageFrom(body: unknown, fallback: string) {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return fallback;
}

async function csrfRequest(path: string, method: "POST" | "PATCH", body?: unknown) {
  const csrfResponse = await fetch("/api/csrf", {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const csrfBody: unknown = await csrfResponse.json();
  if (
    !csrfResponse.ok ||
    typeof csrfBody !== "object" ||
    csrfBody === null ||
    !("csrfToken" in csrfBody) ||
    typeof csrfBody.csrfToken !== "string"
  ) {
    throw new Error("Could not verify this request. Refresh and try again.");
  }

  return fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfBody.csrfToken,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
}

export function Dashboard({
  user,
  initialTickets,
  initialError,
}: {
  user: User;
  initialTickets: Ticket[] | undefined;
  initialError?: string;
}) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets ?? []);
  const [loading, setLoading] = useState(!initialTickets);
  const [error, setError] = useState(initialError ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [busyTicketId, setBusyTicketId] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/tickets", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/login?expired=1");
          return;
        }
        throw new Error(messageFrom(body, "Tickets could not be loaded."));
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("tickets" in body) ||
        !Array.isArray(body.tickets)
      ) {
        throw new Error("The server returned an invalid ticket list.");
      }
      setTickets(body.tickets as Ticket[]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Tickets could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  const filteredTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      const matchesQuery =
        !normalized ||
        `${ticket.id} ${ticket.title} ${ticket.category} ${ticket.status} ${ticket.priority}`
          .toLowerCase()
          .includes(normalized);
      return (
        matchesQuery &&
        (statusFilter === "ALL" || ticket.status === statusFilter)
      );
    });
  }, [query, statusFilter, tickets]);

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const parsed = createTicketInputSchema.safeParse({
      title: formData.get("title"),
      description: formData.get("description"),
      category: formData.get("category"),
      priority: formData.get("priority"),
    });
    if (!parsed.success) {
      setCreateError(parsed.error.issues[0]?.message ?? "Check the ticket details.");
      return;
    }

    try {
      const response = await csrfRequest("/api/tickets", "POST", parsed.data);
      const body: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          router.replace("/login?expired=1");
          return;
        }
        setCreateError(messageFrom(body, "Ticket could not be created."));
        return;
      }
      setCreating(false);
      form.reset();
      await loadTickets();
    } catch (requestError) {
      setCreateError(
        requestError instanceof Error
          ? requestError.message
          : "Ticket could not be created.",
      );
    }
  }

  async function changeStatus(ticketId: string, status: TicketStatus) {
    const parsed = updateTicketStatusInputSchema.safeParse({ status });
    if (!parsed.success) return;
    setBusyTicketId(ticketId);
    setError("");
    try {
      const response = await csrfRequest(
        `/api/tickets/${encodeURIComponent(ticketId)}/status`,
        "PATCH",
        parsed.data,
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(messageFrom(body, "Ticket status could not be updated."));
        if (response.status === 401) router.replace("/login?expired=1");
        return;
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("ticket" in body) ||
        typeof body.ticket !== "object" ||
        body.ticket === null
      ) {
        setError("The server returned an invalid ticket.");
        return;
      }
      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === ticketId ? (body.ticket as Ticket) : ticket,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Ticket status could not be updated.",
      );
    } finally {
      setBusyTicketId("");
    }
  }

  async function logout() {
    try {
      const response = await csrfRequest("/api/auth/logout", "POST");
      if (!response.ok) throw new Error("Sign-out failed. Please try again.");
      window.location.replace("/login");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sign-out failed. Please try again.",
      );
    }
  }

  const supportUser = user.role !== "USER";
  const counts = {
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "OPEN").length,
    inProgress: tickets.filter((ticket) => ticket.status === "IN_PROGRESS").length,
    resolved: tickets.filter(
      (ticket) => ticket.status === "RESOLVED" || ticket.status === "CLOSED",
    ).length,
  };
  const countsAvailable = !loading && !error;
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="NEXUS home">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span className="brand-name">NEXUS<span>IT OPERATIONS</span></span>
        </Link>
        <p className="sidebar-label mt-9">WORKSPACE</p>
        <nav className="side-nav" aria-label="Workspace navigation">
          <a className="side-link active" href="#recent-tickets" aria-current="page">
            <span className="side-icon" aria-hidden="true">▦</span><span>Overview</span>
          </a>
          <a className="side-link" href="#recent-tickets">
            <span className="side-icon" aria-hidden="true">▤</span><span>Tickets</span>
            <span className="nav-count">{countsAvailable ? counts.total : "—"}</span>
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon" aria-hidden="true">?</span>
            <strong>Need a hand?</strong>
            <p>Create a ticket and our support team will follow up.</p>
            <a href="#recent-tickets">View tickets <span aria-hidden="true">→</span></a>
          </div>
          <div className="profile-button">
            <span className="profile-avatar">{initials}</span>
            <span className="profile-details">
              <strong>{user.firstName} {user.lastName}</strong>
              <small>{label(user.role)}</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark" aria-hidden="true">N</span>
            <span className="brand-name">NEXUS<span>IT OPERATIONS</span></span>
          </div>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-divider">/</span><strong>Overview</strong></div>
          <div className="topbar-actions">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <span className="visually-hidden">Search tickets</span>
              <input aria-label="Search tickets" type="search" placeholder="Search tickets..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <span className="topbar-divider" aria-hidden="true" />
            <button type="button" className="topbar-profile" onClick={logout} aria-label="Sign out">
              <span className="profile-avatar">{initials}</span>
              <span className="topbar-profile-name">{user.firstName} {user.lastName}</span>
              <span>Sign out</span>
            </button>
          </div>
        </header>

        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> NEXUS IT OPERATIONS</div>
              <h1>Welcome, {user.firstName}</h1>
              <p className="welcome-copy">Your live ticket overview. Signed in as {label(user.role)}.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setCreating((value) => !value)}>
              <span aria-hidden="true">＋</span> {creating ? "Cancel" : "Create a ticket"}
            </button>
          </section>

          <section className="summary-grid" aria-label="Ticket summary">
            {[
              ["Total tickets", counts.total, "Tickets returned by the API", "icon-indigo"],
              ["Open", counts.open, "Currently awaiting support", "icon-amber"],
              ["In progress", counts.inProgress, "Being worked on", "icon-rose"],
              ["Resolved or closed", counts.resolved, "Completed requests", "icon-green"],
            ].map(([title, count, detail, color]) => (
              <article className="summary-card" key={title}>
                <div className="summary-top"><span className={`summary-icon ${color}`} aria-hidden="true">▤</span></div>
                <p className="summary-label">{title}</p>
                <div className="summary-value">{countsAvailable ? count : "—"}</div>
                <p className="summary-foot">{detail}</p>
              </article>
            ))}
          </section>

          {creating && (
            <section className="panel mb-4 p-5" aria-labelledby="create-ticket-heading">
              <h2 id="create-ticket-heading" className="mb-4 text-base font-semibold">Create a support ticket</h2>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={createTicket}>
                <label className="grid gap-1 text-sm font-medium">
                  Title
                  <input className="rounded-md border border-[#dfe4ec] px-3 py-2 font-normal" name="title" required maxLength={200} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Category
                  <select className="rounded-md border border-[#dfe4ec] px-3 py-2 font-normal" name="category" defaultValue="INCIDENT">
                    {categories.map((category) => <option key={category} value={category}>{label(category)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium md:col-span-2">
                  Description
                  <textarea className="min-h-24 rounded-md border border-[#dfe4ec] px-3 py-2 font-normal" name="description" required maxLength={10_000} />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Priority
                  <select className="rounded-md border border-[#dfe4ec] px-3 py-2 font-normal" name="priority" defaultValue="NORMAL">
                    {["LOW", "NORMAL", "HIGH", "URGENT"].map((priority) => <option key={priority} value={priority}>{label(priority)}</option>)}
                  </select>
                </label>
                {createError && <p className="text-sm text-[#a7374e] md:col-span-2" role="alert">{createError}</p>}
                <button className="primary-button w-fit md:col-span-2" type="submit">Submit ticket</button>
              </form>
            </section>
          )}

          <section className="panel recent-panel" id="recent-tickets">
            <div className="panel-heading recent-heading">
              <div>
                <h2>Recent tickets <span className="ticket-count">{loading ? "…" : tickets.length}</span></h2>
                <p>{supportUser ? "Tickets visible to your support role" : "Your support requests"}</p>
              </div>
              <div className="table-actions">
                <label className="select-button filter-button">
                  <span className="visually-hidden">Filter by status</span>
                  <select className="bg-transparent outline-none" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="ALL">All statuses</option>
                    {(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const).map((status) => <option key={status} value={status}>{label(status)}</option>)}
                  </select>
                </label>
                <button className="text-link" type="button" onClick={() => void loadTickets()}>Refresh</button>
              </div>
            </div>
            {error && <p className="mx-4 my-3 rounded bg-[#fff0f2] p-3 text-sm text-[#a7374e]" role="alert">{error} <button className="font-semibold underline" type="button" onClick={() => void loadTickets()}>Try again</button></p>}
            <div className="table-scroll">
              <table className="ticket-table">
                <caption className="visually-hidden">Recent support tickets</caption>
                <thead><tr><th scope="col">TICKET</th><th scope="col">SUBJECT</th><th scope="col">STATUS</th><th scope="col">PRIORITY</th><th scope="col">LAST UPDATED</th><th scope="col">UPDATE STATUS</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td className="no-results" colSpan={6}>Loading tickets…</td></tr>
                  ) : filteredTickets.length === 0 ? (
                    <tr><td className="no-results" colSpan={6}>{tickets.length === 0 ? "No tickets yet. Create one to get started." : "No tickets match your search or filter."}</td></tr>
                  ) : filteredTickets.map((ticket) => {
                    const allowed = supportUser
                      ? transitions[ticket.status]
                      : ticket.status === "RESOLVED"
                        ? ["CLOSED" as const]
                        : [];
                    return (
                      <tr key={ticket.id}>
                        <td><span className="ticket-id">{ticket.id.slice(0, 8).toUpperCase()}</span></td>
                        <td><div className="ticket-subject"><span><strong>{ticket.title}</strong><small>{label(ticket.category)}</small></span></div></td>
                        <td><span className={`status-pill status-${ticket.status.toLowerCase().replace("_", "-")}`}><i />{label(ticket.status)}</span></td>
                        <td><span className={`priority-label priority-${ticket.priority.toLowerCase()}`}><i />{label(ticket.priority)}</span></td>
                        <td className="updated-cell">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ticket.updatedAt))}</td>
                        <td>
                          {allowed.length > 0 ? (
                            <select
                              className="max-w-32 rounded border border-[#e9edf3] bg-white px-2 py-1 text-xs"
                              aria-label={`Change status for ${ticket.title}`}
                              value={ticket.status}
                              disabled={busyTicketId === ticket.id}
                              onChange={(event) => void changeStatus(ticket.id, event.target.value as TicketStatus)}
                            >
                              <option value={ticket.status}>{label(ticket.status)}</option>
                              {allowed.map((status) => <option key={status} value={status}>{label(status)}</option>)}
                            </select>
                          ) : <span className="text-xs text-[#9ba5b2]">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>Showing <strong>{loading ? "—" : filteredTickets.length}</strong> of {loading ? "—" : tickets.length} tickets</span>
            </div>
          </section>
          <footer className="footer"><span>© {new Date().getFullYear()} NEXUS IT Operations</span><span>Signed in as {user.email}</span></footer>
        </div>
      </main>
    </div>
  );
}
