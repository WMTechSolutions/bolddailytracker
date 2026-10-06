-- Reset a student's password back to the class password (BOLD2026).
-- They'll be forced to choose a new password the next time they sign in.
-- Edit the email below, then: Supabase -> SQL Editor -> New query -> paste -> Run

update auth.users
set encrypted_password = extensions.crypt('BOLD2026', extensions.gen_salt('bf')),
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"must_change": true}'::jsonb
where lower(email) = lower('student@example.com');
