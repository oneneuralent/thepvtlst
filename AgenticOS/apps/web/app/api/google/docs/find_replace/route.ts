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
  const { document_id, find_text, replace_text } = body;

  if (!document_id || !find_text || replace_text === undefined) {
    return NextResponse.json({ error: "document_id, find_text, and replace_text are required" }, { status: 400 });
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
    const response = await fetch(
      `https://docs.googleapis.com/v1/documents/${document_id}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              replaceAllText: {
                containsText: {
                  text: find_text,
                  matchCase: true,
                },
                replaceText: replace_text,
              },
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Google Docs API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      documentId: data.documentId,
      message: "Find and replace completed successfully",
      replacements: data.replies?.[0]?.replaceAllText?.occurrencesChanged ?? 0,
    });
  } catch (error) {
    console.error("[google-docs-find-replace] Error:", error);
    return NextResponse.json({ error: "Failed to perform find and replace in Google Docs" }, { status: 500 });
  }
}
