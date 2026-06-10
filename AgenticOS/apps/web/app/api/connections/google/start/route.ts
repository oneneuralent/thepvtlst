import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildGoogleOAuthUrl } from "@/lib/server/google";
import { getRuntimeIdentity } from "@/lib/server/identity";
import { ensureUserWorkspace } from "@/lib/server/workspace";

export async function POST() {
  const identity = await getRuntimeIdentity();
  if (!identity) {
    return NextResponse.json({ error: "No runtime identity is configured." }, { status: 401 });
  }

  const workspaceId = await ensureUserWorkspace(identity);
  const state = Buffer.from(
    JSON.stringify({
      workspaceId,
      userId: identity.id,
      nonce: crypto.randomBytes(16).toString("base64url")
    })
  ).toString("base64url");

  try {
    return NextResponse.json({ url: buildGoogleOAuthUrl(state) });
  } catch (error) {
    console.error("[google-start] OAuth start failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Google OAuth." },
      { status: 500 }
    );
  }
}
