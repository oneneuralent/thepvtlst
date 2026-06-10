import { createAdminClient } from "@/lib/supabase/admin";

export type WorkspaceSkillContextItem = {
  id: string;
  type: "workspace_skill";
  title: string;
  content: string;
  category: string;
  status: string;
  versionId?: string | null;
};

export type WorkspaceSkillRow = {
  id: string;
  name: string;
  category: string;
  description: string;
  status: string;
  scope?: string | null;
  current_version_id?: string | null;
  created_at?: string;
  version?: {
    id: string;
    version: number;
    body: string;
    status: string;
    safety_status: string;
  } | null;
};

export async function loadWorkspaceSkillsForDisplay(workspaceId: string) {
  const admin = createAdminClient();
  const { data: skills, error } = await admin
    .from("workspace_skills")
    .select("id,name,category,description,status,scope,current_version_id,created_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error || !skills?.length) return [];

  const versionsBySkillId = new Map<string, WorkspaceSkillRow["version"]>();
  const versionsById = new Map<string, WorkspaceSkillRow["version"]>();

  const skillIds = skills.map((skill) => skill.id as string);
  if (skillIds.length) {
    const { data: versions } = await admin
      .from("skill_versions")
      .select("id,skill_id,version,body,status,safety_status")
      .in("skill_id", skillIds)
      .order("version", { ascending: false });

    for (const version of versions ?? []) {
      const normalized = {
        id: version.id as string,
        version: Number(version.version ?? 1),
        body: String(version.body ?? ""),
        status: String(version.status ?? "draft"),
        safety_status: String(version.safety_status ?? "needs_review")
      };
      versionsById.set(version.id as string, normalized);
      if (!versionsBySkillId.has(version.skill_id as string)) {
        versionsBySkillId.set(version.skill_id as string, normalized);
      }
    }
  }

  return skills.map((skill) => ({
    id: skill.id as string,
    name: skill.name as string,
    category: skill.category as string,
    description: skill.description as string,
    status: skill.status as string,
    scope: skill.scope as string | null,
    current_version_id: skill.current_version_id as string | null,
    created_at: skill.created_at as string,
    version: skill.current_version_id
      ? versionsById.get(skill.current_version_id as string) ?? versionsBySkillId.get(skill.id as string) ?? null
      : versionsBySkillId.get(skill.id as string) ?? null
  }));
}

export async function loadActiveWorkspaceSkillContext({
  limit = 6,
  workspaceId
}: {
  limit?: number;
  workspaceId: string;
}): Promise<WorkspaceSkillContextItem[]> {
  const skills = await loadWorkspaceSkillsForDisplay(workspaceId);
  return skills
    .filter((skill) => skill.status === "active" && skill.version?.status === "active" && skill.version.safety_status === "passed")
    .slice(0, limit)
    .map((skill) => ({
      id: skill.id,
      type: "workspace_skill",
      title: skill.name,
      content: [
        `Description: ${skill.description}`,
        `Category: ${skill.category}`,
        "Procedure:",
        skill.version?.body ?? ""
      ].join("\n"),
      category: skill.category,
      status: skill.status,
      versionId: skill.version?.id ?? null
    }));
}

export async function proposeWorkspaceSkill({
  body,
  category,
  description,
  name,
  reason,
  userId,
  workspaceId
}: {
  body: string;
  category: string;
  description: string;
  name: string;
  reason?: string;
  userId: string;
  workspaceId: string;
}) {
  const admin = createAdminClient();
  const { data: skill, error: skillError } = await admin
    .from("workspace_skills")
    .upsert(
      {
        workspace_id: workspaceId,
        name,
        category,
        description,
        status: "needs_review",
        created_by: userId
      },
      { onConflict: "workspace_id,name" }
    )
    .select("id")
    .single();

  if (skillError || !skill?.id) {
    throw new Error(skillError?.message ?? "Could not create workspace skill.");
  }

  const { count } = await admin
    .from("skill_versions")
    .select("id", { count: "exact", head: true })
    .eq("skill_id", skill.id);

  const { data: version, error: versionError } = await admin
    .from("skill_versions")
    .insert({
      skill_id: skill.id,
      workspace_id: workspaceId,
      version: (count ?? 0) + 1,
      body,
      changelog: reason ?? "Proposed manually from The PVTLST.",
      status: "draft",
      safety_status: "needs_review",
      created_by: userId
    })
    .select("id")
    .single();

  if (versionError || !version?.id) {
    throw new Error(versionError?.message ?? "Could not create skill version.");
  }

  await admin.from("skill_events").insert({
    workspace_id: workspaceId,
    skill_id: skill.id,
    version_id: version.id,
    event_type: "proposed",
    reason: reason ?? "Manual workspace skill proposal.",
    actor: "user",
    metadata: { source: "api/workspace-skills" }
  });

  return { skillId: skill.id as string, versionId: version.id as string };
}
