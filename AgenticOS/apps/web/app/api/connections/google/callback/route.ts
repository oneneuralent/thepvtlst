import { NextResponse } from "next/server";
import { exchangeGoogleCode, loadGoogleProfile, serializeGoogleTokens } from "@/lib/server/google";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/app?connection=google_error", request.url));
  }

  try {
    const parsedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      workspaceId: string;
      userId: string;
    };
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.access_token) {
      throw new Error("Google did not return an access token.");
    }

    const profile = await loadGoogleProfile(tokens.access_token);
    const serialized = serializeGoogleTokens(tokens);
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("connections")
      .select("id, encrypted_refresh_token")
      .eq("workspace_id", parsedState.workspaceId)
      .eq("user_id", parsedState.userId)
      .eq("provider", "google")
      .maybeSingle();

    const connectionPayload = {
        workspace_id: parsedState.workspaceId,
        user_id: parsedState.userId,
        provider: "google",
        provider_account_id: profile.email ?? profile.id,
        scopes: serialized.scopes,
        encrypted_access_token: serialized.encryptedAccessToken,
        encrypted_refresh_token: serialized.encryptedRefreshToken ?? existing?.encrypted_refresh_token ?? null,
        expires_at: serialized.expiresAt,
        status: "connected",
        metadata: { email: profile.email, googleUserId: profile.id },
        token_last_refreshed_at: new Date().toISOString()
      };

    const { error } = existing?.id
      ? await admin.from("connections").update(connectionPayload).eq("id", existing.id)
      : await admin.from("connections").insert(connectionPayload);

    if (error) {
      throw new Error(error.message);
    }

    await admin.from("connection_events").insert({
      workspace_id: parsedState.workspaceId,
      user_id: parsedState.userId,
      provider: "google",
      event_type: "connected",
      metadata: { scopes: serialized.scopes, email: profile.email }
    });

    return NextResponse.redirect(new URL("/app?connection=google_connected", request.url));
  } catch (error) {
    console.error("[google-callback] OAuth exchange failed:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/app?connection=google_error", request.url));
  }
}
