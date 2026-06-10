create table if not exists public.connections (
  id uuid primary key default gen_random_uuid()
);

alter table public.connections add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.connections add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.connections add column if not exists provider text not null default 'unknown';
alter table public.connections add column if not exists provider_account_id text;
alter table public.connections add column if not exists scopes text[] not null default '{}';
alter table public.connections add column if not exists encrypted_access_token text;
alter table public.connections add column if not exists encrypted_refresh_token text;
alter table public.connections add column if not exists expires_at timestamptz;
alter table public.connections add column if not exists status text not null default 'connected';
alter table public.connections add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.connections add column if not exists created_at timestamptz not null default now();
alter table public.connections add column if not exists updated_at timestamptz not null default now();
alter table public.connections add column if not exists connection_type text not null default 'oauth';
alter table public.connections add column if not exists token_last_refreshed_at timestamptz;
alter table public.connections add column if not exists last_used_at timestamptz;

create table if not exists public.skill_registry (
  id uuid primary key default gen_random_uuid()
);

alter table public.skill_registry add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.skill_registry add column if not exists name text not null default 'unnamed_skill';
alter table public.skill_registry add column if not exists provider text not null default 'agenticos';
alter table public.skill_registry add column if not exists category text not null default 'connector';
alter table public.skill_registry add column if not exists description text not null default '';
alter table public.skill_registry add column if not exists required_scopes text[] not null default '{}';
alter table public.skill_registry add column if not exists allowed_modes text[] not null default '{}';
alter table public.skill_registry add column if not exists approval_required boolean not null default false;
alter table public.skill_registry add column if not exists enabled boolean not null default true;
alter table public.skill_registry add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.skill_registry add column if not exists created_at timestamptz not null default now();
alter table public.skill_registry add column if not exists updated_at timestamptz not null default now();

create unique index if not exists skill_registry_workspace_name_idx on public.skill_registry (workspace_id, name);

create table if not exists public.connection_events (
  id uuid primary key default gen_random_uuid()
);

alter table public.connection_events add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.connection_events add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.connection_events add column if not exists connection_id uuid references public.connections(id) on delete set null;
alter table public.connection_events add column if not exists provider text not null default 'unknown';
alter table public.connection_events add column if not exists event_type text not null default 'unknown';
alter table public.connection_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.connection_events add column if not exists created_at timestamptz not null default now();
