import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleTokenForWorkspace, extractWorkspaceId } from "@/lib/server/google-token";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";

export async function GET(request: Request) {
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
    const tokenResult = await getGoogleTokenForWorkspace(admin, workspaceId);
    accessToken = tokenResult.token;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
  }

  try {
    const response = await fetch("https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet'&fields=files(id,name,webViewLink)", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Google Drive API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      spreadsheets: data.files || [],
    });
  } catch (error) {
    console.error("[google-sheets-list] Error:", error);
    return NextResponse.json({ error: "Failed to list Google Sheets" }, { status: 500 });
  }
}
