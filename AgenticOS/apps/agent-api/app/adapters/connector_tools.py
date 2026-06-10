"""AgenticOS connector tools registered into Hermes's tool registry.

Instead of regex-parsing email intents outside Hermes, we register real
tool schemas so Hermes can CHOOSE to call gmail_search, gmail_read,
gmail_send etc. through its native tool loop.

The handlers return structured results back to Hermes. For write actions
(gmail_send, calendar_create), the handler returns an approval-required
marker that the bridge picks up.
"""

import json
import logging
import threading
import httpx
from typing import Any

logger = logging.getLogger(__name__)

# ── Thread-local connector context ───────────────────────────────────────────
# Set by hermes_bridge.py inside _run_hermes before starting the AIAgent.
# Connector tool handlers read this to make synchronous web API calls inline,
# so Hermes gets real results during its conversation loop (not pending markers).
_ctx = threading.local()


def set_connector_context(workspace_id: str, user_id: str, web_api_url: str) -> None:
    """Set per-thread connector context. Call this inside the Hermes worker thread."""
    _ctx.workspace_id = workspace_id
    _ctx.user_id = user_id
    _ctx.web_api_url = web_api_url


def _web_get(path: str, params: dict | None = None) -> str:
    """Synchronous GET to the web API. Returns JSON string."""
    workspace_id = getattr(_ctx, "workspace_id", None)
    user_id = getattr(_ctx, "user_id", None)
    web_api_url = getattr(_ctx, "web_api_url", None)
    if not workspace_id or not web_api_url:
        return json.dumps({"error": "Connector context not initialized"})
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(
                f"{web_api_url}{path}",
                params=params,
                headers={"x-workspace-id": workspace_id, "x-user-id": user_id or ""},
            )
            if resp.is_success:
                return json.dumps(resp.json())
            return json.dumps({"error": f"HTTP {resp.status_code}: {resp.text[:300]}"})
    except Exception as exc:
        logger.error("Connector GET %s failed: %s", path, exc)
        return json.dumps({"error": str(exc)})


def _web_post(path: str, body: dict | None = None) -> str:
    """Synchronous POST to the web API. Returns JSON string."""
    workspace_id = getattr(_ctx, "workspace_id", None)
    user_id = getattr(_ctx, "user_id", None)
    web_api_url = getattr(_ctx, "web_api_url", None)
    if not workspace_id or not web_api_url:
        return json.dumps({"error": "Connector context not initialized"})
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{web_api_url}{path}",
                json=body or {},
                headers={"x-workspace-id": workspace_id, "x-user-id": user_id or ""},
            )
            if resp.is_success:
                return json.dumps(resp.json())
            return json.dumps({"error": f"HTTP {resp.status_code}: {resp.text[:300]}"})
    except Exception as exc:
        logger.error("Connector POST %s failed: %s", path, exc)
        return json.dumps({"error": str(exc)})


def _web_delete(path: str, params: dict | None = None) -> str:
    """Synchronous DELETE to the web API. Returns JSON string."""
    workspace_id = getattr(_ctx, "workspace_id", None)
    user_id = getattr(_ctx, "user_id", None)
    web_api_url = getattr(_ctx, "web_api_url", None)
    if not workspace_id or not web_api_url:
        return json.dumps({"error": "Connector context not initialized"})
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.delete(
                f"{web_api_url}{path}",
                params=params,
                headers={"x-workspace-id": workspace_id, "x-user-id": user_id or ""},
            )
            if resp.is_success:
                return json.dumps(resp.json())
            return json.dumps({"error": f"HTTP {resp.status_code}: {resp.text[:300]}"})
    except Exception as exc:
        logger.error("Connector DELETE %s failed: %s", path, exc)
        return json.dumps({"error": str(exc)})

# Toolset name for all AgenticOS connector tools
CONNECTOR_TOOLSET = "agenticos_connectors"

# ── Schemas ──────────────────────────────────────────────────────────

GMAIL_SEARCH_SCHEMA = {
    "name": "gmail_search",
    "description": (
        "Search the user's Gmail inbox. Returns subject, from, date, and snippet "
        "for up to 10 matching messages. The user must have connected their Google "
        "account first. Use Gmail search operators like from:, to:, subject:, "
        "newer_than:, older_than:, has:attachment, etc."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Gmail search query (e.g. 'from:boss@company.com newer_than:7d')"
            }
        },
        "required": ["query"]
    }
}

GMAIL_READ_SCHEMA = {
    "name": "gmail_read",
    "description": (
        "Read a specific Gmail message by its ID. Returns the full message body, "
        "headers, and metadata. Use gmail_search first to find message IDs."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "message_id": {
                "type": "string",
                "description": "The Gmail message ID (obtained from gmail_search results)"
            }
        },
        "required": ["message_id"]
    }
}

GMAIL_SEND_SCHEMA = {
    "name": "gmail_send",
    "description": (
        "Compose and send an email through the user's connected Gmail account. "
        "This action REQUIRES explicit user approval before sending. Compose a "
        "professional email with proper greeting, body, and sign-off. The system "
        "will pause and show the draft to the user for approval."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "to": {
                "type": "string",
                "description": "Recipient email address"
            },
            "subject": {
                "type": "string",
                "description": "Email subject line"
            },
            "body": {
                "type": "string",
                "description": "Full email body text. Write a complete, professional email."
            }
        },
        "required": ["to", "subject", "body"]
    }
}

GMAIL_CREATE_DRAFT_SCHEMA = {
    "name": "gmail_create_draft",
    "description": (
        "Create a Gmail email draft without sending. Use this when you want to "
        "prepare an email for the user to review and send later. Supports to/cc/bcc, "
        "subject, and body. The draft will be saved in the user's Gmail drafts folder."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "to": {
                "type": "string",
                "description": "Recipient email address"
            },
            "subject": {
                "type": "string",
                "description": "Email subject line"
            },
            "body": {
                "type": "string",
                "description": "Full email body text"
            },
            "cc": {
                "type": "string",
                "description": "Optional: CC recipient email address"
            },
            "bcc": {
                "type": "string",
                "description": "Optional: BCC recipient email address"
            }
        },
        "required": ["to", "subject", "body"]
    }
}

GMAIL_DELETE_DRAFT_SCHEMA = {
    "name": "gmail_delete_draft",
    "description": (
        "Permanently delete a Gmail draft by its ID. Use this to remove drafts "
        "that are no longer needed. The draft must exist and the user must have "
        "permission to delete it."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "draft_id": {
                "type": "string",
                "description": "The Gmail draft ID (obtained from gmail_search or gmail_list_drafts)"
            }
        },
        "required": ["draft_id"]
    }
}

GMAIL_ADD_LABEL_SCHEMA = {
    "name": "gmail_add_label",
    "description": (
        "Add one or more labels to a Gmail message. Use this to organize emails "
        "by category (e.g., 'Work', 'Personal', 'Urgent'). Ensure the label "
        "exists or create it first using gmail_create_label."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "message_id": {
                "type": "string",
                "description": "The Gmail message ID"
            },
            "label_ids": {
                "type": "array",
                "description": "List of label IDs or names to add (e.g., ['IMPORTANT', 'WORK'])",
                "items": {
                    "type": "string"
                }
            }
        },
        "required": ["message_id", "label_ids"]
    }
}

GMAIL_REMOVE_LABEL_SCHEMA = {
    "name": "gmail_remove_label",
    "description": (
        "Remove one or more labels from a Gmail message. Use this to reorganize "
        "emails or remove category labels that are no longer relevant."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "message_id": {
                "type": "string",
                "description": "The Gmail message ID"
            },
            "label_ids": {
                "type": "array",
                "description": "List of label IDs or names to remove",
                "items": {
                    "type": "string"
                }
            }
        },
        "required": ["message_id", "label_ids"]
    }
}

GMAIL_CREATE_LABEL_SCHEMA = {
    "name": "gmail_create_label",
    "description": (
        "Create a new Gmail label for organizing emails. Label names must be unique. "
        "Use this to set up custom categories like 'Projects', 'Invoices', etc."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "label_name": {
                "type": "string",
                "description": "The name for the new label"
            }
        },
        "required": ["label_name"]
    }
}

GMAIL_LIST_LABELS_SCHEMA = {
    "name": "gmail_list_labels",
    "description": (
        "List all Gmail labels in the user's account. Returns label names and IDs. "
        "Use this to discover available labels before adding/removing them from messages."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

GMAIL_REPLY_SCHEMA = {
    "name": "gmail_reply",
    "description": (
        "Reply to an existing Gmail message. This action REQUIRES explicit user "
        "approval before sending. The reply will be threaded with the original message. "
        "Provide the message ID and your reply text."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "message_id": {
                "type": "string",
                "description": "The Gmail message ID to reply to"
            },
            "body": {
                "type": "string",
                "description": "Reply body text"
            }
        },
        "required": ["message_id", "body"]
    }
}

GMAIL_FORWARD_SCHEMA = {
    "name": "gmail_forward",
    "description": (
        "Forward an existing Gmail message to another recipient. This action REQUIRES "
        "explicit user approval before sending. The forwarded message will include "
        "the original content."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "message_id": {
                "type": "string",
                "description": "The Gmail message ID to forward"
            },
            "to": {
                "type": "string",
                "description": "Recipient email address to forward to"
            },
            "body": {
                "type": "string",
                "description": "Optional: Additional message to include with the forward"
            }
        },
        "required": ["message_id", "to"]
    }
}

GOOGLE_DOCS_READ_SCHEMA = {
    "name": "google_docs_read",
    "description": (
        "Read the content of a Google Docs document by its ID. Returns the document "
        "title and body text. The user must have connected their Google account first. "
        "Use this to reference existing documents when the user asks about their content."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "document_id": {
                "type": "string",
                "description": "The Google Docs document ID (from the URL: docs.google.com/document/d/DOCUMENT_ID/edit)"
            }
        },
        "required": ["document_id"]
    }
}

GOOGLE_DOCS_WRITE_SCHEMA = {
    "name": "google_docs_write",
    "description": (
        "Create or update a Google Docs document. This action REQUIRES explicit user "
        "approval before writing. Provide a title and document body. The system will "
        "pause and show the draft to the user for approval."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Document title"
            },
            "content": {
                "type": "string",
                "description": "Document body content (markdown or plain text)"
            },
            "document_id": {
                "type": "string",
                "description": "Optional: existing document ID to update instead of creating new"
            }
        },
        "required": ["title", "content"]
    }
}

GOOGLE_SHEETS_READ_SCHEMA = {
    "name": "google_sheets_read",
    "description": (
        "Read data from a Google Sheets spreadsheet by its ID. Returns the sheet "
        "name and cell data in a structured format. The user must have connected "
        "their Google account first."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "spreadsheet_id": {
                "type": "string",
                "description": "The Google Sheets spreadsheet ID (from the URL: docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit)"
            },
            "range": {
                "type": "string",
                "description": "Optional: A1 notation range (e.g., 'Sheet1!A1:C10'). Defaults to first sheet."
            }
        },
        "required": ["spreadsheet_id"]
    }
}

GOOGLE_SHEETS_WRITE_SCHEMA = {
    "name": "google_sheets_write",
    "description": (
        "Write data to a Google Sheets spreadsheet. This action REQUIRES explicit user "
        "approval before writing. Provide the spreadsheet ID, range, and values. "
        "The system will pause and show the draft to the user for approval."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "spreadsheet_id": {
                "type": "string",
                "description": "The Google Sheets spreadsheet ID"
            },
            "range": {
                "type": "string",
                "description": "A1 notation range (e.g., 'Sheet1!A1:C10')"
            },
            "values": {
                "type": "array",
                "description": "2D array of values to write (e.g., [['Name', 'Age'], ['Alice', 30]])",
                "items": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            }
        },
        "required": ["spreadsheet_id", "range", "values"]
    }
}

GOOGLE_DOCS_SEARCH_SCHEMA = {
    "name": "google_docs_search",
    "description": (
        "Search for Google Docs documents by name or content. Returns a list of matching "
        "documents with their IDs and titles. Use this to find documents before reading them."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query for document name or content"
            }
        },
        "required": ["query"]
    }
}

GOOGLE_DOCS_LIST_SCHEMA = {
    "name": "google_docs_list",
    "description": (
        "List all Google Docs documents in the user's Drive. Returns document IDs, "
        "titles, and last modified dates. Use this to browse available documents."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

GOOGLE_DOCS_MARKDOWN_SCHEMA = {
    "name": "google_docs_markdown",
    "description": (
        "Export a Google Docs document as Markdown format. Returns the document content "
        "as structured markdown text. Useful for converting docs to markdown for "
        "further processing or storage."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "document_id": {
                "type": "string",
                "description": "The Google Docs document ID"
            }
        },
        "required": ["document_id"]
    }
}

GOOGLE_DOCS_FIND_REPLACE_SCHEMA = {
    "name": "google_docs_find_replace",
    "description": (
        "Find and replace text in a Google Docs document. This action REQUIRES explicit "
        "user approval before writing. Provide the document ID, text to find, and "
        "replacement text."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "document_id": {
                "type": "string",
                "description": "The Google Docs document ID"
            },
            "find_text": {
                "type": "string",
                "description": "Text to find in the document"
            },
            "replace_text": {
                "type": "string",
                "description": "Text to replace with"
            }
        },
        "required": ["document_id", "find_text", "replace_text"]
    }
}

GOOGLE_SHEETS_LIST_SCHEMA = {
    "name": "google_sheets_list",
    "description": (
        "List all Google Sheets spreadsheets in the user's Drive. Returns spreadsheet "
        "IDs, titles, and last modified dates. Use this to browse available spreadsheets."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

GOOGLE_SHEETS_CREATE_SCHEMA = {
    "name": "google_sheets_create",
    "description": (
        "Create a new Google Sheets spreadsheet. This action REQUIRES explicit user "
        "approval before creating. Provide a title for the new spreadsheet."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Title for the new spreadsheet"
            }
        },
        "required": ["title"]
    }
}

GOOGLE_SHEETS_APPEND_SCHEMA = {
    "name": "google_sheets_append",
    "description": (
        "Append rows of data to a Google Sheets spreadsheet. This action REQUIRES explicit "
        "user approval before writing. Provide the spreadsheet ID, sheet name, and data rows."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "spreadsheet_id": {
                "type": "string",
                "description": "The Google Sheets spreadsheet ID"
            },
            "sheet_name": {
                "type": "string",
                "description": "Name of the sheet to append to (e.g., 'Sheet1')"
            },
            "rows": {
                "type": "array",
                "description": "Array of rows to append (e.g., [['Alice', 30], ['Bob', 25]])",
                "items": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            }
        },
        "required": ["spreadsheet_id", "sheet_name", "rows"]
    }
}

# ── Memory Block Schemas (Letta-style) ───────────────────────────────────────

MEMORY_BLOCK_READ_SCHEMA = {
    "name": "memory_block_read",
    "description": (
        "Read a memory block by its label. Memory blocks are in-context storage for "
        "important information like user preferences, agent persona, or current objectives. "
        "Returns the block's label, description, and current value."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "description": "The memory block label (e.g., 'user_preferences', 'agent_persona')"
            }
        },
        "required": ["label"]
    }
}

MEMORY_BLOCK_WRITE_SCHEMA = {
    "name": "memory_block_write",
    "description": (
        "Create or update a memory block. Use this to store important information that "
        "should persist in the agent's context. If the block doesn't exist, it will be created. "
        "If it exists, it will be updated. Common labels: user_preferences, agent_persona, "
        "current_objectives, project_context."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "description": "The memory block label (must be unique per workspace)"
            },
            "description": {
                "type": "string",
                "description": "Description of what this block stores"
            },
            "value": {
                "type": "string",
                "description": "The content to store in this memory block"
            },
            "char_limit": {
                "type": "integer",
                "description": "Optional: Maximum character limit for this block (default: 2000)"
            }
        },
        "required": ["label", "description", "value"]
    }
}

MEMORY_BLOCK_LIST_SCHEMA = {
    "name": "memory_block_list",
    "description": (
        "List all memory blocks for the current workspace. Returns labels, descriptions, "
        "values, and character limits for all blocks. Use this to see what memory is "
        "currently stored."
    ),
    "parameters": {
        "type": "object",
        "properties": {},
        "required": []
    }
}

MEMORY_BLOCK_DELETE_SCHEMA = {
    "name": "memory_block_delete",
    "description": (
        "Delete a memory block by its label. Use this to remove outdated or irrelevant "
        "memory blocks. This action cannot be undone."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "label": {
                "type": "string",
                "description": "The memory block label to delete"
            }
        },
        "required": ["label"]
    }
}

# ── Library Schemas ─────────────────────────────────────────────────────

LIBRARY_LIST_SCHEMA = {
    "name": "library_list",
    "description": (
        "List items from the user's library. Returns saved responses, web results, "
        "documents, email drafts, and other artifacts. Use this to reference previous "
        "work, research findings, or saved content. Supports filtering by type."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "description": "Optional: Filter by type (e.g., 'response', 'web_result', 'document', 'email'). If not provided, returns all items."
            }
        },
        "required": []
    }
}

LIBRARY_SAVE_SCHEMA = {
    "name": "library_save",
    "description": (
        "Save an item to the user's library. Use this to store important research findings, "
        "responses, documents, or any content that should be preserved for future reference. "
        "Each item includes a title, content, type, and optional metadata."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "description": "The type of item (e.g., 'response', 'web_result', 'document', 'email', 'note')"
            },
            "title": {
                "type": "string",
                "description": "A descriptive title for the item"
            },
            "content": {
                "type": "string",
                "description": "The main content to save"
            },
            "metadata": {
                "type": "object",
                "description": "Optional: Additional metadata (e.g., URL, source, tags)"
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional: Tags for categorization"
            }
        },
        "required": ["type", "title", "content"]
    }
}

# ── Handlers ─────────────────────────────────────────────────────────
# These are called by Hermes's tool executor during the conversation loop.
# They don't execute external actions directly — they return structured
# results that the HermesBridge picks up.
#
# For read operations: the bridge will call the real API before returning.
# For write operations: the handler returns an approval marker.

def handle_gmail_search(args: dict, **kwargs: Any) -> str:
    """Handle gmail_search tool call from Hermes — executes inline."""
    return _web_post("/api/email", {"query": args.get("query", "newer_than:7d")})


def handle_gmail_read(args: dict, **kwargs: Any) -> str:
    """Handle gmail_read tool call from Hermes — executes inline."""
    message_id = args.get("message_id", "")
    return _web_get(f"/api/email/{message_id}")


def handle_gmail_send(args: dict, **kwargs: Any) -> str:
    """Handle gmail_send tool call from Hermes.

    Returns an approval-required marker. The bridge will create the
    approval record and pause execution.
    """
    return json.dumps({
        "__agenticos_connector__": True,
        "action": "gmail_send",
        "requires_approval": True,
        "draft": {
            "to": args.get("to", ""),
            "subject": args.get("subject", ""),
            "body": args.get("body", "")
        },
        "status": "requires_approval"
    })


def handle_gmail_create_draft(args: dict, **kwargs: Any) -> str:
    """Handle gmail_create_draft tool call from Hermes — executes inline."""
    return _web_post("/api/email/manage-draft", {
        "action": "create",
        "to": args.get("to", ""),
        "subject": args.get("subject", ""),
        "body": args.get("body", ""),
        "cc": args.get("cc"),
        "bcc": args.get("bcc"),
    })


def handle_gmail_delete_draft(args: dict, **kwargs: Any) -> str:
    """Handle gmail_delete_draft tool call from Hermes — executes inline."""
    return _web_post("/api/email/manage-draft", {"action": "delete", "draft_id": args.get("draft_id", "")})


def handle_gmail_add_label(args: dict, **kwargs: Any) -> str:
    """Handle gmail_add_label tool call from Hermes — executes inline."""
    return _web_post("/api/email/labels", {
        "action": "add",
        "message_id": args.get("message_id", ""),
        "label_ids": args.get("label_ids", []),
    })


def handle_gmail_remove_label(args: dict, **kwargs: Any) -> str:
    """Handle gmail_remove_label tool call from Hermes — executes inline."""
    return _web_post("/api/email/labels", {
        "action": "remove",
        "message_id": args.get("message_id", ""),
        "label_ids": args.get("label_ids", []),
    })


def handle_gmail_create_label(args: dict, **kwargs: Any) -> str:
    """Handle gmail_create_label tool call from Hermes — executes inline."""
    return _web_post("/api/email/labels", {"action": "create", "label_name": args.get("label_name", "")})


def handle_gmail_list_labels(args: dict, **kwargs: Any) -> str:
    """Handle gmail_list_labels tool call from Hermes — executes inline."""
    return _web_get("/api/email/labels")


def handle_gmail_reply(args: dict, **kwargs: Any) -> str:
    """Handle gmail_reply tool call from Hermes.

    Returns an approval-required marker. The bridge will create the
    approval record and pause execution.
    """
    return json.dumps({
        "__agenticos_connector__": True,
        "action": "gmail_reply",
        "requires_approval": True,
        "draft": {
            "message_id": args.get("message_id", ""),
            "body": args.get("body", "")
        },
        "status": "requires_approval"
    })


def handle_gmail_forward(args: dict, **kwargs: Any) -> str:
    """Handle gmail_forward tool call from Hermes.

    Returns an approval-required marker. The bridge will create the
    approval record and pause execution.
    """
    return json.dumps({
        "__agenticos_connector__": True,
        "action": "gmail_forward",
        "requires_approval": True,
        "draft": {
            "message_id": args.get("message_id", ""),
            "to": args.get("to", ""),
            "body": args.get("body")
        },
        "status": "requires_approval"
    })


def handle_google_docs_read(args: dict, **kwargs: Any) -> str:
    """Handle google_docs_read tool call from Hermes — executes inline."""
    return _web_post("/api/google/docs/read", {"document_id": args.get("document_id", "")})


def handle_google_docs_write(args: dict, **kwargs: Any) -> str:
    """Handle google_docs_write tool call from Hermes — executes inline."""
    body = {"title": args.get("title", ""), "content": args.get("content", "")}
    if args.get("document_id"):
        body["document_id"] = args["document_id"]
    return _web_post("/api/google/docs/write", body)


def handle_google_sheets_read(args: dict, **kwargs: Any) -> str:
    """Handle google_sheets_read tool call from Hermes — executes inline."""
    return _web_post("/api/google/sheets/read", {
        "spreadsheet_id": args.get("spreadsheet_id", ""),
        "range": args.get("range", ""),
    })


def handle_google_sheets_write(args: dict, **kwargs: Any) -> str:
    """Handle google_sheets_write tool call from Hermes — executes inline."""
    return _web_post("/api/google/sheets/write", {
        "spreadsheet_id": args.get("spreadsheet_id", ""),
        "range": args.get("range", ""),
        "values": args.get("values", []),
    })


def handle_google_docs_search(args: dict, **kwargs: Any) -> str:
    """Handle google_docs_search tool call from Hermes — executes inline."""
    return _web_post("/api/google/docs/search", {"query": args.get("query", "")})


def handle_google_docs_list(args: dict, **kwargs: Any) -> str:
    """Handle google_docs_list tool call from Hermes — executes inline."""
    return _web_get("/api/google/docs/list")


def handle_google_docs_markdown(args: dict, **kwargs: Any) -> str:
    """Handle google_docs_markdown tool call from Hermes — executes inline."""
    return _web_post("/api/google/docs/markdown", {"document_id": args.get("document_id", "")})


def handle_google_docs_find_replace(args: dict, **kwargs: Any) -> str:
    """Handle google_docs_find_replace tool call from Hermes — executes inline."""
    return _web_post("/api/google/docs/find_replace", {
        "document_id": args.get("document_id", ""),
        "find_text": args.get("find_text", ""),
        "replace_text": args.get("replace_text", ""),
    })


def handle_google_sheets_list(args: dict, **kwargs: Any) -> str:
    """Handle google_sheets_list tool call from Hermes — executes inline."""
    return _web_get("/api/google/sheets/list")


def handle_google_sheets_create(args: dict, **kwargs: Any) -> str:
    """Handle google_sheets_create tool call from Hermes — executes inline."""
    return _web_post("/api/google/sheets/create", {"title": args.get("title", "Untitled Spreadsheet")})


def handle_google_sheets_append(args: dict, **kwargs: Any) -> str:
    """Handle google_sheets_append tool call from Hermes — executes inline."""
    return _web_post("/api/google/sheets/append", {
        "spreadsheet_id": args.get("spreadsheet_id", ""),
        "sheet_name": args.get("sheet_name", "Sheet1"),
        "rows": args.get("rows", []),
    })


def handle_memory_block_read(args: dict, **kwargs: Any) -> str:
    """Handle memory_block_read tool call from Hermes — executes inline."""
    return _web_get("/api/memory/blocks", {"label": args.get("label", "")})


def handle_memory_block_write(args: dict, **kwargs: Any) -> str:
    """Handle memory_block_write tool call from Hermes — executes inline."""
    body = {
        "label": args.get("label", ""),
        "description": args.get("description", ""),
        "value": args.get("value", ""),
    }
    if args.get("char_limit") is not None:
        body["char_limit"] = args["char_limit"]
    return _web_post("/api/memory/blocks", body)


def handle_memory_block_list(args: dict, **kwargs: Any) -> str:
    """Handle memory_block_list tool call from Hermes — executes inline."""
    return _web_get("/api/memory/blocks")


def handle_memory_block_delete(args: dict, **kwargs: Any) -> str:
    """Handle memory_block_delete tool call from Hermes — executes inline."""
    return _web_delete("/api/memory/blocks", {"label": args.get("label", "")})


def handle_library_list(args: dict, **kwargs: Any) -> str:
    """Handle library_list tool call from Hermes — executes inline."""
    params = {}
    if args.get("type"):
        params["type"] = args["type"]
    return _web_get("/api/library", params)


def handle_library_save(args: dict, **kwargs: Any) -> str:
    """Handle library_save tool call from Hermes — executes inline."""
    body = {
        "type": args.get("type", ""),
        "title": args.get("title", ""),
        "content": args.get("content", ""),
    }
    if args.get("metadata"):
        body["metadata"] = args["metadata"]
    if args.get("tags"):
        body["tags"] = args["tags"]
    return _web_post("/api/library/save", body)


def _check_connectors_available() -> bool:
    """Check if connector tools should be available."""
    # Always available — the actual Google connection check happens at execution time
    return True


# ── Code Interpreter (E2B sandbox) ───────────────────────────────────

CODE_INTERPRETER_TOOLSET = "code_interpreter"

CODE_RUN_SCHEMA = {
    "name": "code_run",
    "description": (
        "Execute Python or JavaScript code in a secure, isolated cloud sandbox (E2B). "
        "Returns stdout, result values, and any errors. "
        "Use for: data analysis, CSV/JSON processing, calculations, transformations, "
        "chart data generation, API testing, and any computation the user needs. "
        "You can install pip packages on-the-fly. Each execution is isolated — no access "
        "to Railway host or other users."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "language": {
                "type": "string",
                "enum": ["python", "javascript"],
                "description": "Programming language to use"
            },
            "code": {
                "type": "string",
                "description": "Code to execute. For Python, use print() to surface results."
            },
            "packages": {
                "type": "array",
                "items": {"type": "string"},
                "description": "pip packages to install before running (Python only, e.g. ['pandas', 'matplotlib'])"
            }
        },
        "required": ["language", "code"]
    }
}


def handle_code_run(args: dict, **kwargs: Any) -> str:
    """Handle code_run tool call — returns pending_execution marker for bridge."""
    return json.dumps({
        "__agenticos_connector__": True,
        "action": "code_run",
        "language": args.get("language", "python"),
        "code": args.get("code", ""),
        "packages": args.get("packages", []),
        "status": "pending_execution"
    })


# ── Registration ─────────────────────────────────────────────────────

def register_connector_tools() -> None:
    """Register AgenticOS connector tools into Hermes's tool registry.

    Called once by the HermesBridge before creating an AIAgent instance.
    """
    try:
        from tools.registry import registry, discover_builtin_tools
        from toolsets import TOOLSETS
    except ImportError as e:
        logger.warning("Cannot import Hermes tool registry — connector tools not registered: %s", e)
        return

    logger.info("Starting connector tools registration...")

    # Ensure Hermes tool discovery has run
    if not registry._tools:
        logger.info("Registry empty, running discover_builtin_tools()...")
        discover_builtin_tools()
        logger.info("Discovery complete. Tools: %d", len(registry._tools))

    # Register the toolset in Hermes's TOOLSETS dict so it can be enabled
    if CONNECTOR_TOOLSET not in TOOLSETS:
        TOOLSETS[CONNECTOR_TOOLSET] = {
            "description": "AgenticOS connected app tools (Gmail, Docs, Sheets, Calendar, Drive, Memory, Library)",
            "tools": [
                "gmail_search", "gmail_read", "gmail_send",
                "gmail_create_draft", "gmail_delete_draft",
                "gmail_add_label", "gmail_remove_label", "gmail_create_label", "gmail_list_labels",
                "gmail_reply", "gmail_forward",
                "google_docs_read", "google_docs_write",
                "google_docs_search", "google_docs_list", "google_docs_markdown", "google_docs_find_replace",
                "google_sheets_read", "google_sheets_write",
                "google_sheets_list", "google_sheets_create", "google_sheets_append",
                "memory_block_read", "memory_block_write", "memory_block_list", "memory_block_delete",
                "library_list", "library_save"
            ],
            "includes": []
        }
        logger.info("Added %s to TOOLSETS", CONNECTOR_TOOLSET)
    else:
        logger.info("%s already in TOOLSETS", CONNECTOR_TOOLSET)

    # Register each tool
    tools_to_register = [
        ("gmail_search", GMAIL_SEARCH_SCHEMA, handle_gmail_search, "📧", "Search Gmail inbox"),
        ("gmail_read", GMAIL_READ_SCHEMA, handle_gmail_read, "📨", "Read a Gmail message"),
        ("gmail_send", GMAIL_SEND_SCHEMA, handle_gmail_send, "✉️", "Send email via Gmail (approval required)"),
        ("gmail_create_draft", GMAIL_CREATE_DRAFT_SCHEMA, handle_gmail_create_draft, "📝", "Create Gmail draft"),
        ("gmail_delete_draft", GMAIL_DELETE_DRAFT_SCHEMA, handle_gmail_delete_draft, "🗑️", "Delete Gmail draft"),
        ("gmail_add_label", GMAIL_ADD_LABEL_SCHEMA, handle_gmail_add_label, "🏷️", "Add label to Gmail message"),
        ("gmail_remove_label", GMAIL_REMOVE_LABEL_SCHEMA, handle_gmail_remove_label, "❌", "Remove label from Gmail message"),
        ("gmail_create_label", GMAIL_CREATE_LABEL_SCHEMA, handle_gmail_create_label, "➕", "Create Gmail label"),
        ("gmail_list_labels", GMAIL_LIST_LABELS_SCHEMA, handle_gmail_list_labels, "📋", "List Gmail labels"),
        ("gmail_reply", GMAIL_REPLY_SCHEMA, handle_gmail_reply, "↩️", "Reply to Gmail message (approval required)"),
        ("gmail_forward", GMAIL_FORWARD_SCHEMA, handle_gmail_forward, "➡️", "Forward Gmail message (approval required)"),
        ("google_docs_read", GOOGLE_DOCS_READ_SCHEMA, handle_google_docs_read, "📄", "Read Google Docs document"),
        ("google_docs_write", GOOGLE_DOCS_WRITE_SCHEMA, handle_google_docs_write, "✍️", "Write Google Docs document (approval required)"),
        ("google_docs_search", GOOGLE_DOCS_SEARCH_SCHEMA, handle_google_docs_search, "🔍", "Search Google Docs"),
        ("google_docs_list", GOOGLE_DOCS_LIST_SCHEMA, handle_google_docs_list, "📚", "List Google Docs"),
        ("google_docs_markdown", GOOGLE_DOCS_MARKDOWN_SCHEMA, handle_google_docs_markdown, "📝", "Export Google Docs as Markdown"),
        ("google_docs_find_replace", GOOGLE_DOCS_FIND_REPLACE_SCHEMA, handle_google_docs_find_replace, "🔄", "Find/replace in Google Docs (approval required)"),
        ("google_sheets_read", GOOGLE_SHEETS_READ_SCHEMA, handle_google_sheets_read, "📊", "Read Google Sheets data"),
        ("google_sheets_write", GOOGLE_SHEETS_WRITE_SCHEMA, handle_google_sheets_write, "✏️", "Write Google Sheets data (approval required)"),
        ("google_sheets_list", GOOGLE_SHEETS_LIST_SCHEMA, handle_google_sheets_list, "📋", "List Google Sheets"),
        ("google_sheets_create", GOOGLE_SHEETS_CREATE_SCHEMA, handle_google_sheets_create, "➕", "Create Google Sheets (approval required)"),
        ("google_sheets_append", GOOGLE_SHEETS_APPEND_SCHEMA, handle_google_sheets_append, "📥", "Append to Google Sheets (approval required)"),
        ("memory_block_read", MEMORY_BLOCK_READ_SCHEMA, handle_memory_block_read, "🧠", "Read memory block"),
        ("memory_block_write", MEMORY_BLOCK_WRITE_SCHEMA, handle_memory_block_write, "✏️", "Write memory block"),
        ("memory_block_list", MEMORY_BLOCK_LIST_SCHEMA, handle_memory_block_list, "📋", "List memory blocks"),
        ("memory_block_delete", MEMORY_BLOCK_DELETE_SCHEMA, handle_memory_block_delete, "🗑️", "Delete memory block"),
        ("library_list", LIBRARY_LIST_SCHEMA, handle_library_list, "📚", "List library items"),
        ("library_save", LIBRARY_SAVE_SCHEMA, handle_library_save, "💾", "Save to library"),
    ]

    for name, schema, handler, emoji, desc in tools_to_register:
        try:
            registry.register(
                name=name,
                toolset=CONNECTOR_TOOLSET,
                schema=schema,
                handler=handler,
                check_fn=_check_connectors_available,
                emoji=emoji,
                description=desc,
            )
            logger.info("Registered tool: %s", name)
        except Exception as e:
            logger.error("Failed to register tool %s: %s", name, e)

    # Register code_interpreter toolset (E2B sandbox — safe cloud execution)
    if CODE_INTERPRETER_TOOLSET not in TOOLSETS:
        TOOLSETS[CODE_INTERPRETER_TOOLSET] = {
            "description": "Secure code execution in isolated cloud sandboxes via E2B",
            "tools": ["code_run"],
            "includes": []
        }
        logger.info("Added %s to TOOLSETS", CODE_INTERPRETER_TOOLSET)

    try:
        registry.register(
            name="code_run",
            toolset=CODE_INTERPRETER_TOOLSET,
            schema=CODE_RUN_SCHEMA,
            handler=handle_code_run,
            emoji="⚡",
            description="Execute Python/JS in isolated E2B sandbox",
        )
        logger.info("Registered tool: code_run")
    except Exception as e:
        logger.error("Failed to register tool code_run: %s", e)

    # Verify registration
    registered = list(registry._tools.keys())
    gmail_tools = [k for k in registered if "gmail" in k.lower()]
    logger.info("Registration complete. Total tools: %d, Gmail tools: %s", len(registered), gmail_tools)
