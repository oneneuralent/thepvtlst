import { NextResponse } from "next/server";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const skillId = new URL(request.url).searchParams.get("skillId");

  if (!skillId) {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("skill_versions")
    .select("id, skill_id, version, body, status, safety_status, source_run_id, created_at, created_by")
    .eq("skill_id", skillId)
    .eq("workspace_id", workspaceId)
    .order("version", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}
