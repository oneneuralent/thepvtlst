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
  const { spreadsheet_id, sheet_name, rows } = body;

  if (!spreadsheet_id || !rows || !Array.isArray(rows)) {
    return NextResponse.json({ error: "spreadsheet_id and rows (array) are required" }, { status: 400 });
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
    const range = sheet_name ? `${sheet_name}!A1` : "Sheet1!A1";
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: rows,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Google Sheets API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      spreadsheetId: data.spreadsheetId,
      updates: data.updates,
      message: "Data appended to spreadsheet successfully",
    });
  } catch (error) {
    console.error("[google-sheets-append] Error:", error);
    return NextResponse.json({ error: "Failed to append Google Sheets data" }, { status: 500 });
  }
}
