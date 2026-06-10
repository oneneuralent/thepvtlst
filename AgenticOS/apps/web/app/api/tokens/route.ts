import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const identity = await getRuntimeIdentity();
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const workspaceId = await ensureUserWorkspace(identity);

  const { data: runs } = await admin
    .from("agent_runs")
    .select("id, status, mode, created_at, completed_at, input, output")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(500);

  const allRuns = runs ?? [];

  const processed = allRuns.map((run) => {
    const output = (run.output ?? {}) as Record<string, unknown>;
    const runtime = (output.runtime ?? {}) as Record<string, unknown>;
    const inputData = (run.input ?? {}) as Record<string, unknown>;
    return {
      id: run.id as string,
      status: run.status as string,
      mode: run.mode as string,
      created_at: run.created_at as string,
      model: (runtime.model as string) ?? (inputData.model as string) ?? "unknown",
      prompt_tokens: (runtime.prompt_tokens as number) ?? 0,
      completion_tokens: (runtime.completion_tokens as number) ?? 0,
      total_tokens: (runtime.total_tokens as number) ?? 0,
      message: ((output.message as string) ?? "").slice(0, 120),
    };
  });

  const totalTokens = processed.reduce((sum, r) => sum + r.total_tokens, 0);
  const completedRuns = processed.filter((r) => r.status === "completed").length;

  const byModel: Record<string, { runs: number; total_tokens: number }> = {};
  for (const r of processed) {
    const key = r.model;
    if (!byModel[key]) byModel[key] = { runs: 0, total_tokens: 0 };
    byModel[key].runs++;
    byModel[key].total_tokens += r.total_tokens;
  }

  const monthly: Record<string, { runs: number; total_tokens: number }> = {};
  for (const r of processed) {
    const month = r.created_at ? r.created_at.slice(0, 7) : "unknown";
    if (!monthly[month]) monthly[month] = { runs: 0, total_tokens: 0 };
    monthly[month].runs++;
    monthly[month].total_tokens += r.total_tokens;
  }

  return Response.json({
    total_runs: allRuns.length,
    completed_runs: completedRuns,
    total_tokens: totalTokens,
    by_model: byModel,
    monthly,
    recent_runs: processed.slice(0, 50),
  });
}
