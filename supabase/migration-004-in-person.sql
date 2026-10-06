-- Adds "In Person" as a conversation channel.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run

alter table public.conversations drop constraint if exists conversations_ch_check;
alter table public.conversations add constraint conversations_ch_check
  check (ch in ('Call','Text','DM','In Person'));
