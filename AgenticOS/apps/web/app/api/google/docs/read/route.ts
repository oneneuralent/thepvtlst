import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleTokenForWorkspace, extractWorkspaceId } from "@/lib/server/google-token";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";

export async function POST(request: NextRequest) {
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

  const body = await request.json();
  const { document_id } = body;

  if (!document_id) {
    return NextResponse.json({ error: "document_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  let accessToken: string;
  try {
    const tokenResult = await getGoogleTokenForWorkspace(admin, workspaceId);
    accessToken = tokenResult.token;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
  }

  try {
    // Call Google Docs API
    const response = await fetch(`https://docs.googleapis.com/v1/documents/${document_id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Google Docs API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();
    
    // Extract document content
    const content = data.document?.body?.content || [];
    let text = "";
    
    for (const element of content) {
      if (element.paragraph) {
        for (const paraElement of element.paragraph.elements) {
          if (paraElement.textRun) {
            text += paraElement.textRun.content;
          }
        }
      }
    }

    return NextResponse.json({
      title: data.title,
      documentId: data.documentId,
      content: text.trim(),
    });
  } catch (error) {
    console.error("[google-docs-read] Error:", error);
    return NextResponse.json({ error: "Failed to read Google Docs document" }, { status: 500 });
  }
}
