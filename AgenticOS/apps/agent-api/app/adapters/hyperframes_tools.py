"""HyperFrames video rendering tools for AgenticOS / O.N.E.

Architecture note
-----------------
These tools make DIRECT synchronous HTTP calls to the user's HyperFrames
Railway service - they do NOT use the connector-marker pattern that Gmail/Docs
use.  The reason: HyperFrames is a multi-step workflow where each step depends
on the previous result (create → upload → lint → render → download URL).
Hermes needs the actual response from each step to reason before calling the
next.  Returning a "pending_execution" marker (like Gmail does) would leave
Hermes blind to intermediate results.

Flow for the agent:
  1. hyperframes_health()                              → check service is up
  2. hyperframes_create_project("my-video")           → create project slot
  3. hyperframes_upload_composition("my-video", html) → upload HTML
  4. hyperframes_lint("my-video")                     → validate structure
  5. hyperframes_render("my-video", quality="draft")  → render to MP4
  6. hyperframes_get_download_url("my-video")         → shareable link

Required env var (set in Railway agent-api service):
    HYPERFRAMES_RAILWAY_URL  e.g. https://railway-hyperframes-production.up.railway.app
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

HYPERFRAMES_TOOLSET = "hyperframes"


# ── Helper ────────────────────────────────────────────────────────────────────

def _get_railway_url() -> str:
    """Return the configured HyperFrames Railway base URL (trailing slash stripped)."""
    raw = os.getenv("HYPERFRAMES_RAILWAY_URL", "").strip().rstrip("/")
    if raw and not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    return raw


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return max(1.0, float(raw))
    except ValueError:
        logger.warning("Invalid %s=%r; using default %.1fs", name, raw, default)
        return default


# ── Schemas ───────────────────────────────────────────────────────────────────

HYPERFRAMES_HEALTH_SCHEMA = {
    "name": "hyperframes_health",
    "description": (
        "Check if the HyperFrames Railway rendering service is online. "
        "Call this first to verify the service is reachable before starting a project."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

HYPERFRAMES_CREATE_PROJECT_SCHEMA = {
    "name": "hyperframes_create_project",
    "description": (
        "Create a new HyperFrames video project on the Railway rendering service. "
        "Returns the project path. Use a unique lowercase name with hyphens, "
        "e.g. 'ai-typography-15s'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project_name": {
                "type": "string",
                "description": "Unique project identifier — lowercase, hyphens OK (e.g. 'ai-typography-video')"
            }
        },
        "required": ["project_name"]
    }
}

HYPERFRAMES_UPLOAD_COMPOSITION_SCHEMA = {
    "name": "hyperframes_upload_composition",
    "description": (
        "Upload a complete HTML composition to a HyperFrames project. "
        "The html_content must be a full HTML file that defines the video using "
        "HyperFrames data-* attributes: data-start, data-duration, data-track-index, etc. "
        "The root <div id='stage'> must carry data-composition-id matching the project name. "
        "Every timed element must have class='clip'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project_name": {
                "type": "string",
                "description": "Project name (must already exist via hyperframes_create_project)"
            },
            "html_content": {
                "type": "string",
                "description": "Full HTML composition content with HyperFrames data-* attributes"
            }
        },
        "required": ["project_name", "html_content"]
    }
}

HYPERFRAMES_LINT_SCHEMA = {
    "name": "hyperframes_lint",
    "description": (
        "Validate a HyperFrames HTML composition before rendering. "
        "Returns a list of errors and warnings. Fix all errors before calling "
        "hyperframes_render — rendering a broken composition wastes time."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project_name": {
                "type": "string",
                "description": "Project name to validate"
            }
        },
        "required": ["project_name"]
    }
}

HYPERFRAMES_RENDER_SCHEMA = {
    "name": "hyperframes_render",
    "description": (
        "Render a HyperFrames project to MP4 on the Railway service. "
        "Use quality='draft' for fast iteration (recommended: always use draft first). "
        "Rendering typically takes 20-60 seconds for a 15-second draft video. "
        "After this succeeds call hyperframes_get_download_url to get the share link."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project_name": {
                "type": "string",
                "description": "Project name to render"
            },
            "quality": {
                "type": "string",
                "description": "Render quality: 'draft' (fast), 'standard', or 'high' (slow). Default: draft",
                "enum": ["draft", "standard", "high"]
            },
            "width": {
                "type": "integer",
                "description": "Optional video width in pixels (default: 1920)"
            },
            "height": {
                "type": "integer",
                "description": "Optional video height in pixels (default: 1080)"
            },
            "fps": {
                "type": "integer",
                "description": "Optional frames per second (default: 30)"
            }
        },
        "required": ["project_name"]
    }
}

HYPERFRAMES_GET_DOWNLOAD_URL_SCHEMA = {
    "name": "hyperframes_get_download_url",
    "description": (
        "Get the direct MP4 download URL for a rendered HyperFrames video. "
        "Call this after hyperframes_render succeeds. "
        "Returns a URL the user can open directly in their browser to download the video."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "project_name": {
                "type": "string",
                "description": "Project name to get download URL for"
            }
        },
        "required": ["project_name"]
    }
}


# ── Handlers ──────────────────────────────────────────────────────────────────
# These make DIRECT synchronous httpx calls to the Railway service.
# Results are returned immediately as JSON strings so Hermes can reason about
# each step before proceeding to the next.

def handle_hyperframes_health(args: dict, **kwargs: Any) -> str:
    """Ping the HyperFrames Railway service health endpoint."""
    url = _get_railway_url()
    if not url:
        return json.dumps({
            "success": False,
            "error": (
                "HYPERFRAMES_RAILWAY_URL is not set. "
                "Please configure this environment variable in the Railway agent-api service "
                "to point to your HyperFrames rendering service."
            )
        })
    try:
        import httpx
        resp = httpx.get(f"{url}/health", timeout=10.0)
        resp.raise_for_status()
        return json.dumps({"success": True, "status": resp.json(), "service_url": url})
    except Exception as exc:
        return json.dumps({"success": False, "error": f"Health check failed: {exc}"})


def handle_hyperframes_create_project(args: dict, **kwargs: Any) -> str:
    """Create a new project slot on the Railway service."""
    url = _get_railway_url()
    project_name = (args.get("project_name") or "").strip().lower().replace(" ", "-")
    if not url:
        return json.dumps({"success": False, "error": "HYPERFRAMES_RAILWAY_URL not configured."})
    if not project_name:
        return json.dumps({"success": False, "error": "project_name is required."})
    try:
        import httpx
        # Server route: POST /api/project  body: { "name": "<project>" }
        resp = httpx.post(f"{url}/api/project", json={"name": project_name}, timeout=30.0)
        resp.raise_for_status()
        return json.dumps({"success": True, **resp.json()})
    except Exception as exc:
        return json.dumps({"success": False, "error": f"Create project failed: {exc}"})


def handle_hyperframes_upload_composition(args: dict, **kwargs: Any) -> str:
    """Upload an HTML composition as multipart form data."""
    url = _get_railway_url()
    project_name = (args.get("project_name") or "").strip()
    html_content = args.get("html_content") or ""
    if not url:
        return json.dumps({"success": False, "error": "HYPERFRAMES_RAILWAY_URL not configured."})
    if not project_name:
        return json.dumps({"success": False, "error": "project_name is required."})
    if not html_content:
        return json.dumps({"success": False, "error": "html_content is required."})
    try:
        import httpx
        # Server route: POST /api/composition/:project  multipart field name = 'html'
        resp = httpx.post(
            f"{url}/api/composition/{project_name}",
            files={"html": ("index.html", html_content.encode("utf-8"), "text/html")},
            timeout=30.0,
        )
        resp.raise_for_status()
        return json.dumps({"success": True, **resp.json()})
    except Exception as exc:
        return json.dumps({"success": False, "error": f"Upload composition failed: {exc}"})


def handle_hyperframes_lint(args: dict, **kwargs: Any) -> str:
    """Validate a composition's HTML structure."""
    url = _get_railway_url()
    project_name = (args.get("project_name") or "").strip()
    if not url:
        return json.dumps({"success": False, "error": "HYPERFRAMES_RAILWAY_URL not configured."})
    if not project_name:
        return json.dumps({"success": False, "error": "project_name is required."})
    try:
        import httpx
        # Server route: POST /api/lint/:project  (no body needed)
        resp = httpx.post(f"{url}/api/lint/{project_name}", timeout=30.0)
        resp.raise_for_status()
        return json.dumps({"success": True, **resp.json()})
    except Exception as exc:
        return json.dumps({"success": False, "error": f"Lint failed: {exc}"})


def handle_hyperframes_render(args: dict, **kwargs: Any) -> str:
    """Start rendering a project to MP4 on the Railway service."""
    url = _get_railway_url()
    project_name = (args.get("project_name") or "").strip()
    quality = (args.get("quality") or "draft").lower()
    if quality not in ("draft", "standard", "high"):
        quality = "draft"
    if not url:
        return json.dumps({"success": False, "error": "HYPERFRAMES_RAILWAY_URL not configured."})
    if not project_name:
        return json.dumps({"success": False, "error": "project_name is required."})

    payload: dict[str, Any] = {"project": project_name, "quality": quality}
    if args.get("width"):
        payload["width"] = int(args["width"])
    if args.get("height"):
        payload["height"] = int(args["height"])
    if args.get("fps"):
        payload["fps"] = int(args["fps"])

    # Keep the client timeout longer than the renderer service timeout
    # (draft: 120s, standard/high: 300s), otherwise the agent gives up first.
    default_timeout = 150.0 if quality == "draft" else 330.0
    render_timeout = _env_float("HYPERFRAMES_RENDER_TIMEOUT_SECONDS", default_timeout)
    try:
        import httpx
        # Server route: POST /api/render/:project  body: { "quality": "draft" } (project is in URL)
        render_payload = {"quality": payload["quality"]}
        if "width" in payload:
            render_payload["width"] = payload["width"]
        if "height" in payload:
            render_payload["height"] = payload["height"]
        if "fps" in payload:
            render_payload["fps"] = payload["fps"]
        resp = httpx.post(f"{url}/api/render/{project_name}", json=render_payload, timeout=render_timeout)
        resp.raise_for_status()
        data = resp.json()
        download_url = f"{url}/api/download/{project_name}"
        return json.dumps({"success": True, "download_url": download_url, **data})
    except Exception as exc:
        return json.dumps({"success": False, "error": f"Render failed: {exc}"})


def handle_hyperframes_get_download_url(args: dict, **kwargs: Any) -> str:
    """Return the direct download URL for a rendered video."""
    url = _get_railway_url()
    project_name = (args.get("project_name") or "").strip()
    if not url:
        return json.dumps({"success": False, "error": "HYPERFRAMES_RAILWAY_URL not configured."})
    if not project_name:
        return json.dumps({"success": False, "error": "project_name is required."})
    # Server route: GET /api/download/:project
    download_url = f"{url}/api/download/{project_name}"
    return json.dumps({
        "success": True,
        "download_url": download_url,
        "project": project_name,
        "message": f"Share this link with the user to download their video: {download_url}"
    })


def _check_hyperframes_available() -> bool:
    """Always return True so hyperframes tools appear in the LLM tool list.

    If HYPERFRAMES_RAILWAY_URL is not configured the individual handlers return
    a descriptive error message instead of being silently omitted from the
    tool selection.  This way the agent can tell the user what is missing rather
    than not attempting the task at all.
    """
    return True


# ── Registration ──────────────────────────────────────────────────────────────

def register_hyperframes_tools() -> None:
    """Register all HyperFrames tools into Hermes's tool registry.

    Called by HermesBridge._ensure_hermes_path() at startup, after the
    Hermes vendor path is on sys.path and connector tools are registered.
    """
    try:
        from tools.registry import registry
        from toolsets import TOOLSETS
    except ImportError as exc:
        logger.warning("Cannot import Hermes tool registry — HyperFrames tools not registered: %s", exc)
        return

    if HYPERFRAMES_TOOLSET not in TOOLSETS:
        TOOLSETS[HYPERFRAMES_TOOLSET] = {
            "description": (
                "HyperFrames video rendering via Railway cloud service. "
                "Create HTML compositions and render to MP4."
            ),
            "tools": [
                "hyperframes_health",
                "hyperframes_create_project",
                "hyperframes_upload_composition",
                "hyperframes_lint",
                "hyperframes_render",
                "hyperframes_get_download_url",
            ],
            "includes": []
        }
        logger.info("Registered TOOLSETS entry: %s", HYPERFRAMES_TOOLSET)

    tools_to_register = [
        ("hyperframes_health",             HYPERFRAMES_HEALTH_SCHEMA,             handle_hyperframes_health,             "🎬", "Check HyperFrames service health"),
        ("hyperframes_create_project",     HYPERFRAMES_CREATE_PROJECT_SCHEMA,     handle_hyperframes_create_project,     "📁", "Create a new HyperFrames video project"),
        ("hyperframes_upload_composition", HYPERFRAMES_UPLOAD_COMPOSITION_SCHEMA, handle_hyperframes_upload_composition, "📤", "Upload HTML composition to project"),
        ("hyperframes_lint",               HYPERFRAMES_LINT_SCHEMA,               handle_hyperframes_lint,               "✅", "Validate composition before rendering"),
        ("hyperframes_render",             HYPERFRAMES_RENDER_SCHEMA,             handle_hyperframes_render,             "🎥", "Render project to MP4 video"),
        ("hyperframes_get_download_url",   HYPERFRAMES_GET_DOWNLOAD_URL_SCHEMA,   handle_hyperframes_get_download_url,   "⬇️", "Get video download URL"),
    ]

    for name, schema, handler, emoji, desc in tools_to_register:
        try:
            registry.register(
                name=name,
                toolset=HYPERFRAMES_TOOLSET,
                schema=schema,
                handler=handler,
                check_fn=_check_hyperframes_available,
                emoji=emoji,
                description=desc,
            )
            logger.info("Registered HyperFrames tool: %s", name)
        except Exception as exc:
            logger.error("Failed to register HyperFrames tool %s: %s", name, exc)
