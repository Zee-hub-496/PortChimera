-- Day 2: remember when a document entered 'processing', so a document left behind by an API
-- restart can be detected and marked failed instead of spinning forever.
-- Additive and nullable: existing rows and old code keep working. Safe to run twice.
alter table public.documents
  add column if not exists processing_started_at timestamptz;
