import { auth } from "@clerk/nextjs/server";
import type { User } from "@supabase/supabase-js";
import { isClerkAuthMode, isDevAuthMode } from "@/lib/auth-mode";
import { createClient } from "@/lib/supabase/server";

export type RuntimeIdentity = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  authProvider: "dev" | "supabase" | "clerk";
  externalUserId: string;
};

export function getDevIdentity(): RuntimeIdentity {
  return {
    id: process.env.DEV_USER_ID ?? "00000000-0000-4000-8000-000000000001",
    email: process.env.DEV_USER_EMAIL ?? "builder@one.local",
    fullName: "The PVTLST Builder",
    avatarUrl: null,
    authProvider: "dev",
    externalUserId: process.env.DEV_USER_ID ?? "00000000-0000-4000-8000-000000000001"
  };
}

export async function getRuntimeIdentity(): Promise<RuntimeIdentity | null> {
  if (isDevAuthMode()) {
    return getDevIdentity();
  }

  if (isClerkAuthMode()) {
    return fromClerkAuth();
  }

  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return fromSupabaseUser(user);
}

async function fromClerkAuth(): Promise<RuntimeIdentity | null> {
  const session = await auth();
  const userId = session.userId;

  if (!userId) {
    return null;
  }

  const claims = session.sessionClaims as Record<string, unknown> | null;
  const email =
    typeof claims?.email === "string"
      ? claims.email
      : typeof claims?.primary_email_address === "string"
        ? claims.primary_email_address
        : `${userId}@one.local`;
  const fullName =
    typeof claims?.name === "string"
      ? claims.name
      : typeof claims?.given_name === "string"
        ? claims.given_name
        : "Clerk user";
  const avatarUrl = typeof claims?.picture === "string" ? claims.picture : null;

  return {
    id: stableUuidFromString(`clerk:${userId}`),
    email,
    fullName,
    avatarUrl,
    authProvider: "clerk",
    externalUserId: userId
  };
}

function stableUuidFromString(input: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-0000-4000-8000-${hex}${hex}`.slice(0, 36);
}

function fromSupabaseUser(user: User): RuntimeIdentity {
  const email = user.email ?? "workspace@one.local";

  return {
    id: user.id,
    email,
    fullName: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : email.split("@")[0],
    avatarUrl: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : null,
    authProvider: "supabase",
    externalUserId: user.id
  };
}
