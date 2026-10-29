"use client";

import { useEffect, useMemo, useState } from "react";

interface Ticket {
  id: string;
  requesterId: string;
  title: string;
  description: string;
  category:
    | "INCIDENT"
    | "SERVICE_REQUEST"
    | "ACCESS_REQUEST"
    | "HARDWARE"
    | "SOFTWARE"
    | "NETWORK"
    | "OTHER";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
}

interface TicketListResponse {
  tickets: Ticket[];
}

function formatEnumLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const navigation = [
  { label: "Overview", icon: "▦", active: true },
  { label: "My tickets", icon: "▤", count: "8" },
  { label: "Knowledge base", icon: "▧" },
  { label: "Assets", icon: "▣" },
];

function Dashboard() {
  const [query, setQuery] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTickets() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("http://localhost:5000/api/tickets", {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          let message = `The request failed (${response.status}).`;
          try {
            const body: unknown = await response.json();
            if (
              typeof body === "object" &&
              body !== null &&
              "error" in body &&
              typeof body.error === "object" &&
              body.error !== null &&
              "message" in body.error &&
              typeof body.error.message === "string"
            ) {
              message = body.error.message;
            }
          } catch {
            // Use the HTTP status when the server does not return JSON.
          }

          if (response.status === 401) {
            message += " This dashboard does not yet have a secure sign-in session.";
          }
          throw new Error(message);
        }

        const result = (await response.json()) as TicketListResponse;
        if (!Array.isArray(result.tickets)) {
          throw new Error("The server returned an invalid ticket list.");
        }
        setTickets(result.tickets);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof TypeError
            ? "Could not connect to the NEXUS API at http://localhost:5000."
            : requestError instanceof Error
              ? requestError.message
              : "Tickets could not be loaded.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadTickets();
    return () => controller.abort();
  }, [retry]);

  const visibleTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return tickets;
    return tickets.filter((ticket) =>
      `${ticket.id} ${ticket.title} ${ticket.category} ${ticket.status} ${ticket.priority}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, tickets]);

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="NEXUS home">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span className="brand-name">NEXUS<span>IT OPERATIONS</span></span>
        </a>

        <div className="workspace-picker">
          <span className="workspace-symbol" aria-hidden="true">✦</span>
          <span className="workspace-label"><small>WORKSPACE</small><strong>Acme Corporation</strong></span>
          <span className="workspace-chevron" aria-hidden="true">⌄</span>
        </div>

        <p className="sidebar-label">WORKSPACE</p>
        <nav className="side-nav" aria-label="Workspace navigation">
          {navigation.map((item) => (
            <a key={item.label} className={`side-link${item.active ? " active" : ""}`} href="#recent-tickets" aria-current={item.active ? "page" : undefined}>
              <span className="side-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-icon" aria-hidden="true">?</span>
            <strong>Need a hand?</strong>
            <p>Our support team is just a ticket away.</p>
            <a href="#recent-tickets">Get support <span aria-hidden="true">→</span></a>
          </div>
          <button type="button" className="profile-button">
            <span className="profile-avatar">SJ</span>
            <span className="profile-details"><strong>Sreedevi Jayanandan</strong><small>Employee</small></span>
            <span className="profile-menu" aria-hidden="true">···</span>
          </button>
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
              <input aria-label="Search tickets" type="search" placeholder="Search anything..." value={query} onChange={(event) => setQuery(event.target.value)} />
              <kbd>⌘ K</kbd>
            </label>
            <button type="button" className="icon-button notification-button" aria-label="Notifications">
              <span aria-hidden="true">♧</span><i aria-hidden="true" />
            </button>
            <span className="topbar-divider" aria-hidden="true" />
            <button type="button" className="topbar-profile" aria-label="Sreedevi Jayanandan profile">
              <span className="profile-avatar">SJ</span><span className="topbar-profile-name">Sreedevi Jayanandan</span><span aria-hidden="true">⌄</span>
            </button>
          </div>
        </header>

        <div className="content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> TUESDAY, OCTOBER 27, 2026</div>
              <h1>Good morning, Sreedevi <span aria-hidden="true">✦</span></h1>
              <p className="welcome-copy">Here&apos;s what&apos;s happening with your IT requests today.</p>
            </div>
            <a className="primary-button" href="#recent-tickets"><span aria-hidden="true">＋</span> Create a ticket</a>
          </section>

          <section className="summary-grid" aria-label="Ticket summary">
            <article className="summary-card">
              <div className="summary-top"><span className="summary-icon icon-indigo" aria-hidden="true">▤</span><span className="summary-trend trend-green">↗ 12%</span></div>
              <p className="summary-label">Total tickets</p><div className="summary-value">24</div>
              <p className="summary-foot">Compared to last month</p>
              <span className="sparkline spark-indigo" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
            </article>
            <article className="summary-card">
              <div className="summary-top"><span className="summary-icon icon-amber" aria-hidden="true">◷</span><span className="summary-trend trend-neutral">Active</span></div>
              <p className="summary-label">In progress</p><div className="summary-value">08</div>
              <p className="summary-foot">Tickets being worked on</p>
              <span className="sparkline spark-amber" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
            </article>
            <article className="summary-card">
              <div className="summary-top"><span className="summary-icon icon-green" aria-hidden="true">✓</span><span className="summary-trend trend-green">↗ 8.4%</span></div>
              <p className="summary-label">Resolved this month</p><div className="summary-value">16</div>
              <p className="summary-foot">Great work, team!</p>
              <span className="sparkline spark-green" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
            </article>
            <article className="summary-card">
              <div className="summary-top"><span className="summary-icon icon-rose" aria-hidden="true">⌁</span><span className="summary-trend trend-green">↘ 2.1h</span></div>
              <p className="summary-label">Avg. response time</p><div className="summary-value">4.2<span className="value-unit">hrs</span></div>
              <p className="summary-foot">Faster than last month</p>
              <span className="sparkline spark-rose" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
            </article>
          </section>

          <section className="secondary-grid">
            <article className="panel activity-panel">
              <div className="panel-heading">
                <div><h2>Ticket activity</h2><p>A quick look at your requests this week</p></div>
                <button className="select-button" type="button">This week <span aria-hidden="true">⌄</span></button>
              </div>
              <div className="chart-area" role="img" aria-label="Mock chart showing ticket activity from Monday through Sunday">
                <div className="chart-y-labels"><span>12</span><span>9</span><span>6</span><span>3</span><span>0</span></div>
                <div className="chart">
                  <div className="chart-grid"><i /><i /><i /><i /><i /></div>
                  <div className="chart-bars">
                    {[["5", "3"], ["8", "4"], ["6", "5"], ["10", "6"], ["7", "4"], ["9", "5"], ["4", "2"]].map((pair, index) => (
                      <div className="bar-group" key={index}><div className="bar-pair"><i style={{ height: `${Number(pair[0]) * 7}px` }} /><i style={{ height: `${Number(pair[1]) * 7}px` }} /></div><span>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-legend"><span><i className="legend-indigo" /> Created</span><span><i className="legend-sky" /> Resolved</span></div>
            </article>
            <article className="panel breakdown-panel">
              <div className="panel-heading"><div><h2>Requests by category</h2><p>Where your tickets are coming from</p></div><button className="more-button" type="button" aria-label="More category options">···</button></div>
              <div className="category-list">
                <div className="category-row"><span className="category-icon category-network">⌁</span><span className="category-name">Network</span><span className="category-track"><i style={{ width: "78%" }} /></span><strong>32%</strong></div>
                <div className="category-row"><span className="category-icon category-hardware">▣</span><span className="category-name">Hardware</span><span className="category-track"><i style={{ width: "59%" }} /></span><strong>24%</strong></div>
                <div className="category-row"><span className="category-icon category-access">♙</span><span className="category-name">Access</span><span className="category-track"><i style={{ width: "42%" }} /></span><strong>18%</strong></div>
                <div className="category-row"><span className="category-icon category-software">▧</span><span className="category-name">Software</span><span className="category-track"><i style={{ width: "35%" }} /></span><strong>14%</strong></div>
                <div className="category-row"><span className="category-icon category-other">•••</span><span className="category-name">Other</span><span className="category-track"><i style={{ width: "29%" }} /></span><strong>12%</strong></div>
              </div>
              <a className="category-link" href="#recent-tickets">View all categories <span aria-hidden="true">→</span></a>
            </article>
          </section>

          <section className="panel recent-panel" id="recent-tickets">
            <div className="panel-heading recent-heading">
              <div><h2>Recent tickets <span className="ticket-count">{loading ? "…" : tickets.length}</span></h2><p>Keep track of your latest support requests</p></div>
              <div className="table-actions">
                <button className="select-button filter-button" type="button"><span aria-hidden="true">☷</span> Filters</button>
                <a className="text-link" href="#recent-tickets">View all <span aria-hidden="true">→</span></a>
              </div>
            </div>
            <div className="table-scroll">
              <table className="ticket-table">
                <caption className="visually-hidden">Recent support tickets</caption>
                <thead><tr><th scope="col">TICKET</th><th scope="col">SUBJECT</th><th scope="col">STATUS</th><th scope="col">PRIORITY</th><th scope="col">LAST UPDATED</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td className="no-results" colSpan={6}>Loading recent tickets…</td></tr>
                  ) : error ? (
                    <tr>
                      <td className="no-results" colSpan={6} role="alert">
                        {error}{" "}
                        <button className="text-link" type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
                      </td>
                    </tr>
                  ) : visibleTickets.length === 0 ? (
                    <tr>
                      <td className="no-results" colSpan={6}>
                        {tickets.length === 0
                          ? "No tickets yet."
                          : `No tickets match “${query}”. Try another search.`}
                      </td>
                    </tr>
                  ) : visibleTickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td><span className="ticket-id">{ticket.id}</span></td>
                      <td><div className="ticket-subject"><span><strong>{ticket.title}</strong><small>{formatEnumLabel(ticket.category)}</small></span></div></td>
                      <td><span className={`status-pill status-${ticket.status.toLowerCase().replace("_", "-")}`}><i />{formatEnumLabel(ticket.status)}</span></td>
                      <td><span className={`priority-label priority-${ticket.priority.toLowerCase()}`}><i />{formatEnumLabel(ticket.priority)}</span></td>
                      <td className="updated-cell">{formatUpdatedAt(ticket.updatedAt)}</td>
                      <td><button className="row-menu" type="button" aria-label={`More options for ${ticket.id}`}>···</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Showing <strong>{loading || error ? "—" : visibleTickets.length}</strong> of {loading || error ? "—" : tickets.length} tickets</span></div>
          </section>
          <footer className="footer"><span>© 2026 NEXUS IT Operations</span><span>Need help? <a href="#recent-tickets">Contact support</a></span></footer>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  return <Dashboard />;
}
