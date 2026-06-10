import { NextResponse } from "next/server";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const { data, error } = await createAdminClient()
    .from("connections")
    .select("id, provider, provider_account_id, scopes, status, metadata, expires_at, last_used_at, created_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", identity.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ connections: data ?? [] });
}
