alter table if exists public.profiles drop constraint if exists profiles_id_fkey;
alter table if exists public.workspaces drop constraint if exists workspaces_owner_id_fkey;
alter table if exists public.workspace_members drop constraint if exists workspace_members_user_id_fkey;
alter table if exists public.threads drop constraint if exists threads_user_id_fkey;
alter table if exists public.agent_runs drop constraint if exists agent_runs_user_id_fkey;
alter table if exists public.library_items drop constraint if exists library_items_user_id_fkey;
alter table if exists public.canvas_boards drop constraint if exists canvas_boards_user_id_fkey;
alter table if exists public.connections drop constraint if exists connections_user_id_fkey;
alter table if exists public.usage_events drop constraint if exists usage_events_user_id_fkey;
alter table if exists public.tool_calls drop constraint if exists tool_calls_approved_by_fkey;
alter table if exists public.approvals drop constraint if exists approvals_approved_by_fkey;

alter table if exists public.profiles add column if not exists auth_provider text not null default 'supabase';
alter table if exists public.profiles add column if not exists external_user_id text;
alter table if exists public.profiles add column if not exists clerk_user_id text;

create unique index if not exists profiles_auth_provider_external_user_id_idx
on public.profiles (auth_provider, external_user_id)
where external_user_id is not null;

create unique index if not exists profiles_clerk_user_id_idx
on public.profiles (clerk_user_id)
where clerk_user_id is not null;
