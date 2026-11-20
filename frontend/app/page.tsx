import Link from "next/link";
import { Dashboard } from "@/components/dashboard";
import { loadDashboard } from "@/lib/server/dashboard";

export const instant = false;

export default async function Home() {
  const { user, tickets, error } = await loadDashboard();
  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-5 text-[#1d2940]">
        <section className="max-w-md rounded-xl border border-[#e9edf4] bg-white p-8 text-center">
          <h1 className="mb-3 text-xl font-semibold">NEXUS is temporarily unavailable</h1>
          <p className="mb-5 text-sm text-[#8792a5]" role="alert">{error}</p>
          <Link className="text-sm font-semibold text-[#5b62d6] underline" href="/login">Return to sign in</Link>
        </section>
      </main>
    );
  }
  return <Dashboard user={user} initialTickets={tickets} initialError={error} />;
}
