"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    const supabase = createClient();

    const result =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` }
          });

    setIsLoading(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup") {
      setMessage("Check your email to confirm your account, then sign in.");
      return;
    }

    router.push("/app");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={onSubmit} className="card w-full max-w-md rounded-3xl p-8 shadow-glow">
        <Link href="/" className="text-sm font-semibold tracking-widest text-brand-400">The PVTLST</Link>
        <h1 className="mt-6 text-3xl font-semibold">
          {mode === "login" ? "Welcome back" : "Join The PVTLST"}
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {mode === "login"
            ? "Sign in to your workspace."
            : "Private intelligence. Infinite action."}
        </p>

        <label className="mt-8 block text-sm text-slate-300">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-white outline-none focus:border-brand-400"
            type="email"
            required
          />
        </label>

        <label className="mt-4 block text-sm text-slate-300">
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-white outline-none focus:border-brand-400"
            type="password"
            required
            minLength={8}
          />
        </label>

        {message ? <p className="mt-4 text-sm text-amber-200">{message}</p> : null}

        <button
          disabled={isLoading}
          className="mt-6 w-full rounded-2xl bg-brand-500 px-4 py-3 font-semibold text-ink transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <p className="mt-5 text-center text-sm text-slate-400">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <Link className="text-brand-400" href={mode === "login" ? "/auth/signup" : "/auth/login"}>
            {mode === "login" ? "Create account" : "Sign in"}
          </Link>
        </p>
      </form>
    </main>
  );
}
