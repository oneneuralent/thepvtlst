FORBIDDEN_PUBLIC_TOOLS = {
    "terminal",
    "shell",
    "raw_code_execution",
    "unrestricted_filesystem",
    "unknown_mcp_server",
    "unapproved_browser_automation",
}

APPROVAL_REQUIRED = {
    "send_email",
    "delete_email",
    "schedule_event",
    "invite_user",
    "post_social",
    "edit_external_document",
    "delete_external_document",
    "send_message",
    "make_purchase",
    "publish_content",
}


def build_tool_policy(mode: str) -> dict:
    if mode == "ask":
        allowed = {"chat", "memory_read", "attached_file_summary"}
    elif mode == "create":
        allowed = {
            "chat",
            "memory_read",
            "web_search",
            "read_uploaded_file",
            "generate_document",
            "save_library",
            "create_canvas_card",
        }
    else:
        allowed = {
            "chat",
            "memory_read",
            "web_search",
            "read_uploaded_file",
            "save_library",
            "create_canvas_card",
            "connected_app_read",
            "connected_app_write_draft",
        }

    return {
        "allowed_tools": sorted(allowed),
        "forbidden_tools": sorted(FORBIDDEN_PUBLIC_TOOLS),
        "approval_required": sorted(APPROVAL_REQUIRED),
    }
