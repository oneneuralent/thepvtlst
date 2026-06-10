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
  const { title, content, document_id } = body;

  if (!title || !content) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
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
    let url, method, payload;

    if (document_id) {
      // Update existing document
      url = `https://docs.googleapis.com/v1/documents/${document_id}:batchUpdate`;
      method = "POST";
      payload = {
        requests: [
          {
            replaceAllText: {
              containsText: { text: "" },
              replaceText: content,
            },
          },
        ],
      };
    } else {
      // Create new document
      url = "https://docs.googleapis.com/v1/documents";
      method = "POST";
      payload = {
        title,
      };
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Google Docs API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    // If creating new document, then add content
    if (!document_id && data.documentId) {
      const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${data.documentId}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        }),
      });

      if (!updateResponse.ok) {
        const error = await updateResponse.text();
        return NextResponse.json({ error: `Failed to add content to new document: ${error}` }, { status: updateResponse.status });
      }
    }

    return NextResponse.json({
      documentId: data.documentId,
      title: data.title,
      message: document_id ? "Document updated successfully" : "Document created successfully",
    });
  } catch (error) {
    console.error("[google-docs-write] Error:", error);
    return NextResponse.json({ error: "Failed to write Google Docs document" }, { status: 500 });
  }
}
