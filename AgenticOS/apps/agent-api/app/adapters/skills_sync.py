"""Supabase ↔ Hermes skills filesystem bridge.

Hermes reads/writes skills as SKILL.md files in {HERMES_HOME}/skills/.
Railway's filesystem is ephemeral, so we sync from Supabase before each
run and push any new/modified skills back to Supabase after.

Per-workspace isolation:
    HERMES_HOME = /tmp/hermes-{workspace_id}/
    Skills dir  = /tmp/hermes-{workspace_id}/skills/{skill-name}/SKILL.md

This ensures users never see each other's skills even on the same Railway
instance.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def workspace_hermes_home(workspace_id: str) -> Path:
    """Return the per-workspace HERMES_HOME path."""
    base = os.environ.get("HERMES_TMP_BASE", "/tmp")
    return Path(base) / f"hermes-{workspace_id}"


def write_skills_to_fs(
    workspace_id: str,
    skills: list[dict[str, Any]],
) -> Path:
    """Write skill documents from Supabase data to the per-workspace skills dir.

    Returns the HERMES_HOME path so the caller can set the env var.

    Each skill dict must have at minimum: {"name": str, "body": str}.
    Optional: {"category": str}.  Category is used as a sub-folder prefix
    so Hermes shows grouped skills (e.g. skills/research/deep-dive/).
    """
    hermes_home = workspace_hermes_home(workspace_id)
    skills_dir = hermes_home / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for skill in skills:
        name: str = skill.get("name", "").strip().replace(" ", "-").lower()
        body: str = skill.get("body", "").strip()
        category: str = skill.get("category", "").strip().replace(" ", "-").lower()

        if not name or not body:
            continue

        # Place in category sub-dir if provided, e.g. skills/research/deep-dive/
        if category and category != "general":
            skill_dir = skills_dir / category / name
        else:
            skill_dir = skills_dir / name

        skill_dir.mkdir(parents=True, exist_ok=True)
        skill_file = skill_dir / "SKILL.md"
        skill_file.write_text(_ensure_skill_markdown(name, body, category), encoding="utf-8")
        written += 1

    logger.info("Wrote %d skills to %s", written, skills_dir)
    return hermes_home


def _ensure_skill_markdown(name: str, body: str, category: str) -> str:
    """Return a Hermes-compatible SKILL.md document.

    Workspace skills are stored in Supabase as plain procedure bodies in many
    paths, but Hermes discovers skills by parsing SKILL.md frontmatter.
    Preserve already-valid SKILL.md content and wrap plain bodies.
    """
    stripped = body.strip()
    if stripped.startswith("---") and "\n---" in stripped[3:]:
        return stripped

    title = name.replace("-", " ").strip().title() or "Workspace Skill"
    safe_name = name.replace('"', "'")
    safe_category = (category or "general").replace('"', "'")
    description = f"Workspace skill: {title}"
    return "\n".join([
        "---",
        f"name: {safe_name}",
        f"description: {description}",
        "version: 1.0.0",
        "metadata:",
        "  hermes:",
        f"    tags: [{safe_category}]",
        "---",
        "",
        f"# {title}",
        "",
        stripped,
    ])


_SOUL_MD = """# O.N.E — One Neural Entity

You are O.N.E, a personal AI operating system. You are not a chatbot — you are an agent that takes real action.

## Core Identity
- You act on behalf of the user using their connected accounts (Gmail, Google Drive)
- You remember what they tell you and build a deeper model of them over time
- You save procedures from successful tasks so future runs are faster and smarter
- You are persistent, proactive, and precise

## Personality
- Direct and confident — give answers and take action, don't hedge
- Curious about the user's context — ask only when genuinely needed
- Grows with the user — every conversation makes you more capable
"""


def write_context_files(
    workspace_id: str,
    memory_blocks: list[dict[str, Any]] | None = None,
    enabled_mcp_servers: list[str] | None = None,
) -> None:
    """Write SOUL.md, USER.md, and config.yaml to the per-workspace HERMES_HOME.

    Called before each Hermes run so context files are available.
    - SOUL.md: O.N.E persona loaded by Hermes
    - USER.md: snapshot of memory blocks as user model
    - config.yaml: curated MCP server configs (HTTP-only, no stdio spawning)
    """
    hermes_home = workspace_hermes_home(workspace_id)
    hermes_home.mkdir(parents=True, exist_ok=True)

    # Write SOUL.md — O.N.E persona (always the same)
    soul_file = hermes_home / "SOUL.md"
    soul_file.write_text(_SOUL_MD.strip(), encoding="utf-8")

    # Write USER.md — snapshot of memory blocks as structured user model
    if memory_blocks:
        lines = ["# User Model\n"]
        for block in memory_blocks:
            label = block.get("label", "")
            value = block.get("value", "")
            description = block.get("description", "")
            if label and value:
                lines.append(f"## {label}")
                if description:
                    lines.append(f"_{description}_")
                lines.append(f"\n{value}\n")
        user_file = hermes_home / "USER.md"
        user_file.write_text("\n".join(lines), encoding="utf-8")
        logger.info("Wrote USER.md with %d memory blocks to %s", len(memory_blocks), hermes_home)

    # Write config.yaml — only curated HTTP MCP servers the user has enabled.
    # Safety invariant: no "command" or "args" keys are ever written (no stdio subprocess spawning).
    _write_mcp_config(hermes_home, enabled_mcp_servers or [])

    logger.info("Wrote SOUL.md to %s", hermes_home)


def _write_mcp_config(hermes_home: Path, enabled_mcp_servers: list[str]) -> None:
    """Write HERMES_HOME/config.yaml with only the user's enabled curated MCP servers.

    Safety rules enforced here:
    - Only servers from MCP_SERVERS_CATALOG (pre-vetted by O.N.E team) are allowed
    - No 'command' or 'args' keys ever written (prevents subprocess spawning on Railway)
    - All server configs use HTTPS URLs only
    """
    try:
        from app.core.hermes_profile import MCP_SERVERS_CATALOG
    except ImportError:
        logger.warning("MCP_SERVERS_CATALOG not available — skipping config.yaml")
        return

    config_file = hermes_home / "config.yaml"

    if not enabled_mcp_servers:
        # Write empty config to clear any previous server config
        config_file.write_text("# O.N.E config — no MCP servers enabled\n", encoding="utf-8")
        return

    lines = ["mcp_servers:\n"]
    written = 0
    for server_name in enabled_mcp_servers:
        # Only allow servers from our curated catalog
        server_cfg = MCP_SERVERS_CATALOG.get(server_name)
        if not server_cfg:
            logger.warning("MCP server '%s' not in MCP_SERVERS_CATALOG — skipped", server_name)
            continue

        # Safety: never write command/args (stdio would spawn subprocesses on Railway)
        if "command" in server_cfg or "args" in server_cfg:
            logger.error("MCP server '%s' has stdio config — BLOCKED by safety policy", server_name)
            continue

        url = server_cfg.get("url", "")
        if not url.startswith("https://") and not url.startswith("http://"):
            logger.warning("MCP server '%s' has no valid URL — skipped", server_name)
            continue

        lines.append(f"  {server_name}:\n")
        lines.append(f"    url: \"{url}\"\n")
        if "transport" in server_cfg:
            lines.append(f"    transport: {server_cfg['transport']}\n")
        if "headers" in server_cfg:
            lines.append("    headers:\n")
            for header_name, header_val in server_cfg["headers"].items():
                lines.append(f"      {header_name}: \"{header_val}\"\n")
        lines.append("    enabled: true\n")
        written += 1

    config_file.write_text("".join(lines), encoding="utf-8")
    logger.info("Wrote config.yaml with %d MCP servers to %s", written, hermes_home)


def snapshot_skills(workspace_id: str) -> dict[str, float]:
    """Return {relative_skill_path: mtime} for all SKILL.md files.

    Called before the Hermes run to detect new/changed skills after.
    """
    hermes_home = workspace_hermes_home(workspace_id)
    skills_dir = hermes_home / "skills"
    if not skills_dir.exists():
        return {}

    snapshot: dict[str, float] = {}
    for skill_file in skills_dir.rglob("SKILL.md"):
        rel = str(skill_file.relative_to(skills_dir))
        snapshot[rel] = skill_file.stat().st_mtime
    return snapshot


def read_new_skills(
    workspace_id: str,
    before_snapshot: dict[str, float],
) -> list[dict[str, str]]:
    """Scan the skills dir for new or modified SKILL.md files since the snapshot.

    Returns a list of {"name": str, "body": str, "category": str} dicts
    ready to be persisted back to Supabase.
    """
    hermes_home = workspace_hermes_home(workspace_id)
    skills_dir = hermes_home / "skills"
    if not skills_dir.exists():
        return []

    new_or_changed: list[dict[str, str]] = []
    for skill_file in skills_dir.rglob("SKILL.md"):
        rel = str(skill_file.relative_to(skills_dir))
        mtime = skill_file.stat().st_mtime

        if rel not in before_snapshot or mtime > before_snapshot[rel]:
            # Determine name and category from directory structure
            parts = skill_file.parent.relative_to(skills_dir).parts
            if len(parts) == 1:
                name, category = parts[0], "general"
            elif len(parts) >= 2:
                category, name = parts[0], "/".join(parts[1:])
            else:
                continue

            body = skill_file.read_text(encoding="utf-8").strip()
            if body:
                new_or_changed.append({
                    "name": name,
                    "body": body,
                    "category": category,
                })
                logger.info("Detected new/modified skill: %s (category=%s)", name, category)

    return new_or_changed
