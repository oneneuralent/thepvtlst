import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/server/crypto";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleTokenForWorkspace, extractWorkspaceId } from "@/lib/server/google-token";

export async function POST(request: Request) {
  const workspaceId = extractWorkspaceId(request);
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing x-workspace-id header." }, { status: 400 });
  }
  const admin = createAdminClient();
  let accessToken: string;
  try {
    ({ token: accessToken } = await getGoogleTokenForWorkspace(admin, workspaceId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { query?: string };
  const query = body.query ?? "newer_than:7d";

  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listResponse.ok) {
    return NextResponse.json({ error: `Gmail search failed: HTTP ${listResponse.status}`, messages: [] });
  }
  const list = (await listResponse.json()) as { messages?: { id: string; threadId: string }[] };
  const messages = await Promise.all(
    (list.messages ?? []).slice(0, 10).map(async (msg) => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!r.ok) return null;
      const detail = (await r.json()) as { id: string; threadId: string; snippet?: string; payload?: { headers?: { name: string; value: string }[] } };
      const headers = detail.payload?.headers ?? [];
      const header = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      return { id: detail.id, threadId: detail.threadId, subject: header("Subject") || "(no subject)", from: header("From"), date: header("Date"), snippet: detail.snippet ?? "" };
    })
  );
  return NextResponse.json({ connected: true, messages: messages.filter(Boolean) });
}

export async function GET(request: Request) {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const admin = createAdminClient();
  const { data: connection, error } = await admin
    .from("connections")
    .select("id, scopes, encrypted_access_token, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", identity.id)
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!connection?.encrypted_access_token) {
    return NextResponse.json({ connected: false, messages: [] });
  }

  const accessToken = decryptSecret(connection.encrypted_access_token);
  if (!accessToken) {
    return NextResponse.json({ connected: false, messages: [] });
  }

  const query = new URL(request.url).searchParams.get("q") ?? "newer_than:30d";
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!listResponse.ok) {
    return NextResponse.json({ connected: true, error: `Gmail list failed with HTTP ${listResponse.status}.`, messages: [] });
  }

  const list = (await listResponse.json()) as { messages?: { id: string; threadId: string }[] };
  const messages = await Promise.all(
    (list.messages ?? []).slice(0, 10).map(async (message) => {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!response.ok) return null;
      const detail = (await response.json()) as {
        id: string;
        threadId: string;
        snippet?: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = detail.payload?.headers ?? [];
      const header = (name: string) => headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
      return {
        id: detail.id,
        threadId: detail.threadId,
        subject: header("Subject") || "(no subject)",
        from: header("From"),
        date: header("Date"),
        snippet: detail.snippet ?? ""
      };
    })
  );

  await admin.from("connection_events").insert({
    workspace_id: workspaceId,
    user_id: identity.id,
    connection_id: connection.id,
    provider: "google",
    event_type: "gmail_list",
    metadata: { query }
  });

  return NextResponse.json({ connected: true, messages: messages.filter(Boolean) });
}
