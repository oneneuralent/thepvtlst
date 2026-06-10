create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null check (type in ('user', 'workspace', 'thread', 'file', 'preference', 'connection', 'skill')),
  title text not null,
  content text not null,
  source_type text,
  source_id uuid,
  confidence numeric not null default 0.7 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.memories add column if not exists target text not null default 'agent_memory';
alter table public.memories add column if not exists safety_status text not null default 'passed';
alter table public.memories add column if not exists blocked_reason text;
alter table public.memories add column if not exists last_used_at timestamptz;
alter table public.memories add column if not exists usage_count int not null default 0;

create index if not exists memories_workspace_status_created_idx on public.memories (workspace_id, status, created_at desc);
create index if not exists memories_workspace_type_idx on public.memories (workspace_id, type);

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

alter table public.connections add column if not exists connection_type text not null default 'oauth';
alter table public.connections add column if not exists token_last_refreshed_at timestamptz;
alter table public.connections add column if not exists last_used_at timestamptz;

create table if not exists public.skill_registry (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  provider text not null default 'agenticos',
  category text not null,
  description text not null,
  required_scopes text[] not null default '{}',
  allowed_modes text[] not null default '{}',
  approval_required boolean not null default false,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists skill_registry_workspace_name_idx
on public.skill_registry (workspace_id, name);

create table if not exists public.connection_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  provider text not null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null default 'default',
  runtime text not null default 'safe-hermes',
  model_provider text not null default 'openrouter',
  model_name text,
  memory_policy jsonb not null default '{"auto_extract":true,"require_review_for_sensitive":true,"max_context_memories":12,"promote_skills_after_successes":3}'::jsonb,
  tool_policy jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_profiles_workspace_user_name_idx
on public.agent_profiles (workspace_id, user_id, name);

create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  memory_id uuid references public.memories(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  thread_id uuid references public.threads(id) on delete set null,
  event_type text not null check (event_type in ('proposed', 'added', 'updated', 'merged', 'archived', 'deleted', 'rejected', 'blocked')),
  before jsonb,
  after jsonb,
  reason text,
  actor text not null default 'agent' check (actor in ('agent', 'user', 'system', 'admin')),
  safety_status text not null default 'passed' check (safety_status in ('passed', 'needs_review', 'blocked')),
  blocked_reason text,
  created_at timestamptz not null default now()
);

create index if not exists memory_events_workspace_created_idx on public.memory_events (workspace_id, created_at desc);
create index if not exists memory_events_memory_created_idx on public.memory_events (memory_id, created_at desc);

create table if not exists public.memory_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  thread_id uuid references public.threads(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete cascade,
  job_type text not null check (job_type in ('extract_turn', 'summarize_thread', 'pre_compress', 'promote_skill', 'sync_provider')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error text,
  attempts int not null default 0,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists memory_jobs_status_run_after_idx on public.memory_jobs (status, run_after, created_at);
create index if not exists memory_jobs_workspace_thread_idx on public.memory_jobs (workspace_id, thread_id, created_at desc);

create table if not exists public.thread_summaries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  summary text not null,
  durable_facts jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  message_start_id uuid references public.messages(id) on delete set null,
  message_end_id uuid references public.messages(id) on delete set null,
  token_estimate int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists thread_summaries_thread_created_idx on public.thread_summaries (thread_id, created_at desc);

create table if not exists public.workspace_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  category text not null,
  description text not null,
  current_version_id uuid,
  scope text not null default 'workspace' check (scope in ('user', 'workspace', 'global_candidate')),
  status text not null default 'active' check (status in ('draft', 'active', 'needs_review', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.skill_versions (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.workspace_skills(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version int not null,
  body text not null,
  changelog text,
  source_run_id uuid references public.agent_runs(id) on delete set null,
  source_memory_id uuid references public.memories(id) on delete set null,
  status text not null default 'active' check (status in ('draft', 'active', 'rejected', 'archived')),
  safety_status text not null default 'passed' check (safety_status in ('passed', 'needs_review', 'blocked')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (skill_id, version)
);

alter table if exists public.workspace_skills drop constraint if exists workspace_skills_current_version_id_fkey;
alter table if exists public.workspace_skills add constraint workspace_skills_current_version_id_fkey foreign key (current_version_id) references public.skill_versions(id) on delete set null;

create table if not exists public.skill_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  skill_id uuid references public.workspace_skills(id) on delete cascade,
  version_id uuid references public.skill_versions(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  event_type text not null check (event_type in ('proposed', 'created', 'patched', 'activated', 'rejected', 'archived', 'used', 'failed')),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  actor text not null default 'agent' check (actor in ('agent', 'user', 'system', 'admin')),
  created_at timestamptz not null default now()
);

create index if not exists skill_events_workspace_created_idx on public.skill_events (workspace_id, created_at desc);

create table if not exists public.trajectory_samples (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  thread_id uuid references public.threads(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete cascade,
  mode text not null check (mode in ('ask', 'create', 'act')),
  model_provider text,
  model_name text,
  completed boolean not null default false,
  quality_score numeric,
  messages jsonb not null default '[]'::jsonb,
  tool_trace jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists trajectory_samples_workspace_created_idx on public.trajectory_samples (workspace_id, created_at desc);
create index if not exists trajectory_samples_run_idx on public.trajectory_samples (run_id);

create table if not exists public.memory_provider_configs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'supabase_builtin',
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  encrypted_secret_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, provider)
);
