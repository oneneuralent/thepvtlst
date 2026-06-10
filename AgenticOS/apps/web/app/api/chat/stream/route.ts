import { z } from "zod";
import { streamAgent, type UserToolSettings } from "@/lib/server/agent-api";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { loadMemoryContext, queueLearningArtifacts, rememberExplicitInstruction } from "@/lib/server/memory";
import { loadActiveWorkspaceSkillContext } from "@/lib/server/workspace-skills";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { createThread, insertMessage, persistAgentTooling, loadThreadMessages } from "../route";

const chatStreamSchema = z.object({
  message: z.string().min(1).max(8000),
  mode: z.enum(["ask", "create", "act"]),
  model: z.string().min(1).max(160).optional(),
  threadId: z.string().uuid().optional()
});

export async function POST(request: Request) {
  const parsed = chatStreamSchema.safeParse(await request.json());
  const encoder = new TextEncoder();

  function encode(event: string, data: Record<string, unknown>) {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!parsed.success) {
        controller.enqueue(encode("run.failed", { message: "Invalid chat request." }));
        controller.close();
        return;
      }

      const { message, mode, model } = parsed.data;
      const identity = await getRuntimeIdentity();
      if (!identity) {
        controller.enqueue(encode("run.failed", { message: "No runtime identity is configured." }));
        controller.close();
        return;
      }

      const admin = createAdminClient();

      try {
        const workspaceId = await ensureUserWorkspace(identity);
        const threadId = parsed.data.threadId ?? (await createThread(admin, workspaceId, identity.id, mode, message));
        const userMessageId = await insertMessage(admin, threadId, workspaceId, "user", message);
        const memoryContext = await loadMemoryContext({ workspaceId, userId: identity.id, query: message });
        const skillContext = await loadActiveWorkspaceSkillContext({ workspaceId });
        const conversationHistory = await loadThreadMessages(admin, threadId, workspaceId);
        const userToolSettings = await loadUserToolSettings(admin, workspaceId, identity.id);
        const provider = userToolSettings?.llm_provider ?? "openrouter";
        const llmModel = userToolSettings?.llm_model ?? "nvidia/nemotron-3-super-120b-a12b:free";

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

        controller.enqueue(encode("run.started", { runId: run.id, threadId, mode, model: llmModel }));
        controller.enqueue(encode("reasoning.summary", { summary: `The PVTLST is activating memory, skills, and tools for ${mode} mode.` }));

        // ALL messages go through Hermes. Hermes decides which tools to use
        // (gmail_send, gmail_search, web_search, etc.) via its native tool loop.
        const result = await streamAgent({
          runId: run.id as string,
          workspaceId,
          userId: identity.id,
          threadId,
          mode,
          message,
          model: llmModel,
          provider,
          memoryContext: [...memoryContext, ...skillContext],
          conversationHistory,
          userToolSettings,
        }, (event, data) => {
          if (event === "run.started" || event === "run.completed" || event === "run.failed") return;
          controller.enqueue(encode(event, data));
        });

        // Persist any skills the agent created/edited during this run
        if (result.new_skills && result.new_skills.length > 0) {
          const createdSkills = await persistNewSkills(admin, workspaceId, identity.id, run.id as string, result.new_skills);
          // Emit skill.created events for each new skill
          for (const skill of createdSkills) {
            controller.enqueue(encode("skill.created", { name: skill.name, category: skill.category }));
          }
        }

        // Auto-save thread artifacts (sources, tool outputs) to library
        await saveThreadArtifactsToLibrary(
          admin,
          workspaceId,
          identity.id,
          threadId,
          result.sources ?? [],
          result.tool_events ?? []
        );

        for (const event of result.tool_events ?? []) {
          // Log browser tool events for safety monitoring
          if (event.tool_name?.startsWith("browser_")) {
            await admin.from("browser_sessions").insert({
              workspace_id: workspaceId,
              user_id: identity.id,
              run_id: run,
              provider: "unknown", // Will be updated by actual browser tool handler
              status: "active",
              metadata: {
                tool_name: event.tool_name,
                input: event.input,
                output: event.output
              }
            });
          }
        }

        if (result.status === "requires_approval") {
          controller.enqueue(encode("approval.required", { approval: result.approval_payload ?? {} }));
        }

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
          draft: result.approval_payload ?? null,
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

        controller.enqueue(encode("message.delta", { delta: result.message }));
        
        // Send reasoning log as separate event for UI toggle
        if (result.reasoning_log && result.reasoning_log.length > 0) {
          controller.enqueue(encode("reasoning.log", { steps: result.reasoning_log }));
        }
        
        controller.enqueue(
          encode(result.status === "failed" ? "run.failed" : "run.completed", {
            ...result,
            threadId,
            runId: run.id,
            approvalId
          } as Record<string, unknown>)
        );
      } catch (error) {
        controller.enqueue(
          encode("run.failed", {
            message: error instanceof Error ? error.message : "The agent run failed before completion."
          })
        );
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

async function loadUserToolSettings(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  userId: string
): Promise<UserToolSettings> {
  const [{ data: settings }, { data: apiKeys }] = await Promise.all([
    admin
      .from("workspace_tool_settings")
      .select("toolset_name, enabled, metadata")
      .eq("workspace_id", workspaceId)
      .eq("enabled", true),
    admin
      .from("connections")
      .select("provider, encrypted_access_token, metadata")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("connection_type", "api_key")
      .eq("status", "connected"),
  ]);

  // Also load workspace skills to pass to the agent
  const { data: skillRows } = await admin
    .from("workspace_skills")
    .select("id, name, category, current_version_id")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  console.log(`[DEBUG] Loaded ${skillRows?.length ?? 0} skills for workspace ${workspaceId}`);

  // Fetch active skill versions for these skills
  const skillIds = (skillRows ?? []).map(s => s.id);
  console.log(`[DEBUG] Skill IDs:`, skillIds);
  const { data: skillVersions } = skillIds.length > 0 ? await admin
    .from("skill_versions")
    .select("id, skill_id, body, version, status, safety_status")
    .in("skill_id", skillIds)
    .eq("status", "active")
    .eq("safety_status", "passed") : { data: [] };

  console.log(`[DEBUG] Loaded ${skillVersions?.length ?? 0} skill versions with status=active and safety_status=passed`);

  const enabledToolsets = (settings ?? []).map((s) => s.toolset_name as string);

  // Extract LLM provider/model settings
  const llmSettings = settings?.find(s => s.toolset_name === "llm_settings")?.metadata as { provider?: string; model?: string } | undefined;

  const apiKeyMap: Record<string, string> = {};
  const llmProvider = llmSettings?.provider ?? "openrouter";
  const llmModel = llmSettings?.model ?? "nvidia/nemotron-3-super-120b-a12b:free";
  for (const conn of apiKeys ?? []) {
    const meta = (conn.metadata ?? {}) as Record<string, string>;
    const envVar = meta.env_var;
    if (envVar && conn.encrypted_access_token) {
      apiKeyMap[envVar] = conn.encrypted_access_token;
    }
    // Also handle NVIDIA NIM API key
    if (conn.provider === "nvidia-nim" && conn.encrypted_access_token) {
      apiKeyMap["NVIDIA_NIM_API_KEY"] = conn.encrypted_access_token;
    }
  }

  const skills = (skillRows ?? []).map((row) => {
    const version = skillVersions?.find(v => v.skill_id === row.id);
    return {
      name: row.name as string,
      body: version?.body ?? "",
      category: (row.category as string) ?? "general",
    };
  }).filter((s) => s.body.length > 0);

  console.log(`[DEBUG] Final skills array:`, skills.map(s => ({ name: s.name, bodyLength: s.body.length })));

  const { data: memoryBlockRows } = await admin
    .from("memory_blocks")
    .select("label, description, value")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(20);

  const memory_blocks = (memoryBlockRows ?? []).map(b => ({
    label: b.label as string,
    description: b.description as string,
    value: b.value as string,
  }));

  return {
    enabled_toolsets: enabledToolsets,
    api_keys: apiKeyMap,
    skills,
    memory_blocks,
    llm_provider: llmProvider,
    llm_model: llmModel
  };
}

async function persistNewSkills(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  userId: string,
  runId: string,
  newSkills: { name: string; body: string; category: string }[]
): Promise<{ name: string; category: string }[]> {
  const createdSkills: { name: string; category: string }[] = [];
  for (const skill of newSkills) {
    try {
      // Upsert the skill record
      const { data: existing } = await admin
        .from("workspace_skills")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", skill.name)
        .single();

      let skillId: string;
      if (existing?.id) {
        skillId = existing.id as string;
        await admin.from("workspace_skills").update({
          category: skill.category,
          updated_at: new Date().toISOString(),
        }).eq("id", skillId);
      } else {
        const { data: created } = await admin.from("workspace_skills").insert({
          workspace_id: workspaceId,
          name: skill.name,
          category: skill.category,
          description: `Created by agent during run ${runId}`,
          status: "needs_review",
          created_by: userId,
        }).select("id").single();
        skillId = created?.id as string;
      }

      if (!skillId) continue;

      // Get the next version number
      const { data: versions } = await admin
        .from("skill_versions")
        .select("version")
        .eq("skill_id", skillId)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = ((versions?.[0]?.version as number) ?? 0) + 1;

      const { data: newVersion } = await admin.from("skill_versions").insert({
        skill_id: skillId,
        workspace_id: workspaceId,
        version: nextVersion,
        body: skill.body,
        source_run_id: runId,
        status: "needs_review",
        safety_status: "needs_review",
        created_by: userId,
      }).select("id").single();

      // Set as current version
      if (newVersion?.id) {
        await admin.from("workspace_skills").update({
          current_version_id: newVersion.id,
        }).eq("id", skillId);
      }

      createdSkills.push({ name: skill.name, category: skill.category });
    } catch (err) {
      console.error("[skills] Failed to persist skill:", skill.name, err);
    }
  }
  return createdSkills;
}

async function saveThreadArtifactsToLibrary(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  userId: string,
  threadId: string,
  sources: { title: string; url: string; content?: string }[],
  toolEvents: { tool_name: string; output: Record<string, unknown> }[]
): Promise<void> {
  try {
    // Save web search sources as library items
    for (const source of sources) {
      await admin.from("library_items").insert({
        workspace_id: workspaceId,
        user_id: userId,
        thread_id: threadId,
        type: "web_result",
        item_type: "source",
        title: source.title,
        content: source.content,
        metadata: { url: source.url },
        tags: ["web", "research"],
      });
    }

    // Save tool event outputs as artifacts (e.g., email drafts, docs content)
    for (const event of toolEvents) {
      const output = event.output as Record<string, unknown>;
      if (event.tool_name === "gmail_send" && output.draft) {
        const draft = output.draft as { to: string; subject: string; body: string };
        await admin.from("library_items").insert({
          workspace_id: workspaceId,
          user_id: userId,
          thread_id: threadId,
          type: "response",
          item_type: "artifact",
          title: `Email draft to ${draft.to}`,
          content: JSON.stringify(draft, null, 2),
          metadata: { tool: "gmail_send", draft },
          tags: ["email", "draft"],
        });
      } else if (event.tool_name === "google_docs_read" && output.content) {
        await admin.from("library_items").insert({
          workspace_id: workspaceId,
          user_id: userId,
          thread_id: threadId,
          type: "document",
          item_type: "artifact",
          title: (output.title as string) || "Google Docs",
          content: output.content as string,
          metadata: { tool: "google_docs_read", documentId: output.documentId },
          tags: ["docs", "google"],
        });
      } else if (event.tool_name === "google_sheets_read" && output.values) {
        await admin.from("library_items").insert({
          workspace_id: workspaceId,
          user_id: userId,
          thread_id: threadId,
          type: "response",
          item_type: "artifact",
          title: (output.title as string) || "Google Sheets",
          content: JSON.stringify(output.values, null, 2),
          metadata: { tool: "google_sheets_read", spreadsheetId: output.spreadsheetId },
          tags: ["sheets", "google"],
        });
      }
    }
  } catch (err) {
    console.error("[library] Failed to save thread artifacts:", err);
  }
}
