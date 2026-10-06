-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  cat        text not null check (cat in ('client','recruit','current','past','biz')),
  ch         text not null check (ch in ('Call','Text','DM')),
  two        boolean not null default true,
  phone      text not null default '',
  notes      text not null default '',
  date       date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists conversations_user_date on public.conversations (user_id, date);

create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  weekly  int  not null default 100,
  days    int[] not null default '{1,2,3,4,5}'
);

alter table public.conversations enable row level security;
alter table public.settings      enable row level security;

drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
