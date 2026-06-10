-- Per-workspace toolset enable/disable settings.
-- API keys for paid tools are stored in the existing connections table
-- with connection_type='api_key' and provider matching the tool provider.

create table if not exists public.workspace_tool_settings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  toolset_name  text not null,
  enabled       boolean not null default false,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists workspace_tool_settings_ws_toolset_idx
  on public.workspace_tool_settings (workspace_id, toolset_name);

alter table public.workspace_tool_settings enable row level security;

create policy "workspace_tool_settings_owner"
  on public.workspace_tool_settings for all
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = auth.uid()
    )
  );
