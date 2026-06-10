import { NextResponse } from "next/server";
import { z } from "zod";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

const librarySaveSchema = z.object({
  type: z.enum(["file", "note", "response", "web_result", "image", "link", "document"]),
  title: z.string().min(1).max(240),
  content: z.string().max(50000).optional(),
  filePath: z.string().max(1000).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  const parsed = librarySaveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid library item." }, { status: 400 });
  }

  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const { data, error } = await createAdminClient()
    .from("library_items")
    .insert({
      workspace_id: workspaceId,
      user_id: identity.id,
      type: parsed.data.type,
      title: parsed.data.title,
      content: parsed.data.content ?? "",
      file_path: parsed.data.filePath ?? null,
      metadata: parsed.data.metadata ?? {},
      tags: parsed.data.tags ?? []
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json({ error: error?.message ?? "Could not save library item." }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
