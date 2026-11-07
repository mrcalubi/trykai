-- Which migrations are on this database? Read only; safe on staging and
-- production. Migrations are applied by hand, so there is no history table:
-- each row looks for something that migration created. Run it, then read the
-- "missing" rows top to bottom. Check the project ref in the URL first.

with c(table_name, column_name) as (
  select table_name::text, column_name::text
  from information_schema.columns
  where table_schema = 'public'
),
f(name) as (
  select p.proname::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
checks(migration, what, applied) as (
  values
    ('00001', 'baseline tables', to_regclass('public.reviews') is not null),
    ('00002', 'address reveal (replaced by 00025)', exists (select 1 from f where name in ('get_listing_address', 'listing_address'))),
    ('00003', 'users.is_suspended', exists (select 1 from c where table_name = 'users' and column_name = 'is_suspended')),
    ('00004', 'handle_new_user()', exists (select 1 from f where name = 'handle_new_user')),
    ('00005', 'bookings.payment_rail', exists (select 1 from c where table_name = 'bookings' and column_name = 'payment_rail')),
    ('00006', 'reject_host_self_booking()', exists (select 1 from f where name = 'reject_host_self_booking')),
    ('00007', 'users.is_admin', exists (select 1 from c where table_name = 'users' and column_name = 'is_admin')),
    ('00008', 'can_create_listing()', exists (select 1 from f where name = 'can_create_listing')),
    ('00009', 'session_visible_to_me()', exists (select 1 from f where name = 'session_visible_to_me')),
    ('00010', 'invoke_release_payout()', exists (select 1 from f where name = 'invoke_release_payout')),
    ('00011', 'guest_can_leave_review()', exists (select 1 from f where name = 'guest_can_leave_review')),
    ('00012', 'delete_empty_session()', exists (select 1 from f where name = 'delete_empty_session')),
    ('00013', 'reviews_for_host()', exists (select 1 from f where name = 'reviews_for_host')),
    ('00014', 'users.display_name', exists (select 1 from c where table_name = 'users' and column_name = 'display_name')),
    ('00015', 'listing_ratings()', exists (select 1 from f where name = 'listing_ratings')),
    ('00016', 'planning_areas table', to_regclass('public.planning_areas') is not null),
    ('00017', 'users.terms_accepted_at', exists (select 1 from c where table_name = 'users' and column_name = 'terms_accepted_at')),
    ('00018', 'listings.duration_mins', exists (select 1 from c where table_name = 'listings' and column_name = 'duration_mins')),
    ('00019', 'only redefines functions (no marker; fine if 00020 is applied)', true),
    ('00020', 'listings.group_pricing', exists (select 1 from c where table_name = 'listings' and column_name = 'group_pricing')),
    ('00021', 'users.bio', exists (select 1 from c where table_name = 'users' and column_name = 'bio')),
    ('00022', 'my_is_founding_host()', exists (select 1 from f where name = 'my_is_founding_host')),
    ('00023', 'my_account()', exists (select 1 from f where name = 'my_account')),
    ('00024', 'set_listing_spots()', exists (select 1 from f where name = 'set_listing_spots')),
    ('00025', 'full_address hidden from anon', not has_column_privilege('anon', 'public.listings', 'full_address', 'SELECT')),
    ('00026', 'listing-photos insert policy', exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'listing_photos_insert_own_folder')),
    ('00027', 'listing_host_in_good_standing()', exists (select 1 from f where name = 'listing_host_in_good_standing')),
    ('00028', 'listings_price_ceiling constraint', exists (select 1 from pg_constraint where conname = 'listings_price_ceiling')),
    ('00029', 'bookings.payout_hold_reason', exists (select 1 from c where table_name = 'bookings' and column_name = 'payout_hold_reason')),
    ('00030', 'booking_money_events table', to_regclass('public.booking_money_events') is not null),
    ('00031', 'booking_complaints table', to_regclass('public.booking_complaints') is not null),
    ('00032', 'listing_interests table', to_regclass('public.listing_interests') is not null),
    ('00033', 'sessions.held_by_session_id', exists (select 1 from c where table_name = 'sessions' and column_name = 'held_by_session_id')),
    ('00034', 'users.teaching_plan', exists (select 1 from c where table_name = 'users' and column_name = 'teaching_plan')),
    ('00035', 'users.singpass_sub', exists (select 1 from c where table_name = 'users' and column_name = 'singpass_sub')),
    ('00036', 'listings.review_status', exists (select 1 from c where table_name = 'listings' and column_name = 'review_status')),
    ('00037', 'bookings.guest_reminder_sent_at', exists (select 1 from c where table_name = 'bookings' and column_name = 'guest_reminder_sent_at')),
    ('00038', 'listings.what_to_bring', exists (select 1 from c where table_name = 'listings' and column_name = 'what_to_bring')),
    ('00039', 'host_strike_events table', to_regclass('public.host_strike_events') is not null),
    ('00040', 'host_sessions_held()', exists (select 1 from f where name = 'host_sessions_held')),
    ('00041', 'users.featured_review_id', exists (select 1 from c where table_name = 'users' and column_name = 'featured_review_id')),
    ('00042', 'listing_addons table', to_regclass('public.listing_addons') is not null),
    ('00043', 'bookings.addons_amount', exists (select 1 from c where table_name = 'bookings' and column_name = 'addons_amount')),
    ('00044', 'reschedule_booking()', exists (select 1 from f where name = 'reschedule_booking')),
    ('00045', 'second bookings to sessions key dropped',
      exists (select 1 from c where table_name = 'bookings' and column_name = 'rescheduled_from_session_id')
      and not exists (select 1 from pg_constraint where conname = 'bookings_rescheduled_from_session_id_fkey')),
    ('00046', 'listings.arrival_instructions', exists (select 1 from c where table_name = 'listings' and column_name = 'arrival_instructions')),
    ('00047', 'reviews.photo_paths', exists (select 1 from c where table_name = 'reviews' and column_name = 'photo_paths')),
    ('00048', 'post_review() and review_notes', exists (select 1 from f where name = 'post_review') and to_regclass('public.review_notes') is not null),
    ('00049', 'reviews locked (own rows only)',
      exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reviews' and policyname = 'Reviewers can read their own reviews')
      and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reviews' and policyname = 'Anyone can view reviews')),
    ('00050', 'booking_guests table', to_regclass('public.booking_guests') is not null),
    ('00051', 'claim_review_reminders()', exists (select 1 from f where name = 'claim_review_reminders')),
    ('00052', 'telegram_link_codes table', to_regclass('public.telegram_link_codes') is not null)
)
select migration, case when applied then 'applied' else 'MISSING' end as status, what
from checks
order by applied, migration;
