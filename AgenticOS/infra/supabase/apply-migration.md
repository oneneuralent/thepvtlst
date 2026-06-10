# Apply Supabase Migration

The app is wired to the Supabase project in local env, but the hosted database does not currently have the AgenticOS tables.

Apply these migrations before testing chat:

1. `infra/supabase/migrations/0000_enable_extensions.sql`
2. `infra/supabase/migrations/0001_core_dashboard_paste.sql`
3. `infra/supabase/migrations/0002_clerk_ready_dev_identity.sql`
4. `infra/supabase/migrations/0003_memory_and_connector_registry.sql`
5. `infra/supabase/migrations/0004_hermes_style_learning_architecture.sql`

## Option 1: Supabase Dashboard

1. Open the Supabase project.
2. Go to SQL Editor.
3. Paste and run the full contents of `infra/supabase/migrations/0000_enable_extensions.sql`.
4. Paste and run the full contents of `infra/supabase/migrations/0001_core_dashboard_paste.sql`.
5. Paste and run the full contents of `infra/supabase/migrations/0002_clerk_ready_dev_identity.sql`.
6. Paste and run the full contents of `infra/supabase/migrations/0003_memory_and_connector_registry.sql`.
7. Paste and run the full contents of `infra/supabase/migrations/0004_hermes_style_learning_architecture.sql`.
8. Confirm the `profiles`, `workspaces`, `workspace_members`, `threads`, `messages`, `agent_runs`, `tool_calls`, `library_items`, `canvas_boards`, `canvas_cards`, `connections`, `approvals`, `usage_events`, `memories`, `memory_events`, `memory_jobs`, `thread_summaries`, `workspace_skills`, `skill_versions`, `skill_events`, `trajectory_samples`, `agent_profiles`, and `memory_provider_configs` tables exist.

## Option 2: Supabase CLI

This needs either a Supabase login session or a database URL.

```powershell
npx supabase login
npx supabase link --project-ref hslxlfkhotltmzifcqtb
npx supabase db push
```

Or, with a database connection string:

```powershell
npx supabase db push --db-url "postgresql://postgres:<password>@db.hslxlfkhotltmzifcqtb.supabase.co:5432/postgres"
```

## Verification

After the migration is applied:

1. Start the web app with `npm --workspace apps/web run dev`.
2. Open `http://localhost:3000/app`.
3. Send an Ask or Create message.
4. Confirm rows appear in `profiles`, `workspaces`, `workspace_members`, `threads`, `messages`, `agent_runs`, `tool_calls`, and `library_items`.
