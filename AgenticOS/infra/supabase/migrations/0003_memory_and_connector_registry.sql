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

create index if not exists memories_workspace_status_created_idx
on public.memories (workspace_id, status, created_at desc);

create index if not exists memories_workspace_type_idx
on public.memories (workspace_id, type);

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
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
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

alter table if exists public.connections add column if not exists connection_type text not null default 'oauth';
alter table if exists public.connections add column if not exists token_last_refreshed_at timestamptz;
alter table if exists public.connections add column if not exists last_used_at timestamptz;

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

insert into public.skill_registry (
  workspace_id,
  name,
  provider,
  category,
  description,
  required_scopes,
  allowed_modes,
  approval_required,
  enabled,
  metadata
) values
  (null, 'google.gmail.search', 'google', 'connector', 'Search Gmail messages.', array['gmail.readonly'], array['ask','create','act'], false, true, '{}'::jsonb),
  (null, 'google.gmail.get', 'google', 'connector', 'Read a selected Gmail message.', array['gmail.readonly'], array['ask','create','act'], false, true, '{}'::jsonb),
  (null, 'google.gmail.draft', 'google', 'connector', 'Prepare a Gmail draft.', array['gmail.compose'], array['create','act'], false, true, '{}'::jsonb),
  (null, 'google.gmail.send', 'google', 'connector', 'Send an email through Gmail.', array['gmail.send'], array['act'], true, true, '{}'::jsonb),
  (null, 'google.calendar.list', 'google', 'connector', 'Read Google Calendar events.', array['calendar.readonly'], array['ask','create','act'], false, true, '{}'::jsonb),
  (null, 'google.calendar.create', 'google', 'connector', 'Create a Google Calendar event.', array['calendar.events'], array['act'], true, true, '{}'::jsonb),
  (null, 'google.drive.search', 'google', 'connector', 'Search Google Drive files.', array['drive.metadata.readonly'], array['ask','create','act'], false, true, '{}'::jsonb),
  (null, 'google.drive.upload', 'google', 'connector', 'Upload a file to Google Drive.', array['drive.file'], array['create','act'], true, true, '{}'::jsonb),
  (null, 'google.sheets.read', 'google', 'connector', 'Read Google Sheets ranges.', array['spreadsheets.readonly'], array['ask','create','act'], false, true, '{}'::jsonb),
  (null, 'google.sheets.update', 'google', 'connector', 'Update Google Sheets ranges.', array['spreadsheets'], array['act'], true, true, '{}'::jsonb),
  (null, 'google.docs.create', 'google', 'connector', 'Create a Google Doc.', array['documents'], array['create','act'], true, true, '{}'::jsonb),
  (null, 'notion.search', 'notion', 'connector', 'Search Notion workspace content.', array['notion.read'], array['ask','create','act'], false, true, '{}'::jsonb),
  (null, 'notion.create_page', 'notion', 'connector', 'Create a Notion page.', array['notion.write'], array['create','act'], true, true, '{}'::jsonb),
  (null, 'slack.search', 'slack', 'connector', 'Search Slack messages.', array['slack.search'], array['ask','create','act'], false, true, '{}'::jsonb),
  (null, 'slack.send_message', 'slack', 'connector', 'Send a Slack message.', array['slack.chat.write'], array['act'], true, true, '{}'::jsonb)
on conflict (workspace_id, name) do nothing;
