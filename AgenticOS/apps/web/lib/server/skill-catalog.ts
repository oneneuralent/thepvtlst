export type AgenticSkillStatus = "active" | "partial" | "planned" | "internal";

export type AgenticSkill = {
  id: string;
  name: string;
  status: AgenticSkillStatus;
  modes: Array<"ask" | "create" | "act">;
  description: string;
  safeTools: string[];
  hermesPattern: string;
  nextStep: string;
};

export const agenticSkillCatalog: AgenticSkill[] = [
  {
    id: "ask",
    name: "Ask Skill",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "General chat, workspace context, model selection, and safe answers.",
    safeTools: ["chat", "memory_context", "model_presets"],
    hermesPattern: "AIAgent loop + prompt_builder mode guidance",
    nextStep: "Add profile-backed model preferences per workspace."
  },
  {
    id: "research",
    name: "Research Skill",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "Current web search with sources and saved web results.",
    safeTools: ["tavily_search", "web_sources", "library.web_result"],
    hermesPattern: "web_search/web_extract toolset with result compression",
    nextStep: "Add web_extract and multi-step research reports."
  },
  {
    id: "gmail",
    name: "Gmail Skill",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "Full Gmail integration: search, read, send, drafts, labels, reply, forward. All write actions require approval.",
    safeTools: ["gmail_search", "gmail_read", "gmail_send", "gmail_create_draft", "gmail_delete_draft", "gmail_add_label", "gmail_remove_label", "gmail_create_label", "gmail_list_labels", "gmail_reply", "gmail_forward"],
    hermesPattern: "tool registry intent -> approval gate -> connector execution",
    nextStep: "None - fully integrated with Hermes tool registry."
  },
  {
    id: "google-docs",
    name: "Google Docs Skill",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "Full Google Docs integration: read, write, search, list, markdown export, find/replace. All write actions require approval.",
    safeTools: ["google_docs_read", "google_docs_write", "google_docs_search", "google_docs_list", "google_docs_markdown", "google_docs_find_replace"],
    hermesPattern: "connector toolset + approval.py safety model",
    nextStep: "None - fully integrated with Hermes tool registry."
  },
  {
    id: "google-sheets",
    name: "Google Sheets Skill",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "Full Google Sheets integration: read, write, list, create, append. All write actions require approval.",
    safeTools: ["google_sheets_read", "google_sheets_write", "google_sheets_list", "google_sheets_create", "google_sheets_append"],
    hermesPattern: "connector toolset + approval.py safety model",
    nextStep: "None - fully integrated with Hermes tool registry."
  },
  {
    id: "library",
    name: "Library Skill",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "Save and retrieve chats, sources, generated responses, documents, and media metadata. Agent can now read and write library items during conversation.",
    safeTools: ["library_list", "library_save"],
    hermesPattern: "session/state persistence + FTS-style recall",
    nextStep: "Add thread reopen and file/media storage previews."
  },
  {
    id: "memory",
    name: "Memory Skill",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "Letta-style memory blocks for in-context storage. Agents can read, write, list, and delete memory blocks for user preferences, persona, objectives, and project context. Self-editing memory enabled.",
    safeTools: ["memory_block_read", "memory_block_write", "memory_block_list", "memory_block_delete"],
    hermesPattern: "Memory blocks stored in Supabase, managed via Hermes tool registry",
    nextStep: "None - fully integrated with Letta-style memory blocks."
  },
  {
    id: "hyperframes",
    name: "HyperFrames Video",
    status: "active",
    modes: ["create", "act"],
    description: "Render HTML/CSS compositions to MP4 via HyperFrames Railway cloud. No terminal, no npm, no ffmpeg on agent host. Requires HYPERFRAMES_RAILWAY_URL set in Railway environment.",
    safeTools: ["hyperframes_health", "hyperframes_create_project", "hyperframes_upload_composition", "hyperframes_lint", "hyperframes_render", "hyperframes_get_download_url"],
    hermesPattern: "Direct synchronous HTTP calls to Railway service — chromium runs there, not here",
    nextStep: "Deploy HyperFrames Railway service → set HYPERFRAMES_RAILWAY_URL env var in agent-api Railway service."
  },
  {
    id: "workspace-skills",
    name: "Workspace Skills",
    status: "active",
    modes: ["ask", "create", "act"],
    description: "Reusable per-workspace procedures reviewed before activation. Agent can create, view, and manage skills via Hermes built-in tools.",
    safeTools: ["skills_list", "skill_view", "skill_manage"],
    hermesPattern: "skills_list + skill_view + review-gated skill_manage",
    nextStep: "Add skill creation notifications and review UI."
  },
  {
    id: "files",
    name: "File Understanding Skill",
    status: "planned",
    modes: ["ask", "create"],
    description: "Read uploaded files, search indexed content, and summarize documents.",
    safeTools: ["storage.read", "document.parse", "library.file"],
    hermesPattern: "file_tools read/search patterns without raw filesystem access",
    nextStep: "Add Supabase Storage upload and parser pipeline."
  },
  {
    id: "calendar",
    name: "Calendar Skill",
    status: "planned",
    modes: ["ask", "create", "act"],
    description: "Read calendar availability and create/update events after approval.",
    safeTools: ["google.calendar.read", "google.calendar.write.approval"],
    hermesPattern: "connector toolset + approval.py safety model",
    nextStep: "Add calendar list/read endpoints, then approval-gated create."
  },
  {
    id: "automation",
    name: "Automation Skill",
    status: "planned",
    modes: ["act"],
    description: "Recurring checks, scheduled runs, and user-approved background work.",
    safeTools: ["automation.create", "automation.pause", "automation.history"],
    hermesPattern: "cron jobs + gateway delivery concepts",
    nextStep: "Add workspace-scoped automation schema and UI."
  },
  {
    id: "image-gen",
    name: "Image Generation Skill",
    status: "partial",
    modes: ["create"],
    description: "Generate images using FAL or other image generation APIs. Requires FAL_KEY.",
    safeTools: ["image_generate"],
    hermesPattern: "FAL API integration with approval for cost control",
    nextStep: "Add FAL API endpoint and image preview UI."
  },
  {
    id: "tts",
    name: "Text-to-Speech Skill",
    status: "planned",
    modes: ["create"],
    description: "Convert text to speech using ElevenLabs or similar TTS APIs.",
    safeTools: ["tts_generate"],
    hermesPattern: "TTS API integration with audio playback",
    nextStep: "Add ElevenLabs API endpoint and audio player UI."
  },
  {
    id: "unsafe-hermes-tools",
    name: "Raw Hermes Power Tools",
    status: "internal",
    modes: [],
    description: "Terminal, shell, unrestricted browser, filesystem write, MCP, code execution, and delegation stay disabled for public users.",
    safeTools: [],
    hermesPattern: "disabled_toolsets safety boundary",
    nextStep: "Keep internal-only until per-workspace sandboxing and admin policies exist."
  }
];

export const blockedHermesToolsets = [
  "terminal",
  "file.write",
  "mcp.arbitrary",
  "code_execution",
  "delegation",
  "env_passthrough",
  "credential_files"
];
