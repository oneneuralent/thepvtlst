import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const extractionSchema = z.object({
  memories: z
    .array(
      z.object({
        type: z.enum(["user", "workspace", "thread", "file", "preference", "connection", "skill"]).default("workspace"),
        target: z.enum(["user_profile", "agent_memory", "workspace_knowledge", "procedure_hint"]).default("agent_memory"),
        title: z.string().min(1).max(120),
        content: z.string().min(1).max(600),
        confidence: z.number().min(0).max(1).default(0.7),
        reason: z.string().max(300).optional()
      })
    )
    .default([]),
  skills: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        category: z.string().min(1).max(80).default("workflow"),
        description: z.string().min(1).max(300),
        body: z.string().min(1).max(3000),
        reason: z.string().max(300).optional()
      })
    )
    .default([])
});

type QueuedMemoryJob = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  thread_id: string | null;
  run_id: string | null;
  input: {
    user_message?: string;
    assistant_message?: string;
    mode?: string;
  };
};

export async function processQueuedLearningJobs(limit = 3) {
  const supabase = createAdminClient();
  const { data: jobs, error } = await supabase
    .from("memory_jobs")
    .select("id,workspace_id,user_id,thread_id,run_id,input")
    .eq("status", "queued")
    .lte("run_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Could not load memory jobs: ${error.message}`);
  }

  const results = [];
  for (const job of (jobs ?? []) as QueuedMemoryJob[]) {
    results.push(await processOneLearningJob(supabase, job));
  }

  return results;
}

async function processOneLearningJob(supabase: ReturnType<typeof createAdminClient>, job: QueuedMemoryJob) {
  await supabase
    .from("memory_jobs")
    .update({ status: "running", started_at: new Date().toISOString(), attempts: 1 })
    .eq("id", job.id);

  try {
    const extraction = await extractLearning(job);

    for (const memory of extraction.memories) {
      const blockedReason = scanMemorySafety(memory.content);
      if (blockedReason) {
        await supabase.from("memory_events").insert({
          workspace_id: job.workspace_id,
          user_id: job.user_id,
          run_id: job.run_id,
          thread_id: job.thread_id,
          event_type: "blocked",
          after: memory,
          reason: memory.reason ?? "Memory extraction blocked by safety scanner.",
          safety_status: "blocked",
          blocked_reason: blockedReason
        });
        continue;
      }

      const { data: created } = await supabase
        .from("memories")
        .insert({
          workspace_id: job.workspace_id,
          user_id: memory.target === "user_profile" ? job.user_id : null,
          type: memory.type,
          target: memory.target,
          title: memory.title,
          content: memory.content,
          source_type: "agent_run",
          source_id: job.run_id,
          confidence: memory.confidence,
          safety_status: "passed",
          metadata: { extracted_by: "learning_job", job_id: job.id }
        })
        .select("id")
        .single();

      await supabase.from("memory_events").insert({
        workspace_id: job.workspace_id,
        user_id: job.user_id,
        memory_id: created?.id ?? null,
        run_id: job.run_id,
        thread_id: job.thread_id,
        event_type: "added",
        after: memory,
        reason: memory.reason ?? "Extracted durable fact from completed run.",
        actor: "agent",
        safety_status: "passed"
      });
    }

    for (const skill of extraction.skills) {
      const { data: workspaceSkill } = await supabase
        .from("workspace_skills")
        .upsert(
          {
            workspace_id: job.workspace_id,
            name: skill.name,
            category: skill.category,
            description: skill.description,
            status: "needs_review"
          },
          { onConflict: "workspace_id,name" }
        )
        .select("id")
        .single();

      if (!workspaceSkill?.id) continue;

      const { count } = await supabase
        .from("skill_versions")
        .select("id", { count: "exact", head: true })
        .eq("skill_id", workspaceSkill.id);

      const version = (count ?? 0) + 1;
      const { data: skillVersion } = await supabase
        .from("skill_versions")
        .insert({
          skill_id: workspaceSkill.id,
          workspace_id: job.workspace_id,
          version,
          body: skill.body,
          changelog: skill.reason ?? "Proposed from a completed agent run.",
          source_run_id: job.run_id,
          status: "draft",
          safety_status: "needs_review"
        })
        .select("id")
        .single();

      await supabase.from("skill_events").insert({
        workspace_id: job.workspace_id,
        skill_id: workspaceSkill.id,
        version_id: skillVersion?.id ?? null,
        run_id: job.run_id,
        event_type: "proposed",
        reason: skill.reason ?? "Reusable workflow detected by learning job.",
        actor: "agent",
        metadata: { job_id: job.id }
      });
    }

    await supabase
      .from("memory_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        output: extraction
      })
      .eq("id", job.id);

    return { jobId: job.id, status: "completed", memories: extraction.memories.length, skills: extraction.skills.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown learning job error.";
    await supabase
      .from("memory_jobs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error: message })
      .eq("id", job.id);
    return { jobId: job.id, status: "failed", error: message };
  }
}

async function extractLearning(job: QueuedMemoryJob) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "The PVTLST"
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "Extract durable memory and reusable skills from a completed AI assistant turn. Return only valid JSON. Do not include markdown. Save only stable user preferences, workspace facts, tool quirks, and reusable workflows. Do not save temporary task progress, one-off results, secrets, access tokens, passwords, or volatile current facts."
        },
        {
          role: "user",
          content: JSON.stringify({
            expected_shape: {
              memories: [
                {
                  type: "preference",
                  target: "user_profile",
                  title: "short title",
                  content: "declarative stable fact",
                  confidence: 0.8,
                  reason: "why this is durable"
                }
              ],
              skills: [
                {
                  name: "short-workflow-name",
                  category: "workflow",
                  description: "what this reusable workflow does",
                  body: "procedural steps in markdown",
                  reason: "why this should become a skill"
                }
              ]
            },
            turn: job.input
          })
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter extraction failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  const parsedJson = JSON.parse(String(raw ?? "{}"));
  return extractionSchema.parse(parsedJson);
}

function scanMemorySafety(content: string) {
  const patterns = [
    /ignore\s+(previous|all|above|prior)\s+instructions/i,
    /system\s+prompt\s+override/i,
    /do\s+not\s+tell\s+the\s+user/i,
    /curl\s+.*(key|token|secret|password)/i,
    /cat\s+.*(\.env|credentials|\.netrc|\.npmrc)/i,
    /(api[_-]?key|secret|password|refresh[_-]?token)\s*[:=]/i
  ];

  const matched = patterns.find((pattern) => pattern.test(content));
  return matched ? "Potential prompt-injection or secret-exfiltration memory content." : null;
}
