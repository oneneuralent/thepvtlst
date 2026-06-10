# The PVTLST

The PVTLST is a private AI operating system:
private intelligence, one all-rounder agent, connected apps, library, canvas, and approval-based actions.

> Connected to Vercel — auto-deploy from `oneneuralent/ThePvtLst`.

## Architecture

- `apps/web`: Next.js App Router frontend on Vercel.
- `apps/agent-api`: FastAPI runtime manager for safe agent workers.
- `packages/shared`: shared product types and safety constants.
- `packages/ui`: future shared UI package.
- `infra/supabase`: database migrations and policies.

## Local Setup

```bash
npm install
npm run dev:all
```

For the agent API:

```bash
cd apps/agent-api
python -m venv .venv
.venv\Scripts\activate
pip install -e .
python -m uvicorn app.main:app --port 8001
```

Copy `.env.example` to `.env.local` in `apps/web` and fill Supabase values.

## Current Phase

Phase 0 and the base of Phase 1 are scaffolded:

- Monorepo root
- Next.js landing page
- Protected `/app` workspace shell
- Supabase auth helper files
- Login/signup screens
- Chat route wired through FastAPI agent runtime
- Supabase migration for profiles/workspaces/core product tables
- FastAPI agent runtime with Hermes bridge

Hermes is vendored in `vendor/hermes-agent` and is the primary local chat engine.
The local starter uses the agent API virtualenv so Hermes dependencies such as
`openai` are available at runtime.
