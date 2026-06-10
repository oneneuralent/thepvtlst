import { NextResponse } from "next/server";
import { processQueuedLearningJobs } from "@/lib/server/learning";

export async function POST(request: Request) {
  const expected = process.env.AGENT_API_SECRET;
  const provided = request.headers.get("x-agent-api-secret");

  if (expected && provided !== expected) {
    return NextResponse.json({ error: "Invalid learning worker secret." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const results = await processQueuedLearningJobs(Math.min(Math.max(body.limit ?? 3, 1), 10));

  return NextResponse.json({ results });
}
