import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type EmailDraft = {
  to: string;
  subject: string;
  body: string;
};

type GoogleConnection = {
  id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  expires_at: string | null;
  scopes: string[] | null;
};

export function parseEmailSendIntent(message: string): EmailDraft | null {
  const toMatch = message.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (!toMatch) return null;

  const lower = message.toLowerCase();
  const looksLikeSend = /\b(send|email|mail|gmail)\b/i.test(message) && lower.includes("send");
  if (!looksLikeSend) return null;

  const afterAddress = message.slice(toMatch.index! + toMatch[0].length).trim();
  const cleanedBody = afterAddress
    .replace(/^,+\s*/, "")
    .replace(/^(and\s+)?(tell|say|saying|message|body)\s+(him|her|them|[a-z\s]{1,40})?\s*(that\s+)?/i, "")
    .replace(/^[:,-]\s*/, "")
    .trim();

  const body = cleanedBody || "Hi,\n\nI wanted to share this with you.\n\nBest,";

  return {
    to: toMatch[0],
    subject: "A note from The PVTLST",
    body
  };
}

export async function createEmailApproval({
  admin,
  draft,
  runId,
  workspaceId
}: {
  admin: AdminClient;
  draft: EmailDraft;
  runId: string;
  workspaceId: string;
}) {
  const { data: toolCall, error: toolError } = await admin
    .from("tool_calls")
    .insert({
      workspace_id: workspaceId,
      run_id: runId,
      tool_name: "google.gmail.send",
      tool_category: "connector",
      input: draft,
      output: { draftOnly: true, message: "Prepared Gmail draft and paused for approval." },
      status: "requires_approval",
      requires_approval: true
    })
    .select("id")
    .single();

  if (toolError || !toolCall?.id) {
    throw new Error(toolError?.message ?? "Could not create email tool call.");
  }

  const { data: approval, error: approvalError } = await admin
    .from("approvals")
    .insert({
      workspace_id: workspaceId,
      run_id: runId,
      tool_call_id: toolCall.id,
      status: "pending",
      approval_payload: draft
    })
    .select("id")
    .single();

  if (approvalError || !approval?.id) {
    throw new Error(approvalError?.message ?? "Could not create approval.");
  }

  return {
    approvalId: approval.id as string,
    toolCallId: toolCall.id as string
  };
}

export async function sendApprovedGmail({
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

  // Handle both flat {to,subject,body} and connector-wrapped {draft:{to,subject,body}} formats
  const rawPayload = approval.approval_payload as Record<string, unknown>;
  const draft = ((rawPayload.draft ?? rawPayload) as Partial<EmailDraft>);
  if (!draft.to || !draft.subject || !draft.body) {
    throw new Error("Approval payload is missing email draft fields.");
  }

  const { token, connectionId } = await getGoogleAccessToken({ admin, workspaceId, userId });
  const raw = encodeRawEmail({
    to: draft.to,
    subject: draft.subject,
    body: draft.body
  });

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });

  const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Gmail send failed with HTTP ${response.status}.`);
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
      output: { gmailMessageId: payload.id ?? null, sent: true },
      approved_by: userId,
      approved_at: now
    })
    .eq("id", approval.tool_call_id)
    .eq("workspace_id", workspaceId);

  await admin
    .from("agent_runs")
    .update({
      status: "completed",
      output: { message: "Approved Gmail message sent.", gmailMessageId: payload.id ?? null },
      completed_at: now
    })
    .eq("id", approval.run_id)
    .eq("workspace_id", workspaceId);

  await admin.from("connection_events").insert({
    workspace_id: workspaceId,
    user_id: userId,
    connection_id: connectionId,
    provider: "google",
    event_type: "gmail_send",
    metadata: { to: draft.to, subject: draft.subject, gmailMessageId: payload.id ?? null }
  });

  return { gmailMessageId: payload.id ?? null };
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
    .maybeSingle<GoogleConnection>();

  if (error) throw new Error(error.message);
  if (!connection) throw new Error("Google Workspace is not connected.");

  const scopes = connection.scopes ?? [];
  if (!scopes.includes("https://www.googleapis.com/auth/gmail.send")) {
    throw new Error("Reconnect Google Workspace with Gmail send permission.");
  }

  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  const shouldRefresh = Boolean(connection.encrypted_refresh_token) && expiresAt < Date.now() + 120_000;
  if (shouldRefresh) {
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

  const token = decryptSecret(connection.encrypted_access_token);
  if (!token) throw new Error("Google access token could not be decrypted. Reconnect Google Workspace.");

  return { token, connectionId: connection.id };
}

async function refreshGoogleAccessToken(encryptedRefreshToken: string) {
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

function encodeRawEmail(draft: EmailDraft) {
  const sanitizeHeader = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  const raw = [
    `To: ${sanitizeHeader(draft.to)}`,
    `Subject: ${sanitizeHeader(draft.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    draft.body
  ].join("\r\n");

  return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
