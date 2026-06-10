import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type GoogleSheetsWriteDraft = {
  spreadsheet_id: string;
  range: string;
  values: string[][];
};

export async function executeApprovedGoogleSheetsWrite({
  admin,
  approvalId,
  userId,
  workspaceId
}: {
  admin: AdminClient;
  approvalId: string;
  userId: string;
  workspaceId: string;
}) {
  const { data: approval, error: approvalError } = await admin
    .from("approvals")
    .select("id, run_id, tool_call_id, status, approval_payload")
    .eq("id", approvalId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (approvalError) throw new Error(approvalError.message);
  if (!approval) throw new Error("Approval request was not found.");
  if (approval.status !== "pending") throw new Error(`Approval is already ${approval.status}.`);

  const rawPayload = approval.approval_payload as Record<string, unknown>;
  const draft = ((rawPayload.draft ?? rawPayload) as Partial<GoogleSheetsWriteDraft>);
  if (!draft.spreadsheet_id || !draft.range || !draft.values) {
    throw new Error("Approval payload is missing required fields (spreadsheet_id, range, values).");
  }

  const { token, connectionId } = await getGoogleAccessToken({ admin, workspaceId, userId });

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${draft.spreadsheet_id}/values/${encodeURIComponent(draft.range)}:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: draft.values,
      }),
    }
  );

  const apiPayload = (await response.json().catch(() => ({}))) as { spreadsheetId?: string; updates?: any; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(apiPayload.error?.message ?? `Google Sheets API failed with HTTP ${response.status}.`);
  }

  const now = new Date().toISOString();
  await admin
    .from("approvals")
    .update({ status: "approved", approved_by: userId, resolved_at: now })
    .eq("id", approvalId)
    .eq("workspace_id", workspaceId);

  await admin
    .from("tool_calls")
    .update({
      status: "completed",
      output: { spreadsheetId: apiPayload.spreadsheetId, updates: apiPayload.updates, written: true },
      approved_by: userId,
      approved_at: now
    })
    .eq("id", approval.tool_call_id)
    .eq("workspace_id", workspaceId);

  await admin
    .from("agent_runs")
    .update({
      status: "completed",
      output: { message: "Approved Google Sheets write completed.", spreadsheetId: apiPayload.spreadsheetId },
      completed_at: now
    })
    .eq("id", approval.run_id)
    .eq("workspace_id", workspaceId);

  await admin.from("connection_events").insert({
    workspace_id: workspaceId,
    user_id: userId,
    connection_id: connectionId,
    provider: "google",
    event_type: "google_sheets_write",
    metadata: { spreadsheetId: apiPayload.spreadsheetId, range: draft.range }
  });

  return { spreadsheetId: apiPayload.spreadsheetId };
}

async function getGoogleAccessToken({
  admin,
  userId,
  workspaceId
}: {
  admin: AdminClient;
  userId: string;
  workspaceId: string;
}) {
  const { data: connection, error } = await admin
    .from("connections")
    .select("id, encrypted_access_token, encrypted_refresh_token, expires_at, scopes")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!connection) throw new Error("Google Workspace is not connected.");

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  const shouldRefresh = Boolean(connection.encrypted_refresh_token) && expiresAt < Date.now() + 120_000;
  if (shouldRefresh) {
    const { decryptSecret, encryptSecret } = await import("@/lib/server/crypto");
    const refreshed = await refreshGoogleAccessToken(connection.encrypted_refresh_token!);
    await admin
      .from("connections")
      .update({
        encrypted_access_token: encryptSecret(refreshed.accessToken),
        expires_at: refreshed.expiresAt,
        token_last_refreshed_at: new Date().toISOString()
      })
      .eq("id", connection.id);
    return { token: refreshed.accessToken, connectionId: connection.id };
  }

  const { decryptSecret } = await import("@/lib/server/crypto");
  const token = decryptSecret(connection.encrypted_access_token);
  if (!token) throw new Error("Google access token could not be decrypted. Reconnect Google Workspace.");

  return { token, connectionId: connection.id };
}

async function refreshGoogleAccessToken(encryptedRefreshToken: string) {
  const { decryptSecret } = await import("@/lib/server/crypto");
  const refreshToken = decryptSecret(encryptedRefreshToken);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Google refresh credentials are not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? `Google token refresh failed with HTTP ${response.status}.`);
  }

  return {
    accessToken: payload.access_token,
    expiresAt: payload.expires_in ? new Date(Date.now() + payload.expires_in * 1000).toISOString() : null
  };
}
