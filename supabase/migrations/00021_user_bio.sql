-- Short public About on every profile.
--
-- bio is trimmed, at most 500 characters, and nullable (empty means no
-- About). Column grants follow 00005/00014: SELECT to anon and
-- authenticated, UPDATE to authenticated. guard_user_self_update (00007,
-- last rewritten in 00017) does not inspect bio, so the granted UPDATE
-- is allowed.
--
-- Safe to run more than once.

alter table public.users
  add column if not exists bio text;

update public.users
set bio = null
where bio is not null
  and btrim(bio) = '';

update public.users
set bio = left(btrim(bio), 500)
where bio is not null
  and bio is distinct from left(btrim(bio), 500);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_bio_check'
  ) then
    alter table public.users
      add constraint users_bio_check
      check (
        bio is null
        or (
          char_length(bio) between 1 and 500
          and bio = btrim(bio)
        )
      );
  end if;
end $$;

grant select (bio) on table public.users to anon, authenticated;
grant update (bio) on table public.users to authenticated;
