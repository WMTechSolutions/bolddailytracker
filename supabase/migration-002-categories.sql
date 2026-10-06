-- Adds "Real Estate Client" (client) and "Recruit" (recruit) categories.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run

alter table public.conversations drop constraint if exists conversations_cat_check;
alter table public.conversations add constraint conversations_cat_check
  check (cat in ('client','recruit','current','past','biz'));
