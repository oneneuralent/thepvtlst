# O.N.E OS — Deep Analysis & Implementation Roadmap

> **O.N.E = One Neural Entity**  
> The AI operating system for your life. Hermes is the engine. O.N.E is the face.

---

## 1. What We Have RIGHT NOW (Current State)

| Layer | Component | Status |
|---|---|---|
| Agent Engine | Hermes v0.14.0 (Nous Research) | ✅ Running on Railway |
| LLM Router | OpenRouter (free + paid models) | ✅ Active |
| Memory | MEMORY.md per workspace, Supabase-backed semantic recall | ✅ Working |
| Skills | Supabase `workspace_skills` + Hermes SKILL.md files | ✅ Just built |
| Gmail | Search, read, send with approval gate | ✅ Fixed |
| Web | Search + extract via Hermes web toolset | ✅ Active |
| Vision | Image analysis (GPT-4V via OpenRouter) | ✅ Active |
| Delegation | `delegate_task` — spawns child subagent (depth 1) | ✅ Active |
| TODO | Per-session todo list management | ✅ Active |
| Clarify | Agent can ask follow-up questions | ✅ Active |
| Supabase | 25+ tables, RLS, per-workspace isolation | ✅ Active |
| Frontend | Next.js 15, streaming SSE, approval UI | ✅ Active |
| Auth | Dev identity / Clerk ready | ✅ Active |

---

## 2. What the User Can See (Current UI)

```
┌─────────────────────────────────────────────────────────┐
│  Left Sidebar  │         Chat Panel          │  Right   │
│  - Chat        │  Messages stream here       │  Panel   │
│  - Library     │  Tool steps shown as dots   │          │
│  - Email       │  Approval button appears    │  Sources │
│  - Canvas      │  when gmail_send fires      │  Tools   │
│  - Connections │                             │  Runtime │
│  - Skills      │                             │          │
└─────────────────────────────────────────────────────────┘
```

**What's missing from the UI right now:**
- No agent identity ("I am ready" says nothing about O.N.E)
- No visual "O.N.E is using [skill: deep-research]" label
- No subagent spawning indicator (when delegate_task fires)
- Chat resets on page refresh (history not loaded from DB)
- No worker/agent graph panel

---

## 3. Memory Persistence — WHY CHAT DISAPPEARS

### The bug:
```typescript
// WorkspaceShell.tsx line 148
const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
// ↑ Always starts fresh. Never fetches from Supabase.
```

Messages ARE stored to Supabase (`messages` table) after every turn.  
The agent DOES receive conversation history (loaded from DB via `loadThreadMessages`).  
But the **UI never fetches past messages on mount**. So the chat looks empty on reload.

### Fix needed:
1. On mount (or when `threadId` changes), fetch messages from `/api/chat/messages?threadId=X`
2. Also show thread list in the sidebar so user can switch between threads
3. Pin thread to URL param (`?t=<threadId>`) so refresh preserves it

---

## 4. Worker & Subagent Architecture

### How agents spawn today:

```
User message
     ↓
O.N.E (main agent, Hermes AIAgent #1)
     ↓ calls delegate_task("research competitor X")
         ↓
         Child Agent (Hermes AIAgent #2, ephemeral)
         - Inherits same model + toolsets
         - Blocked: delegate_task, clarify, memory, execute_code
         - Max depth = 1
         - Runs synchronously inside parent's tool call
         ↓ returns result string to parent
     ↓
O.N.E synthesizes result and responds to user
```

### What's missing for a "workers" UI:
- No real-time panel showing child agents running
- No parallel workers (all sequential today)
- No persistent background workers (cron jobs not wired)
- No kanban/queue (Hermes has kanban toolset but it's off)

---

## 5. Skills — What They Are

```
Skills = procedural memory documents

MEMORY.md  → "User prefers concise answers, uses dark mode"
SKILL.md   → "How to research a company in 5 steps:
              1. Web search for company name + funding
              2. Search LinkedIn for team size
              ..."
```

The agent reads skills at the start of every run.  
The agent can CREATE, EDIT, DELETE skills mid-conversation.  
Skills are versioned in `skill_versions` table.  
Skills sync: Supabase → `/tmp/hermes-{workspace_id}/skills/` before run.

---

## 6. MCP Servers (Model Context Protocol)

Reference: https://github.com/punkpeye/awesome-mcp-servers

Hermes has an `mcp` toolset (currently blocked for safety).  
MCP = standard plug-in protocol for LLM tools.

**How to add an MCP server:**
1. Run the MCP server as a sidecar process (stdio or HTTP)
2. Pass server config to Hermes `mcp_servers` kwarg
3. Hermes auto-discovers all tools exposed by that server
4. Selectively unblock `mcp` toolset for trusted servers only

**Top MCP servers worth integrating:**
| Server | Capability |
|---|---|
| filesystem | Read/write local files (sandboxed) |
| postgres | Direct DB queries |
| github | Repo management, PRs |
| slack | Slack messages |
| notion | Read/write Notion pages |
| google-maps | Location & directions |

---

## 7. Browser Automation (browser-use)

Reference: https://github.com/browser-use/browser-use

### What it gives O.N.E:
- Controlled Chromium browser inside Railway container
- Click, type, scroll, fill forms
- Screenshot and vision-based navigation
- Login to sites (with stored credentials)
- Web scraping of JS-heavy sites (SPAs, dashboards)

### Integration path:
```python
# As a Hermes custom tool in connector_tools.py
from browser_use import Browser, BrowserConfig

async def browse_and_act(url: str, task: str) -> str:
    browser = Browser(config=BrowserConfig(headless=True))
    agent = BrowserAgent(task=task, browser=browser, llm=...)
    result = await agent.run()
    return result
```

Or better: **as a SKILL** — agent writes the automation steps, browser-use executes them.  
This means O.N.E can learn new browser workflows and save them as skills.

**What this enables:**
- "Book me a flight on MakeMyTrip"
- "Fill my tax form on income tax portal"
- "Post on LinkedIn"
- "Check my bank balance"

**Cost**: Chromium on Railway = ~512MB extra RAM. Doable on paid plan.

---

## 8. WhatsApp Integration (India-critical)

Reference: https://github.com/wwebjs/whatsapp-web.js

### Why it matters:
India's primary communication channel is WhatsApp.  
Not Gmail. Not Slack. WhatsApp.  
O.N.E must speak WhatsApp natively to be relevant in India.

### Architecture options:

| Option | Pros | Cons |
|---|---|---|
| whatsapp-web.js | Free, full API, no Business approval | Needs persistent session, Chrome, can get banned |
| WhatsApp Business API (Meta) | Official, reliable | Paid, approval required, India pricing |
| Baileys (Node.js) | Lightweight, no Chrome | Same ban risk as wwebjs |

### Recommended approach (Phase 1):
1. **Sidecar Node.js service** on Railway running wwebjs
2. QR scan once to authenticate (stored session)
3. REST API: `/send`, `/receive`, `/status`
4. O.N.E Hermes connector tool: `whatsapp_send(to, message)`
5. Incoming messages → webhook → new agent run

### Integration with O.N.E:
```
WhatsApp message arrives
        ↓
Webhook → /api/whatsapp/webhook
        ↓
Creates new agent run (same as chat)
        ↓
O.N.E responds → whatsapp_send(reply)
```

This makes O.N.E a **WhatsApp AI assistant** natively.

---

## 9. Branding: O.N.E Identity

### What to change:
| Location | Current | Should Be |
|---|---|---|
| Starter message | "I am ready. Ask, create, or act..." | "O.N.E is online. What do you need?" |
| Tool activity label | Shows tool names only | "O.N.E → using [gmail_send]" |
| Subagent spawn | No indication | "O.N.E → spawning worker for [task]" |
| Skill use | No indication | "O.N.E → applying skill [deep-research]" |
| System prompt | "You are AgenticOS..." | "You are O.N.E (One Neural Entity)..." |

### Live activity display (new UI component needed):
```
┌──────────────────────────────────────┐
│ ⚡ O.N.E is working...               │
│   ├─ 🔍 Using skill: deep-research  │
│   ├─ 🌐 Searching web               │
│   └─ 🤖 Worker: analyzing results   │
└──────────────────────────────────────┘
```

---

## 10. Scheduled Automations

Hermes has a `cronjob` toolset. To wire it:
1. Agent calls `cronjob_set(schedule, task_description)`
2. This stores to `scheduled_jobs` Supabase table
3. Vercel/Railway cron hits `/api/cron/run` on schedule
4. That endpoint spawns a fresh agent run with the task

**Examples O.N.E could do on schedule:**
- "Every morning at 7am: summarise my emails"
- "Every Friday: write a weekly summary of what I did"
- "Every hour: check if my competitor posted new content"

---

## 11. FULL IMPLEMENTATION ROADMAP

### Priority Table

| # | Feature | Impact | Effort | Priority | Status |
|---|---|---|---|---|---|
| 1 | **Memory persistence** — load chat history on mount | High | Low | 🔴 P0 | Not started |
| 2 | **O.N.E branding** — rename in UI + system prompt | High | Low | 🔴 P0 | Not started |
| 3 | **Live activity panel** — "O.N.E is using skill X" | High | Medium | 🔴 P0 | Not started |
| 4 | **Thread list sidebar** — switch between conversations | High | Medium | 🔴 P0 | Not started |
| 5 | **Tool settings UI** — /settings/tools page | Medium | Medium | 🟠 P1 | Not started |
| 6 | **browser-use integration** — Chromium + browser agent | Very High | High | 🟠 P1 | Not started |
| 7 | **WhatsApp connector** — wwebjs sidecar | Very High | High | 🟠 P1 | Not started |
| 8 | **Telegram connector** — Bot API (simpler than WA) | High | Low | 🟡 P2 | Not started |
| 9 | **Scheduled automations** — cron job wiring | High | Medium | 🟡 P2 | Not started |
| 10 | **Subagent visual panel** — worker graph in UI | Medium | Medium | 🟡 P2 | Not started |
| 11 | **MCP server support** — selective unblock | Medium | Medium | 🟡 P2 | Not started |
| 12 | **Skills editor UI** — create/edit skills in browser | Medium | Low | 🟡 P2 | Not started |
| 13 | **Parallel workers** — multiple subagents at once | High | High | 🔵 P3 | Not started |
| 14 | **Learning loops** — agent improves its own skills | Very High | Very High | 🔵 P3 | Not started |
| 15 | **Cloud execution** — E2B/Modal for sandboxed code | High | High | 🔵 P3 | Not started |

---

## 12. The Real Leap: What Makes O.N.E Different

```
Most AI assistants:    User → Chat → LLM → Text response

O.N.E:                 User → O.N.E → Memory recall
                                     → Skill application
                                     → Tool execution (Gmail, browser, WhatsApp)
                                     → Worker delegation
                                     → Learning (writes new skills)
                                     → Scheduled automation
                                     → Persistent across sessions
```

The six pillars:

| Pillar | What it means | How we implement |
|---|---|---|
| **Memory** | Remembers who you are across all sessions | MEMORY.md + Supabase semantic recall |
| **Skills** | Learns HOW you work, not just WHAT you want | SKILL.md + versioned Supabase storage |
| **Tools** | Can act, not just answer | Gmail, browser, WhatsApp, API calls |
| **Automation** | Works while you sleep | Cron jobs, scheduled runs |
| **Persistence** | Nothing disappears, everything compounds | Supabase threads, skills, memories |
| **Execution** | Writes and runs code/browser actions | browser-use, E2B sandbox |

---

## 13. Immediate Next 3 Steps (This Week)

### Step 1 — Fix memory persistence (2 hours)
- Add `GET /api/chat/messages?threadId=` endpoint
- On WorkspaceShell mount: if `threadId` in URL, fetch and hydrate messages
- Store `threadId` in URL param `?t=`

### Step 2 — O.N.E identity (1 hour)
- Update system prompt: "You are O.N.E (One Neural Entity)..."
- Update starter message
- Update tool activity labels in `WorkspaceShell`

### Step 3 — Apply DB migration (5 minutes)
- Run `0005_workspace_tool_settings.sql` in Supabase dashboard
- This unlocks the tool settings API

---

*Last updated: May 2026*  
*Engine: Hermes v0.14.0 by Nous Research*  
*Product: O.N.E OS by OneNeuralEntity*
