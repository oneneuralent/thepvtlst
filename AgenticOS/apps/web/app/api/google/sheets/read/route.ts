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
  const { spreadsheet_id, range } = body;

  if (!spreadsheet_id) {
    return NextResponse.json({ error: "spreadsheet_id is required" }, { status: 400 });
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
    // Get spreadsheet metadata first
    const metaResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!metaResponse.ok) {
      const error = await metaResponse.text();
      return NextResponse.json({ error: `Google Sheets API error: ${error}` }, { status: metaResponse.status });
    }

    const metaData = await metaResponse.json();
    const sheetName = metaData.sheets?.[0]?.properties?.title || "Sheet1";
    const actualRange = range || `${sheetName}!A1:Z100`;

    // Get values
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${encodeURIComponent(actualRange)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Google Sheets API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      spreadsheetId: metaData.spreadsheetId,
      title: metaData.properties?.title,
      sheetName,
      range: data.range,
      values: data.values || [],
    });
  } catch (error) {
    console.error("[google-sheets-read] Error:", error);
    return NextResponse.json({ error: "Failed to read Google Sheets data" }, { status: 500 });
  }
}
