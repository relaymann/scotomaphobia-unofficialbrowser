create extension if not exists pgcrypto;
create table if not exists public.player_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Wanderer' check (char_length(display_name) between 1 and 24),
 settings jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.saved_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 save_version integer not null default 1 check (save_version>0),
 level_id text not null default 'layer-1',
 progress jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.player_profiles enable row level security;
alter table public.saved_runs enable row level security;
create policy "read own profile" on public.player_profiles for select to authenticated using(auth.uid()=user_id);
create policy "insert own profile" on public.player_profiles for insert to authenticated with check(auth.uid()=user_id);
create policy "update own profile" on public.player_profiles for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy "read own save" on public.saved_runs for select to authenticated using(auth.uid()=user_id);
create policy "insert own save" on public.saved_runs for insert to authenticated with check(auth.uid()=user_id);
create policy "update own save" on public.saved_runs for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
