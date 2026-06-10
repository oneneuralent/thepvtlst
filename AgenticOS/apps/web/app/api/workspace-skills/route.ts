import { NextResponse } from "next/server";
import { z } from "zod";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { loadWorkspaceSkillsForDisplay, proposeWorkspaceSkill } from "@/lib/server/workspace-skills";
import { ensureUserWorkspace } from "@/lib/server/workspace";

const proposeSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.string().min(1).max(80).default("workflow"),
  description: z.string().min(1).max(300),
  body: z.string().min(1).max(5000),
  reason: z.string().max(300).optional()
});

export async function GET() {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  return NextResponse.json({ skills: await loadWorkspaceSkillsForDisplay(workspaceId) });
}

export async function POST(request: Request) {
  const parsed = proposeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid workspace skill payload." }, { status: 400 });
  }

  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const result = await proposeWorkspaceSkill({
    ...parsed.data,
    userId: identity.id,
    workspaceId
  });

  return NextResponse.json({ status: "needs_review", ...result });
}
