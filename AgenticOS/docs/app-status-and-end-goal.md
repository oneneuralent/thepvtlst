# AgenticOS App Status and End Goal

## Purpose

This document is the working contract for the product we are building.
It describes:

- what the app is supposed to be
- what is already implemented
- what is currently fake or placeholder behavior
- what must be wired next for the app to work as a real product
- the final desired architecture and safety model

This file should stay current as the project evolves.

## Product Definition

AgenticOS is not a coding agent, terminal agent, or developer tool.

AgenticOS is a personal AI operating system for normal users.

Core promise:

> One subscription. One all-rounder agent. Connect your apps. It does work for you without code, terminal, or developer setup.

The product must feel consumer-safe, simple, and useful on day one.
Hermes is an internal execution engine, not the product surface.

## Core Modes

The logged-in product should be a single-page workspace with a mode toggle.

### 1. Ask Mode

Purpose:

- fast answers
- simple chat
- web search
- file reading
- memory retrieval

Characteristics:

- low latency
- minimal tool activity UI
- safe read-only or low-risk actions

### 2. Create Mode

Purpose:

- generate documents
- make images
- write plans
- build tables
- create posts
- assemble research boards
- create presentations

Characteristics:

- output-heavy
- save to library
- send outputs to canvas

### 3. Act Mode

Purpose:

- operate connected apps
- Gmail
- Calendar
- Drive
- Notion
- Slack
- Sheets
- CRM

Characteristics:

- every external action must require approval before execution
- approval is required before sending, deleting, scheduling, posting, spending, inviting, or modifying external data

## Safety Rules

Public users must not receive raw developer power.

Disabled by default:

- terminal
- unrestricted filesystem
- raw code execution
- local shell commands
- arbitrary browser automation
- dangerous MCP tools
- user-created unlimited plugin execution

Allowed instead:

- safe web search
- file reading
- document generation
- app connectors
- structured automations
- approval-based actions

Golden rule:

Every user gets an isolated workspace.
Every workspace gets a safe Hermes profile.
Every action needs permission when side effects are involved.

## Final Architecture

```text
GoDaddy (registrar only)
  ->
Cloudflare DNS / WAF / CDN
  ->
Vercel
  ->
Next.js frontend
  ->
Supabase Auth + Postgres + Storage + Realtime
  ->
Agent Runtime API / Runtime Manager
  ->
Safe Hermes worker profile
  ->
Curated tools only
  ->
User-approved actions
```

## Required Product Areas

### Landing

Message:

> Your AI employee for everything.

Purpose:

- explain the product simply
- show Ask / Create / Act modes
- show safety model
- convert users to signup

### Workspace

Single-page logged-in experience at `/app`.

Main layout:

- left sidebar
- center workspace
- right inspector
- top mode toggle

### Library

Stores:

- uploaded files
- generated documents
- saved responses
- research outputs
- links
- images
- notes

### Canvas

Visual board for:

- prompts
- responses
- files
- web results
- notes
- ideas
- tasks
- decisions

### Connections

Connectors for:

- Google
- Gmail
- Calendar
- Drive
- Notion
- Slack
- GitHub
- more later

## Current Code Status

This is what has actually been built so far in the current working copy.

## 2026-05-22 Runtime Bridge Checkpoint

Completed now:

- Clerk sign-in/sign-up works locally and `/app` loads with a signed-in Clerk user.
- The web chat no longer owns the agent brain directly.
- `apps/web/app/api/chat/route.ts` now records identity/workspace/thread/message/run data, then calls the separate Agent API runtime.
- `apps/agent-api` now has a real `/runs` execution boundary.
- Agent API loads local dev env from `apps/web/.env.local` for local split-stack testing.
- Agent API enforces `AGENT_API_SECRET` when configured.
- Tavily web search runs inside Agent API instead of directly inside the Next.js route.
- OpenRouter generation is wired as a service layer and safely reports missing config when no key is present.
- Hermes has an adapter stub that confirms the local checkout exists and keeps dangerous surfaces disabled until a safe profile is bound.
- Act Mode returns a `requires_approval` runtime result and the web route persists the approval/tool-call records.
- The workspace UI has been moved toward dark gray + teal neo-glass styling.
- Long assistant messages now wrap properly on mobile.

Verified locally:

- `npm --workspace apps/web run typecheck` passes.
- `python -m compileall app` passes inside `apps/agent-api`.
- `GET http://127.0.0.1:8000/health` returns healthy with Tavily configured and OpenRouter not configured.
- Direct `POST http://127.0.0.1:8000/runs` works with the local agent secret.
- Browser test from signed-in `/app` sent `HI` and received an Agent API response through the web UI.
- OpenRouter local key has been added to ignored env and `OPENROUTER_MODEL` is set to `nvidia/nemotron-3-super-120b-a12b:free`.
- Direct Agent API smoke test confirms `openrouter_chat` completes.
- Browser smoke test confirms signed-in `/app` now receives an OpenRouter-generated answer through the full web path.
- Added `0003_memory_and_connector_registry.sql` for scalable per-workspace memory, connector tool registry, and connection events.
- Added `0004_hermes_style_learning_architecture.sql` to mirror Hermes' learning architecture with memory events, memory jobs, thread summaries, workspace skills, skill versions, skill events, trajectories, memory provider configs, and agent profiles.
- Added web memory loader that pulls active workspace/user memories before every agent run.
- Added explicit memory capture for messages that start with phrases like `remember...`, `remember that...`, `my preference is...`, or `from now on...`.
- Agent API now accepts `memory_context` and includes it in the OpenRouter generation context.
- Agent API now has a Google connector policy registry with read/write scopes and approval requirements.

Still pending:

- Bind Hermes to a safe worker profile behind `HermesAdapter`; do not expose terminal, shell, raw filesystem, MCP, or arbitrary code execution.
- Apply `infra/supabase/migrations/0003_memory_and_connector_registry.sql` in Supabase before memory persists in the hosted project.
- Apply `infra/supabase/migrations/0004_hermes_style_learning_architecture.sql` after `0003` to unlock the full self-learning schema.
- Build OAuth connect flow for Google and encrypt the returned access/refresh tokens.
- Add semantic memory extraction after each run instead of only explicit `remember...` capture.
- Confirm hosted Supabase migration `0002_clerk_ready_dev_identity.sql` is applied if future writes hit missing Clerk identity columns.
- Build persisted thread list, library CRUD, canvas CRUD, file uploads, connector OAuth, and approval resume/execute flow.

### Repo and Base Setup

Implemented:

- monorepo root
- `apps/web`
- `apps/agent-api`
- `packages/shared`
- `packages/ui`
- `infra/supabase`
- `docs`
- root workspace config
- root env example
- README

Status:

- working

### Frontend

Implemented:

- Next.js App Router app
- Tailwind setup
- landing page
- `/app` workspace shell
- left sidebar
- mode toggle
- center panel
- right inspector
- login page
- signup page
- auth callback route
- Clerk provider wrapper
- Clerk auth dock with sign-in, sign-up, and user button
- Clerk proxy middleware scaffold
- Clerk `/sign-in` and `/sign-up` App Router pages

Status:

- UI works locally
- production build passes
- Clerk UI activates when Clerk env keys are present

### Chat

Implemented:

- real `/api/chat` route
- Supabase-authenticated request handling
- automatic profile/workspace bootstrap from the server route
- thread creation
- user message persistence
- assistant message persistence
- agent run creation/update
- tool call logging
- Tavily web search for Ask/Create modes
- pending approval record creation for Act mode

Status:

- wired in code
- blocked from full hosted testing until the Supabase migration is applied
- not connected to Hermes yet

### Supabase

Implemented:

- helper clients
- middleware protection logic
- migration scaffold with core tables
- RLS foundations
- signup trigger scaffold
- local env wiring for the provided Supabase project
- hosted base table schema applied successfully
- dev-auth and Clerk-ready identity migration created
- app runtime can run with a fixed dev identity now
- Clerk runtime identity mapping is implemented in code

Status:

- connected in code
- hosted project is reachable
- base tables are created
- Clerk-ready/dev identity migration is not applied yet
- chat still needs end-to-end testing after `0002_clerk_ready_dev_identity.sql` is applied
- Clerk env keys are not present locally yet

### Agent Runtime

Implemented:

- FastAPI service skeleton
- health endpoint
- run endpoint skeleton
- approval endpoint skeleton
- basic safety policy module
- runtime abstraction stub

Status:

- placeholder only
- Hermes is not integrated
- no real execution pipeline yet
- Hermes repo URL/details are still needed

## Fake Behavior Removed

The previous demo fallback that rendered `/app` without Supabase configuration has been removed.

Current behavior:

- `/app` requires a real Supabase session
- login/signup use Supabase Auth
- chat route requires a signed-in user
- chat route persists workspace/thread/message/run records through Supabase

Remaining placeholder behavior:

- Hermes execution is not integrated yet
- OpenRouter LLM generation is not integrated yet
- Act mode creates approval records, but does not execute connected app actions yet
- Library and canvas UI are still placeholder panels

## What Must Be Wired Next

These are the next required implementation steps in the correct order.

### Phase A: Real Supabase First

This is the highest priority because the app needs real identity and data isolation before Hermes can safely run.

Progress:

- Supabase project connected in local env
- base schema applied successfully
- `/app` no longer allows demo access
- `/api/chat` now requires auth and is written to persist records
- auth gate has now been relaxed for dev mode because Clerk will be added later
- `/app` can run with a fixed dev identity when `AUTH_MODE=dev`
- `@clerk/nextjs` is installed
- `proxy.ts` uses `clerkMiddleware()`
- `ClerkProvider` is wired inside `app/layout.tsx`
- `<Show>`, `<SignInButton>`, `<SignUpButton>`, and `<UserButton>` are used
- Clerk CLI doctor has been run
- Clerk CLI confirms the project still needs login/link/env pull

Build next:

1. apply `0002_clerk_ready_dev_identity.sql`
2. add Clerk env keys to `apps/web/.env.local`
3. keep `AUTH_MODE=dev` for no-login testing or switch to `AUTH_MODE=clerk` for real Clerk auth
4. open `/app`
5. send an Ask/Create message
6. verify `/api/chat` writes profile/workspace/thread/message/run/tool/library rows

Definition of done:

- no fake access path
- dev workspace works now
- Clerk can become the real user layer later
- workspace data is isolated by workspace ID

### Phase B: Real Chat Persistence

Build next:

1. create thread on first message
2. save user messages
3. save assistant messages
4. load prior thread history
5. show thread list in sidebar
6. create `agent_runs` row for every request

Definition of done:

- chat history survives reload
- all messages map to workspace and user

### Phase C: Wire Hermes Through Agent API

Hermes should be integrated only after Supabase identity and storage are real.

Build next:

1. Next.js chat route validates Supabase session
2. route resolves active workspace
3. route creates thread/message/run records
4. route calls Agent API
5. Agent API loads workspace context
6. Agent API builds safe tool allowlist by mode
7. Agent API calls Hermes through adapter
8. response streams back to web app
9. final output persists to database

Definition of done:

- Hermes runs behind our runtime layer
- frontend never calls Hermes directly

### Phase D: Library and File Flow

Build next:

1. Supabase Storage buckets
2. upload endpoint
3. file metadata saved to `library_items`
4. file attachment picker in workspace
5. agent can read uploaded files in Ask/Create modes

Definition of done:

- users can upload files and use them in runs

### Phase E: Canvas

Build next:

1. real board loading
2. save card to canvas
3. create note card
4. delete card
5. search/filter cards

Definition of done:

- canvas is backed by database, not placeholder UI

### Phase F: Connections and Act Mode

Build next:

1. Google OAuth via Supabase or integration layer
2. encrypted token storage
3. read-only Gmail and Calendar tools first
4. approval system for write actions
5. approval UI in workspace
6. runtime pause/resume flow

Definition of done:

- connected actions work safely with approval

## Recommended Execution Order

This is the correct practical order for turning the current scaffold into a real product:

1. apply `0002_clerk_ready_dev_identity.sql`
2. verify no-login `/app`
3. verify persisted chat and runs
4. wire Hermes through Agent API
5. add OpenRouter LLM generation
6. add file uploads and library
7. add canvas persistence
8. add connections
9. add approvals for Act Mode
10. add billing and usage limits

## What Is Not Done Yet

The following parts are still missing:

- `0002_clerk_ready_dev_identity.sql` application
- Clerk env keys
- tested no-login dev workspace flow
- tested Clerk sign-up/sign-in flow
- verified persisted threads/messages/runs
- file upload flow
- storage policies
- library CRUD
- canvas CRUD
- connection OAuth
- encrypted connector token handling
- Hermes adapter integration
- OpenRouter model integration
- streaming run events
- approvals table flow in UI and runtime
- plan-based limits
- Stripe billing
- Sentry
- Langfuse
- rate limiting

## End Goal Definition

The app is complete only when all of the following are true:

### User Experience

- a user signs up
- a workspace is created automatically
- the user lands in `/app`
- Ask, Create, and Act modes are real
- chat, files, memory, and outputs persist
- connections work
- approvals work

### Safety

- no public terminal access
- no unrestricted filesystem
- no raw code execution
- no dangerous action without approval
- all actions logged
- all data isolated by workspace

### Architecture

- Vercel serves the frontend
- Supabase handles auth, DB, storage, and realtime
- Hermes runs only behind the runtime manager
- runtime enforces tool permissions
- frontend never bypasses backend safety checks

### Product Quality

- no fake demo auth path
- no placeholder execution pretending to be Hermes
- critical flows are tested end to end

## Current Blocker

The requested destination path is:

`C:\Users\app\AgenticOS`

That folder is not currently writable by the active Windows user in this environment.

Because of that, the live working copy was created at:

`C:\Users\welco\OneDrive\Documents\New project\AgenticOS`

Until permissions are fixed on the requested folder, development must continue in the current working copy or the ACL on the target folder must be updated.

## Immediate Next Action

The right next engineering move is:

1. apply `0002_clerk_ready_dev_identity.sql`
2. add Clerk env keys
3. test no-login `/app` with `AUTH_MODE=dev`
4. test Clerk sign-up/sign-in with `AUTH_MODE=clerk`
5. test `/api/chat` persistence
6. add OpenRouter LLM generation
7. wire Hermes into the Agent API
8. add file upload/library/canvas persistence

This keeps the product honest and makes every later integration safer.

## Progress Snapshot

Current progress estimate:

- Product direction and architecture: 90%
- Repo scaffold: 100%
- Landing page: 80%
- Workspace UI shell: 70%
- Supabase base schema: 70%
- Supabase dev identity wiring: 70%
- Chat persistence wiring: 65%
- Clerk integration: 55%
- Tavily research integration: 50%
- Act Mode approval database path: 35%
- Library: 15%
- Canvas: 15%
- Connections: 10%
- Hermes integration: 5%
- OpenRouter LLM generation: 0%
- Billing and usage limits: 0%

Overall MVP progress: about 35%.

The app has moved from design shell to early real backend wiring. The biggest remaining unlock is testing a real signed-in user against the Supabase tables, then replacing the current research/draft response path with OpenRouter plus Hermes runtime execution.
