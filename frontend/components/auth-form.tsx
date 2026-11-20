"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginInputSchema, registerInputSchema } from "@/lib/validation";

type AuthMode = "login" | "register";

async function submitWithCsrf(path: string, payload: unknown) {
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
    throw new Error("Could not establish a secure form session. Please try again.");
  }

  return fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfBody.csrfToken,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
}

function responseMessage(body: unknown, fallback: string) {
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

export function AuthForm({
  mode,
  notice,
}: {
  mode: AuthMode;
  notice?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const input = {
      email: String(form.get("email") ?? ""),
      password,
      ...(registering
        ? {
            firstName: String(form.get("firstName") ?? ""),
            lastName: String(form.get("lastName") ?? ""),
          }
        : {}),
    };
    const parsed = registering
      ? registerInputSchema.safeParse(input)
      : loginInputSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form details.");
      return;
    }

    if (
      registering &&
      password !== String(form.get("confirmPassword") ?? "")
    ) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await submitWithCsrf(
        registering ? "/api/auth/register" : "/api/auth/login",
        parsed.data,
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        setError(
          responseMessage(
            body,
            registering ? "Could not create your account." : "Sign-in failed.",
          ),
        );
        return;
      }

      if (registering) {
        router.replace("/login?registered=1");
      } else {
        router.replace("/");
        router.refresh();
      }
    } catch {
      setError("Could not connect to NEXUS. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fb] px-4 py-10 text-[#1d2940]">
      <section className="w-full max-w-md rounded-xl border border-[#e9edf4] bg-white p-7 shadow-sm sm:p-9">
        <Link className="brand mb-8" href="/login" aria-label="NEXUS sign in">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span className="brand-name">NEXUS<span>IT OPERATIONS</span></span>
        </Link>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#777ce0]">
          Secure account access
        </p>
        <h1 className="mb-2 text-2xl font-semibold">
          {registering ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mb-7 text-sm text-[#8792a5]">
          {registering
            ? "Register to manage your IT support requests."
            : "Sign in to view and manage your support requests."}
        </p>

        {notice && (
          <p className="mb-4 rounded-md bg-[#edf8f1] px-3 py-2 text-sm text-[#28734f]" role="status">
            {notice}
          </p>
        )}

        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          {registering && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">
                First name
                <input className="rounded-md border border-[#dfe4ec] px-3 py-2.5 font-normal outline-none focus:border-[#777ce0]" name="firstName" autoComplete="given-name" required maxLength={100} />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Last name
                <input className="rounded-md border border-[#dfe4ec] px-3 py-2.5 font-normal outline-none focus:border-[#777ce0]" name="lastName" autoComplete="family-name" required maxLength={100} />
              </label>
            </div>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            Email
            <input className="rounded-md border border-[#dfe4ec] px-3 py-2.5 font-normal outline-none focus:border-[#777ce0]" name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Password
            <input className="rounded-md border border-[#dfe4ec] px-3 py-2.5 font-normal outline-none focus:border-[#777ce0]" name="password" type="password" autoComplete={registering ? "new-password" : "current-password"} required minLength={registering ? 8 : 1} maxLength={72} />
          </label>
          {registering && (
            <label className="grid gap-1.5 text-sm font-medium">
              Confirm password
              <input className="rounded-md border border-[#dfe4ec] px-3 py-2.5 font-normal outline-none focus:border-[#777ce0]" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
            </label>
          )}
          {error && (
            <p className="rounded-md bg-[#fff0f2] px-3 py-2 text-sm text-[#a7374e]" role="alert">
              {error}
            </p>
          )}
          <button className="mt-1 rounded-md bg-[#5b62d6] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4d54c5] disabled:cursor-wait disabled:opacity-60" type="submit" disabled={busy}>
            {busy
              ? registering
                ? "Creating account…"
                : "Signing in…"
              : registering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8792a5]">
          {registering ? "Already have an account? " : "New to NEXUS? "}
          <Link className="font-semibold text-[#5b62d6] hover:underline" href={registering ? "/login" : "/register"}>
            {registering ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
