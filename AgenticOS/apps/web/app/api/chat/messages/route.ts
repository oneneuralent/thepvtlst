import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ messages: [] });

  const identity = await getRuntimeIdentity();
  if (!identity) return NextResponse.json({ messages: [] });

  const admin = createAdminClient();
  const workspaceId = await ensureUserWorkspace(identity);

  const { data } = await admin
    .from("messages")
    .select("id, role, content, created_at, metadata")
    .eq("thread_id", threadId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(60);

  return NextResponse.json({ messages: data ?? [] });
}
