import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailApproval } from "@/lib/server/email-actions";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

const draftSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000)
});

export async function POST(request: Request) {
  const parsed = draftSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid draft payload." }, { status: 400 });
  }

  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const admin = createAdminClient();
  const { data: run, error: runError } = await admin
    .from("agent_runs")
    .insert({
      workspace_id: workspaceId,
      user_id: identity.id,
      mode: "act",
      status: "requires_approval",
      input: { emailDraft: parsed.data },
      output: { message: "Email draft prepared and waiting for approval." }
    })
    .select("id")
    .single();

  if (runError || !run?.id) {
    return NextResponse.json({ error: runError?.message ?? "Could not create email approval run." }, { status: 500 });
  }

  let approvalId: string;
  try {
    approvalId = (
      await createEmailApproval({
        admin,
        workspaceId,
        runId: run.id as string,
        draft: parsed.data
      })
    ).approvalId;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create approval." },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "requires_approval", approvalId, runId: run.id });
}
