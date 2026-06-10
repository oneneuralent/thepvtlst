# O.N.E (One Neural Entity) — Build Progress

> Last updated: May 2026 | Engine: Hermes v0.14.0 | Infra: Railway (agent-api) + Vercel (web)

---

## ✅ COMPLETE — Phase 1: Core Infrastructure

### Auth & Identity
- Clerk + dev auth mode
- `getRuntimeIdentity()` works in both Clerk and dev mode
- `ensureUserWorkspace()` auto-creates workspace on first login

### Memory & Threads
- `GET /api/chat/threads` — lists 25 recent threads
- `GET /api/chat/messages?threadId=` — loads 60 messages per thread
- WorkspaceShell reads `?t=` URL param on mount, loads thread history
- URL updates to `?t=<threadId>` on every run via `router.replace`
- Thread list in sidebar (12 most recent, click to load)
- New Chat button in sidebar

### Branding
- Sidebar: "O.N.E / Your AI OS"
- Starter: "O.N.E is online"
- Thinking: "O.N.E is thinking..."
- Tool labels: "O.N.E → searching web" etc.
- System prompt persona: "You are O.N.E (One Neural Entity)..."

### Skills System (Supabase-backed)
- `workspace_skills` + `skill_versions` tables in Supabase
- `skills_sync.py` — bidirectional sync (Supabase ↔ `/tmp/hermes-{workspace_id}/`)
- `RunResponse.new_skills` returned and persisted after every run
- Skills loaded into `user_tool_settings.skills` before each run

### Delegation
- `delegate_task` enabled, max depth 1
- Children inherit full safety profile

### Gmail Approval Flow
- Fixed callback args bug: `tool_complete_callback(tc.id, name, args, result)`
- Approval button in UI works correctly

---

## ✅ COMPLETE — Phase 2: Agent Visibility

### Reasoning Log Panel
- `HermesRunResult.reasoning_steps` captures every tool call start/complete
- Streamed to frontend as `reasoning.log` SSE event
- UI: collapsible "Show Brain" button in chat header
- Dark panel with color-coded steps (teal=calling, green=done, amber=awaiting)

---

## ✅ COMPLETE — Tool Wiring (May 2026)

### Gmail — ALL 11 tools now fully wired

| Tool | Type | Backend Route | Status |
|------|------|---------------|--------|
| `gmail_search` | READ | `POST /api/email` | ✅ |
| `gmail_read` | READ | `GET /api/email/[id]` | ✅ |
| `gmail_send` | WRITE | approval flow | ✅ |
| `gmail_reply` | WRITE | approval flow | ✅ |
| `gmail_forward` | WRITE | approval flow | ✅ |
| `gmail_create_draft` | WRITE | `POST /api/email/manage-draft` | ✅ |
| `gmail_delete_draft` | WRITE | `POST /api/email/manage-draft` | ✅ |
| `gmail_list_labels` | READ | `GET /api/email/labels` | ✅ |
| `gmail_create_label` | WRITE | `POST /api/email/labels` | ✅ |
| `gmail_add_label` | WRITE | `POST /api/email/labels` | ✅ |
| `gmail_remove_label` | WRITE | `POST /api/email/labels` | ✅ |

### Google Docs — ALL 6 tools wired

| Tool | Type | Backend Route | Status |
|------|------|---------------|--------|
| `google_docs_list` | READ | `GET /api/google/docs/list` | ✅ |
| `google_docs_search` | READ | `POST /api/google/docs/search` | ✅ |
| `google_docs_read` | READ | `GET /api/google/docs/read` | ✅ |
| `google_docs_markdown` | READ | `POST /api/google/docs/markdown` | ✅ |
| `google_docs_write` | WRITE | approval flow | ✅ |
| `google_docs_find_replace` | WRITE | approval flow | ✅ |

### Google Sheets — ALL 5 tools wired

| Tool | Type | Backend Route | Status |
|------|------|---------------|--------|
| `google_sheets_list` | READ | `GET /api/google/sheets/list` | ✅ |
| `google_sheets_read` | READ | `POST /api/google/sheets/read` | ✅ |
| `google_sheets_create` | WRITE | `POST /api/google/sheets/create` | ✅ |
| `google_sheets_append` | WRITE | `POST /api/google/sheets/append` | ✅ |
| `google_sheets_write` | WRITE | approval flow | ✅ |

### Memory Blocks — ALL 4 wired

| Tool | Status |
|------|--------|
| `memory_block_read` | ✅ |
| `memory_block_write` | ✅ |
| `memory_block_list` | ✅ |
| `memory_block_delete` | ✅ |

---

## ✅ COMPLETE — Self-Improvement Loop (May 2026)

Inspired by `NousResearch/hermes-agent-self-evolution` (GEPA + DSPy):

1. **SOUL.md** — written to `/tmp/hermes-{workspace_id}/SOUL.md` before each run
   - O.N.E persona file, loaded by Hermes via `skip_context_files: False`
   
2. **USER.md** — generated from `memory_blocks` table, written before each run
   - Gives Hermes a persistent user model without extra LLM calls

3. **System prompt self-improvement rules**:
   - After 3+ tool call tasks → auto-save skill with `skill_manage`
   - On user personal info → `memory_block_write('user_profile', ...)`
   - On recurring patterns → `memory_block_write('user_preferences', ...)`

4. **Data flow**:
   ```
   memory_blocks (Supabase)
     ↓ loadUserToolSettings()
     ↓ user_tool_settings.memory_blocks[]
     ↓ write_context_files() → USER.md
     ↓ Hermes loads USER.md (skip_context_files=False)
     ↓ Agent has full user context on every run
   ```

---

## ✅ COMPLETE — System Prompt Rewrite (May 2026)

`hermes_profile.py → SAFE_SYSTEM_PROMPT` fully rewritten:
- Decision priority tree (1=Connectors, 2=Memory, 3=Web, 4=Plan, 5=Clarify)
- All 21 connector tools listed with full signatures
- TOOL CHAIN guidance (e.g. gmail_search → gmail_read)
- READ vs WRITE (approval) clearly separated per section
- Self-improvement loop (SKILL SAVING + USER MODELING rules)
- Compounding intelligence framing

---

## ✅ COMPLETE — Code Interpreter (E2B Sandbox)

Safely replaces the blocked `code_execution` toolset with an isolated cloud sandbox:

- **`code_run(language, code, packages?)`** — runs Python or JS in E2B microVM
- Zero access to Railway host — fully isolated per execution
- pip packages auto-installed on-the-fly inside the sandbox
- User opt-in via `code_interpreter` in TOOLSET_CATALOG (requires `E2B_API_KEY`)
- Full chain: `connector_tools.py` → `hermes_bridge.py` → `_execute_code_run()` → E2B cloud

**To activate:** Set `E2B_API_KEY` in Railway env vars and add `code_interpreter` to user tool settings.

---

## 🔒 ALWAYS BLOCKED (safety wall — cannot be overridden)

- `terminal` — raw shell on Railway
- `file` — host filesystem
- `browser` — Chromium not installed
- `mcp` — arbitrary external servers
- `code_execution` — Python on host
- `session_search` — ephemeral SQLite

---

## 🔑 USER-CONFIGURABLE TOOLSETS

| Toolset | Requires |
|---------|----------|
| `image_gen` | `FAL_KEY` |
| `tts` | Nothing (Edge TTS), `ELEVENLABS_API_KEY` optional |
| `discord` | `DISCORD_TOKEN` |
| `messaging` | `TELEGRAM_TOKEN` / `SLACK_BOT_TOKEN` |
| `cronjob` | Nothing |
| `homeassistant` | `HASS_TOKEN` + `HASS_URL` |

---

## 📋 PENDING DEPLOYMENTS

- [ ] Deploy `agent-api` changes to Railway (hermes_bridge.py, hermes_profile.py, skills_sync.py)
- [ ] Deploy `apps/web` changes to Vercel (new API routes, stream/route.ts, agent-api.ts)
- [ ] Apply DB migration `0005_workspace_tool_settings.sql` in Supabase dashboard

---

## 🗺️ ROADMAP

### Phase 3 — Telegram Connector
- `/api/telegram/webhook` route
- Telegram bot token in user_tool_settings
- Message events trigger agent runs

### Phase 4 — Split-view Doc/Sheet Preview in Chat
- When agent creates/reads a Google Doc or Sheet, open a mini-preview panel
- Same pattern as email approval panel but shows iframe or rendered content

### Phase 5 — Browser-use + WhatsApp
- Cloud browser via Railway (not local Chromium)
- WhatsApp via Meta Cloud API

### Future: GEPA Self-Evolution
- Read execution traces from `save_trajectories: True`
- Auto-propose skill improvements using `hermes-agent-self-evolution`
- PR-gated updates (human review before merging)

---

## 🏗️ ARCHITECTURE SNAPSHOT

```
User Browser
    │
    ▼
apps/web (Next.js 15, Vercel)
    │  POST /api/chat/stream
    │  loadUserToolSettings() → {skills, memory_blocks, api_keys}
    │  loadMemoryContext()
    │
    ▼
apps/agent-api (FastAPI, Railway)
    │  HermesBridge.run()
    │  write_skills_to_fs() + write_context_files()
    │  HERMES_HOME = /tmp/hermes-{workspace_id}/
    │      SOUL.md  ← O.N.E persona
    │      USER.md  ← memory blocks snapshot
    │      skills/  ← all workspace skills
    │
    ▼
Hermes v0.14.0 (NousResearch)
    │  AIAgent with enabled_toolsets
    │  tool_start_callback → reasoning_steps[]
    │  tool_complete_callback → execute connectors
    │
    ▼
connector execution loop
    │  gmail_* → /api/email/*
    │  google_docs_* → /api/google/docs/*
    │  google_sheets_* → /api/google/sheets/*
    │  memory_block_* → /api/memory/blocks/*
    │
    ▼
Supabase
    - agent_runs, threads, messages
    - workspace_skills + skill_versions
    - memory_blocks
    - connections (encrypted tokens)
    - library_items
```
