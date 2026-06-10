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
  const { error } = await admin
    .from("connections")
    .update({ status: "revoked", encrypted_access_token: null, encrypted_refresh_token: null })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .eq("user_id", identity.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("connection_events").insert({
    workspace_id: workspaceId,
    user_id: identity.id,
    connection_id: id,
    provider: "google",
    event_type: "disconnected",
    metadata: {}
  });

  return NextResponse.json({ ok: true });
}
