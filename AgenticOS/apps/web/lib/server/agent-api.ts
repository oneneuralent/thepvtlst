export type AgentMode = "ask" | "create" | "act";

export type AgentSource = {
  title: string;
  url: string;
  content?: string;
  score?: number | null;
};

export type AgentToolEvent = {
  tool_name: string;
  tool_category: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: string;
  requires_approval: boolean;
};

export type AgentRunResponse = {
  status: "completed" | "requires_approval" | "failed" | "cancelled" | string;
  message: string;
  sources: AgentSource[];
  tool_events: AgentToolEvent[];
  approval_payload?: Record<string, unknown> | null;
  runtime?: Record<string, unknown>;
  new_skills?: { name: string; body: string; category: string }[];
  fallback_message?: string | null;
  reasoning_log?: string[];
};

export type UserToolSkill = {
  name: string;
  body: string;
  category: string;
};

export type UserToolMemoryBlock = {
  label: string;
  description: string;
  value: string;
};

export type UserToolSettings = {
  enabled_toolsets: string[];
  api_keys: Record<string, string>;
  skills: UserToolSkill[];
  memory_blocks?: UserToolMemoryBlock[];
  llm_provider?: string;
  llm_model?: string;
};

export async function runAgent(payload: {
  runId: string;
  workspaceId: string;
  userId: string;
  threadId: string;
  mode: AgentMode;
  message: string;
  model?: string;
  provider?: string;
  attachments?: Record<string, unknown>[];
  memoryContext?: Record<string, unknown>[];
  conversationHistory?: { role: string; content: string }[];
  userToolSettings?: UserToolSettings;
}): Promise<AgentRunResponse> {
  const baseUrl = process.env.AGENT_API_URL ?? "http://localhost:8000";

  if (!baseUrl || baseUrl.includes("localhost")) {
    throw new Error("Agent API is not configured for production. Please set AGENT_API_URL environment variable.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AGENT_API_SECRET ? { "x-agent-api-secret": process.env.AGENT_API_SECRET } : {})
    },
    body: JSON.stringify({
      run_id: payload.runId,
      workspace_id: payload.workspaceId,
      user_id: payload.userId,
      thread_id: payload.threadId,
      mode: payload.mode,
      message: payload.message,
      model: payload.model,
      provider: payload.provider,
      attachments: payload.attachments ?? [],
      memory_context: payload.memoryContext ?? [],
      conversation_history: payload.conversationHistory ?? [],
      user_tool_settings: payload.userToolSettings ?? { enabled_toolsets: [], api_keys: {}, skills: [] }
    })
  });

  const body = (await response.json().catch(() => null)) as AgentRunResponse | { detail?: string } | null;

  if (!response.ok) {
    throw new Error(
      body && "detail" in body && body.detail
        ? body.detail
        : `Agent runtime failed with HTTP ${response.status}.`
    );
  }

  return body as AgentRunResponse;
}

export async function streamAgent(
  payload: {
    runId: string;
    workspaceId: string;
    userId: string;
    threadId: string;
    mode: AgentMode;
    message: string;
    model?: string;
    provider?: string;
    attachments?: Record<string, unknown>[];
    memoryContext?: Record<string, unknown>[];
    conversationHistory?: { role: string; content: string }[];
    userToolSettings?: UserToolSettings;
  },
  onEvent: (event: string, data: Record<string, unknown>) => void
): Promise<AgentRunResponse> {
  const baseUrl = process.env.AGENT_API_URL ?? "http://localhost:8000";

  if (!baseUrl || baseUrl.includes("localhost")) {
    throw new Error("Agent API is not configured for production. Please set AGENT_API_URL environment variable.");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/runs/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AGENT_API_SECRET ? { "x-agent-api-secret": process.env.AGENT_API_SECRET } : {})
    },
    body: JSON.stringify({
      run_id: payload.runId,
      workspace_id: payload.workspaceId,
      user_id: payload.userId,
      thread_id: payload.threadId,
      mode: payload.mode,
      message: payload.message,
      model: payload.model,
      provider: payload.provider,
      attachments: payload.attachments ?? [],
      memory_context: payload.memoryContext ?? [],
      conversation_history: payload.conversationHistory ?? [],
      user_tool_settings: payload.userToolSettings ?? { enabled_toolsets: [], api_keys: {}, skills: [] }
    })
  });

  if (!response.ok || !response.body) {
    throw new Error(`Agent runtime stream failed with HTTP ${response.status}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AgentRunResponse | null = null;

  function handleChunk(chunk: string) {
    const lines = chunk.split("\n");
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const dataLine = lines.find((line) => line.startsWith("data:"));
    if (!eventLine || !dataLine) return;

    const event = eventLine.slice("event:".length).trim();
    const rawData = dataLine.slice("data:".length).trim();
    const data = JSON.parse(rawData) as Record<string, unknown>;
    onEvent(event, data);

    if (event === "run.completed" || event === "run.failed") {
      finalResult = data as AgentRunResponse;
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) handleChunk(chunk);
  }

  if (buffer.trim()) handleChunk(buffer);
  if (!finalResult) throw new Error("Agent stream ended without a final run result.");
  return finalResult;
}
