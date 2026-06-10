-- Browser session tracking for cost monitoring and limits
create table if not exists public.browser_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  provider text not null, -- 'browserbase' or 'browser_use'
  session_id text, -- provider's session identifier
  status text not null default 'active', -- 'active', 'completed', 'failed'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  cost_usd numeric(10, 4) default 0,
  pages_visited int default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists browser_sessions_workspace_created_idx on public.browser_sessions (workspace_id, created_at desc);
create index if not exists browser_sessions_run_id_idx on public.browser_sessions (run_id);
create index if not exists browser_sessions_user_idx on public.browser_sessions (user_id, created_at desc);

-- Browser usage limits per workspace
create table if not exists public.browser_limits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  max_sessions_per_day int default 50,
  max_cost_per_month_usd numeric(10, 2) default 100.00,
  max_duration_per_session_seconds int default 300, -- 5 minutes
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists browser_limits_workspace_idx on public.browser_limits (workspace_id);

-- RLS policies
alter table public.browser_sessions enable row level security;
alter table public.browser_limits enable row level security;

create policy "browser_sessions_workspace_read" on public.browser_sessions for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = auth.uid()
    )
  );

create policy "browser_limits_workspace_read" on public.browser_limits for select
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = auth.uid()
    )
  );

create policy "browser_limits_workspace_write" on public.browser_limits for all
  using (
    workspace_id in (
      select id from public.workspaces where owner_id = auth.uid()
    )
  );
