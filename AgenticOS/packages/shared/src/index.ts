export type AgentMode = "fast" | "research" | "action";

export const forbiddenPublicTools = [
  "terminal",
  "shell",
  "raw_code_execution",
  "unrestricted_filesystem",
  "unknown_mcp_server",
  "unapproved_browser_automation"
] as const;

export const approvalRequiredActions = [
  "send_email",
  "delete_email",
  "schedule_event",
  "invite_user",
  "post_social",
  "edit_external_document",
  "delete_external_document",
  "send_message",
  "make_purchase",
  "publish_content"
] as const;
