"""Hermes AIAgent bridge for the AgenticOS SaaS runtime.

Imports and runs the Hermes conversation loop in-process with safe
profile settings. Captures tool calls, streaming deltas, and final
response for the SaaS API layer.

Architecture:
  Web (Next.js) → agent-api (FastAPI) → HermesBridge → AIAgent
  
The bridge adds vendor/hermes-agent to sys.path on first use,
instantiates AIAgent with SaaS-safe kwargs, runs one conversation
turn in a background thread, and collects structured results.
"""

from __future__ import annotations

import logging
import json
import os
import re
import sys
import threading
import httpx
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from app.core.hermes_profile import build_hermes_kwargs, LLM_FALLBACK_MODELS
from app.core.schemas import RunResponse, Source, ToolEvent
from app.adapters.skills_sync import write_skills_to_fs, write_context_files, snapshot_skills, read_new_skills
from app.services.openrouter import generate_with_openrouter
from app.services.tavily import search_tavily

logger = logging.getLogger(__name__)

# ── Per-user isolation lock ────────────────────────────────────────────────────
# os.environ is a global dict shared across all threads in the process.
# Two concurrent Hermes runs would corrupt each other's HERMES_HOME and API
# keys without this lock.  We hold it only for env injection + AIAgent init
# (milliseconds), then release so the long run_conversation proceeds in parallel.
_hermes_init_lock = threading.Lock()

# ── Web API helpers ───────────────────────────────────────────────────────
# Call the web API endpoints for connector operations (keeps token management in web layer)

_WEB_API_URL = os.getenv("WEB_API_URL", "http://localhost:3000")


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("Invalid %s=%r; using default %.1fs", name, raw, default)
        return default
    return max(1.0, value)


class _ApprovalRequiredInterrupt(BaseException):
    """Stop Hermes as soon as a side-effecting connector requests approval."""

    def __init__(self, tool_name: str) -> None:
        super().__init__(f"{tool_name} requires approval")
        self.tool_name = tool_name


class _ToolConfigurationInterrupt(Exception):
    """Stop a run when an enabled tool is present but not actually usable."""

    def __init__(self, tool_name: str, message: str) -> None:
        super().__init__(message)
        self.tool_name = tool_name


async def _call_web_google_docs_read(document_id: str, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to read Google Docs document."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/docs/read",
            json={"document_id": document_id},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_sheets_read(spreadsheet_id: str, range: str | None, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to read Google Sheets data."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/sheets/read",
            json={"spreadsheet_id": spreadsheet_id, "range": range},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_sheets_create(title: str, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to create a Google Sheet."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/sheets/create",
            json={"title": title},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_sheets_list(workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to list Google Sheets."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_WEB_API_URL}/api/google/sheets/list",
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_sheets_append(spreadsheet_id: str, sheet_name: str, rows: list[list[str]], workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to append data to Google Sheets."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/sheets/append",
            json={"spreadsheet_id": spreadsheet_id, "sheet_name": sheet_name, "rows": rows},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_search(query: str, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to search Gmail."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/email",
            json={"query": query},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_read(message_id: str, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to read Gmail message."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_WEB_API_URL}/api/email/{message_id}",
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_memory_block_read(label: str, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to read a memory block."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_WEB_API_URL}/api/memory/blocks?label={label}",
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_memory_block_write(label: str, description: str, value: str, char_limit: int | None, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to write a memory block."""
    async with httpx.AsyncClient() as client:
        body = {"label": label, "description": description, "value": value}
        if char_limit is not None:
            body["char_limit"] = char_limit
        response = await client.post(
            f"{_WEB_API_URL}/api/memory/blocks",
            json=body,
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_memory_block_list(workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to list memory blocks."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_WEB_API_URL}/api/memory/blocks",
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_memory_block_delete(label: str, workspace_id: str, user_id: str) -> dict:
    """Call web API endpoint to delete a memory block."""
    async with httpx.AsyncClient() as client:
        response = await client.delete(
            f"{_WEB_API_URL}/api/memory/blocks?label={label}",
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_list_labels(workspace_id: str, user_id: str) -> dict:
    """Call web API to list Gmail labels."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_WEB_API_URL}/api/email/labels",
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_create_label(label_name: str, workspace_id: str, user_id: str) -> dict:
    """Call web API to create a Gmail label."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/email/labels",
            json={"action": "create", "label_name": label_name},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_add_label(message_id: str, label_ids: list, workspace_id: str, user_id: str) -> dict:
    """Call web API to add labels to a Gmail message."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/email/labels",
            json={"action": "add", "message_id": message_id, "label_ids": label_ids},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_remove_label(message_id: str, label_ids: list, workspace_id: str, user_id: str) -> dict:
    """Call web API to remove labels from a Gmail message."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/email/labels",
            json={"action": "remove", "message_id": message_id, "label_ids": label_ids},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_create_draft(to: str, subject: str, body: str, cc: str | None, bcc: str | None, workspace_id: str, user_id: str) -> dict:
    """Call web API to create a Gmail draft."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/email/manage-draft",
            json={"action": "create", "to": to, "subject": subject, "body": body, "cc": cc, "bcc": bcc},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_gmail_delete_draft(draft_id: str, workspace_id: str, user_id: str) -> dict:
    """Call web API to delete a Gmail draft."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/email/manage-draft",
            json={"action": "delete", "draft_id": draft_id},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_docs_list(workspace_id: str, user_id: str) -> dict:
    """Call web API to list Google Docs documents."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{_WEB_API_URL}/api/google/docs/list",
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_docs_search(query: str, workspace_id: str, user_id: str) -> dict:
    """Call web API to search Google Docs documents."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/docs/search",
            json={"query": query},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_docs_markdown(document_id: str, workspace_id: str, user_id: str) -> dict:
    """Call web API to export a Google Doc as markdown."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/docs/markdown",
            json={"document_id": document_id},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_docs_find_replace(document_id: str, find_text: str, replace_text: str, workspace_id: str, user_id: str) -> dict:
    """Call web API to perform find and replace in a Google Doc."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/docs/find_replace",
            json={"document_id": document_id, "find_text": find_text, "replace_text": replace_text},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_docs_write(title: str, content: str, document_id: str | None, workspace_id: str, user_id: str) -> dict:
    """Call web API to write to a Google Doc (create or update)."""
    async with httpx.AsyncClient() as client:
        body = {"title": title, "content": content}
        if document_id:
            body["document_id"] = document_id
        response = await client.post(
            f"{_WEB_API_URL}/api/google/docs/write",
            json=body,
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _call_web_google_sheets_write(spreadsheet_id: str, range: str, values: list[list[str]], workspace_id: str, user_id: str) -> dict:
    """Call web API to write data to a Google Sheet."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{_WEB_API_URL}/api/google/sheets/write",
            json={"spreadsheet_id": spreadsheet_id, "range": range, "values": values},
            headers={"x-workspace-id": workspace_id, "x-user-id": user_id}
        )
        if not response.is_success:
            raise Exception(f"Web API error: {response.text}")
        return response.json()


async def _execute_code_run(language: str, code: str, packages: list) -> dict:
    """Execute code in an isolated E2B cloud sandbox.

    E2B runs code in an isolated microVM — no access to the Railway host.
    Requires E2B_API_KEY environment variable.
    """
    import asyncio

    e2b_key = os.getenv("E2B_API_KEY", "")
    if not e2b_key:
        return {"error": "E2B_API_KEY not configured. Enable Code Interpreter in settings.", "success": False}

    def _run_sync() -> dict:
        try:
            from e2b_code_interpreter import Sandbox  # type: ignore
        except ImportError:
            return {"error": "e2b-code-interpreter package not installed on agent-api.", "success": False}

        try:
            with Sandbox(api_key=e2b_key, timeout=30) as sbx:
                if packages and language == "python":
                    pkg_list = " ".join(packages)
                    install = sbx.commands.run(f"pip install {pkg_list} -q", timeout=60)
                    if install.exit_code != 0:
                        return {"error": f"pip install failed: {install.stderr}", "success": False}

                execution = sbx.run_code(code, language=language)

                results_text = "\n".join(
                    str(r.text) for r in (execution.results or []) if getattr(r, "text", None)
                )
                stdout = getattr(execution, "logs", {})
                stdout_text = "\n".join(getattr(stdout, "stdout", []) or [])

                if execution.error:
                    return {
                        "success": False,
                        "error": execution.error.value,
                        "traceback": execution.error.traceback,
                        "stdout": stdout_text,
                    }
                return {
                    "success": True,
                    "output": results_text or stdout_text,
                    "stdout": stdout_text,
                }
        except Exception as exc:
            return {"error": str(exc), "success": False}

    return await asyncio.get_event_loop().run_in_executor(None, _run_sync)


# ---------------------------------------------------------------------------
# Hermes vendor path setup
# ---------------------------------------------------------------------------

# Try to find local vendor directory, otherwise use installed package
_HERMES_PATH = None
try:
    _HERMES_PATH = Path(__file__).resolve().parents[4] / "vendor" / "hermes-agent"
except IndexError:
    # In Railway/deployment, vendor directory doesn't exist
    # Hermes is installed via pip from GitHub
    pass

_hermes_imported = False


def _ensure_hermes_path() -> None:
    """Add vendor/hermes-agent to sys.path once so its modules are importable."""
    global _hermes_imported
    if _hermes_imported:
        return

    # Only add local vendor path if it exists (for local development)
    hermes_str = "pip_installed"
    if _HERMES_PATH and _HERMES_PATH.exists():
        hermes_str = str(_HERMES_PATH)
        if hermes_str not in sys.path:
            sys.path.insert(0, hermes_str)

    # Hermes expects HERMES_HOME to exist for state.db, skills, etc.
    hermes_home = Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes"))
    hermes_home.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HERMES_HOME", str(hermes_home))

    # Register AgenticOS connector tools into Hermes's tool registry
    from app.adapters.connector_tools import register_connector_tools
    register_connector_tools()

    # Register HyperFrames video rendering tools (direct HTTP calls to Railway service)
    try:
        from app.adapters.hyperframes_tools import register_hyperframes_tools
        register_hyperframes_tools()
    except Exception as exc:
        logger.warning("Could not register HyperFrames tools: %s", exc)

    # Register web search providers (normally loaded by Hermes CLI, but needed in SaaS)
    try:
        from plugins.web.tavily.provider import TavilyWebSearchProvider
        from agent.web_search_registry import register_provider as _register_web_provider
        _register_web_provider(TavilyWebSearchProvider())
        logger.info("Registered Tavily web search provider")
    except Exception as exc:
        logger.warning("Could not register Tavily web search provider: %s", exc)

    # Force-register web_search under the 'web' toolset.
    # In Hermes's built-in registry web_search is owned by the 'browser' toolset.
    # Disabling browser (_ALWAYS_OFF) removes web_search even though the 'web'
    # toolset claims it.  We re-register a Tavily-backed web_search under 'web'
    # so the tool survives the browser disable.
    try:
        from tools.registry import registry
        from toolsets import TOOLSETS
        from tools.web_tools import web_search_tool  # Hermes built-in handler

        if "web_search" not in registry._tools:
            registry.register(
                name="web_search",
                toolset="web",
                schema={
                    "name": "web_search",
                    "description": "Search the web for up-to-date information. Use for research, news, and factual queries.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search query"}
                        },
                        "required": ["query"]
                    }
                },
                handler=web_search_tool,
                emoji="🔍",
                description="Search the web via Tavily",
            )
            # Also ensure 'web' toolset lists web_search
            if "web" in TOOLSETS and "web_search" not in TOOLSETS["web"].get("tools", []):
                TOOLSETS["web"].setdefault("tools", []).append("web_search")
            logger.info("Re-registered web_search under 'web' toolset (Tavily backend)")
        else:
            # Tool exists — ensure it's bound to 'web' not 'browser'
            entry = registry._tools.get("web_search")
            if entry and getattr(entry, "toolset", None) == "browser":
                entry.toolset = "web"
                if "web" in TOOLSETS and "web_search" not in TOOLSETS["web"].get("tools", []):
                    TOOLSETS["web"].setdefault("tools", []).append("web_search")
                logger.info("Re-bound web_search from 'browser' to 'web' toolset")
    except Exception as exc:
        logger.warning("Could not re-register web_search under web toolset: %s", exc)

    _hermes_imported = True
    logger.info("Hermes vendor path added: %s (connector tools registered)", hermes_str)


# ---------------------------------------------------------------------------
# Run result collector
# ---------------------------------------------------------------------------

@dataclass
class HermesRunResult:
    """Collects output from one Hermes conversation turn."""

    message: str = ""
    tool_events: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    token_deltas: list[str] = field(default_factory=list)
    reasoning_steps: list[str] = field(default_factory=list)
    completed: bool = False
    raw_response: Any = None
    fallback_message: str | None = None


# ---------------------------------------------------------------------------
# Bridge
# ---------------------------------------------------------------------------

class HermesBridge:
    """Thin wrapper that runs one Hermes conversation turn and returns structured output."""

    def __init__(self) -> None:
        self._available: bool | None = None

    @property
    def available(self) -> bool:
        if self._available is None:
            # Check if Hermes is available either via local vendor or pip installation
            if _HERMES_PATH:
                self._available = _HERMES_PATH.exists() and (_HERMES_PATH / "run_agent.py").exists()
            else:
                # In Railway/deployment, check if Hermes can be imported
                # Hermes pyproject.toml defines py-modules: ["run_agent", "model_tools", ...]
                for import_name in ["run_agent", "model_tools", "toolsets"]:
                    try:
                        __import__(import_name)
                        self._available = True
                        return self._available
                    except ImportError:
                        continue
                self._available = False
        return self._available

    def describe(self) -> dict:
        return {
            "available": self.available,
            "repo_path": str(_HERMES_PATH) if _HERMES_PATH else "pip_installed",
            "status": "bridge_ready" if self.available else "vendor_missing",
        }

    async def run(
        self,
        *,
        mode: str,
        message: str,
        run_id: str,
        workspace_id: str,
        user_id: str,
        thread_id: str | None = None,
        memory_context: str = "",
        model: str | None = None,
        provider: str | None = None,
        conversation_history: list[dict] | None = None,
        user_tool_settings: dict | None = None,
        event_callback: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> RunResponse:
        """Execute one Hermes conversation turn and return a structured response."""

        if not self.available:
            return RunResponse(
                status="failed",
                message="Hermes vendor directory not found. Cannot run agent.",
            )

        _ensure_hermes_path()

        kwargs, api_keys_to_inject = build_hermes_kwargs(
            mode=mode,
            message=message,
            run_id=run_id,
            workspace_id=workspace_id,
            user_id=user_id,
            thread_id=thread_id,
            memory_context=memory_context,
            model_override=model,
            provider=provider,
            user_tool_settings=user_tool_settings,
        )
        logger.info(
            "Hermes enabled toolsets: %s (user extras: %s)",
            kwargs.get("enabled_toolsets"),
            list((user_tool_settings or {}).get("enabled_toolsets", [])),
        )

        # ── Skills + context sync: Supabase → filesystem ────────────────────
        # Write the user's saved skills and context files to a per-workspace
        # HERMES_HOME so Hermes skill tools and context loading work.
        skills_data: list[dict] = (user_tool_settings or {}).get("skills", [])
        memory_blocks: list[dict] = (user_tool_settings or {}).get("memory_blocks", [])
        # MCP servers: filter user's enabled_toolsets to only mcp_* entries
        # These map directly to MCP_SERVERS_CATALOG keys in hermes_profile.py
        enabled_toolsets: list[str] = (user_tool_settings or {}).get("enabled_toolsets", [])
        enabled_mcp_servers: list[str] = [t for t in enabled_toolsets if t.startswith("mcp_")]
        hermes_home = write_skills_to_fs(workspace_id, skills_data)
        write_context_files(
            workspace_id,
            memory_blocks=memory_blocks or None,
            enabled_mcp_servers=enabled_mcp_servers or None,
        )
        api_keys_to_inject["HERMES_HOME"] = str(hermes_home)
        logger.info(
            "HERMES_HOME=%s (%d skills, %d memory blocks, %d MCP servers synced)",
            hermes_home, len(skills_data), len(memory_blocks), len(enabled_mcp_servers)
        )
        if event_callback:
            event_callback("skills.synced", {
                "hermes_home": str(hermes_home),
                "skills_count": len(skills_data),
                "memory_blocks_count": len(memory_blocks),
                "mcp_servers_count": len(enabled_mcp_servers),
                "skill_names": [skill.get("name") for skill in skills_data if skill.get("name")],
            })

        # Capture Tavily key now — api_keys_to_inject is cleaned up after thread.join
        # so bridge-level fallback calls need the key captured before the thread runs.
        _tavily_key: str | None = api_keys_to_inject.get("TAVILY_API_KEY") or os.getenv("TAVILY_API_KEY")

        # Snapshot before the run so we can detect agent-created/edited skills
        skills_before = snapshot_skills(workspace_id)

        result = HermesRunResult()

        # Callbacks to capture tool events and streaming tokens.
        # Hermes passes extra positional args (tool_name, tool_args, ...) so we use *args.
        def on_tool_start(*args: Any, **kw: Any) -> None:
            # Hermes calls: tool_start_callback(tc.id, function_name, function_args)
            # args[0] = tool call ID (tc.id)
            # args[1] = function name  e.g. "gmail_send"
            # args[2] = function args dict
            tool_name = str(args[1]) if len(args) > 1 else kw.get("tool_name", "unknown")
            tool_input = args[2] if len(args) > 2 and isinstance(args[2], dict) else kw.get("input", {})
            if not isinstance(tool_input, dict):
                tool_input = {"raw": str(tool_input)}
            # Record in reasoning log
            args_preview = ", ".join(f"{k}={repr(v)[:60]}" for k, v in list(tool_input.items())[:3])
            result.reasoning_steps.append(f"→ calling {tool_name}({args_preview})")
            result.tool_events.append({
                "tool_name": tool_name,
                "tool_category": kw.get("toolset", "unknown"),
                "input": tool_input,
                "output": {},
                "status": "running",
                "requires_approval": False,
            })
            if event_callback:
                event_callback("tool.started", {
                    "tool_name": tool_name,
                    "tool_category": kw.get("toolset", "unknown"),
                    "input": tool_input,
                    "output": {},
                    "status": "running",
                    "requires_approval": False,
                })

        def on_tool_complete(*args: Any, **kw: Any) -> None:
            # Hermes calls: tool_complete_callback(tc.id, name, args_dict, function_result)
            # args[0] = tool call ID (tc.id)
            # args[1] = function name  e.g. "gmail_send"
            # args[2] = function args dict (the INPUT, not the output)
            # args[3] = function_result string (the actual JSON output)
            tool_name = str(args[1]) if len(args) > 1 else kw.get("tool_name", "unknown")
            tool_input = args[2] if len(args) > 2 and isinstance(args[2], dict) else {}
            tool_output = args[3] if len(args) > 3 else kw.get("output", {})

            # Parse connector tool markers
            parsed_output = tool_output
            if isinstance(tool_output, str):
                try:
                    parsed_output = json.loads(tool_output)
                except (json.JSONDecodeError, TypeError):
                    parsed_output = {"result": str(tool_output)[:2000]}

            is_connector = isinstance(parsed_output, dict) and parsed_output.get("__agenticos_connector__")
            needs_approval = is_connector and parsed_output.get("requires_approval")
            pending_execution = is_connector and parsed_output.get("status") == "pending_execution"
            output_val = parsed_output if isinstance(parsed_output, dict) else {"result": str(tool_output)[:2000]}
            error_text = str(output_val.get("error", "")) if isinstance(output_val, dict) else ""
            is_config_error = (
                "Unsupported state or unable to authenticate data" in error_text
                or "Request URL is missing an 'http://' or 'https://' protocol" in error_text
                or "Google access token could not be decrypted" in error_text
                or "Google account is not connected" in error_text
            )

            # Record completion in reasoning log
            if needs_approval:
                status_label = "⏸ awaiting approval"
            elif pending_execution:
                status_label = "⏳ pending execution"
            else:
                status_label = "✓ done"
            result.reasoning_steps.append(f"  {tool_name}: {status_label}")

            # Update the last matching running tool event
            completed_status = "failed" if error_text else "completed"
            for event in reversed(result.tool_events):
                if event["tool_name"] == tool_name and event["status"] == "running":
                    # Preserve pending_execution status for connector tools that need execution
                    if error_text:
                        event["status"] = "failed"
                        completed_status = "failed"
                    elif pending_execution:
                        event["status"] = "pending_execution"
                        completed_status = "pending_execution"
                    elif needs_approval:
                        event["status"] = "requires_approval"
                        completed_status = "requires_approval"
                    else:
                        event["status"] = "completed"
                        completed_status = "completed"
                    event["requires_approval"] = bool(needs_approval)
                    event["output"] = output_val
                    break
            else:
                # on_tool_start was missed — insert a synthetic completed event
                if error_text:
                    event_status = "failed"
                elif pending_execution:
                    event_status = "pending_execution"
                elif needs_approval:
                    event_status = "requires_approval"
                else:
                    event_status = "completed"
                completed_status = event_status
                result.tool_events.append({
                    "tool_name": tool_name,
                    "tool_category": kw.get("toolset", "unknown"),
                    "input": tool_input,
                    "output": output_val,
                    "status": event_status,
                    "requires_approval": bool(needs_approval),
                })
            if event_callback:
                event_callback("tool.completed", {
                    "tool_name": tool_name,
                    "tool_category": kw.get("toolset", "unknown"),
                    "input": tool_input,
                    "output": output_val,
                    "status": completed_status,
                    "requires_approval": bool(needs_approval),
                })

            if needs_approval:
                raise _ApprovalRequiredInterrupt(tool_name)
            if is_config_error:
                raise _ToolConfigurationInterrupt(tool_name, error_text)

        def on_stream_delta(*args: Any, **kw: Any) -> None:
            delta = args[0] if args else kw.get("delta", "")
            if delta is not None:
                result.token_deltas.append(str(delta))
                if event_callback:
                    event_callback("message.delta", {"delta": str(delta)})

        kwargs["tool_start_callback"] = on_tool_start
        kwargs["tool_complete_callback"] = on_tool_complete
        kwargs["stream_delta_callback"] = on_stream_delta

        # Run Hermes in a thread to avoid blocking the async event loop
        exception_holder: list[Exception] = []
        used_model: str = kwargs.get("model", "unknown")

        def _run_hermes() -> None:
            # Inject per-user env vars and create AIAgent atomically under a
            # process-wide lock so concurrent runs never cross-contaminate
            # HERMES_HOME or each user's API keys.
            _saved_env: dict[str, str | None] = {}
            agent = None
            try:
                # Set thread-local connector context so tool handlers can execute
                # inline (synchronous HTTP calls to the web API) without returning
                # pending_execution markers that Hermes cannot resolve.
                from app.adapters.connector_tools import set_connector_context
                set_connector_context(workspace_id, user_id or "", _WEB_API_URL)
                logger.debug("Connector context set: workspace=%s url=%s", workspace_id, _WEB_API_URL)

                with _hermes_init_lock:
                    for env_var, env_val in api_keys_to_inject.items():
                        if env_var and env_val:
                            _saved_env[env_var] = os.environ.get(env_var)
                            os.environ[env_var] = str(env_val)
                            logger.debug("Injected user key: %s (workspace=%s)", env_var, workspace_id)

                    from run_agent import AIAgent
                    agent = AIAgent(**kwargs)
                    logger.debug("AIAgent created for workspace=%s (HERMES_HOME=%s)", workspace_id, os.environ.get("HERMES_HOME"))
                # Lock released — AIAgent has captured HERMES_HOME internally.
                # run_conversation proceeds in parallel with other users' runs.

                response = agent.run_conversation(
                    message,
                    conversation_history=conversation_history or []
                )
                result.raw_response = response

                result.message = _coerce_hermes_message(response)

                result.completed = True
            except _ApprovalRequiredInterrupt as exc:
                logger.info("Hermes paused for approval-required tool: %s", exc.tool_name)
                result.message = (
                    result.message
                    or "I prepared an action that needs your approval before it can run."
                )
                result.completed = True
            except Exception as exc:
                logger.exception("Hermes run failed")
                exception_holder.append(exc)
                result.error = str(exc)
            finally:
                with _hermes_init_lock:
                    for env_var, original_val in _saved_env.items():
                        if original_val is None:
                            os.environ.pop(env_var, None)
                        else:
                            os.environ[env_var] = original_val
                    logger.debug("Restored env for workspace=%s", workspace_id)

        thread = threading.Thread(target=_run_hermes, daemon=True)
        thread.start()
        run_timeout = _env_float("HERMES_RUN_TIMEOUT_SECONDS", 120.0)
        thread.join(timeout=run_timeout)

        if not result.completed and not result.error:
            result.error = f"Hermes run timed out after {run_timeout:g} seconds."

        # If Hermes failed but we got streaming deltas, use those
        if result.error and result.token_deltas:
            result.message = "".join([d for d in result.token_deltas if d is not None])

        # ── LLM fallback retry logic ───────────────────────────────────────────────
        # If the run failed with a rate limit or provider error, retry with next model
        if result.error and used_model in LLM_FALLBACK_MODELS:
            error_lower = result.error.lower()
            is_rate_limit = any(x in error_lower for x in ["429", "rate limit", "quota", "too many requests"])
            is_provider_error = any(x in error_lower for x in ["500", "502", "503", "504", "timeout", "unavailable"])

            if is_rate_limit or is_provider_error:
                current_idx = LLM_FALLBACK_MODELS.index(used_model)
                if current_idx + 1 < len(LLM_FALLBACK_MODELS):
                    fallback_model = LLM_FALLBACK_MODELS[current_idx + 1]
                    logger.warning(
                        "LLM %s failed (%s), retrying with fallback: %s",
                        used_model,
                        result.error,
                        fallback_model
                    )
                    kwargs["model"] = fallback_model
                    used_model = fallback_model
                    result = HermesRunResult()  # Reset result for retry
                    exception_holder.clear()
                    result.fallback_message = f"Switched to {fallback_model} due to rate limit on {used_model}."

                    # Retry with fallback model
                    thread = threading.Thread(target=_run_hermes, daemon=True)
                    thread.start()
                    thread.join(timeout=run_timeout)

                    if not result.completed and not result.error:
                        result.error = f"Hermes run timed out after {run_timeout:g} seconds (fallback model: {fallback_model})."

                    if result.error and result.token_deltas:
                        result.message = "".join([d for d in result.token_deltas if d is not None])

        bridge_sources: list[Source] = []
        bridge_runtime: dict[str, Any] = {}

        text_tool_request = _parse_text_tool_request(result.message)
        if text_tool_request and not result.tool_events:
            tool_name = str(text_tool_request.get("tool") or "")
            tool_args = text_tool_request.get("arguments") or {}

            if tool_name == "web_search":
                query = str(tool_args.get("query") or message)
                answer, bridge_sources, search_error = await search_tavily(query, api_key=_tavily_key)
                research_context = "\n".join(
                    f"{index + 1}. {source.title}: {source.content} ({source.url})"
                    for index, source in enumerate(bridge_sources[:5])
                )
                llm_answer, llm_error = await generate_with_openrouter(
                    mode=mode,
                    message=message,
                    model=model,
                    research_context="\n\n".join(
                        part for part in [answer, research_context] if part
                    ),
                )

                result.message = llm_answer or answer or (
                    "I tried to search the web, but the search/generation layer did not return an answer."
                )
                result.tool_events.append({
                    "tool_name": "web_search",
                    "tool_category": "web_search",
                    "input": {"query": query, "source": "hermes_text_tool_request"},
                    "output": {
                        "answer": answer,
                        "sources": [source.model_dump() for source in bridge_sources],
                        "search_error": search_error,
                        "generation_error": llm_error,
                    },
                    "status": "failed" if search_error and not answer else "completed",
                    "requires_approval": False,
                })
                bridge_runtime["text_tool_fallback"] = {
                    "tool": tool_name,
                    "reason": "Hermes model emitted a tool request as plain text.",
                }

        if not bridge_sources and not result.tool_events and _should_auto_search(message, result.message):
            answer, bridge_sources, search_error = await search_tavily(message, api_key=_tavily_key)
            research_context = "\n".join(
                f"{index + 1}. {source.title}: {source.content} ({source.url})"
                for index, source in enumerate(bridge_sources[:5])
            )
            llm_answer, llm_error = await generate_with_openrouter(
                mode=mode,
                message=message,
                model=model,
                research_context="\n\n".join(part for part in [answer, research_context] if part),
            )

            result.message = llm_answer or answer or result.message
            result.tool_events.append({
                "tool_name": "tavily_search",
                "tool_category": "web_search",
                "input": {"query": message, "source": "agenticos_auto_search"},
                "output": {
                    "answer": answer,
                    "sources": [source.model_dump() for source in bridge_sources],
                    "search_error": search_error,
                    "generation_error": llm_error,
                },
                "status": "failed" if search_error and not answer else "completed",
                "requires_approval": False,
            })
            bridge_runtime["auto_search"] = {
                "reason": "Hermes completed without tool use for a current-information request.",
            }

        # ── Connector action execution ─────────────────────────────────────────
        # Execute connector tool actions that Hermes emitted as markers
        for event in result.tool_events:
            if event.get("status") == "pending_execution" and event.get("output", {}).get("__agenticos_connector__"):
                action = event["output"].get("action")
                try:
                    if action == "gmail_search":
                        query = event["output"].get("query")
                        if query:
                            gmail_result = await _call_web_gmail_search(query, workspace_id, user_id)
                            event["output"] = gmail_result
                            logger.info("Executed gmail_search: %s", query)
                    elif action == "gmail_read":
                        message_id = event["output"].get("message_id")
                        if message_id:
                            gmail_result = await _call_web_gmail_read(message_id, workspace_id, user_id)
                            event["output"] = gmail_result
                            logger.info("Executed gmail_read: %s", message_id)
                    elif action == "google_docs_read":
                        document_id = event["output"].get("document_id")
                        if document_id:
                            docs_result = await _call_web_google_docs_read(document_id, workspace_id, user_id)
                            event["output"] = docs_result
                            logger.info("Executed google_docs_read: %s", document_id)
                    elif action == "google_sheets_read":
                        spreadsheet_id = event["output"].get("spreadsheet_id")
                        range_val = event["output"].get("range")
                        if spreadsheet_id:
                            sheets_result = await _call_web_google_sheets_read(spreadsheet_id, range_val, workspace_id, user_id)
                            event["output"] = sheets_result
                            logger.info("Executed google_sheets_read: %s", spreadsheet_id)
                    elif action == "google_sheets_create":
                        title = event["output"].get("title") or (event["output"].get("draft") or {}).get("title")
                        if title:
                            sheets_result = await _call_web_google_sheets_create(title, workspace_id, user_id)
                            event["output"] = sheets_result
                            logger.info("Executed google_sheets_create: %s", title)
                    elif action == "google_sheets_list":
                        sheets_result = await _call_web_google_sheets_list(workspace_id, user_id)
                        event["output"] = sheets_result
                        logger.info("Executed google_sheets_list")
                    elif action == "google_sheets_append":
                        # Support both top-level keys (new format) and draft dict (legacy)
                        draft = event["output"].get("draft") or {}
                        spreadsheet_id = event["output"].get("spreadsheet_id") or draft.get("spreadsheet_id")
                        sheet_name = event["output"].get("sheet_name") or draft.get("sheet_name")
                        rows = event["output"].get("rows") or draft.get("rows", [])
                        if spreadsheet_id and rows:
                            sheets_result = await _call_web_google_sheets_append(spreadsheet_id, sheet_name or "Sheet1", rows, workspace_id, user_id)
                            event["output"] = sheets_result
                            logger.info("Executed google_sheets_append: %s", spreadsheet_id)
                    elif action == "google_sheets_write":
                        spreadsheet_id = event["output"].get("spreadsheet_id")
                        range_val = event["output"].get("range")
                        values = event["output"].get("values", [])
                        if spreadsheet_id and range_val and values:
                            sheets_result = await _call_web_google_sheets_write(spreadsheet_id, range_val, values, workspace_id, user_id)
                            event["output"] = sheets_result
                            logger.info("Executed google_sheets_write: %s", spreadsheet_id)
                    elif action == "google_docs_write":
                        title = event["output"].get("title")
                        content = event["output"].get("content")
                        document_id = event["output"].get("document_id")
                        if title and content:
                            docs_result = await _call_web_google_docs_write(title, content, document_id, workspace_id, user_id)
                            event["output"] = docs_result
                            logger.info("Executed google_docs_write: %s", title)
                    # Memory block operations
                    elif action == "memory_block_read":
                        label = event["output"].get("label")
                        if label:
                            memory_result = await _call_web_memory_block_read(label, workspace_id, user_id)
                            event["output"] = memory_result
                            logger.info("Executed memory_block_read: %s", label)
                    elif action == "memory_block_write":
                        draft = event["output"].get("draft", {})
                        label = draft.get("label")
                        description = draft.get("description")
                        value = draft.get("value")
                        char_limit = draft.get("char_limit")
                        if label and description and value:
                            memory_result = await _call_web_memory_block_write(label, description, value, char_limit, workspace_id, user_id)
                            event["output"] = memory_result
                            logger.info("Executed memory_block_write: %s", label)
                    elif action == "memory_block_list":
                        memory_result = await _call_web_memory_block_list(workspace_id, user_id)
                        event["output"] = memory_result
                        logger.info("Executed memory_block_list")
                    elif action == "memory_block_delete":
                        label = event["output"].get("label")
                        if label:
                            memory_result = await _call_web_memory_block_delete(label, workspace_id, user_id)
                            event["output"] = memory_result
                            logger.info("Executed memory_block_delete: %s", label)
                    # Gmail label operations
                    elif action == "gmail_list_labels":
                        labels_result = await _call_web_gmail_list_labels(workspace_id, user_id)
                        event["output"] = labels_result
                        logger.info("Executed gmail_list_labels")
                    elif action == "gmail_create_label":
                        label_name = event["output"].get("label_name")
                        if label_name:
                            label_result = await _call_web_gmail_create_label(label_name, workspace_id, user_id)
                            event["output"] = label_result
                            logger.info("Executed gmail_create_label: %s", label_name)
                    elif action == "gmail_add_label":
                        message_id = event["output"].get("message_id")
                        label_ids = event["output"].get("label_ids", [])
                        if message_id:
                            label_result = await _call_web_gmail_add_label(message_id, label_ids, workspace_id, user_id)
                            event["output"] = label_result
                            logger.info("Executed gmail_add_label: msg=%s labels=%s", message_id, label_ids)
                    elif action == "gmail_remove_label":
                        message_id = event["output"].get("message_id")
                        label_ids = event["output"].get("label_ids", [])
                        if message_id:
                            label_result = await _call_web_gmail_remove_label(message_id, label_ids, workspace_id, user_id)
                            event["output"] = label_result
                            logger.info("Executed gmail_remove_label: msg=%s labels=%s", message_id, label_ids)
                    # Gmail draft operations
                    elif action == "gmail_create_draft":
                        draft = event["output"].get("draft", {})
                        to = draft.get("to", "")
                        subject = draft.get("subject", "")
                        body_text = draft.get("body", "")
                        cc = draft.get("cc")
                        bcc = draft.get("bcc")
                        if to and subject:
                            draft_result = await _call_web_gmail_create_draft(to, subject, body_text, cc, bcc, workspace_id, user_id)
                            event["output"] = draft_result
                            logger.info("Executed gmail_create_draft to=%s subject=%s", to, subject)
                    elif action == "gmail_delete_draft":
                        draft_id = event["output"].get("draft_id")
                        if draft_id:
                            draft_result = await _call_web_gmail_delete_draft(draft_id, workspace_id, user_id)
                            event["output"] = draft_result
                            logger.info("Executed gmail_delete_draft: %s", draft_id)
                    # Google Docs list/search/markdown
                    elif action == "google_docs_list":
                        docs_result = await _call_web_google_docs_list(workspace_id, user_id)
                        event["output"] = docs_result
                        logger.info("Executed google_docs_list")
                    elif action == "google_docs_search":
                        query = event["output"].get("query", "")
                        docs_result = await _call_web_google_docs_search(query, workspace_id, user_id)
                        event["output"] = docs_result
                        logger.info("Executed google_docs_search: %s", query)
                    elif action == "google_docs_markdown":
                        document_id = event["output"].get("document_id")
                        if document_id:
                            docs_result = await _call_web_google_docs_markdown(document_id, workspace_id, user_id)
                            event["output"] = docs_result
                            logger.info("Executed google_docs_markdown: %s", document_id)
                    elif action == "google_docs_find_replace":
                        document_id = event["output"].get("document_id")
                        find_text = event["output"].get("find_text")
                        replace_text = event["output"].get("replace_text")
                        if document_id and find_text is not None and replace_text is not None:
                            docs_result = await _call_web_google_docs_find_replace(document_id, find_text, replace_text, workspace_id, user_id)
                            event["output"] = docs_result
                            logger.info("Executed google_docs_find_replace: %s", document_id)
                    # Code interpreter (E2B sandbox — safe cloud execution)
                    elif action == "code_run":
                        language = event["output"].get("language", "python")
                        code = event["output"].get("code", "")
                        packages = event["output"].get("packages", [])
                        if code:
                            code_result = await _execute_code_run(language, code, packages)
                            event["output"] = code_result
                            logger.info("Executed code_run: language=%s packages=%s success=%s", language, packages, code_result.get("success"))
                    # Write actions (gmail_send, gmail_reply, gmail_forward) require approval and are
                    # handled via the approval flow, not executed here. Docs/Sheets write auto-execute.
                except Exception as e:
                    logger.error("Connector action %s failed: %s", action, e)
                    event["status"] = "failed"
                    event["output"] = {"error": str(e)}

        # ── Skills sync: filesystem → Supabase ──────────────────────────────
        # Detect any skills the agent created or edited during this run.
        new_skills = read_new_skills(workspace_id, skills_before)
        if new_skills:
            logger.info("Agent created/edited %d skill(s): %s",
                        len(new_skills), [s["name"] for s in new_skills])

        # Build structured response
        tool_events = [
            ToolEvent(
                tool_name=evt["tool_name"],
                tool_category=evt["tool_category"],
                input=evt["input"],
                output=evt["output"],
                status=evt["status"],
                requires_approval=evt.get("requires_approval", False),
            )
            for evt in result.tool_events
        ]

        if result.error and not result.message:
            return RunResponse(
                status="failed",
                message=f"Agent run failed: {result.error}",
                tool_events=tool_events,
                new_skills=new_skills,
                reasoning_log=result.reasoning_steps,
                runtime={"hermes": self.describe(), "error": result.error},
            )

        # Check if any connector tool needs approval
        approval_event = next(
            (evt for evt in result.tool_events if evt.get("requires_approval")),
            None,
        )
        if approval_event:
            draft = (approval_event.get("output") or {}).get("draft", {})
            # Ensure draft has required fields for email approval
            if draft and not draft.get("to") and not draft.get("subject") and not draft.get("body"):
                # If draft is empty, try to get from input
                draft = approval_event.get("input", {})
            return RunResponse(
                status="requires_approval",
                message=result.message or "The agent prepared an action that requires your approval.",
                sources=bridge_sources,
                tool_events=tool_events,
                approval_payload=draft,
                new_skills=new_skills,
                reasoning_log=result.reasoning_steps,
                runtime={"hermes": self.describe(), "model": model, **bridge_runtime},
                fallback_message=result.fallback_message,
            )

        return RunResponse(
            status="completed",
            message=result.message or "The agent completed without a text response.",
            sources=bridge_sources,
            tool_events=tool_events,
            new_skills=new_skills,
            reasoning_log=result.reasoning_steps,
            runtime={"hermes": self.describe(), "model": model, **bridge_runtime},
            fallback_message=result.fallback_message,
        )


def _coerce_hermes_message(response: Any) -> str:
    """Extract user-facing text from Hermes' current response shapes."""

    if isinstance(response, str):
        return response

    if isinstance(response, dict):
        for key in ("content", "message", "final_response", "response"):
            value = response.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return str(response)

    return str(response) if response else ""


def _parse_text_tool_request(message: str) -> dict[str, Any] | None:
    """Detect models that print a tool call as JSON instead of using tool_calls."""

    text = (message or "").strip()
    if not text:
        return None

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1).strip() if fenced else text

    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None

    tool = payload.get("tool") or payload.get("name")
    action = payload.get("action")
    arguments = payload.get("arguments") or payload.get("args") or {}

    if action == "search" and isinstance(payload.get("query"), str):
        return {"tool": "web_search", "arguments": {"query": payload["query"]}}

    if tool == "web_search" and isinstance(arguments, dict):
        return {"tool": tool, "arguments": arguments}

    return None


def _should_auto_search(user_message: str, assistant_message: str) -> bool:
    text = f"{user_message}\n{assistant_message}".lower()
    current_markers = (
        "weather",
        "current",
        "today",
        "latest",
        "now",
        "news",
        "check",
        "search",
        "look up",
    )
    refusal_markers = (
        "not able to directly access",
        "can't access live",
        "cannot access live",
        "up-to-date",
    )

    return any(marker in text for marker in current_markers) or any(
        marker in text for marker in refusal_markers
    )
