# Vercel

Deploy `apps/web` as the Vercel project root.

Keep `apps/agent-api` on a separate long-running worker host. Hermes is dependency-heavy and agent runs can exceed ordinary request lifetimes, so the Vercel app should call the worker through `AGENT_API_URL` plus `AGENT_API_SECRET`.

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_API_URL`
- `AGENT_API_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

Worker-side environment variables:

- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `TAVILY_API_KEY`
- `AGENT_API_SECRET`
