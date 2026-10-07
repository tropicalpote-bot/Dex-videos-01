create extension if not exists pgcrypto;

create table if not exists public.video_batches (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  platform text not null check (platform in ('instagram', 'facebook')),
  requested_count integer not null check (requested_count between 1 and 500),
  imported_count integer not null default 0 check (imported_count between 0 and 500),
  status text not null default 'imported',
  created_at timestamptz not null default now()
);

alter table public.video_batches enable row level security;

drop policy if exists "allow batch creation" on public.video_batches;
create policy "allow batch creation"
on public.video_batches
for insert
to anon, authenticated
with check (
  requested_count between 1 and 500
  and imported_count between 0 and requested_count
  and platform in ('instagram', 'facebook')
);

revoke all on public.video_batches from anon, authenticated;
grant insert on public.video_batches to anon, authenticated;
