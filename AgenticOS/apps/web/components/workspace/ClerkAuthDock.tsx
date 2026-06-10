"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

export function ClerkAuthDock() {
  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-line bg-ink/70 px-3 py-2 text-sm text-white shadow-glow backdrop-blur-xl">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="rounded-full px-3 py-1.5 text-slate-200 transition hover:bg-white/10">Sign in</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="rounded-full bg-white px-3 py-1.5 font-semibold text-ink transition hover:bg-slate-200">
            Sign up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}
