import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent, type AgentMode, type AgentRunResponse, type AgentSource } from "@/lib/server/agent-api";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { loadMemoryContext, queueLearningArtifacts, rememberExplicitInstruction } from "@/lib/server/memory";
import { loadActiveWorkspaceSkillContext } from "@/lib/server/workspace-skills";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

const chatRequestSchema = z.object({
  message: z.string().min(1).max(8000),
  mode: z.enum(["ask", "create", "act"]),
  model: z.string().min(1).max(160).optional(),
  threadId: z.string().uuid().optional()
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const { message, mode, model } = parsed.data;
  const identity = await getRuntimeIdentity();

  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const workspaceId = await ensureUserWorkspace(identity);
    const threadId = parsed.data.threadId ?? (await createThread(admin, workspaceId, identity.id, mode, message));
    const userMessageId = await insertMessage(admin, threadId, workspaceId, "user", message);
    const memoryContext = await loadMemoryContext({ workspaceId, userId: identity.id, query: message });
    const skillContext = await loadActiveWorkspaceSkillContext({ workspaceId });
    
    // Load active skills for Hermes skill tools
    const { loadWorkspaceSkillsForDisplay } = await import("@/lib/server/workspace-skills");
    const allSkills = await loadWorkspaceSkillsForDisplay(workspaceId);
    console.log(`[DEBUG] Loaded ${allSkills.length} skills for workspace ${workspaceId}:`, allSkills.map(s => ({ name: s.name, status: s.status, versionStatus: s.version?.status, safetyStatus: s.version?.safety_status })));
    const activeSkills = allSkills
      .filter((skill) => skill.status === "active" && skill.version?.status === "active" && skill.version?.safety_status === "passed")
      .map((skill) => ({
        name: skill.name,
        body: skill.version?.body ?? "",
        category: skill.category
      }));
    console.log(`[DEBUG] Filtered to ${activeSkills.length} active skills`);

    const { data: run, error: runError } = await admin
      .from("agent_runs")
      .insert({
        workspace_id: workspaceId,
        thread_id: threadId,
        user_id: identity.id,
        mode,
        status: "running",
        input: { message, model }
      })
      .select("id")
      .single();

    if (runError || !run?.id) {
      throw new Error(runError?.message ?? "Could not create run.");
    }

    const result = await runAgent({
      runId: run.id as string,
      workspaceId,
      userId: identity.id,
      threadId,
      mode,
      message,
      model,
      memoryContext: [...memoryContext, ...skillContext],
      userToolSettings: {
        enabled_toolsets: [],
        api_keys: {},
        skills: activeSkills
      }
    });

    await rememberExplicitInstruction({
      workspaceId,
      userId: identity.id,
      content: message,
      sourceId: userMessageId,
      runId: run.id as string,
      threadId
    });

    const approvalId = await persistAgentTooling({
      admin,
      result,
      workspaceId,
      userId: identity.id,
      runId: run.id as string,
      mode
    });

    await insertMessage(admin, threadId, workspaceId, "assistant", result.message, {
      sources: result.sources,
      approvalId,
      toolEvents: result.tool_events,
      runtime: result.runtime ?? {}
    });

    await admin
      .from("agent_runs")
      .update({
        status: result.status,
        output: {
          message: result.message,
          sources: result.sources,
          approvalId,
          runtime: result.runtime ?? {}
        },
        completed_at: result.status === "completed" ? new Date().toISOString() : null
      })
      .eq("id", run.id);

    await queueLearningArtifacts({
      workspaceId,
      userId: identity.id,
      threadId,
      runId: run.id as string,
      mode,
      userMessage: message,
      assistantMessage: result.message,
      toolTrace: result.tool_events ?? []
    });

    return NextResponse.json({
      message: result.message,
      threadId,
      runId: run.id,
      status: result.status,
      sources: result.sources,
      approvalId
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The agent run failed before completion."
      },
      { status: 500 }
    );
  }
}

export async function createThread(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  userId: string,
  mode: AgentMode,
  message: string
) {
  const { data, error } = await admin
    .from("threads")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      mode,
      title: message.slice(0, 72) || "New thread"
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Could not create thread.");
  }

  return data.id as string;
}

export async function insertMessage(
  admin: ReturnType<typeof createAdminClient>,
  threadId: string,
  workspaceId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  metadata: Record<string, unknown> = {}
) {
  const { data, error } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      workspace_id: workspaceId,
      role,
      content,
      metadata
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not save ${role} message: ${error.message}`);
  }

  return data.id as string;
}

export async function loadThreadMessages(
  admin: ReturnType<typeof createAdminClient>,
  threadId: string,
  workspaceId: string
) {
  const { data, error } = await admin
    .from("messages")
    .select("role, content, metadata")
    .eq("thread_id", threadId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return [];
  }

  return (data || []).map((msg: { role: string; content: string; metadata?: Record<string, unknown> }) => {
    const content = msg.content;
    const metadata = msg.metadata || {};
    
    // If there's a pending approval draft, append it to the content for context
    if (metadata.approvalId && metadata.draft) {
      const draft = metadata.draft as Record<string, unknown>;
      const draftText = `\n\n[PENDING APPROVAL DRAFT]\nTo: ${draft.to}\nSubject: ${draft.subject}\nBody: ${draft.body}\n[/PENDING APPROVAL DRAFT]`;
      return {
        role: msg.role,
        content: content + draftText
      };
    }
    
    return {
      role: msg.role,
      content
    };
  });
}

export async function persistAgentTooling({
  admin,
  result,
  mode,
  workspaceId,
  userId,
  runId
}: {
  admin: ReturnType<typeof createAdminClient>;
  result: AgentRunResponse;
  mode: AgentMode;
  workspaceId: string;
  userId: string;
  runId: string;
}) {
  let approvalId: string | null = null;
  let approvalToolCallId: string | null = null;

  for (const event of result.tool_events ?? []) {
    const { data, error } = await admin
      .from("tool_calls")
      .insert({
        run_id: runId,
        workspace_id: workspaceId,
        tool_name: event.tool_name,
        tool_category: event.tool_category,
        input: event.input,
        output: event.output,
        status: event.status,
        requires_approval: event.requires_approval
      })
      .select("id, requires_approval")
      .single();

    if (error) {
      throw new Error(`Could not save tool call: ${error.message}`);
    }

    if (data?.requires_approval) {
      approvalToolCallId = data.id as string;
    }
  }

  if (result.status === "requires_approval" && approvalToolCallId) {
    const { data, error } = await admin
      .from("approvals")
      .insert({
        workspace_id: workspaceId,
        run_id: runId,
        tool_call_id: approvalToolCallId,
        status: "pending",
        approval_payload: result.approval_payload ?? {}
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message ?? "Could not create approval request.");
    }

    approvalId = data.id as string;
  }

  if (result.sources.length > 0) {
    await admin.from("library_items").insert(
      result.sources.slice(0, 3).map((source: AgentSource) => ({
        workspace_id: workspaceId,
        user_id: userId,
        type: "web_result",
        title: source.title,
        content: source.content ?? "",
        file_path: null,
        metadata: { url: source.url, score: source.score },
        tags: [mode, "agent-api"]
      }))
    );
  }

  return approvalId;
}
