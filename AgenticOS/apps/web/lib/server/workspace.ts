import type { RuntimeIdentity } from "@/lib/server/identity";
import { createAdminClient } from "@/lib/supabase/admin";

export async function ensureUserWorkspace(identity: RuntimeIdentity) {
  const supabase = createAdminClient();

  // Try to insert profile first, fall back to update if exists
  const { error: profileError } = await withSupabaseRetry(() =>
    supabase.from("profiles").upsert({
      id: identity.id,
      email: identity.email,
      full_name: identity.fullName,
      avatar_url: identity.avatarUrl,
      auth_provider: identity.authProvider,
      external_user_id: identity.externalUserId,
      clerk_user_id: identity.authProvider === "clerk" ? identity.externalUserId : null
    }, { onConflict: "id" })
  );

  // Ignore duplicate key errors - profile already exists
  if (profileError && !profileError.message.includes("duplicate key")) {
    throw new Error(`Could not ensure profile: ${profileError.message}`);
  }

  const { data: existingMembership, error: membershipError } = await withSupabaseRetry(() =>
    supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", identity.id)
      .limit(1)
      .maybeSingle()
  );

  if (membershipError) {
    throw new Error(`Could not load workspace membership: ${membershipError.message}`);
  }

  if (existingMembership?.workspace_id) {
    return existingMembership.workspace_id as string;
  }

  const { data: workspace, error: workspaceError } = await withSupabaseRetry(() =>
    supabase
      .from("workspaces")
      .insert({
        name: "Personal workspace",
        owner_id: identity.id
      })
      .select("id")
      .single()
  );

  if (workspaceError || !workspace?.id) {
    throw new Error(`Could not create workspace: ${workspaceError?.message ?? "unknown error"}`);
  }

  const { error: memberError } = await withSupabaseRetry(() =>
    supabase.from("workspace_members").insert({
      workspace_id: workspace.id,
      user_id: identity.id,
      role: "owner"
    })
  );

  if (memberError) {
    throw new Error(`Could not create workspace membership: ${memberError.message}`);
  }

  await withSupabaseRetry(() =>
    supabase.from("canvas_boards").insert({
      workspace_id: workspace.id,
      user_id: identity.id,
      title: "Main board"
    })
  );

  return workspace.id as string;
}

async function withSupabaseRetry<T>(operation: () => PromiseLike<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      const maybeError = result as { error?: { message?: string } | null };

      if (!maybeError.error || !isRetryableSupabaseError(maybeError.error.message)) {
        return result;
      }

      lastError = maybeError.error;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 650));
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  return operation() as Promise<T>;
}

function isRetryableSupabaseError(message?: string) {
  if (!message) return false;
  return /fetch failed|network|timeout|terminated|econnreset/i.test(message);
}
