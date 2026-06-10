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
    ({ token: accessToken } = await getGoogleTokenForWorkspace(admin, workspaceId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
  }

  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.document'&fields=files(id,name,webViewLink,modifiedTime)&orderBy=modifiedTime desc&pageSize=20",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) return NextResponse.json({ error: `Drive API error: HTTP ${response.status}` }, { status: 502 });
  const data = await response.json() as { files?: { id: string; name: string; webViewLink: string; modifiedTime: string }[] };
  return NextResponse.json({ documents: data.files ?? [] });
}
