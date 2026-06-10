# Clerk CLI Status

Clerk is installed and wired into the existing Next.js App Router app.

## Implemented

- `@clerk/nextjs` is installed.
- `apps/web/proxy.ts` uses `clerkMiddleware()` from `@clerk/nextjs/server`.
- The proxy matcher includes `'/__clerk/(.*)'`.
- `ClerkProvider` is inside `<body>` in `apps/web/app/layout.tsx`.
- The app uses `Show`, `SignInButton`, `SignUpButton`, and `UserButton`.
- App Router sign-in and sign-up pages exist:
  - `/sign-in`
  - `/sign-up`
- Runtime identity can use:
  - dev identity with `AUTH_MODE=dev`
  - Clerk identity with `AUTH_MODE=clerk`

## Clerk CLI Doctor Result

Command run:

```powershell
npx clerk doctor --verbose
```

Command also run after local Clerk keys were added:

```powershell
npx clerk doctor --spotlight
```

Result:

- Next.js framework detected.
- Clerk CLI is installed and up to date.
- CLI host state is writable.
- The project is not logged in to Clerk CLI yet.
- The project is not linked to a Clerk application yet.
- `.env.local` now contains Clerk test keys.
- The previous missing-key warning is gone.
- The remaining CLI blockers are Clerk login and project linking.

## What You Need To Do

Run these from:

`C:\Users\welco\OneDrive\Documents\New project\AgenticOS\apps\web`

```powershell
npx clerk auth login
npx clerk link
npx clerk doctor --verbose
```

If you want Clerk CLI to overwrite or refresh local keys from the linked app, then run:

```powershell
npx clerk env pull
```

Local env should include:

```env
AUTH_MODE=clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/app
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/app
```

For no-login app testing while Clerk is being prepared, keep:

```env
AUTH_MODE=dev
```

## Current Recommendation

Use `AUTH_MODE=clerk` when testing real Clerk signup/sign-in.
Use `AUTH_MODE=dev` only when you want to bypass auth and test the app loop quickly.
