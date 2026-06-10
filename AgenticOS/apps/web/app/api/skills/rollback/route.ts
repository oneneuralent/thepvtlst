import { NextResponse } from "next/server";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const { skillId, body } = (await request.json()) as { skillId: string; body: string };

  if (!skillId || !body) {
    return NextResponse.json({ error: "skillId and body are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify skill belongs to workspace
  const { data: skill, error: skillError } = await admin
    .from("workspace_skills")
    .select("id")
    .eq("id", skillId)
    .eq("workspace_id", workspaceId)
    .single();

  if (skillError || !skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // Get next version number
  const { count } = await admin
    .from("skill_versions")
    .select("id", { count: "exact", head: true })
    .eq("skill_id", skillId);

  // Insert new version with the old body
  const { data: newVersion, error: versionError } = await admin
    .from("skill_versions")
    .insert({
      skill_id: skillId,
      workspace_id: workspaceId,
      version: (count ?? 0) + 1,
      body,
      status: "active",
      safety_status: "passed",
      created_by: identity.id,
    })
    .select("id")
    .single();

  if (versionError || !newVersion?.id) {
    return NextResponse.json({ error: versionError?.message ?? "Could not create rollback version" }, { status: 500 });
  }

  // Set as current version and mark skill active
  const { error: updateError } = await admin
    .from("workspace_skills")
    .update({
      status: "active",
      current_version_id: newVersion.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", skillId)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, versionId: newVersion.id });
}
