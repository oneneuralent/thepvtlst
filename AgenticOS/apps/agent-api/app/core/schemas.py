from pydantic import BaseModel, Field


class RunRequest(BaseModel):
    run_id: str | None = None
    workspace_id: str
    user_id: str
    thread_id: str | None = None
    mode: str = Field(pattern="^(ask|create|act)$")
    message: str
    model: str | None = None
    provider: str | None = None
    attachments: list[dict] = []
    memory_context: list[dict] = []
    conversation_history: list[dict] = []
    # Per-user tool config: {enabled_toolsets, api_keys, skills}
    user_tool_settings: dict = {}


class ApprovalRequest(BaseModel):
    approval_id: str
    decision: str = Field(pattern="^(approved|rejected|edited)$")
    edited_payload: dict | None = None


class Source(BaseModel):
    title: str
    url: str
    content: str = ""
    score: float | None = None


class ToolEvent(BaseModel):
    tool_name: str
    tool_category: str
    input: dict = {}
    output: dict = {}
    status: str = "completed"
    requires_approval: bool = False


class RunResponse(BaseModel):
    status: str
    message: str
    sources: list[Source] = []
    tool_events: list[ToolEvent] = []
    approval_payload: dict | None = None
    runtime: dict = {}
    # Agent-created/edited skills → [{name, body, category}] → saved to Supabase
    new_skills: list[dict] = []
    # User-facing message when LLM fallback occurred (e.g., "Switched to gpt-4o-mini due to rate limit")
    fallback_message: str | None = None
    # Agent reasoning log — internal monologue captured from stream deltas + tool calls
    reasoning_log: list[str] = []
