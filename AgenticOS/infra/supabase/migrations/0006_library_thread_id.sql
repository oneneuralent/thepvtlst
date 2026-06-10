-- Add thread_id to library_items for session-based library organization
-- This allows each thread to have its own library of relevant items

alter table public.library_items
add column if not exists thread_id uuid references public.threads(id) on delete cascade;

-- Add index for efficient querying by thread
create index if not exists library_items_thread_id_idx
on public.library_items (thread_id);

-- Add item_type column for more granular categorization
-- This extends the existing 'type' column with specific subtypes
alter table public.library_items
add column if not exists item_type text check (item_type in ('chat', 'source', 'artifact', 'file', 'note'));

-- Add summary column for auto-generated summaries of long content
alter table public.library_items
add column if not exists summary text;

-- Update RLS policy to allow filtering by thread_id
-- (existing library_items_workspace_access policy already covers this via workspace_id)
