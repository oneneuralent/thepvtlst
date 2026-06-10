create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid()
);

alter table public.agent_profiles add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.agent_profiles add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.agent_profiles add column if not exists name text not null default 'default';
alter table public.agent_profiles add column if not exists runtime text not null default 'safe-hermes';
alter table public.agent_profiles add column if not exists model_provider text not null default 'openrouter';
alter table public.agent_profiles add column if not exists model_name text;
alter table public.agent_profiles add column if not exists memory_policy jsonb not null default '{"auto_extract":true,"require_review_for_sensitive":true,"max_context_memories":12,"promote_skills_after_successes":3}'::jsonb;
alter table public.agent_profiles add column if not exists tool_policy jsonb not null default '{}'::jsonb;
alter table public.agent_profiles add column if not exists status text not null default 'active';
alter table public.agent_profiles add column if not exists created_at timestamptz not null default now();
alter table public.agent_profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists agent_profiles_workspace_user_name_idx on public.agent_profiles (workspace_id, user_id, name);

create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid()
);

alter table public.memory_events add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.memory_events add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.memory_events add column if not exists memory_id uuid references public.memories(id) on delete set null;
alter table public.memory_events add column if not exists run_id uuid references public.agent_runs(id) on delete set null;
alter table public.memory_events add column if not exists thread_id uuid references public.threads(id) on delete set null;
alter table public.memory_events add column if not exists event_type text not null default 'proposed';
alter table public.memory_events add column if not exists before jsonb;
alter table public.memory_events add column if not exists after jsonb;
alter table public.memory_events add column if not exists reason text;
alter table public.memory_events add column if not exists actor text not null default 'agent';
alter table public.memory_events add column if not exists safety_status text not null default 'passed';
alter table public.memory_events add column if not exists blocked_reason text;
alter table public.memory_events add column if not exists created_at timestamptz not null default now();

create index if not exists memory_events_workspace_created_idx on public.memory_events (workspace_id, created_at desc);
create index if not exists memory_events_memory_created_idx on public.memory_events (memory_id, created_at desc);

create table if not exists public.memory_jobs (
  id uuid primary key default gen_random_uuid()
);

alter table public.memory_jobs add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.memory_jobs add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.memory_jobs add column if not exists thread_id uuid references public.threads(id) on delete cascade;
alter table public.memory_jobs add column if not exists run_id uuid references public.agent_runs(id) on delete cascade;
alter table public.memory_jobs add column if not exists job_type text not null default 'extract_turn';
alter table public.memory_jobs add column if not exists status text not null default 'queued';
alter table public.memory_jobs add column if not exists input jsonb not null default '{}'::jsonb;
alter table public.memory_jobs add column if not exists output jsonb not null default '{}'::jsonb;
alter table public.memory_jobs add column if not exists error text;
alter table public.memory_jobs add column if not exists attempts int not null default 0;
alter table public.memory_jobs add column if not exists run_after timestamptz not null default now();
alter table public.memory_jobs add column if not exists started_at timestamptz;
alter table public.memory_jobs add column if not exists completed_at timestamptz;
alter table public.memory_jobs add column if not exists created_at timestamptz not null default now();

create index if not exists memory_jobs_status_run_after_idx on public.memory_jobs (status, run_after, created_at);
create index if not exists memory_jobs_workspace_thread_idx on public.memory_jobs (workspace_id, thread_id, created_at desc);
