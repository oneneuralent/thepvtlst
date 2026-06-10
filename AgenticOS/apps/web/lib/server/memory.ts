import { createAdminClient } from "@/lib/supabase/admin";

export type MemoryContextItem = {
  id: string;
  type: string;
  title: string;
  content: string;
  confidence: number;
};

export async function loadMemoryContext({
  workspaceId,
  userId,
  query,
  limit = 8
}: {
  workspaceId: string;
  userId: string;
  query: string;
  limit?: number;
}): Promise<MemoryContextItem[]> {
  const supabase = createAdminClient();
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3)
    .slice(0, 8);

  const request = supabase
    .from("memories")
    .select("id,type,title,content,confidence")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .order("updated_at", { ascending: false })
    .limit(40);

  const { data, error } = await request;

  if (error) {
    return [];
  }

  const ranked = (data ?? [])
    .map((memory) => {
      const searchable = `${memory.title ?? ""} ${memory.content ?? ""}`.toLowerCase();
      const score = tokens.reduce((count, token) => count + (searchable.includes(token) ? 1 : 0), 0);
      return { memory, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map(({ memory }) => ({
    id: memory.id as string,
    type: memory.type as string,
    title: memory.title as string,
    content: memory.content as string,
    confidence: Number(memory.confidence ?? 0.7)
  }));
}

export async function rememberExplicitInstruction({
  workspaceId,
  userId,
  content,
  sourceId,
  runId,
  threadId
}: {
  workspaceId: string;
  userId: string;
  content: string;
  sourceId?: string;
  runId?: string;
  threadId?: string;
}) {
  const normalized = extractExplicitMemory(content);
  if (!normalized) return null;
  const blockedReason = scanMemorySafety(normalized);
  if (blockedReason) {
    await createAdminClient().from("memory_events").insert({
      workspace_id: workspaceId,
      user_id: userId,
      run_id: runId ?? null,
      thread_id: threadId ?? null,
      event_type: "blocked",
      after: { content: normalized },
      reason: "Explicit memory capture blocked by safety scanner.",
      safety_status: "blocked",
      blocked_reason: blockedReason
    });
    return null;
  }

  const supabase = createAdminClient();
  const title = normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;

  const { data, error } = await supabase
    .from("memories")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      type: "preference",
      title,
      content: normalized,
      source_type: "message",
      source_id: sourceId ?? null,
      confidence: 0.95,
      target: "user_profile",
      safety_status: "passed",
      metadata: { capture: "explicit_remember" }
    })
    .select("id")
    .single();

  if (error) {
    return null;
  }

  if (data?.id) {
    await supabase.from("memory_events").insert({
      workspace_id: workspaceId,
      user_id: userId,
      memory_id: data.id,
      run_id: runId ?? null,
      thread_id: threadId ?? null,
      event_type: "added",
      after: { title, content: normalized, type: "preference", target: "user_profile" },
      reason: "User explicitly requested this be remembered.",
      actor: "user",
      safety_status: "passed"
    });
  }

  return data?.id as string | null;
}

export async function queueLearningArtifacts({
  workspaceId,
  userId,
  threadId,
  runId,
  mode,
  userMessage,
  assistantMessage,
  toolTrace
}: {
  workspaceId: string;
  userId: string;
  threadId: string;
  runId: string;
  mode: "ask" | "create" | "act";
  userMessage: string;
  assistantMessage: string;
  toolTrace: Record<string, unknown>[];
}) {
  const supabase = createAdminClient();

  await supabase.from("trajectory_samples").insert({
    workspace_id: workspaceId,
    user_id: userId,
    thread_id: threadId,
    run_id: runId,
    mode,
    model_provider: "openrouter",
    model_name: process.env.OPENROUTER_MODEL ?? null,
    completed: true,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage }
    ],
    tool_trace: toolTrace,
    metadata: { source: "web_chat_route" }
  });

  await supabase.from("memory_jobs").insert({
    workspace_id: workspaceId,
    user_id: userId,
    thread_id: threadId,
    run_id: runId,
    job_type: "extract_turn",
    status: "queued",
    input: {
      user_message: userMessage,
      assistant_message: assistantMessage,
      mode,
      extraction_policy: "durable_facts_preferences_and_reusable_workflows_only"
    }
  });
}

export function extractExplicitMemory(content: string) {
  const trimmed = content.trim();
  const patterns = [
    /^remember that\s+/i,
    /^remember\s+/i,
    /^my preference is\s+/i,
    /^from now on\s+/i
  ];

  for (const pattern of patterns) {
    if (pattern.test(trimmed)) {
      return trimmed.replace(pattern, "").trim();
    }
  }

  return null;
}

function scanMemorySafety(content: string) {
  const patterns = [
    /ignore\s+(previous|all|above|prior)\s+instructions/i,
    /system\s+prompt\s+override/i,
    /do\s+not\s+tell\s+the\s+user/i,
    /curl\s+.*(key|token|secret|password)/i,
    /cat\s+.*(\.env|credentials|\.netrc|\.npmrc)/i
  ];

  const matched = patterns.find((pattern) => pattern.test(content));
  return matched ? "Potential prompt-injection or secret-exfiltration memory content." : null;
}
