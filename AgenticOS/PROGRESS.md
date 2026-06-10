# AgenticOS — Progress Log & Hermes Integration Plan

> Last updated: 2026-05-22 16:35 UTC  
> Author: Cascade + Builder  
> Status: Phase 1 in progress — Milestones 1-2 complete

---

## What Is AgenticOS?

**End Goal:** A consumer AI operating system — one subscription, one all-rounder agent. Users chat in Ask/Create/Act modes, the agent uses Hermes engine for conversation + tools + learning, connects to real apps (Gmail, Calendar, Slack, etc.) with approval-based safety, self-improves by creating skills from experience, and stores everything in a persistent workspace (Library + Canvas). No terminal, no shell, no raw code — safe for normal users.

---

## Current Architecture

```
AgenticOS/
├── apps/
│   ├── web/              # Next.js 15 App Router (port 3000)
│   │   ├── app/
│   │   │   ├── page.tsx            # Landing page (3 modes, CTA)
│   │   │   ├── app/page.tsx        # Protected workspace shell
│   │   │   ├── api/chat/route.ts   # Chat API → calls agent-api /runs
│   │   │   ├── api/memory/         # Memory processing endpoint
│   │   │   ├── auth/               # Login/signup/callback
│   │   │   └── layout.tsx          # Clerk or raw children
│   │   ├── components/workspace/
│   │   │   ├── WorkspaceShell.tsx   # Main chat UI + sidebar + inspector
│   │   │   ├── AuthForm.tsx         # Supabase auth form
│   │   │   └── ClerkAuthDock.tsx    # Clerk user button
│   │   └── lib/
│   │       ├── server/agent-api.ts  # HTTP client to agent-api /runs
│   │       ├── server/memory.ts     # Load memories, explicit capture, safety
│   │       ├── server/learning.ts   # Extract memories + skills from runs
│   │       ├── server/identity.ts   # Dev / Clerk / Supabase identity
│   │       ├── server/workspace.ts  # Auto-provision workspace + profile
│   │       ├── supabase/admin.ts    # Service-role Supabase client
│   │       └── auth-mode.ts         # dev vs clerk switch
│   │
│   └── agent-api/        # FastAPI runtime (port 8000)
│       └── app/
│           ├── main.py              # /health, /runs, /runs/{id}/approve
│           ├── core/
│           │   ├── runtime.py       # AgentRuntime — orchestrates run
│           │   ├── hermes_adapter.py # STUB — only describes availability
│           │   ├── safety.py        # Forbidden tools + approval-required
│           │   ├── connectors.py    # Google connector tool definitions
│           │   ├── schemas.py       # RunRequest, RunResponse, ToolEvent
│           │   └── env.py           # Load .env
│           └── services/
│               ├── openrouter.py    # Direct OpenRouter chat completion
│               └── tavily.py        # Tavily web search
│
├── vendor/hermes-agent/   # Hermes v0.14.0 (full source)
│   ├── agent/             # Core engine (conversation_loop, curator, memory, skills, tools...)
│   ├── gateway/           # Telegram, Discord, Slack, WhatsApp, Email, Teams
│   ├── tools/             # Built-in toolsets
│   ├── skills/            # Skill bundles
│   ├── run_agent.py       # Main entry point
│   ├── cli.py             # CLI interface
│   ├── hermes_state.py    # Persistent state management
│   └── pyproject.toml     # Python 3.11+, openai, httpx, pydantic, etc.
│
├── infra/supabase/migrations/
│   ├── 0001_core.sql              # 13 core tables + RLS + triggers
│   ├── 0002_clerk_ready_dev_identity.sql
│   ├── 0003_0004_part2-5.sql      # 13 learning tables (memories, skills, trajectories)
│   └── ...
│
├── packages/shared/       # (empty — future shared types)
├── packages/ui/           # (empty — future shared components)
└── docs/                  # (empty)
```

---

## What's Done (Phase 0 + Phase 1 Base)

| # | Item | Status |
|---|------|--------|
| 1 | Monorepo with turbo.json | ✅ Done |
| 2 | Next.js landing page (3 modes, CTA, connections list) | ✅ Done |
| 3 | Protected `/app` workspace shell (chat, library, canvas, connections) | ✅ Done |
| 4 | Supabase database: 25+ tables with RLS policies | ✅ Done |
| 5 | Auth: Dev mode for local testing (no keys needed) | ✅ Done |
| 6 | Auth: Clerk integration for production | ✅ Done |
| 7 | Chat API route with thread/message persistence | ✅ Done |
| 8 | Agent-API skeleton with safety policies | ✅ Done |
| 9 | Memory system (load context, explicit capture, safety scanning) | ✅ Done |
| 10 | Learning pipeline (extract memories + skills from runs via LLM) | ✅ Done |
| 11 | Trajectory sampling to Supabase | ✅ Done |
| 12 | Connector policy definitions (Google tools) | ✅ Done |
| 13 | HermesAdapter stub (describes availability only) | ✅ Done |

---

## What's NOT Done (Hermes Integration Required)

| # | Gap | Impact |
|---|-----|--------|
| 1 | HermesAdapter is a stub — doesn't call Hermes engine | Agent uses raw OpenRouter, no tools/skills/memory |
| 2 | No Hermes conversation loop in agent-api | No multi-turn tool use, no context compression |
| 3 | No Hermes tool dispatch through safety layer | Agent can't actually use tools |
| 4 | No Hermes skill system ↔ workspace_skills sync | Skills extracted but never used |
| 5 | No Hermes memory provider ↔ Supabase memories | Two separate memory worlds |
| 6 | No streaming (SSE/WebSocket) from agent to web | User waits for full response |
| 7 | No Hermes config management from web | Can't change model/tools from UI |
| 8 | Empty routers/, adapters/ in agent-api | No modular API structure |
| 9 | Connector OAuth flows not implemented | "Connect" buttons are placeholders |
| 10 | Approval execution not implemented | Creates pending records but can't execute |

---

## Hermes Integration — Milestone Plan

### Milestone 1: Hermes Python Environment ✅ COMPLETE
> Get Hermes importable from agent-api

- [x] Create `apps/agent-api/.env` with OPENROUTER_API_KEY
- [x] Add `vendor/hermes-agent` to agent-api Python path
- [x] Install Hermes dependencies in agent-api venv
- [x] Verify `from agent.conversation_loop import ...` works
- [x] Create `apps/agent-api/app/adapters/hermes_bridge.py` — thin import wrapper

**Implementation:**
- Added `hermes-agent` as path dependency in `pyproject.toml` via `[tool.uv.sources]`
- Created `hermes_bridge.py` that adds vendor path to `sys.path` on first use
- Instantiates `AIAgent` from `run_agent.py` in a background thread
- Captures tool events via `tool_start_callback` and `tool_complete_callback`
- Captures streaming tokens via `stream_delta_callback`
- Returns structured `RunResponse` with tool events and message
- Falls back gracefully if Hermes vendor directory is missing

**Files created/modified:**
- `apps/agent-api/app/adapters/hermes_bridge.py` (new)
- `apps/agent-api/app/adapters/__init__.py` (new)
- `apps/agent-api/pyproject.toml` (updated to v0.2.0, added hermes-agent dep)

### Milestone 2: Safe Hermes Worker Profile ✅ COMPLETE
> Hermes runs behind SaaS safety, not as a raw CLI agent

- [x] Create `apps/agent-api/app/core/hermes_profile.py` — build safe Hermes config
  - Disable: terminal, shell, raw code exec, unrestricted FS, unknown MCP
  - Enable: web search, memory read/write, file summary, skill lookup
  - Set model via OPENROUTER_API_KEY + OPENROUTER_MODEL
- [x] Map AgenticOS modes (ask/create/act) → Hermes tool policy
- [x] Create `apps/agent-api/app/core/hermes_tools.py` — allowlisted tool registry
- [x] Wire approval_required tools to pause-and-wait pattern

**Implementation:**
- Created `hermes_profile.py` with `build_hermes_kwargs()` function
- `_ALWAYS_DISABLED` toolsets: terminal, file_write, file_management, browser, mcp, code_execution, git, deployment
- `_MODE_TOOLSETS` mapping: ask→[web_search], create→[web_search, file_read], act→[web_search, file_read]
- Custom system prompt with SaaS safety rules
- OpenRouter provider with model from `OPENROUTER_MODEL` env var
- All dangerous surfaces disabled via `disabled_toolsets` kwarg

**Files created/modified:**
- `apps/agent-api/app/core/hermes_profile.py` (new)

### Milestone 3: Hermes Conversation Loop Integration ✅ COMPLETE
> Replace raw OpenRouter call with Hermes engine

- [x] Rewrite `runtime.py` to call Hermes conversation loop
- [x] Pass memory context from Supabase → Hermes system prompt
- [x] Capture Hermes tool events → persist to tool_calls table
- [x] Return structured response (message, sources, tool_events, approval)
- [x] Handle Hermes errors gracefully (model timeout, tool failure)

**Implementation:**
- Rewrote `runtime.py` to use `HermesBridge.run()` as primary path
- Kept raw OpenRouter+Tavily fallback via `_run_fallback()` method
- Memory context passed to Hermes via `ephemeral_system_prompt` kwarg
- Tool events captured via callbacks and returned in `RunResponse.tool_events`
- Error handling: Hermes exceptions caught, logged, and returned as failed status
- Added `USE_HERMES` env var (default: true) to toggle between engines
- Health endpoint now shows which engine is active

**Files created/modified:**
- `apps/agent-api/app/core/runtime.py` (rewritten)
- `apps/agent-api/app/main.py` (updated health endpoint)
- `apps/agent-api/app/core/hermes_adapter.py` (reference removed, now unused)

### Milestone 4: Streaming Agent Output
> Real-time token streaming to the web UI

- [ ] Add SSE endpoint: `POST /runs/stream` in agent-api
- [ ] Wire Hermes streaming callback → SSE chunks
- [ ] Update `apps/web/app/api/chat/route.ts` to proxy SSE
- [ ] Update `WorkspaceShell.tsx` to consume SSE stream
- [ ] Show tool calls in real-time in the Run Inspector panel

### Milestone 5: Memory Provider Bridge
> Hermes memory ↔ Supabase memories table

- [ ] Create `apps/agent-api/app/adapters/supabase_memory.py`
  - Implement Hermes memory_provider interface
  - Read: query Supabase memories by workspace + relevance
  - Write: insert new memories with safety scan
  - Update: merge/update existing memories
- [ ] Wire into Hermes agent_init so it loads workspace memories on start
- [ ] Connect learning.ts extraction → Hermes skill format

### Milestone 6: Skill System Bridge
> Hermes skills ↔ workspace_skills + skill_versions tables

- [ ] Create `apps/agent-api/app/adapters/supabase_skills.py`
  - Load active skills from workspace_skills → Hermes skill format
  - Save new skills from Hermes → workspace_skills + skill_versions
- [ ] Wire skill lookup into Hermes prompt builder
- [ ] Add skill approval flow (draft → reviewed → active)
- [ ] Show skills in web UI (new Skills panel or under Library)

### Milestone 7: Connector OAuth + Execution
> Real app connections, not placeholders

- [ ] Google OAuth flow (Gmail, Calendar, Drive, Sheets)
  - `apps/agent-api/app/routers/oauth.py` — OAuth callback
  - Store encrypted tokens in connections table
- [ ] Create `apps/agent-api/app/adapters/google_connector.py`
  - gmail.search, gmail.send, calendar.list, calendar.create, etc.
- [ ] Wire connectors as Hermes tools behind approval layer
- [ ] Approval execution: when user approves, execute the tool call
- [ ] Add Slack, Notion connectors (same pattern)

### Milestone 8: Production Polish
> Ready for team testing

- [ ] Error boundaries in web UI
- [ ] Loading states and skeleton screens
- [ ] Thread history sidebar (list past conversations)
- [ ] Library: real file upload + Supabase Storage
- [ ] Canvas: drag-and-drop cards
- [ ] Usage tracking + rate limiting
- [ ] Docker Compose for full local stack (web + agent-api + Supabase)
- [ ] README with setup instructions for team

---

## Required API Keys & Auth

| Key | Purpose | Where to Get | Required? |
|-----|---------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Database | supabase.com dashboard | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB access | supabase.com dashboard | ✅ Yes |
| `OPENROUTER_API_KEY` | LLM generation (all modes) | openrouter.ai/keys | ✅ Yes |
| `OPENROUTER_MODEL` | Default model | — | Optional (default: gpt-4o-mini) |
| `TAVILY_API_KEY` | Web search (research) | tavily.com | Recommended |
| `EXA_API_KEY` | Alt web search via Hermes | exa.ai | Optional |
| `CLERK_SECRET_KEY` | Production auth | clerk.com | Only for prod |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend | clerk.com | Only for prod |
| `GOOGLE_CLIENT_ID` | Gmail/Calendar/Drive OAuth | console.cloud.google.com | For connectors |
| `GOOGLE_CLIENT_SECRET` | Gmail/Calendar/Drive OAuth | console.cloud.google.com | For connectors |
| `SLACK_BOT_TOKEN` | Slack connector | api.slack.com/apps | For Slack |
| `FAL_KEY` | Image generation | fal.ai | Optional |
| `AGENT_API_SECRET` | Internal API auth | Self-generated | Recommended |
| `AUTH_MODE` | "dev" or "clerk" | — | Set to "dev" for local |

### Local Dev Quick Start (minimum keys)

```env
# apps/web/.env.local
AUTH_MODE=dev
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AGENT_API_URL=http://localhost:8001

# apps/agent-api/.env
OPENROUTER_API_KEY=your-openrouter-key
TAVILY_API_KEY=your-tavily-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## How to Run Locally

```bash
# Terminal 1: Web app
cd apps/web
npm install
npm run dev          # → http://localhost:3000

# Terminal 2: Agent API
cd apps/agent-api
python -m venv .venv
.venv\Scripts\activate
pip install -e .
python -m uvicorn app.main:app --port 8001
```

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| Phase 0 | Chose Next.js 15 + Supabase + Clerk | Modern stack, free tier, fast auth |
| Phase 0 | Hermes as vendor submodule, not npm package | Full source control, can patch safely |
| Phase 0 | Three modes: Ask/Create/Act | Maps to Hermes tool policies cleanly |
| Phase 0 | Safety layer in agent-api, not in web | Single enforcement point, can't be bypassed |
| Phase 1 | Dev auth mode for local testing | No Clerk keys needed locally |
| Phase 1 | Service-role Supabase client for all writes | RLS bypassed server-side, enforced client-side |
| Phase 1 | Ultra-safe SQL migration format | Supabase dashboard corrupts multi-column CREATE |
| Phase 1 | Hermes integration via Python bridge, not subprocess | Direct function calls = faster, type-safe |

---

## 2026-05-22 Hermes Chat Runtime Check

### Findings

- Web chat posts to `apps/web/app/api/chat/route.ts`, which persists the user message/run in Supabase and calls `runAgent()`.
- `runAgent()` calls the FastAPI agent runtime at `AGENT_API_URL`; local `.env.local` points to `http://localhost:8001`.
- FastAPI `/runs` uses `AgentRuntime`, and Hermes is the primary engine when `USE_HERMES` is not disabled.
- The Hermes bridge loads `vendor/hermes-agent`, builds safe SaaS kwargs, and calls `AIAgent.run_conversation()` in-process.
- The observed chat error, `No module named 'openai'`, came from starting the API with global `python` instead of `apps/agent-api/.venv/Scripts/python.exe`.
- The agent API virtualenv already contains `hermes-agent 0.14.0` and `openai 2.24.0`; global Python does not.
- Hermes safe profile was enabling `web_search` as a toolset, but Hermes expects toolset names such as `search` or `web`; this left the model with zero actual tools and caused tool-shaped JSON to appear as normal chat text.

### Fix Applied

- Updated `npm run dev:agent` to use `apps/agent-api/.venv/Scripts/python.exe`.
- Removed `--reload` from the local agent API command because Uvicorn's Windows reload child process was falling back to global Python and losing virtualenv packages.
- Updated the Hermes safe profile to enable the `search` toolset for Ask/Create/Act modes and keep filesystem/delegation surfaces disabled.
- Added a bridge fallback for models that emit search requests as plain JSON text instead of native tool calls; AgenticOS now executes Tavily and summarizes the result instead of showing raw tool JSON in chat.
- Added auto-search for current-information prompts when Hermes completes without using tools, so weather/latest/news requests still get live Tavily context.
- Kept local API port aligned at `8001` across starter scripts and docs.
- Updated README to reflect the current Hermes-backed runtime instead of the older mock-chat status.

### Current Status

- Web: `http://localhost:3000/app`
- Agent API health: `http://localhost:8001/health`
- Hermes bridge: available and selected as the primary engine.
- Validation passed: direct `/runs` weather smoke test returned live Tavily-backed weather data.
- Validation passed: authenticated web chat UI returned the Mumbai weather answer without the `openai` import error.

---

## 2026-05-22 Agentic SaaS Milestone Slice

### Implemented

- Rebuilt `WorkspaceShell` into a scrollable agent cockpit with collapsible left navigation, right run inspector, bottom-docked composer, model preset selector, Email tab, Skills tab, Connections tab, and richer Library view.
- Added browser-facing `POST /api/chat/stream` and worker-side `POST /runs/stream` event streams for run lifecycle, reasoning summaries, tool events, approvals, final messages, and failures.
- Added curated OpenRouter model presets via `GET /api/models/presets`; selected model now travels from the chat UI through Next API to the Hermes worker.
- Added Google Workspace OAuth start/callback/disconnect routes with encrypted token storage and per-user/workspace scoping.
- Added Library APIs for listing and saving durable chat/output/source/media metadata.
- Added Email APIs for Gmail listing/reading after Google OAuth and approval-gated email draft creation.
- Added approval API to record user approval decisions.
- Updated Vercel notes for the split deployment: Vercel web plus separate long-running Hermes worker.

### Validation

- `npm --workspace apps/web run typecheck` passed.
- Python compile check for agent API changed modules passed.
- `npm --workspace apps/web run build` passed after stopping the dev server lock on `.next/trace`.
- Browser smoke passed: `/app` rendered the new cockpit and streaming chat returned a sourced Mumbai weather answer.

### Remaining

- Gmail send execution after approval is recorded but still intentionally gated; worker-side connector execution is next.
- Google token refresh needs a shared server helper before production usage.
- Hermes memory/skills are visible in UI and database-backed, but the full Supabase adapter bridge is still next.
- Supabase Storage uploads and generated media persistence are still next.
