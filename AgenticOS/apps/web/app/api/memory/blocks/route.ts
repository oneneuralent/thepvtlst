import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/memory/blocks - List all memory blocks for workspace
export async function GET(request: Request) {
  try {
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("memory_blocks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ blocks: data || [] });
  } catch (error: any) {
    console.error("Failed to list memory blocks:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/memory/blocks - Create or update a memory block
export async function POST(request: Request) {
  try {
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    const body = await request.json();
    const { label, description, value, char_limit } = body;

    if (!label || !description || !value) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Upsert: if exists, update; if not, create
    const { data, error } = await supabase
      .from("memory_blocks")
      .upsert({
        workspace_id: workspaceId,
        label,
        description,
        value,
        char_limit: char_limit || 2000,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ block: data });
  } catch (error: any) {
    console.error("Failed to write memory block:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/memory/blocks - Delete a memory block
export async function DELETE(request: Request) {
  try {
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspace_id" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const label = searchParams.get("label");

    if (!label) {
      return NextResponse.json({ error: "Missing label parameter" }, { status: 400 });
    }

    const { error } = await supabase
      .from("memory_blocks")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("label", label);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete memory block:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
