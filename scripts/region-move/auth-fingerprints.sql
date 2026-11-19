-- Read only. OPERATIONS.md, Supabase region move (step 3.14).
-- One line per account: id and an md5 of what matters for signing in
-- (password hash, email, phone, metadata, confirmation, bans). Run on OLD and
-- NEW with psql -At -F , -o fp-old.csv / fp-new.csv and diff: the same id
-- with a different md5 is an account that changed on OLD after the dump.
-- Prints ids and hashes only.
select id,
  md5(concat_ws('|', encrypted_password, email, phone, raw_user_meta_data::text,
    raw_app_meta_data::text, email_confirmed_at::text, banned_until::text, deleted_at::text)) as fp
from auth.users
order by id;
