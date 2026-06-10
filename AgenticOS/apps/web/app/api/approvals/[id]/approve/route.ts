import { NextResponse } from "next/server";
import { sendApprovedGmail } from "@/lib/server/email-actions";
import { executeApprovedGoogleDocsWrite, executeApprovedGoogleDocsFindReplace } from "@/lib/server/google-docs-actions";
import { executeApprovedGoogleSheetsWrite } from "@/lib/server/google-sheets-actions";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const { id } = await params;
  const admin = createAdminClient();

  try {
    // Get the approval and tool_call to determine which action to execute
    const { data: approval } = await admin
      .from("approvals")
      .select("tool_call_id")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    const { data: toolCall } = await admin
      .from("tool_calls")
      .select("tool_name")
      .eq("id", approval.tool_call_id)
      .single();

    if (!toolCall) {
      return NextResponse.json({ error: "Tool call not found" }, { status: 404 });
    }

    const toolName = toolCall.tool_name;

    // Gmail send — legacy name "google.gmail.send" or agent connector name "gmail_send"
    if (toolName === "google.gmail.send" || toolName === "gmail_send") {
      const result = await sendApprovedGmail({
        admin,
        approvalId: id,
        userId: identity.id,
        workspaceId
      });
      return NextResponse.json({ ok: true, status: "sent", gmailMessageId: result.gmailMessageId });
    }

    // Google Docs write
    if (toolName === "google.docs.write" || toolName === "google_docs_write") {
      const result = await executeApprovedGoogleDocsWrite({
        admin,
        approvalId: id,
        userId: identity.id,
        workspaceId
      });
      return NextResponse.json({ ok: true, status: "written", documentId: result.documentId });
    }

    // Google Docs find & replace
    if (toolName === "google.docs.find_replace" || toolName === "google_docs_find_replace") {
      const result = await executeApprovedGoogleDocsFindReplace({
        admin,
        approvalId: id,
        userId: identity.id,
        workspaceId
      });
      return NextResponse.json({ ok: true, status: "replaced", occurrencesChanged: result.occurrencesChanged });
    }

    // Google Sheets write
    if (toolName === "google.sheets.write" || toolName === "google_sheets_write") {
      const result = await executeApprovedGoogleSheetsWrite({
        admin,
        approvalId: id,
        userId: identity.id,
        workspaceId
      });
      return NextResponse.json({ ok: true, status: "written", spreadsheetId: result.spreadsheetId });
    }

    return NextResponse.json({ error: `Unsupported tool for approval: ${toolName}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval execution failed." },
      { status: 500 }
    );
  }
}
