# AgenticOS Skills Architecture - Complete Research Document

## Executive Summary

AgenticOS has a **dual-layer skill system**:
1. **Built-in System Skills** - Pre-packaged by AgenticOS, defined in code
2. **Custom User Skills** - Created by users, stored in Supabase, synced to Hermes

This document covers the complete skill architecture, storage, loading mechanism, and recommendations for slash command integration.

---

## 1. Built-in System Skills (In-House)

### Definition
Built-in system skills are pre-configured toolsets with embedded instructions. They are defined in `apps/agent-api/app/core/hermes_profile.py` in the `SAFE_SYSTEM_PROMPT`.

### Location
- **File:** `apps/agent-api/app/core/hermes_profile.py`
- **Section:** Lines 191-379 (SAFE_SYSTEM_PROMPT)
- **Storage:** Code (hardcoded, not in database)

### Available Built-in Skills

| Skill Name | Status | Tools Included | Description |
|------------|--------|----------------|-------------|
| **Ask Skill** | Active | chat, memory_context, model_presets | General chat, workspace context, model selection |
| **Research Skill** | Active | web_search, web_extract, library.web_result | Web search with Tavily + sources |
| **Gmail Skill** | Active | 11 Gmail tools (search, read, send, drafts, labels, reply, forward) | Full Gmail integration, write actions require approval |
| **Google Docs Skill** | Active | 6 Docs tools (read, write, search, list, markdown, find_replace) | Full Docs integration, write actions require approval |
| **Google Sheets Skill** | Active | 5 Sheets tools (read, write, list, create, append) | Full Sheets integration, write actions require approval |
| **Library Skill** | Active | library_list, library_save | Save/retrieve chats, documents, media |
| **Memory Skill** | Active | 4 memory tools (read, write, list, delete) | Letta-style memory blocks for context |
| **HyperFrames Video** | Active | 6 HyperFrames tools | HTML→MP4 rendering via Railway cloud |
| **Workspace Skills** | Active | skills_list, skill_view, skill_manage | User-created skill management |
| **Code Interpreter** | Conditional | code_run (E2B sandbox) | Python/JS execution (requires E2B_API_KEY) |
| **Browser Automation** | Conditional | 6 browser tools (navigate, snapshot, click, type, extract, close) | Cloud browser via Browserbase/Browser Use |
| **MCP Connected Services** | Conditional | Notion, Linear, GitHub, Stripe tools | HTTP-only MCP integrations |

---

### 1.1 Built-in Skills Usage Analysis

**Current Usage Status:**

| Skill Name | Currently Used | Activation Method | User Control | Notes |
|------------|----------------|-------------------|--------------|-------|
| **Ask Skill** | ✅ YES | Always-on (_ALWAYS_ON) | None | Core chat functionality - always active |
| **Research Skill** | ✅ YES | Always-on (_ALWAYS_ON) | None | Web search via Tavily - always active |
| **Gmail Skill** | ✅ YES | Always-on (_ALWAYS_ON) | None | Gmail integration - always active |
| **Google Docs Skill** | ✅ YES | Always-on (_ALWAYS_ON) | None | Docs integration - always active |
| **Google Sheets Skill** | ✅ YES | Always-on (_ALWAYS_ON) | None | Sheets integration - always active |
| **Library Skill** | ✅ YES | Always-on (_ALWAYS_ON) | None | Save/retrieve content - always active |
| **Memory Skill** | ✅ YES | Always-on (_ALWAYS_ON) | None | Memory blocks - always active |
| **HyperFrames Video** | ✅ YES | Always-on (_ALWAYS_ON) | None | Video rendering - always active |
| **Workspace Skills** | ✅ YES | Always-on (_ALWAYS_ON) | None | Skill management - always active |
| **Code Interpreter** | ⚠️ CONDITIONAL | User-configurable (TOOLSET_CATALOG) | Toggle in settings | Requires E2B_API_KEY |
| **Browser Automation** | ⚠️ CONDITIONAL | User-configurable (TOOLSET_CATALOG) | Toggle in settings | Requires BROWSERBASE_API_KEY or BROWSER_USE_API_KEY |
| **MCP Connected Services** | ⚠️ CONDITIONAL | User-configurable (TOOLSET_CATALOG) | Toggle per service | Requires respective API keys |

**Permanently Disabled Skills (Security):**

| Skill Name | Status | Reason | Blocked By |
|------------|--------|--------|------------|
| **Terminal** | ❌ PERMANENTLY DISABLED | Raw shell access on Railway host | _ALWAYS_OFF list |
| **File System** | ❌ PERMANENTLY DISABLED | Host filesystem read/write | _ALWAYS_OFF list |
| **Code Execution** | ❌ PERMANENTLY DISABLED | Execute Python on host | _ALWAYS_OFF list |
| **Session Search** | ❌ PERMANENTLY DISABLED | Hermes SQLite is ephemeral | _ALWAYS_OFF list |

**Planned/Not Yet Implemented Skills:**

| Skill Name | Status | Description | Planned For |
|------------|--------|-------------|-------------|
| **File Understanding** | Planned | Read uploaded files, search indexed content | Phase 4 |
| **Calendar** | Planned | Read calendar, create events after approval | Phase 5 |
| **Automation** | Planned | Recurring checks, scheduled runs | Phase 5 |
| **Image Generation** | Partial | Generate images via FAL (requires FAL_KEY) | Available in TOOLSET_CATALOG |
| **Text-to-Speech** | Planned | Convert text to speech via ElevenLabs | Available in TOOLSET_CATALOG |
| **Discord** | Available | Read Discord channels, participate | Available in TOOLSET_CATALOG |
| **Messaging** | Available | Telegram/Slack/SMS gateway | Available in TOOLSET_CATALOG |
| **Home Assistant** | Available | Control smart home devices | Available in TOOLSET_CATALOG |

**Key Insights:**

1. **Core Skills (9)** are always active and used by default - no user configuration needed
2. **Conditional Skills (3)** require user to enable in settings and provide API keys
3. **Disabled Skills (4)** are permanently blocked for security (host machine access)
4. **Planned Skills (6)** are in development roadmap or available as optional integrations

### How Built-in Skills Work

Built-in skills are **not separate entities** - they are sections in the system prompt that instruct Hermes on:
1. Which tools to use for which tasks
2. Tool chains and best practices
3. Approval requirements for write actions
4. Decision priority order

**Example from SAFE_SYSTEM_PROMPT:**
```markdown
━━━ DECISION PRIORITY ━━━
Follow this order when choosing tools:
1. CONNECTOR TOOLS FIRST — if the task involves Gmail, Google Docs, or Google Sheets
2. MEMORY SECOND — check memory for context before answering
3. WEB RESEARCH THIRD — only if user explicitly requests live information
4. PLANNING — use todo for multi-step tasks
5. CLARIFY LAST — only ask if genuinely ambiguous
```

### Activation
Built-in skills are **always active** based on:
- `_ALWAYS_ON` toolsets (lines 35-47)
- User-enabled toolsets from `TOOLSET_CATALOG` (lines 52-179)
- No database storage required

---

## 2. Custom User Skills (Supabase)

### Definition
Custom user skills are `SKILL.md` files created by users to codify specific workflows, research patterns, or domain knowledge.

### Storage in Supabase

#### Table: `memory_blocks`
**Purpose:** Letta-style in-context memory (can also store skills)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | Workspace isolation |
| label | TEXT | Skill name (e.g., "fashion_research") |
| description | TEXT | What this skill does |
| value | TEXT | SKILL.md content (full markdown) |
| char_limit | INTEGER | Max characters (default 2000) |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update |

**Migration:** `0007_memory_blocks.sql`

#### Table: `workspace_skills`
**Purpose:** Formal skill versioning system (advanced)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | Workspace isolation |
| name | TEXT | Skill name |
| category | TEXT | Skill category (e.g., "research") |
| description | TEXT | Skill description |
| current_version_id | UUID | FK to skill_versions |
| scope | TEXT | 'user', 'workspace', or 'global_candidate' |
| status | TEXT | 'draft', 'active', 'needs_review', 'archived' |
| created_by | UUID | User who created it |
| created_at | TIMESTAMPTZ | Creation timestamp |
| updated_at | TIMESTAMPTZ | Last update |

#### Table: `skill_versions`
**Purpose:** Version history for skills

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| skill_id | UUID | FK to workspace_skills |
| workspace_id | UUID | Workspace isolation |
| version | INTEGER | Version number |
| body | TEXT | SKILL.md content |
| changelog | TEXT | Version notes |
| source_run_id | UUID | Run that created this version |
| source_memory_id | UUID | Memory that inspired this skill |
| status | TEXT | 'draft', 'active', 'rejected', 'archived' |
| safety_status | TEXT | 'passed', 'needs_review', 'blocked' |
| created_by | UUID | User who created it |
| created_at | TIMESTAMPTZ | Creation timestamp |

#### Table: `skill_events`
**Purpose:** Audit log for skill lifecycle

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| workspace_id | UUID | Workspace isolation |
| skill_id | UUID | FK to workspace_skills |
| version_id | UUID | FK to skill_versions |
| run_id | UUID | Related agent run |
| event_type | TEXT | 'proposed', 'created', 'patched', 'activated', 'rejected', 'archived', 'used', 'failed' |
| reason | TEXT | Event reason |
| metadata | JSONB | Additional context |
| actor | TEXT | 'agent', 'user', 'system', 'admin' |
| created_at | TIMESTAMPTZ | Event timestamp |

**Migration:** `0004_hermes_style_learning_architecture.sql`

### SKILL.md Format

Custom skills must follow this exact format:

```markdown
---
name: skill-name
description: When to use this skill
version: 1.0.0
metadata:
  hermes:
    tags: [category]
---

# Readable Skill Title

<step-by-step procedure>
```

**Example:**
```markdown
---
name: fashion-research
description: Research fashion designers and create structured data in Google Sheets
version: 1.0.0
metadata:
  hermes:
    tags: [research, fashion]
---

# Fashion Research Skill

When asked to research fashion designers or create fashion-related data:

1. Use web_search with advanced depth and 10 results
2. Extract key information: name, location, email, website, specialty
3. Create Google Sheet with columns: Designer Name, Specialty, Location, Phone, Email, Website
4. Append data in structured format
5. Provide summary with link to spreadsheet
```

---

## 3. Skill Loading Mechanism

### File: `apps/agent-api/app/adapters/skills_sync.py`

This file handles the bridge between Supabase and Hermes filesystem.

### Flow

```
User Request
    ↓
agent-api receives request
    ↓
skills_sync.write_skills_to_fs()
    ↓
Query Supabase memory_blocks for skills
    ↓
Write SKILL.md files to /tmp/hermes-{workspace_id}/skills/
    ↓
skills_sync.write_context_files()
    ↓
Write SOUL.md (O.N.E persona)
Write USER.md (memory blocks snapshot)
Write config.yaml (MCP servers)
    ↓
Hermes loads skills from filesystem
    ↓
Agent runs with skills in context
    ↓
skills_sync.read_new_skills()
    ↓
Detect new/modified skills
    ↓
Sync back to Supabase
```

### Key Functions

#### `write_skills_to_fs(workspace_id, skills)`
- Reads skills from Supabase `memory_blocks` table
- Writes to `/tmp/hermes-{workspace_id}/skills/{category}/{name}/SKILL.md`
- Auto-wraps plain text in SKILL.md frontmatter if missing
- Returns HERMES_HOME path

#### `write_context_files(workspace_id, memory_blocks, enabled_mcp_servers)`
- Writes `SOUL.md` - O.N.E persona (static)
- Writes `USER.md` - memory blocks as user model
- Writes `config.yaml` - MCP server configurations (safety-enforced)

#### `snapshot_skills(workspace_id)`
- Returns `{skill_path: mtime}` for all SKILL.md files
- Used to detect changes after Hermes run

#### `read_new_skills(workspace_id, before_snapshot)`
- Scans skills directory for new/modified files
- Returns list of `{name, body, category}` dicts
- Syncs back to Supabase

### Per-Workspace Isolation

```
/tmp/hermes-{workspace_id}/
├── SOUL.md
├── USER.md
├── config.yaml
└── skills/
    ├── general/
    │   └── my-skill/
    │       └── SKILL.md
    ├── research/
    │   └── deep-dive/
    │       └── SKILL.md
    └── fashion/
        └── designer-research/
            └── SKILL.md
```

Each workspace has its own isolated HERMES_HOME, ensuring users never see each other's skills.

---

## 4. Toolsets vs Skills

### Critical Distinction

| Aspect | Toolsets | Skills |
|--------|----------|--------|
| **Definition** | Groups of tools from Hermes | Procedures/instructions for using tools |
| **Storage** | Code (hermes_profile.py) | Supabase (memory_blocks, workspace_skills) |
| **Purpose** | Enable/disable capabilities | Codify workflows and best practices |
| **Example** | "web" toolset = web_search + web_extract | "Fashion Research" skill = use web_search → extract → create sheet |
| **User Control** | Toggle in settings | Create/edit in Library |

### Toolset Catalog

Located in `hermes_profile.py` lines 52-179:

| Toolset | Category | API Key Required |
|---------|----------|-----------------|
| web_search | research | TAVILY_API_KEY |
| image_gen | ai | FAL_KEY |
| tts | ai | Optional (ELEVENLABS_API_KEY) |
| discord | platform | DISCORD_TOKEN |
| messaging | platform | Optional (TELEGRAM_TOKEN, SLACK_BOT_TOKEN) |
| cronjob | automation | None |
| homeassistant | platform | HASS_TOKEN, HASS_URL |
| browser | compute | Optional (BROWSERBASE_API_KEY, BROWSER_USE_API_KEY) |
| code_interpreter | compute | E2B_API_KEY |
| mcp_notion | mcp | MCP_NOTION_API_KEY |
| mcp_linear | mcp | MCP_LINEAR_API_KEY |
| mcp_github | mcp | MCP_GITHUB_TOKEN |
| mcp_stripe | mcp | MCP_STRIPE_SECRET_KEY |

### Always-On Toolsets

From `hermes_profile.py` lines 35-47:

```python
_ALWAYS_ON = [
    "agenticos_connectors",  # Gmail, Docs, Sheets
    "web",                   # web_search, web_extract
    "memory",                # memory blocks
    "todo",                  # task planning
    "clarify",               # ask questions
    "vision",                # image analysis
    "delegation",            # child agents
    "skills",                # skill management
    "hyperframes",           # video rendering
    "mcp",                   # MCP integrations
]
```

---

## 5. Current Skill Loading Flow

### When Agent Starts

1. **System Prompt Loading**
   - SAFE_SYSTEM_PROMPT from hermes_profile.py
   - Contains built-in skill instructions
   - Always loaded

2. **Custom Skills Sync**
   - Query Supabase `memory_blocks` where label = skill name
   - Write to `/tmp/hermes-{workspace_id}/skills/`
   - Hermes discovers and loads these SKILL.md files

3. **Context Files**
   - SOUL.md - O.N.E persona
   - USER.md - Memory blocks snapshot
   - config.yaml - MCP server configs

4. **Toolset Activation**
   - Merge `_ALWAYS_ON` with user-enabled toolsets
   - Filter out `_ALWAYS_OFF` (terminal, file, code_execution, session_search)
   - Pass to Hermes as `enabled_toolsets`

### Why "No active skills loaded" Appears

The log message `No active skills loaded into Hermes yet` means:
- **No custom user skills** in Supabase `memory_blocks` for this workspace
- Built-in system skills are still active (via SAFE_SYSTEM_PROMPT)
- Agent uses built-in skills directly through toolsets

---

## 6. Slash Command Integration Proposal

### Objective
Allow users to explicitly select skills via slash commands like `/skill`, `/research`, `/gmail`, etc.

### Proposed Implementation

#### Frontend (WorkspaceShell.tsx)

**Command Detection:**
```typescript
// Detect slash commands in user input
const detectSlashCommand = (input: string) => {
  const match = input.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (match) {
    return { command: match[1], args: match[2] || '' };
  }
  return null;
};
```

**Command Suggestions:**
```typescript
// Show autocomplete for slash commands
const SLASH_COMMANDS = [
  { command: '/skill', description: 'Select a custom skill to use', icon: 'Zap' },
  { command: '/research', description: 'Use research skill with advanced search', icon: 'Search' },
  { command: '/gmail', description: 'Use Gmail skill for email tasks', icon: 'Mail' },
  { command: '/sheets', description: 'Use Google Sheets skill', icon: 'Table' },
  { command: '/docs', description: 'Use Google Docs skill', icon: 'FileText' },
  { command: '/memory', description: 'Use memory skill', icon: 'Brain' },
  { command: '/code', description: 'Use code interpreter', icon: 'Code' },
  { command: '/browser', description: 'Use browser automation', icon: 'Globe' },
];
```

**Command Execution:**
```typescript
// Prepend skill selection to user message
const executeSlashCommand = async (command: string, args: string) => {
  let modifiedMessage = args;
  
  switch (command) {
    case '/skill':
      // Show skill selector modal
      const selectedSkill = await showSkillSelector();
      modifiedMessage = `Use the ${selectedSkill} skill: ${args}`;
      break;
    case '/research':
      modifiedMessage = `Use the Research skill with advanced search depth: ${args}`;
      break;
    case '/gmail':
      modifiedMessage = `Use the Gmail skill: ${args}`;
      break;
    // ... other commands
  }
  
  // Send modified message to agent
  await sendMessage(modifiedMessage);
};
```

#### Backend (hermes_profile.py)

**Skill-Specific System Prompts:**
```python
SKILL_SYSTEM_PROMPTS = {
    "research": """
━━━ RESEARCH MODE ━━━
You are in deep research mode. Use these settings:
- search_depth: advanced
- max_results: 10
- include_raw_content: true
- Always cross-reference 3+ sources
- Provide citations for all claims
""",
    "gmail": """
━━━ GMAIL MODE ━━━
You are in email mode. Use these patterns:
- Always search before reading
- Draft before sending
- Use labels for organization
- All sends require approval
""",
    # ... other skill-specific prompts
}
```

**Modified build_hermes_kwargs:**
```python
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
    requested_skill: str | None = None,  # NEW: Explicit skill selection
) -> tuple[dict[str, Any], dict[str, str]]:
    # ... existing code ...
    
    system_parts = [SAFE_SYSTEM_PROMPT, f"Mode: {mode}"]
    
    # Add skill-specific prompt if requested
    if requested_skill and requested_skill in SKILL_SYSTEM_PROMPTS:
        system_parts.append(SKILL_SYSTEM_PROMPTS[requested_skill])
    
    if memory_context:
        system_parts.append(f"Workspace memory context:\n{memory_context}")
    
    kwargs["ephemeral_system_prompt"] = "\n\n".join(system_parts)
    # ... rest of function ...
```

#### API Changes

**New parameter in chat endpoint:**
```typescript
// apps/web/app/api/chat/route.ts
const { requested_skill } = await request.json();
```

**Pass to agent-api:**
```typescript
const response = await fetch(`${AGENT_API_URL}/run`, {
  method: 'POST',
  body: JSON.stringify({
    // ... existing fields ...
    requested_skill,  // NEW
  }),
});
```

### User Experience Flow

1. **User types `/`** → Shows command suggestions
2. **User selects `/research`** → Auto-completes to `/research `
3. **User types query** → `/research top fashion designers Mumbai 2026`
4. **Frontend detects command** → Sends `requested_skill: "research"` to backend
5. **Backend adds skill-specific prompt** → Hermes runs in research mode
6. **Agent uses advanced search settings** → Better results

### Benefits

- **Explicit control** - Users can force specific skill behavior
- **Discoverability** - Slash commands make skills visible
- **Consistency** - Ensures skill-specific settings are applied
- **Efficiency** - No need to manually specify "use advanced search"

---

## 7. Recommendations

### Immediate Actions

1. **Implement Slash Commands**
   - Add command detection in WorkspaceShell.tsx
   - Create command suggestion UI
   - Add `requested_skill` parameter to chat API
   - Update hermes_profile.py with skill-specific prompts

2. **Skill Discovery UI**
   - Show available skills in sidebar
   - Display skill descriptions and use cases
   - Allow one-click skill activation

3. **Skill Templates**
   - Pre-populate Library with skill templates
   - Examples: "Deep Research", "Email Workflow", "Data Analysis"
   - Users can customize templates

### Medium-Term Enhancements

1. **Skill Analytics**
   - Track which skills are used most
   - Measure skill success rates
   - Suggest skills based on task type

2. **Skill Sharing**
   - Allow users to share skills between workspaces
   - Community skill marketplace
   - Skill rating and review system

3. **Skill Composition**
   - Allow skills to reference other skills
   - Hierarchical skill organization
   - Skill inheritance and overrides

### Long-Term Vision

1. **AI-Generated Skills**
   - Agent automatically creates skills from successful runs
   - Skill quality scoring
   - Automatic skill refinement

2. **Skill Marketplace**
   - Curated skill library by AgenticOS team
   - User-contributed skills
   - Monetization for popular skills

3. **Skill Version Control**
   - Full Git-like versioning for skills
   - Branching and merging
   - Rollback to previous versions

---

## 8. Technical Implementation Checklist

### Frontend (apps/web)

- [ ] Add slash command detection in WorkspaceShell.tsx
- [ ] Create command suggestion dropdown component
- [ ] Implement skill selector modal
- [ ] Add `requested_skill` to chat API call
- [ ] Update UI to show active skill in header
- [ ] Add skill documentation panel in sidebar

### Backend (apps/agent-api)

- [ ] Add `requested_skill` parameter to `/run` endpoint
- [ ] Create `SKILL_SYSTEM_PROMPTS` dict in hermes_profile.py
- [ ] Modify `build_hermes_kwargs` to accept `requested_skill`
- [ ] Add skill-specific system prompt injection
- [ ] Update skill loading to prioritize requested skill

### Database (Supabase)

- [ ] Consider adding `skill_usage_stats` table
- [ ] Add `last_used_at` to workspace_skills table
- [ ] Create skill favorites table
- [ ] Add skill sharing permissions table

---

## 9. Summary

### Current State

- **Built-in Skills:** 12+ pre-configured skills in code (always active)
- **Custom Skills:** Stored in Supabase `memory_blocks` and `workspace_skills` tables
- **Loading:** Synced from Supabase to Hermes filesystem before each run
- **Isolation:** Per-workspace HERMES_HOME ensures privacy
- **Toolsets:** Separate from skills - enable/disable capabilities

### Proposed Enhancement

- **Slash Commands:** `/skill`, `/research`, `/gmail`, etc. for explicit skill selection
- **Skill-Specific Prompts:** Different system prompts per skill
- **Better Discovery:** UI to show available skills and their use cases
- **Templates:** Pre-built skill patterns for common workflows

### Key Files

- `apps/agent-api/app/core/hermes_profile.py` - Built-in skills and toolsets
- `apps/agent-api/app/adapters/skills_sync.py` - Skill sync mechanism
- `apps/web/components/workspace/WorkspaceShell.tsx` - Chat UI (slash commands)
- `infra/supabase/migrations/0004_hermes_style_learning_architecture.sql` - Skill tables
- `infra/supabase/migrations/0007_memory_blocks.sql` - Memory blocks table

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-26  
**Author:** AgenticOS Architecture Research
