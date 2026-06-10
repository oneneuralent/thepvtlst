import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleTokenForWorkspace, extractWorkspaceId } from "@/lib/server/google-token";

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
    action: "create" | "delete";
    to?: string;
    subject?: string;
    body?: string;
    cc?: string;
    bcc?: string;
    draft_id?: string;
  };

  if (body.action === "create") {
    const lines = [
      `To: ${body.to ?? ""}`,
      `Subject: ${body.subject ?? ""}`,
      body.cc ? `Cc: ${body.cc}` : null,
      body.bcc ? `Bcc: ${body.bcc}` : null,
      "",
      body.body ?? ""
    ].filter(l => l !== null).join("\r\n");

    const raw = Buffer.from(lines).toString("base64url");
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw } })
    });
    if (!response.ok) return NextResponse.json({ error: `Create draft failed: HTTP ${response.status}` }, { status: 502 });
    const data = await response.json() as { id: string; message?: { id: string } };
    return NextResponse.json({ draft_id: data.id, message_id: data.message?.id, success: true });
  }

  if (body.action === "delete") {
    if (!body.draft_id) return NextResponse.json({ error: "draft_id required" }, { status: 400 });
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${body.draft_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) return NextResponse.json({ error: `Delete draft failed: HTTP ${response.status}` }, { status: 502 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
