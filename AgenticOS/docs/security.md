# Security Model

Public users must never receive terminal access, unrestricted filesystem access, arbitrary code execution,
unknown MCP tools, or unapproved external side effects.

Every durable row is scoped by `workspace_id` where relevant, and every workspace member check must flow
through Supabase RLS.

Dangerous actions require approval:

- send or delete email
- schedule events
- invite users
- post or publish content
- edit or delete external files
- send messages
- spend money

Safe actions include chat, web search, uploaded file reading, summarization, drafting, saving to library,
and creating canvas cards.
