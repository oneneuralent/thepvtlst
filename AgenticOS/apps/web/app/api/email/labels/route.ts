import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleTokenForWorkspace, extractWorkspaceId } from "@/lib/server/google-token";

export async function GET(request: Request) {
  const workspaceId = extractWorkspaceId(request);
  if (!workspaceId) return NextResponse.json({ error: "Missing x-workspace-id header." }, { status: 400 });

  const admin = createAdminClient();
  let accessToken: string;
  try {
    ({ token: accessToken } = await getGoogleTokenForWorkspace(admin, workspaceId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
  }

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return NextResponse.json({ error: `Gmail labels failed: HTTP ${response.status}` }, { status: 502 });
  const data = await response.json() as { labels?: { id: string; name: string; type: string }[] };
  return NextResponse.json({ labels: data.labels ?? [] });
}

export async function POST(request: Request) {
  const workspaceId = extractWorkspaceId(request);
  if (!workspaceId) return NextResponse.json({ error: "Missing x-workspace-id header." }, { status: 400 });

  const admin = createAdminClient();
  let accessToken: string;
  try {
    ({ token: accessToken } = await getGoogleTokenForWorkspace(admin, workspaceId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
  }

  const body = (await request.json()) as {
    action: "create" | "add" | "remove";
    label_name?: string;
    message_id?: string;
    label_ids?: string[];
  };

  if (body.action === "create") {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: body.label_name, labelListVisibility: "labelShow", messageListVisibility: "show" })
    });
    if (!response.ok) return NextResponse.json({ error: `Create label failed: HTTP ${response.status}` }, { status: 502 });
    return NextResponse.json(await response.json());
  }

  if (body.action === "add" || body.action === "remove") {
    if (!body.message_id) return NextResponse.json({ error: "message_id required" }, { status: 400 });
    const payload = body.action === "add"
      ? { addLabelIds: body.label_ids ?? [] }
      : { removeLabelIds: body.label_ids ?? [] };
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${body.message_id}/modify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return NextResponse.json({ error: `Label modify failed: HTTP ${response.status}` }, { status: 502 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
