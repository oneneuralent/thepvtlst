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
