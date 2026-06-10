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
  const { title } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
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
    const response = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ error: `Google Sheets API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    return NextResponse.json({
      spreadsheetId: data.spreadsheetId,
      spreadsheet_url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
      message: "Spreadsheet created successfully",
    });
  } catch (error) {
    console.error("[google-sheets-create] Error:", error);
    return NextResponse.json({ error: "Failed to create Google Sheet" }, { status: 500 });
  }
}
