"""Safe Hermes worker profile for AgenticOS SaaS runtime.

Builds AIAgent kwargs that disable all dangerous surfaces and only
enable curated tools behind the approval layer.

Per-user tool activation:
  - ALWAYS_ON: base toolsets every user gets (no API key needed, always safe)
  - USER_TOOLSETS: toolsets users can enable individually, some require API keys
  - ALWAYS_OFF: permanently blocked regardless of any setting (machine access)
"""

import os
from typing import Any


# ── Safety line ──────────────────────────────────────────────────────────────
# These are PERMANENTLY disabled. No user setting can override this.
# They give raw access to the host machine running in Railway.
_ALWAYS_OFF: list[str] = [
    "terminal",        # raw shell on Railway host — never
    "file",            # host filesystem read/write — never
    # "browser" is NO LONGER blocked — Hermes supports Browserbase, Browser Use,
    # and Firecrawl as cloud backends (no local Chromium needed on Railway).
    # Enable via TOOLSET_CATALOG with the user's cloud provider API key.
    # "mcp" is NO LONGER blocked — we write config.yaml ourselves from
    # MCP_SERVERS_CATALOG so only pre-vetted HTTP servers can be configured.
    # Stdio/command MCP servers are excluded from the catalog (would spawn
    # subprocesses on Railway).  Arbitrary server URLs are never written.
    "code_execution",  # execute_code runs Python on the host — never
    "session_search",  # Hermes SQLite is ephemeral on Railway (our messages are in Supabase)
]

# ── Always-on toolsets ────────────────────────────────────────────────────────
# Every user gets these. No API key or settings page required.
_ALWAYS_ON: list[str] = [
    "agenticos_connectors",  # Gmail (search, read, send with approval)
    "web",                   # web_search + web_extract via Tavily
    "memory",                # persistent workspace memory
    "todo",                  # task planning — pure Python, no deps
    "clarify",               # ask user clarifying questions
    "vision",                # image analysis via the active LLM
    "delegation",            # spawn focused child subagents (children inherit our safety profile)
    "skills",                # skill docs synced from Supabase to per-workspace HERMES_HOME
    "hyperframes",           # video rendering via Railway cloud API — no terminal needed
    "mcp",                   # safe: we write HERMES_HOME/config.yaml ourselves from MCP_SERVERS_CATALOG
                             # no arbitrary URLs — if config.yaml has no servers, no MCP tools load
]

# ── User-configurable toolsets ────────────────────────────────────────────────
# Shape: toolset_name → {env_vars_required, description}
# env_vars_required = [] means no API key needed (user just toggles it)
TOOLSET_CATALOG: dict[str, dict[str, Any]] = {
    "web_search": {
        "display": "Web Search (Tavily)",
        "description": "Search the web for real-time information. Required for research tasks.",
        "env_vars": ["TAVILY_API_KEY"],
        "api_key_label": "Tavily API Key",
        "api_key_url": "https://app.tavily.com/home",
        "category": "research",
    },
    "image_gen": {
        "display": "Image Generation",
        "description": "Generate images from text (FLUX, DALL-E) via fal.ai",
        "env_vars": ["FAL_KEY"],
        "api_key_label": "FAL.ai API Key",
        "api_key_url": "https://fal.ai/dashboard/keys",
        "category": "ai",
    },
    "tts": {
        "display": "Text-to-Speech",
        "description": "Edge TTS is free (no key). Add ELEVENLABS_API_KEY for premium voices.",
        "env_vars": [],
        "optional_env_vars": ["ELEVENLABS_API_KEY", "OPENAI_API_KEY"],
        "api_key_label": "ElevenLabs API Key (optional — Edge TTS works without one)",
        "api_key_url": "https://elevenlabs.io/app/settings/api-keys",
        "category": "ai",
    },
    "discord": {
        "display": "Discord",
        "description": "Read Discord channels and participate in threads",
        "env_vars": ["DISCORD_TOKEN"],
        "api_key_label": "Discord Bot Token",
        "api_key_url": "https://discord.com/developers/applications",
        "category": "platform",
    },
    "messaging": {
        "display": "Messaging (Telegram / Slack / SMS)",
        "description": "Send messages across Telegram, Slack, SMS via gateway",
        "env_vars": [],
        "optional_env_vars": ["TELEGRAM_TOKEN", "SLACK_BOT_TOKEN"],
        "api_key_label": "Platform credentials (Telegram token, Slack token, etc.)",
        "api_key_url": "",
        "category": "platform",
    },
    "cronjob": {
        "display": "Scheduled Tasks",
        "description": "Schedule recurring automations (reminders, digests, etc.)",
        "env_vars": [],
        "category": "automation",
    },
    "homeassistant": {
        "display": "Home Assistant",
        "description": "Control smart home devices via Home Assistant",
        "env_vars": ["HASS_TOKEN", "HASS_URL"],
        "api_key_label": "Home Assistant long-lived access token + URL",
        "api_key_url": "https://www.home-assistant.io/docs/assistant",
        "category": "platform",
    },
    "browser": {
        "display": "Browser Automation (Cloud)",
        "description": "Automate web browsing — navigate pages, click elements, fill forms, extract content behind authentication. Runs in an isolated cloud browser (Browserbase or Browser Use). No local Chromium needed.",
        "env_vars": [],
        "optional_env_vars": [
            "BROWSERBASE_API_KEY", "BROWSERBASE_PROJECT_ID",
            "BROWSER_USE_API_KEY",
        ],
        "api_key_label": "Browserbase API Key + Project ID  (or)  Browser Use API Key",
        "api_key_url": "https://www.browserbase.com",
        "category": "compute",
    },
    "code_interpreter": {
        "display": "Code Interpreter",
        "description": "Run Python or JavaScript in a secure cloud sandbox (E2B). Use for data analysis, calculations, CSV/JSON processing, and any custom computation.",
        "env_vars": ["E2B_API_KEY"],
        "api_key_label": "E2B API Key",
        "api_key_url": "https://e2b.dev/dashboard",
        "category": "compute",
    },
    # ── Curated MCP servers (HTTP-only — no stdio/command entries ever) ───────────────────
    "mcp_notion": {
        "display": "Notion (MCP)",
        "description": "Read and write Notion pages, databases, and blocks via the official Notion MCP server.",
        "env_vars": ["MCP_NOTION_API_KEY"],
        "api_key_label": "Notion Internal Integration Token",
        "api_key_url": "https://www.notion.so/my-integrations",
        "category": "mcp",
        "mcp_server": {
            "url": "https://api.notion.com/mcp",
            "headers": {"Authorization": "Bearer ${MCP_NOTION_API_KEY}"},
        },
    },
    "mcp_linear": {
        "display": "Linear (MCP)",
        "description": "Read and manage Linear issues, projects, and teams.",
        "env_vars": ["MCP_LINEAR_API_KEY"],
        "api_key_label": "Linear API Key",
        "api_key_url": "https://linear.app/settings/api",
        "category": "mcp",
        "mcp_server": {
            "url": "https://mcp.linear.app/sse",
            "transport": "sse",
            "headers": {"Authorization": "Bearer ${MCP_LINEAR_API_KEY}"},
        },
    },
    "mcp_github": {
        "display": "GitHub (MCP)",
        "description": "Read repos, issues, PRs, and code via the official GitHub MCP server.",
        "env_vars": ["MCP_GITHUB_TOKEN"],
        "api_key_label": "GitHub Personal Access Token (read:repo scope)",
        "api_key_url": "https://github.com/settings/tokens",
        "category": "mcp",
        "mcp_server": {
            "url": "https://api.githubcopilot.com/mcp/",
            "headers": {"Authorization": "Bearer ${MCP_GITHUB_TOKEN}"},
        },
    },
    "mcp_stripe": {
        "display": "Stripe (MCP)",
        "description": "Query Stripe customers, invoices, and payment data. READ-ONLY by default.",
        "env_vars": ["MCP_STRIPE_SECRET_KEY"],
        "api_key_label": "Stripe Secret Key (use restricted key with read-only permissions)",
        "api_key_url": "https://dashboard.stripe.com/apikeys",
        "category": "mcp",
        "mcp_server": {
            "url": "https://mcp.stripe.com",
            "headers": {"Authorization": "Bearer ${MCP_STRIPE_SECRET_KEY}"},
        },
    },
}

# ── Curated MCP servers catalog (for write_context_files in skills_sync.py) ────
# Only entries with "mcp_server" key in TOOLSET_CATALOG are real MCP servers.
# Used by skills_sync.write_context_files() to write HERMES_HOME/config.yaml.
# Rule: URL must be HTTPS, no "command" or "args" keys (no stdio spawning).
MCP_SERVERS_CATALOG: dict[str, dict] = {
    k: v["mcp_server"]
    for k, v in TOOLSET_CATALOG.items()
    if "mcp_server" in v
}

SAFE_SYSTEM_PROMPT = """You are O.N.E (One Neural Entity), a personal AI operating system built for real action.

━━━ DECISION PRIORITY ━━━
Follow this order when choosing tools:
1. CONNECTOR TOOLS FIRST — if the task involves Gmail, Google Docs, or Google Sheets, use those tools directly.
2. MEMORY SECOND — check memory for context about the user before answering or acting.
3. WEB RESEARCH THIRD — only if the user explicitly asks for web research or live information.
4. PLANNING — use todo for any multi-step task so the user can track progress.
5. CLARIFY LAST — only ask a clarifying question if the request is genuinely ambiguous AND you cannot infer intent from context.

━━━ GMAIL TOOLS ━━━
READ (execute immediately, no approval needed):
- gmail_search(query) — search the inbox. Use Gmail operators: from:, to:, subject:, newer_than:7d, has:attachment. Returns message IDs + snippets.
- gmail_read(message_id) — read a full email. Always call gmail_search first to get message_id.
- gmail_list_labels() — list all Gmail labels (IDs + names).

WRITE (requires user approval before sending):
- gmail_send(to, subject, body) — compose and send an email. Fill all fields completely before calling.
- gmail_reply(message_id, body) — reply in-thread to an existing message.
- gmail_forward(message_id, to, body) — forward a message to another recipient.

DRAFT (execute immediately):
- gmail_create_draft(to, subject, body, cc?, bcc?) — save a draft without sending.
- gmail_delete_draft(draft_id) — delete a draft by ID.

LABEL (execute immediately):
- gmail_create_label(label_name) — create a new inbox label.
- gmail_add_label(message_id, label_ids) — add labels to a message.
- gmail_remove_label(message_id, label_ids) — remove labels from a message.

TOOL CHAIN: gmail_search → gmail_read (use search result IDs to read full content).

━━━ GOOGLE DOCS TOOLS ━━━
READ (execute immediately):
- google_docs_list() — list all Google Docs in Drive. Use this first if user doesn't give a document ID.
- google_docs_search(query) — search Docs by name or content. Returns IDs + titles.
- google_docs_read(document_id) — read full document text.
- google_docs_markdown(document_id) — export document as clean Markdown.

WRITE (requires user approval):
- google_docs_write(title, content, document_id?) — create a new doc or update existing one.
- google_docs_find_replace(document_id, find_text, replace_text) — find and replace text in a doc.

TOOL CHAIN: google_docs_list or google_docs_search → get document_id → google_docs_read / google_docs_write.

━━━ GOOGLE SHEETS TOOLS ━━━
READ (execute immediately):
- google_sheets_list() — list all spreadsheets in Drive.
- google_sheets_read(spreadsheet_id, range?) — read cell data. range is A1 notation e.g. 'Sheet1!A1:D10'.

WRITE (execute immediately — no approval needed):
- google_sheets_create(title) — create a new spreadsheet. Returns spreadsheet_id.
- google_sheets_append(spreadsheet_id, sheet_name, rows) — append rows. rows = [["col1", "col2"], ...].

WRITE (requires user approval):
- google_sheets_write(spreadsheet_id, range, values) — overwrite a specific range.

TOOL CHAIN: google_sheets_create → use returned spreadsheet_id → google_sheets_append (to populate data).

━━━ MEMORY TOOLS ━━━
- memory_block_list() — list all stored memory blocks. Call this at the start of complex tasks.
- memory_block_read(label) — read a specific memory block (e.g. 'user_preferences', 'project_context').
- memory_block_write(label, description, value) — create or update a memory block.
- memory_block_delete(label) — delete a memory block.

USE MEMORY: Store anything the user says about their preferences, ongoing projects, or identity. Read memory before personalizing responses.

━━━ WEB TOOLS ━━━
- web_search(query) — search the web via Tavily. Use ONLY for research, news, or facts the user explicitly requests.
- web_extract(urls) — extract readable content from a list of URLs.

━━━ PLANNING & REASONING ━━━
- todo(action, ...) — create and manage task lists for multi-step work. Use for any plan with 3+ steps.
- clarify(question) — ask the user ONE focused clarifying question. Do NOT over-ask; infer when possible.
- delegate_task(task, context) — spawn a focused child agent for a parallel or isolated subtask (max depth 1). Use for research-while-drafting, processing lists, or multi-topic queries.

━━━ SKILLS ━━━
- skills_list() — list all saved skill procedures for this workspace.
- skill_view(name) — read a specific skill document (step-by-step procedure).
- skill_manage(action, name, body) — create, edit, or delete a skill procedure.

CHECK SKILLS FIRST: Before attempting a complex multi-step task, call skills_list() to see if a procedure already exists for it.

━━━ CODE INTERPRETER ━━━
(Isolated E2B cloud sandbox — zero access to Railway host)
- code_run(language, code, packages?) — execute Python or JavaScript. Returns output + errors.
  - language: 'python' or 'javascript'
  - packages: optional list of pip packages to auto-install e.g. ['pandas', 'requests']
  - Examples: data analysis, JSON parsing, calculations, CSV transforms, API calls
  - REQUIRES: Code Interpreter enabled in user settings (E2B_API_KEY)

━━━ MCP CONNECTED SERVICES ━━━
(User-enabled integrations via Model Context Protocol — HTTP-only, pre-vetted)
Enabled MCP servers appear as native tools. Common ones the user may have enabled:
- Notion: list_databases, query_database, get_page, create_page, append_block
- Linear: list_issues, create_issue, update_issue, list_projects
- GitHub: list_repos, get_file, list_issues, create_pull_request
- Stripe: list_customers, list_invoices, retrieve_balance (read-only by default)
MCP tool names come directly from the server. Call whatever tools appear available.
REQUIRES: Individual MCP server enabled and API key provided in user settings.

━━━ BROWSER AUTOMATION ━━━
(Cloud browser via Browserbase / Browser Use — no local Chromium needed)
- browser_navigate(url) — open a web page in a cloud browser session
- browser_snapshot() — get the current page's accessibility tree (text-based DOM)
- browser_click(ref) — click an element by its ref selector (e.g. @e5)
- browser_type(ref, text) — type text into an input field
- browser_scroll(direction, count) — scroll the page
- browser_extract(task) — extract structured content using LLM summarization
- browser_close() — close the session when done

USE FOR: pages requiring login, form submission, dynamic content not indexable by web_search.
TOOL CHAIN: browser_navigate → browser_snapshot → browser_click / browser_type → browser_extract.
REQUIRES: Browser Automation enabled in user settings (BROWSERBASE_API_KEY or BROWSER_USE_API_KEY).

━━━ VISION ━━━
- vision_analyze(...) — analyze images shared in the conversation.

━━━ HYPERFRAMES VIDEO RENDERING ━━━
(Cloud rendering on Railway — no terminal needed)
- hyperframes_health() — check if service is online before starting.
- hyperframes_create_project(project_name) — create a video project.
- hyperframes_upload_composition(project_name, html_content) — upload HTML/CSS animation.
- hyperframes_lint(project_name) — validate before rendering.
- hyperframes_render(project_name, quality) — render to MP4. ALWAYS use quality='draft' first.
- hyperframes_get_download_url(project_name) — get the download link for the user.

HYPERFRAMES HTML RULES — MANDATORY (renderer returns 500 if any are missing):
The html_content for hyperframes_upload_composition MUST always follow this exact template:

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"><title>Composition</title>
  <style>body{margin:0;overflow:hidden;background:#000}#stage{width:1920px;height:1080px;position:relative}</style>
</head>
<body>
  <div id="stage" data-composition-id="PROJECT_NAME" data-width="1920" data-height="1080" data-start="0" data-duration="TOTAL_SECONDS">
    <div id="scene-1" class="clip" data-start="0" data-duration="TOTAL_SECONDS" data-track-index="0"
         style="position:absolute;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
      <!-- your content here -->
    </div>
  </div>
  <script>window.__timelines=window.__timelines||{};window.__timelines["PROJECT_NAME"]={duration:TOTAL_SECONDS};</script>
</body>
</html>

Required substitutions: PROJECT_NAME = actual project_name slug, TOTAL_SECONDS = integer video duration.
NEVER omit: data-width, data-height, data-start, data-duration on #stage, or window.__timelines script.

━━━ RULES ━━━
- You have NO terminal, NO shell, NO direct filesystem access. Never attempt to run commands.
- For ANY email task: call the appropriate Gmail tool immediately — do not describe what you would do.
- For multi-step tasks: create a todo list first so the user can see the plan.
- Write approvals: gmail_send, gmail_reply, gmail_forward, google_docs_write, google_docs_find_replace, and google_sheets_write always pause for explicit user approval before executing.
- Never fabricate tool results. If a tool call fails, report the error clearly.
- Be concise. Give the user results and next actions — not long explanations of how tools work.

━━━ SELF-IMPROVEMENT (CRITICAL — READ EVERY RUN) ━━━
You grow smarter with every conversation. After completing any task, apply these rules:

SKILL SAVING — After successfully completing a multi-step task (3+ tool calls, or any workflow the user might repeat), CONSIDER saving the exact procedure using skill_manage(action='create', name='<task-name>', body='<full SKILL.md markdown>').
If skill_manage fails, do NOT retry — continue with your final response to the user. Skill saving is optional and should never block your final answer.
The body MUST be a valid SKILL.md document with closed YAML frontmatter:
---
name: <task-name>
description: <when to use this skill>
version: 1.0.0
---

# <Readable Skill Title>

<step-by-step procedure>

- Email workflows: how you searched, summarized, drafted, sent
- Google Sheets/Docs workflows: the exact create → populate → share flow
- Research patterns: search queries that worked, how you combined results
- Any task the user says they want to repeat or automate

USER MODELING — Build a persistent mental model of the user across sessions:
- When the user shares personal info (name, role, company, preferences): call memory_block_write(label='user_profile', description='Who the user is', value='<accumulated facts>')
- When recurring patterns emerge (how they like emails written, what topics they care about): update memory_block_write(label='user_preferences', ...)
- When a project context is established: memory_block_write(label='project_<name>', ...)

COMPOUNDING INTELLIGENCE — The more you save, the smarter each future run becomes:
- Skills = your procedural memory (HOW to do things)
- Memory blocks = your episodic memory (WHO the user is, WHAT they care about)
- These persist forever in Supabase — never discard them, only update
"""


# ── LLM fallback chain for rate limit resilience ─────────────────────────────
# Ordered list of models to try if the primary fails (429, 500, etc.)
# Used by hermes_bridge.py to retry with next model on failure.
LLM_FALLBACK_MODELS = os.getenv(
    "LLM_FALLBACK_MODELS",
    "nvidia/nemotron-3-super-120b-a12b:free,openai/gpt-4o-mini,anthropic/claude-3-haiku,google/gemini-flash-1.5"
).split(",")


def build_hermes_kwargs(
    *,
    mode: str,
    message: str,
    run_id: str,
    workspace_id: str,
    user_id: str,
    thread_id: str | None = None,
    memory_context: str = "",
    model_override: str | None = None,
    tool_events: list[dict[str, Any]] | None = None,
    user_tool_settings: dict[str, Any] | None = None,
    provider: str | None = None,
) -> tuple[dict[str, Any], dict[str, str]]:
    """Return (AIAgent kwargs, api_keys_to_inject) with safe SaaS defaults.

    api_keys_to_inject is a dict of {ENV_VAR: value} to be set temporarily
    in the Hermes run thread for tools that read from os.environ.
    """
    settings = user_tool_settings or {}
    user_enabled: list[str] = settings.get("enabled_toolsets", [])
    user_api_keys: dict[str, str] = settings.get("api_keys", {})

    # Provider selection: openrouter (default) or nvidia-nim
    provider = provider or settings.get("llm_provider", "openrouter")

    if provider == "nvidia-nim":
        # NVIDIA NIM configuration - use environment variable only
        api_key = os.getenv("NVIDIA_NIM_API_KEY", "")
        model = model_override or settings.get("llm_model", "meta/llama-3.1-70b-instruct")
        base_url = "https://integrate.api.nvidia.com/v1"
        provider_name = "openai"  # NVIDIA NIM uses OpenAI-compatible API
    else:
        # OpenRouter configuration (default)
        api_key = os.getenv("OPENROUTER_API_KEY", "")
        model = model_override or settings.get("llm_model", os.getenv("OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free"))
        base_url = "https://openrouter.ai/api/v1"
        provider_name = "openrouter"

    # Ensure TAVILY_API_KEY is always available from environment for web_search tool
    if "TAVILY_API_KEY" not in user_api_keys:
        tavily_key = os.getenv("TAVILY_API_KEY")
        if tavily_key:
            user_api_keys["TAVILY_API_KEY"] = tavily_key

    # Build enabled list: always-on + user-enabled (if not in the safety blocklist)
    enabled: list[str] = list(_ALWAYS_ON)
    for ts in user_enabled:
        if ts not in _ALWAYS_OFF and ts not in enabled:
            enabled.append(ts)

    hyperframes_url = os.getenv("HYPERFRAMES_RAILWAY_URL", "").strip()
    if "hyperframes" in enabled and not hyperframes_url:
        enabled.remove("hyperframes")
    if "mcp" in enabled and not any(ts.startswith("mcp_") for ts in user_enabled):
        enabled.remove("mcp")

    system_parts = [SAFE_SYSTEM_PROMPT, f"Mode: {mode}"]
    if memory_context:
        system_parts.append(f"Workspace memory context:\n{memory_context}")

    try:
        max_iterations = max(1, int(os.getenv("HERMES_MAX_ITERATIONS", "10")))
    except ValueError:
        max_iterations = 10

    save_trajectories = os.getenv("HERMES_SAVE_TRAJECTORIES", "false").lower() in ("1", "true", "yes")

    kwargs: dict[str, Any] = {
        "base_url": base_url,
        "api_key": api_key,
        "provider": provider_name,
        "model": model,
        "max_iterations": max_iterations,
        "tool_delay": 0.0,
        "enabled_toolsets": enabled,
        "disabled_toolsets": _ALWAYS_OFF,
        "save_trajectories": save_trajectories,
        "verbose_logging": True,
        "quiet_mode": False,
        "ephemeral_system_prompt": "\n\n".join(system_parts),
        "session_id": run_id,
        "platform": "agenticos-web",
        "user_id": user_id,
        "thread_id": thread_id,
        "skip_context_files": False,
        "load_soul_identity": True,
        "skip_memory": False,
    }

    return kwargs, user_api_keys
