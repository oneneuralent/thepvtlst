import { NextResponse } from "next/server";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const identity = await getRuntimeIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const workspaceId = await ensureUserWorkspace(identity);
  const admin = createAdminClient();

  // Get or create limits for workspace
  const { data: limits } = await admin
    .from("browser_limits")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (!limits) {
    // Create default limits
    const { data: newLimits } = await admin
      .from("browser_limits")
      .insert({
        workspace_id: workspaceId,
        max_sessions_per_day: 50,
        max_cost_per_month_usd: 100.00,
        max_duration_per_session_seconds: 300,
        enabled: true
      })
      .select()
      .single();
    return NextResponse.json({ limits: newLimits });
  }

  // Get today's session count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: todaySessions } = await admin
    .from("browser_sessions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("started_at", today.toISOString());

  // Get this month's cost
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: monthSessions } = await admin
    .from("browser_sessions")
    .select("cost_usd")
    .eq("workspace_id", workspaceId)
    .gte("started_at", monthStart.toISOString());

  const monthCost = monthSessions?.reduce((sum, s) => sum + (parseFloat(s.cost_usd as string) || 0), 0) || 0;

  return NextResponse.json({
    limits,
    usage: {
      sessions_today: todaySessions || 0,
      cost_this_month: monthCost,
      can_start_session: limits.enabled && (todaySessions || 0) < limits.max_sessions_per_day && monthCost < limits.max_cost_per_month_usd
    }
  });
}

export async function POST(request: Request) {
  const identity = await getRuntimeIdentity();
  if (!identity) return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });

  const workspaceId = await ensureUserWorkspace(identity);
  const admin = createAdminClient();

  const body = (await request.json().catch(() => null)) as {
    max_sessions_per_day?: number;
    max_cost_per_month_usd?: number;
    max_duration_per_session_seconds?: number;
    enabled?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { error } = await admin
    .from("browser_limits")
    .upsert(
      {
        workspace_id: workspaceId,
        ...body,
        updated_at: new Date().toISOString()
      },
      { onConflict: "workspace_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
