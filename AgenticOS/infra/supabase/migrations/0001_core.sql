create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New thread',
  mode text not null check (mode in ('ask', 'create', 'act')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('ask', 'create', 'act')),
  status text not null check (status in ('queued', 'running', 'requires_approval', 'completed', 'failed', 'cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tool_name text not null,
  tool_category text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  requires_approval boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('file', 'note', 'response', 'web_result', 'image', 'link', 'document')),
  title text not null,
  content text,
  file_path text,
  metadata jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.canvas_boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Main board',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.canvas_cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.canvas_boards(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null,
  title text not null,
  content text,
  position jsonb not null default '{"x":0,"y":0}'::jsonb,
  size jsonb not null default '{"w":320,"h":240}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  scopes text[] not null default '{}',
  encrypted_access_token text,
  encrypted_refresh_token text,
  expires_at timestamptz,
  status text not null check (status in ('connected', 'expired', 'revoked', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_call_id uuid not null references public.tool_calls(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected', 'edited')),
  approval_payload jsonb not null default '{}'::jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  quantity numeric not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at before update on public.profiles for each row execute function public.touch_updated_at();

drop trigger if exists touch_workspaces_updated_at on public.workspaces;
create trigger touch_workspaces_updated_at before update on public.workspaces for each row execute function public.touch_updated_at();

drop trigger if exists touch_threads_updated_at on public.threads;
create trigger touch_threads_updated_at before update on public.threads for each row execute function public.touch_updated_at();

drop trigger if exists touch_library_items_updated_at on public.library_items;
create trigger touch_library_items_updated_at before update on public.library_items for each row execute function public.touch_updated_at();

drop trigger if exists touch_canvas_boards_updated_at on public.canvas_boards;
create trigger touch_canvas_boards_updated_at before update on public.canvas_boards for each row execute function public.touch_updated_at();

drop trigger if exists touch_canvas_cards_updated_at on public.canvas_cards;
create trigger touch_canvas_cards_updated_at before update on public.canvas_cards for each row execute function public.touch_updated_at();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.agent_runs enable row level security;
alter table public.tool_calls enable row level security;
alter table public.library_items enable row level security;
alter table public.canvas_boards enable row level security;
alter table public.canvas_cards enable row level security;
alter table public.connections enable row level security;
alter table public.approvals enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select using (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "workspaces_members_read" on public.workspaces;
create policy "workspaces_members_read" on public.workspaces for select using (public.is_workspace_member(id));

drop policy if exists "workspace_members_read" on public.workspace_members;
create policy "workspace_members_read" on public.workspace_members for select using (public.is_workspace_member(workspace_id));

drop policy if exists "threads_workspace_access" on public.threads;
create policy "threads_workspace_access" on public.threads for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "messages_workspace_access" on public.messages;
create policy "messages_workspace_access" on public.messages for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "agent_runs_workspace_access" on public.agent_runs;
create policy "agent_runs_workspace_access" on public.agent_runs for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "tool_calls_workspace_access" on public.tool_calls;
create policy "tool_calls_workspace_access" on public.tool_calls for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "library_items_workspace_access" on public.library_items;
create policy "library_items_workspace_access" on public.library_items for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "canvas_boards_workspace_access" on public.canvas_boards;
create policy "canvas_boards_workspace_access" on public.canvas_boards for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "canvas_cards_workspace_access" on public.canvas_cards;
create policy "canvas_cards_workspace_access" on public.canvas_cards for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "connections_workspace_access" on public.connections;
create policy "connections_workspace_access" on public.connections for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "approvals_workspace_access" on public.approvals;
create policy "approvals_workspace_access" on public.approvals for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

drop policy if exists "usage_events_workspace_access" on public.usage_events;
create policy "usage_events_workspace_access" on public.usage_events for all using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_workspace_id uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.workspaces (name, owner_id)
  values ('Personal workspace', new.id)
  returning id into new_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new_workspace_id, new.id, 'owner');

  insert into public.canvas_boards (workspace_id, user_id, title)
  values (new_workspace_id, new.id, 'Main board');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
