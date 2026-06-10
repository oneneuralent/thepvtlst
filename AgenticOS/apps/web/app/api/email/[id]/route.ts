import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/server/crypto";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleTokenForWorkspace, extractWorkspaceId } from "@/lib/server/google-token";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();

  const bridgeWorkspaceId = extractWorkspaceId(request);
  let accessToken: string;

  if (bridgeWorkspaceId) {
    try {
      ({ token: accessToken } = await getGoogleTokenForWorkspace(admin, bridgeWorkspaceId));
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to get Google token" }, { status: 400 });
    }
  } else {
    const identity = await getRuntimeIdentity();
    if (!identity) {
      return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
    }
    const workspaceId = await ensureUserWorkspace(identity);
    const { data: connection } = await admin
      .from("connections")
      .select("encrypted_access_token")
      .eq("workspace_id", workspaceId)
      .eq("user_id", identity.id)
      .eq("provider", "google")
      .eq("status", "connected")
      .maybeSingle();
    const raw = decryptSecret(connection?.encrypted_access_token);
    if (!raw) return NextResponse.json({ error: "Gmail is not connected." }, { status: 409 });
    accessToken = raw;
  }

  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    return NextResponse.json({ error: `Gmail read failed with HTTP ${response.status}.` }, { status: 502 });
  }

  const message = await response.json();
  return NextResponse.json({ message });
}
