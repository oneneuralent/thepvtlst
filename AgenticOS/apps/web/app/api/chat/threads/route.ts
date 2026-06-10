import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";

export async function GET() {
  const identity = await getRuntimeIdentity();
  if (!identity) return NextResponse.json({ threads: [] });

  const admin = createAdminClient();
  const workspaceId = await ensureUserWorkspace(identity);

  const { data } = await admin
    .from("threads")
    .select("id, title, mode, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(25);

  return NextResponse.json({ threads: data ?? [] });
}
