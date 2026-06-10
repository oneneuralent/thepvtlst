# Architecture

AgenticOS separates the consumer SaaS surface from the agent execution engine.

```mermaid
flowchart TD
  A["GoDaddy domain"] --> B["Cloudflare DNS/WAF"]
  B --> C["Vercel Next.js app"]
  C --> D["Supabase Auth, DB, Storage, Realtime"]
  C --> E["Agent API / Runtime Manager"]
  E --> F["Safe Hermes Worker Profile"]
  F --> G["Curated tools only"]
  G --> H["Approval-based actions"]
```

The frontend never calls Hermes directly. It calls a small API layer that validates the user, workspace,
mode, plan, connection scopes, and approval state before anything reaches a worker.
