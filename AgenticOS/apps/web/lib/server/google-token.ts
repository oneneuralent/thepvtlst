/**
 * Shared helper to get a valid Google access token for a workspace.
 * Used by all Google API routes called from the agent bridge.
 * Supports both header-based identity (from bridge) and session-based identity.
 */
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function getGoogleTokenForWorkspace(
  admin: AdminClient,
  workspaceId: string
): Promise<{ token: string; connectionId: string }> {
  const { data: connection, error } = await admin
    .from("connections")
    .select("id, encrypted_access_token, encrypted_refresh_token, expires_at, scopes")
    .eq("workspace_id", workspaceId)
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!connection) throw new Error("Google account is not connected for this workspace.");

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  const shouldRefresh =
    Boolean(connection.encrypted_refresh_token) && expiresAt < Date.now() + 120_000;

  if (shouldRefresh) {
    const refreshToken = decryptSecret(connection.encrypted_refresh_token!);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!refreshToken || !clientId || !clientSecret) {
      throw new Error("Google refresh credentials are not configured.");
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    });

    const payload = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!res.ok || !payload.access_token) {
      throw new Error(
        payload.error_description ?? `Google token refresh failed with HTTP ${res.status}.`
      );
    }

    const newExpiry = payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null;

    await admin
      .from("connections")
      .update({
        encrypted_access_token: encryptSecret(payload.access_token),
        expires_at: newExpiry,
        token_last_refreshed_at: new Date().toISOString()
      })
      .eq("id", connection.id);

    return { token: payload.access_token, connectionId: connection.id };
  }

  const token = decryptSecret(connection.encrypted_access_token);
  if (!token) {
    throw new Error("Google access token could not be decrypted. Please reconnect Google.");
  }

  return { token, connectionId: connection.id };
}

/**
 * Extract workspace ID from request — supports both x-workspace-id header (bridge)
 * and future session-based approaches.
 */
export function extractWorkspaceId(request: Request): string | null {
  return request.headers.get("x-workspace-id");
}
