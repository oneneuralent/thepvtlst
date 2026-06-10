create table if not exists public.memories (
  id uuid primary key default gen_random_uuid()
);

alter table public.memories add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.memories add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.memories add column if not exists type text not null default 'workspace';
alter table public.memories add column if not exists title text not null default 'Untitled memory';
alter table public.memories add column if not exists content text not null default '';
alter table public.memories add column if not exists source_type text;
alter table public.memories add column if not exists source_id uuid;
alter table public.memories add column if not exists confidence numeric not null default 0.7;
alter table public.memories add column if not exists status text not null default 'active';
alter table public.memories add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.memories add column if not exists created_at timestamptz not null default now();
alter table public.memories add column if not exists updated_at timestamptz not null default now();
alter table public.memories add column if not exists target text not null default 'agent_memory';
alter table public.memories add column if not exists safety_status text not null default 'passed';
alter table public.memories add column if not exists blocked_reason text;
alter table public.memories add column if not exists last_used_at timestamptz;
alter table public.memories add column if not exists usage_count int not null default 0;

create index if not exists memories_workspace_status_created_idx on public.memories (workspace_id, status, created_at desc);
create index if not exists memories_workspace_type_idx on public.memories (workspace_id, type);

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

create table if not exists public.thread_summaries (
  id uuid primary key default gen_random_uuid()
);

alter table public.thread_summaries add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.thread_summaries add column if not exists thread_id uuid references public.threads(id) on delete cascade;
alter table public.thread_summaries add column if not exists summary text not null default '';
alter table public.thread_summaries add column if not exists durable_facts jsonb not null default '[]'::jsonb;
alter table public.thread_summaries add column if not exists open_questions jsonb not null default '[]'::jsonb;
alter table public.thread_summaries add column if not exists message_start_id uuid references public.messages(id) on delete set null;
alter table public.thread_summaries add column if not exists message_end_id uuid references public.messages(id) on delete set null;
alter table public.thread_summaries add column if not exists token_estimate int not null default 0;
alter table public.thread_summaries add column if not exists created_at timestamptz not null default now();

create index if not exists thread_summaries_thread_created_idx on public.thread_summaries (thread_id, created_at desc);

create table if not exists public.workspace_skills (
  id uuid primary key default gen_random_uuid()
);

alter table public.workspace_skills add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.workspace_skills add column if not exists name text not null default 'unnamed_skill';
alter table public.workspace_skills add column if not exists category text not null default 'general';
alter table public.workspace_skills add column if not exists description text not null default '';
alter table public.workspace_skills add column if not exists current_version_id uuid;
alter table public.workspace_skills add column if not exists scope text not null default 'workspace';
alter table public.workspace_skills add column if not exists status text not null default 'active';
alter table public.workspace_skills add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.workspace_skills add column if not exists created_at timestamptz not null default now();
alter table public.workspace_skills add column if not exists updated_at timestamptz not null default now();

create unique index if not exists workspace_skills_workspace_name_idx on public.workspace_skills (workspace_id, name);

create table if not exists public.skill_versions (
  id uuid primary key default gen_random_uuid()
);

alter table public.skill_versions add column if not exists skill_id uuid references public.workspace_skills(id) on delete cascade;
alter table public.skill_versions add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.skill_versions add column if not exists version int not null default 1;
alter table public.skill_versions add column if not exists body text not null default '';
alter table public.skill_versions add column if not exists changelog text;
alter table public.skill_versions add column if not exists source_run_id uuid references public.agent_runs(id) on delete set null;
alter table public.skill_versions add column if not exists source_memory_id uuid references public.memories(id) on delete set null;
alter table public.skill_versions add column if not exists status text not null default 'active';
alter table public.skill_versions add column if not exists safety_status text not null default 'passed';
alter table public.skill_versions add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.skill_versions add column if not exists created_at timestamptz not null default now();

create unique index if not exists skill_versions_skill_version_idx on public.skill_versions (skill_id, version);

alter table public.workspace_skills drop constraint if exists workspace_skills_current_version_id_fkey;
alter table public.workspace_skills add constraint workspace_skills_current_version_id_fkey foreign key (current_version_id) references public.skill_versions(id) on delete set null;

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
