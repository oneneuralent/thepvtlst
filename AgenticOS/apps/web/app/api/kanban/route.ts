import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

const TODOS_LABEL = "TODOS";

export type KanbanItem = {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  created_at: string;
};

export async function GET() {
  const identity = await getRuntimeIdentity();
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const workspaceId = await ensureUserWorkspace(identity);

  const { data } = await admin
    .from("memory_blocks")
    .select("value")
    .eq("workspace_id", workspaceId)
    .eq("label", TODOS_LABEL)
    .single();

  try {
    const todos = data?.value ? (JSON.parse(data.value as string) as KanbanItem[]) : [];
    return Response.json({ todos: Array.isArray(todos) ? todos : [] });
  } catch {
    return Response.json({ todos: [] });
  }
}

export async function POST(request: Request) {
  const identity = await getRuntimeIdentity();
  if (!identity) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const workspaceId = await ensureUserWorkspace(identity);

  const body = (await request.json()) as { todos: KanbanItem[] };

  const { error } = await admin.from("memory_blocks").upsert({
    workspace_id: workspaceId,
    user_id: identity.id,
    label: TODOS_LABEL,
    description: "Agent task board — managed by The PVTLST and synced to Kanban view",
    value: JSON.stringify(body.todos ?? []),
    char_limit: 20000,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
