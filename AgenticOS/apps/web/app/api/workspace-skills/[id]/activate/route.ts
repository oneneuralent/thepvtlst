import { NextResponse } from "next/server";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const { id } = await params;
  const admin = createAdminClient();

  const { data: version, error: versionError } = await admin
    .from("skill_versions")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("skill_id", id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError || !version?.id) {
    return NextResponse.json({ error: versionError?.message ?? "No skill version found." }, { status: 404 });
  }

  const { error: skillError } = await admin
    .from("workspace_skills")
    .update({
      status: "active",
      current_version_id: version.id,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (skillError) {
    return NextResponse.json({ error: skillError.message }, { status: 500 });
  }

  const { error: activeVersionError } = await admin
    .from("skill_versions")
    .update({
      status: "active",
      safety_status: "passed"
    })
    .eq("id", version.id)
    .eq("workspace_id", workspaceId);

  if (activeVersionError) {
    return NextResponse.json({ error: activeVersionError.message }, { status: 500 });
  }

  await admin.from("skill_events").insert({
    workspace_id: workspaceId,
    skill_id: id,
    version_id: version.id,
    event_type: "activated",
    reason: "User activated reviewed workspace skill.",
    actor: "user",
    metadata: { source: "api/workspace-skills/activate" }
  });

  return NextResponse.json({ status: "active", skillId: id, versionId: version.id });
}
