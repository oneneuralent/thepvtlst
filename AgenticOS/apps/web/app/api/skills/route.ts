import { NextResponse } from "next/server";
import { agenticSkillCatalog, blockedHermesToolsets } from "@/lib/server/skill-catalog";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { loadWorkspaceSkillsForDisplay } from "@/lib/server/workspace-skills";
import { ensureUserWorkspace } from "@/lib/server/workspace";

export async function GET() {
  const identity = await getRuntimeIdentity();
  const workspaceSkills = [];
  if (identity) {
    const workspaceId = await ensureUserWorkspace(identity);
    workspaceSkills.push(...(await loadWorkspaceSkillsForDisplay(workspaceId)));
  }

  return NextResponse.json({
    skills: agenticSkillCatalog,
    workspaceSkills,
    blockedHermesToolsets,
    enginePattern: {
      loop: "Hermes AIAgent",
      prompting: "prompt_builder-style mode assembly",
      registry: "The PVTLST safe skill catalog + connector tools",
      memory: "Supabase-scoped provider bridge",
      safety: "approval-gated Act Mode"
    }
  });
}
