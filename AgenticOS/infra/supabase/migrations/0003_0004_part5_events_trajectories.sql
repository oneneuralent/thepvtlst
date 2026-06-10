create table if not exists public.skill_events (
  id uuid primary key default gen_random_uuid()
);

alter table public.skill_events add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.skill_events add column if not exists skill_id uuid references public.workspace_skills(id) on delete cascade;
alter table public.skill_events add column if not exists version_id uuid references public.skill_versions(id) on delete set null;
alter table public.skill_events add column if not exists run_id uuid references public.agent_runs(id) on delete set null;
alter table public.skill_events add column if not exists event_type text not null default 'proposed';
alter table public.skill_events add column if not exists reason text;
alter table public.skill_events add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.skill_events add column if not exists actor text not null default 'agent';
alter table public.skill_events add column if not exists created_at timestamptz not null default now();

create index if not exists skill_events_workspace_created_idx on public.skill_events (workspace_id, created_at desc);

create table if not exists public.trajectory_samples (
  id uuid primary key default gen_random_uuid()
);

alter table public.trajectory_samples add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.trajectory_samples add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.trajectory_samples add column if not exists thread_id uuid references public.threads(id) on delete set null;
alter table public.trajectory_samples add column if not exists run_id uuid references public.agent_runs(id) on delete cascade;
alter table public.trajectory_samples add column if not exists mode text not null default 'ask';
alter table public.trajectory_samples add column if not exists model_provider text;
alter table public.trajectory_samples add column if not exists model_name text;
alter table public.trajectory_samples add column if not exists completed boolean not null default false;
alter table public.trajectory_samples add column if not exists quality_score numeric;
alter table public.trajectory_samples add column if not exists messages jsonb not null default '[]'::jsonb;
alter table public.trajectory_samples add column if not exists tool_trace jsonb not null default '[]'::jsonb;
alter table public.trajectory_samples add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.trajectory_samples add column if not exists created_at timestamptz not null default now();

create index if not exists trajectory_samples_workspace_created_idx on public.trajectory_samples (workspace_id, created_at desc);
create index if not exists trajectory_samples_run_idx on public.trajectory_samples (run_id);

create table if not exists public.memory_provider_configs (
  id uuid primary key default gen_random_uuid()
);

alter table public.memory_provider_configs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.memory_provider_configs add column if not exists provider text not null default 'supabase_builtin';
alter table public.memory_provider_configs add column if not exists enabled boolean not null default true;
alter table public.memory_provider_configs add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.memory_provider_configs add column if not exists encrypted_secret_ref text;
alter table public.memory_provider_configs add column if not exists created_at timestamptz not null default now();
alter table public.memory_provider_configs add column if not exists updated_at timestamptz not null default now();

create unique index if not exists memory_provider_configs_workspace_provider_idx on public.memory_provider_configs (workspace_id, provider);
