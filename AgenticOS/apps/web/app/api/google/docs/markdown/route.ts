import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleTokenForWorkspace, extractWorkspaceId } from "@/lib/server/google-token";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";

export async function POST(request: Request) {
  // Try x-workspace-id header first (backend-to-backend calls)
  let workspaceId = extractWorkspaceId(request);
  
  // Fall back to server-side identity (browser calls)
  if (!workspaceId) {
    const identity = await getRuntimeIdentity();
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    workspaceId = await ensureUserWorkspace(identity);
  }

  const admin = createAdminClient();
  let accessToken: string;
  try {
    ({ token: accessToken } = await getGoogleTokenForWorkspace(admin, workspaceId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
  }

  const body = (await request.json()) as { document_id?: string };
  if (!body.document_id) return NextResponse.json({ error: "document_id required" }, { status: 400 });

  const response = await fetch(`https://docs.googleapis.com/v1/documents/${body.document_id}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) return NextResponse.json({ error: `Docs API error: HTTP ${response.status}` }, { status: 502 });

  const doc = await response.json() as {
    title?: string;
    body?: { content?: { paragraph?: { elements?: { textRun?: { content?: string } }[] } }[] }
  };

  const lines: string[] = [`# ${doc.title ?? "Untitled"}`, ""];
  for (const block of doc.body?.content ?? []) {
    if (block.paragraph?.elements) {
      const text = block.paragraph.elements.map(e => e.textRun?.content ?? "").join("");
      if (text.trim()) lines.push(text.replace(/\n$/, ""));
    }
  }

  return NextResponse.json({ document_id: body.document_id, title: doc.title ?? "Untitled", markdown: lines.join("\n") });
}
