# Hermes Engine Map for AgenticOS

## Goal

AgenticOS should reuse Hermes' strongest engine ideas without copying the CLI/dashboard UX or exposing unsafe local-machine power tools to SaaS users.

The product shape is:

- Ask Mode: safe answers, memory, research, file understanding.
- Create Mode: drafts, documents, reports, tables, saved outputs.
- Act Mode: connected-app actions with explicit approval before side effects.

## Hermes Internals Studied

| Hermes Area | Repo Path | Useful Pattern | AgenticOS Mapping |
|---|---|---|---|
| Agent loop | `run_agent.py` | Iterative model/tool loop with callbacks and result handling | Hermes worker behind `/runs` and `/runs/stream` |
| Prompt assembly | `agent/prompt_builder.py` | Identity, memory, skills index, context files, tool guidance | Ask/Create/Act mode prompts and product skill contract |
| Tool orchestration | `model_tools.py` | Tool schemas filtered by enabled/disabled toolsets | Per-mode safe skill registry |
| Tool registry | `tools/registry.py` | Self-registering tools with check functions and metadata | AgenticOS connector/tool catalog with availability and scopes |
| Toolsets | `toolsets.py` | Named groups such as `search`, `web`, `skills`, `memory` | Product skills: Research, Gmail, Library, Memory, Automation |
| Provider runtime | `hermes_cli/runtime_provider.py` | Provider/model/base URL/API mode resolution | OpenRouter presets, later per-workspace profile config |
| Memory | `agent/memory_manager.py` | Provider abstraction, fenced memory context, one external provider | Supabase MemoryProvider bridge, scoped by workspace/user/thread |
| Context compression | `agent/context_compressor.py` | Structured summaries, old tool result pruning, active task preservation | Long chat/thread summarization and library handoff summaries |
| State storage | `hermes_state.py` | Sessions/messages/FTS/cost metadata, parent session chains | Supabase threads/messages/runs with search and summaries |
| Gateway session | `gateway/session.py` | Platform/user/session context and PII-aware routing | Per-user/workspace identity context; future Slack/WhatsApp adapters |
| Approval safety | `tools/approval.py` | Hardline blocks, session approval state, plugin hooks | Approval cards for Gmail/Calendar/Drive/Slack side effects |
| Web tools | `tools/web_tools.py` | Backend selection, search/extract/crawl, result compression | Tavily now; add extract/report workflow next |
| File tools | `tools/file_tools.py` | Read/search pagination, sensitive path blocking, read-size caps | Uploaded file parsing and library search, no raw filesystem |
| Plugins | `plugins/memory`, `plugins/context_engine`, `plugins/browser` | Provider-style extension points | Curated connector providers only, no arbitrary user plugins |
| Cron | `cron/` | Job definitions and scheduler loop | Workspace automations later |

## Product-Safe Skill Catalog

| AgenticOS Skill | Status | Safe Tools | Next Step |
|---|---|---|---|
| Ask Skill | Active | `chat`, `memory_context`, `model_presets` | Profile-backed model settings |
| Research Skill | Active | `tavily_search`, `web_sources`, `library.web_result` | Add extraction and multi-step reports |
| Gmail Skill | Partial | `google.gmail.search`, `google.gmail.read`, `google.gmail.send.approval` | Let Hermes choose Gmail search/read |
| Library Skill | Partial | `library.list`, `library.save` | Thread reopen and file/media previews |
| Memory Skill | Partial | `memory_context`, `memory_jobs`, `memory_events` | Supabase MemoryProvider bridge |
| Workspace Skills | Planned | `skills.list`, `skills.propose`, `skills.activate` | Bridge `workspace_skills` into Hermes |
| File Understanding | Planned | `storage.read`, `document.parse`, `library.file` | Upload/parsing pipeline |
| Calendar Skill | Planned | `google.calendar.read`, `google.calendar.write.approval` | Calendar read/create endpoints |
| Automation Skill | Planned | `automation.create`, `automation.pause`, `automation.history` | Workspace-scoped schedules |

## Keep Disabled for Public Users

- Terminal and shell execution.
- Raw filesystem write/patch tools.
- Arbitrary browser automation.
- Arbitrary MCP server mounting.
- Raw code execution.
- Delegation/subagent spawning outside our worker policy.
- Environment passthrough and credential-file access.
- Raw Hermes CLI slash commands.

These can return later only behind workspace admin controls, isolated sandboxes, audit logs, usage limits, and clear user approvals.

## Implementation Direction

1. Treat Hermes as the reasoning and tool-loop engine.
2. Treat AgenticOS as the SaaS safety and connector gateway.
3. Load only product-safe skill descriptions into the prompt.
4. Execute tools through typed API routes and worker adapters.
5. Record every tool call, approval, connector event, and usage event per workspace.
6. Prefer read-only connectors first; require approval for writes.
7. Store proposed new skills as `needs_review` before activation.

## Implemented Bridge Slice

- `/api/skills` returns the product skill catalog plus workspace skills.
- `/api/workspace-skills` lists and proposes review-gated workspace skills.
- `/api/workspace-skills/:id/activate` marks a reviewed skill/version active.
- Active workspace skills are injected into the agent run context as `workspace_skill` items.
- Hermes receives active skills as safe context, not raw `skill_manage` access.
