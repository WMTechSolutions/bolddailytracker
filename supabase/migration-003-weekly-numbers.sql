-- Weekly BOLD numbers (appointments, listings taken, etc.) + leader switch.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run

create table if not exists public.weekly_numbers (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  metric     text not null check (metric in (
    'contacts_added','listing_appts','buyer_appts','listings_taken','buyers_taken','under_contract',
    'recruits_added','recruiting_appts','recruits_signed')),
  count      int  not null default 0 check (count >= 0),
  primary key (user_id, week_start, metric)
);

alter table public.weekly_numbers enable row level security;
drop policy if exists "own numbers" on public.weekly_numbers;
create policy "own numbers" on public.weekly_numbers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.settings add column if not exists is_leader boolean not null default false;
