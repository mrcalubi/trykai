# TryKai: Engineering

The working document for anyone touching the codebase, human or AI. Covers stack, schema, business rules, file map, and end to end user flows.

**Always read this and DECISIONS.md before making changes.** Visual identity is in DESIGN.md. The remaining build queue is in BUILD_BACKLOG.md.

> **Read before you start, updated 19 October 2026.**
>
> 1. **Stripe Connect is implemented in this tree: separate charges and transfers, Express accounts, decided 16 August 2026.** Guests pay the platform; host share is Transferred 72 hours after the session ends (`starts_at` + `duration_mins`). Remaining payment work is ops, not a second product decision. Platform Stripe payouts must stay **manual** so auto-payout to Aspire does not drain funds needed for those Transfers. See DECISIONS.md.
> 2. **The four tier cancellation logic is built.** Refunds are issued by the `cancel-booking` Edge Function, not the browser. Guests are emailed the refund amount (including $0). When the guest cancels, the host is emailed their payout only. When the host cancels a session, they get a strike email with no guest amounts.
> 3. **Schema lives in** `supabase/migrations/` **(**`00001` **through** `00036`**).** There is no `supabase/schema.sql`. Migrations are applied by hand: staging first, then production in the same sitting, after checking the project ref in the URL and that production has a backup from the last 24 hours. Refs, deploy rules and current state per environment: OPERATIONS.md, Environments and production SQL.
> 4. **A CI test suite and branch protection gate every merge.** Do not expect to merge with red checks. Match the existing plain CSS approach in `index.css`; the project does not use Tailwind.
> 5. `Navbar.jsx` **is deleted.** `SiteNav` **is mounted once in** `App.jsx` **and renders** `TopNav` **for every route. No page mounts its own nav.** **Home shows the Lane 1 headline above the kit's** `Card` **in browse mode, with a rating on the meta line only when** `listing_ratings` **returns reviews.** Button is live on Settings and Hosting listing rows. Input is live on Settings and Login. SelectableCard is still used only by `/style-guide`.
> 6. **All colours come from the tokens at** `:root` **in** `index.css`**.** Never hardcode a hex value in a component. See section 2, Styling.
> 7. **Who builds.** From 24 October Cursor builds most code again; Claude (Claude Code in the TryKai Project chat) reviews, writes docs and handles Singpass (Claude built everything from 19 to 24 October; HANDOVER.md has the catch-up). Either way: branch from `staging`, run `npm run verify`, open a PR into `staging`. Caleb reviews and merges. Never push to `staging` or `main` directly; a push to either deploys every Edge Function. Nobody but Caleb and Rui Heng holds Supabase access tokens or secrets.

---



## 1. What the platform does

Two user types, one account. A user is a guest by default and becomes a host when they create their first listing. The `is_host` flag on the users table handles the distinction. Guest bookings and host tools live as private tabs on your own `/u/:id` profile. `/bookings` and `/hosting` redirect there (keeping the query string and setting `?tab=`). `/dashboard` still redirects to `/bookings` (or `/hosting` when `?connect=` is present) so emails and Stripe return URLs keep working.

- **Hosts** list a skill or experience to teach
- **Guests** browse and book sessions

---



## 2. Stack


| Layer                      | Choice                                                               | Why                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                   | React 19 + Vite 8                                                    | Familiar, fast, well supported by AI coding tools                                                                                                                                                                                                                                                                                                     |
| Routing                    | React Router v7                                                      |                                                                                                                                                                                                                                                                                                                                              |
| Backend, DB, Auth, Storage | Supabase                                                             | Handles backend, auth, storage, and RLS out of the box                                                                                                                                                                                                                                                                                       |
| Hosting                    | Vercel                                                               | Free tier, auto deploy on push                                                                                                                                                                                                                                                                                                               |
| Payments                   | **Stripe Connect**, separate charges and transfers, Express accounts | Decided 16 August. Supports PayNow in Singapore at 1.3%, platform is merchant of record, Transfers held until 72 hours after the session ends. In code: Payment Element + webhook confirmation, Connect onboarding, refunds, hourly Transfer job. Connect account creation uses Stripe Accounts **v2** (`2026-08-26.preview`) in `_shared/connect.ts`. |
| Transactional email        | Resend                                                               | From-address is `TryKai <no-reply@trykai.sg>`. trykai.sg is verified in Resend. Booking emails greet by display name and sign off "See you there," / "Take care," then "The TryKai team". Guest confirmation is a receipt (reference, listing, Singapore time, duration, address, What's provided, What to bring when the listing has items, price lines, payment method, Google Calendar link) with one quiet Cancellation policy line — no refund-tier dates. Guest confirmation and cancellation reply-to is `hello@trykai.sg`. An hourly `send-reminders` job (`00037`) emails confirmed guests and their host when the session starts in 2–24 hours, skipping a booking created less than 6 hours ago so it does not stack on the confirmation. Guest reminder subject is `{Today|Tomorrow}: <listing> at <time>`; host subject is `{Today|Tomorrow}: N person/people coming to <listing>`. Today is the same Singapore calendar date as the send; otherwise Tomorrow. The day-and-time line includes the weekday. The guest email lists What to bring when the listing has items. Cancellation emails the guest the refund amount (including $0) and timing from the refund policy. The host is emailed their payout when the guest cancelled, or a strike notice (no guest amounts) when they cancel a session. `admin-cancel-booking` emails the guest the host-cancel copy, or a dispute refund receipt with `reason: 'dispute'`. `admin-dispute-booking` partial refunds email the guest a refund receipt.                                                                                                                                                                                           |
| Business email             | Zoho Mail Lite                                                       | caleb@, aakash@, [ruiheng@trykai.sg](mailto:ruiheng@trykai.sg)                                                                                                                                                                                                                                                                               |
| AI coding                  | Claude Code                                                          | Claude Code builds and opens PRs into `staging`; Caleb merges. Cursor for small edits when credits allow.                                                                                                                                                                                                                                                                                                 |


**CI** (`.github/workflows/ci.yml`): lint, Vitest with coverage, `vite build`, Playwright (desktop + phone Chromium), Deno type-check of `_shared/{booking,complaints,http,connect,disputes,email,payouts,verification,onemap,singpass,listingReview,interest,reminders}.ts`, and a dry run that every `supabase/functions/<name>/index.ts` matches a `[functions.<name>]` block. Handler type-check is advisory (`continue-on-error`). On push to `staging` or `main`, after those checks pass, `scripts/deploy-edge-functions.mjs` deploys every Edge Function (`supabase functions deploy --use-api`). Staging uses project ref `hzgybclfvpuxkmytdoos` unless `STAGING_SUPABASE_PROJECT_REF` is set. Production requires `PRODUCTION_SUPABASE_PROJECT_REF`. Both require GitHub secret `SUPABASE_ACCESS_TOKEN`. Pull requests do not deploy. Coverage floors: lines 92%, functions 90%, branches 87%; money files 100%.

### Styling

Plain CSS in `src/index.css`. No Tailwind, no CSS modules, no styling dependencies.

**All colours come from the tokens at** `:root` **in** `index.css`**.** Never hardcode a
hex value in a component. The full set and the usage rules are in DECISIONS.md
(9 September entry) and DESIGN.md section 7.

**Mobile first.** Base styles are written for phone with no media query, then
scaled up with `min-width` queries only. Never `max-width`.

User-written copy (listing titles, descriptions, review comments, booking
titles) shares one `overflow-wrap: break-word` rule. Flex text columns next to
a fixed sibling get `flex: 1` and `min-width: 0` so a long word wraps instead of
shrinking the line to one character. My Listings is one full-width card per
row at every width. Each card keeps thumbnail and title on one line,
with the ⋯ menu in the top-right corner and a full-width Add session button
below.

Fonts are referenced through `--display` (Bricolage Grotesque), `--sans`
(Manrope), and `--mono` (Space Mono) so the typefaces can be changed in one
place. `--heading` and `--logo` alias `--display`.

---



## 3. Database schema



### users

```sql
id uuid PK                       -- references auth.users(id); created by handle_new_user on auth.users insert
full_name text
display_name text                -- public handle, trimmed 1–40 chars (`00014`). Backfilled from the first word of full_name.
bio text                         -- public About, trimmed, max 500 chars, nullable (`00021`)
email text unique
phone text
phone_verified boolean default false
avatar_url text
is_host boolean default false
stripe_account_id text           -- Stripe Connect Express account id. Not granted to anon/authenticated SELECT.
stripe_payouts_enabled boolean default false  -- Stripe account.updated or create-account-link retrieve; gates Book
is_founding_host boolean default false        -- Table Editor for the eleven; never a host fee. Not client-writable or readable; my_is_founding_host() (`00022`).
is_admin boolean default false   -- gates the verification review UI. Not client-writable or readable.
id_photo_url text                -- path in private verification-docs bucket. No client SELECT grant.
selfie_url text                  -- path in private verification-docs bucket. No client SELECT grant.
verification_status text not null default 'unverified'  -- CHECK: unverified | pending | approved | rejected. SELECT revoked in 00023.
is_id_verified boolean generated always as (verification_status = 'approved') stored  -- public ID badge (`00023`)
verification_method text         -- manual | stripe_identity (stripe_identity only on staging tests before 23 October)
stripe_identity_session_id text  -- dormant: Stripe Identity is not available to Singapore businesses
teaching_plan text               -- what the host says they will teach, max 600 (`00034`). No client grant; admin queue and the pending email read it.
singpass_sub text                -- Singpass's UUID for the person, unique (`00035`). No client grant.
verified_name text               -- name from Singpass Myinfo (`00035`). No client grant.
verified_dob text                -- date of birth from Myinfo: YYYY-MM-DD, or YYYY-MM / YYYY (`00035`). No client grant.
verified_mobile text             -- mobile from Myinfo, E.164 e.g. +6597399245, or null (`00035`). No client grant.
verification_submitted_at timestamptz
verification_reviewed_at timestamptz
verification_rejection_reason text  -- shown to the host on resubmit, emailed on rejection
verification_consent_at timestamptz -- PDPA: when the host consented to the ID check
host_strikes integer default 0   -- cached active count; apply_host_strike is service_role only. Live count is host_active_strike_count (00039).
is_suspended boolean default false
suspended_at timestamptz
suspension_reason text
created_at timestamptz default now()
terms_accepted_at timestamptz     -- set by handle_new_user when signup metadata terms_accepted is true. Not client-readable or writable (00017). Existing rows stay null.
```

Manual payout columns (payout_method, identifier, name) were considered and not added. Under Stripe Connect Express, Stripe collects the host's bank details at onboarding. `stripe_account_id` is the payout handle.

### host_strike_events (`00039`)

```sql
id uuid PK
host_id uuid FK → users
reason text not null  -- host_cancel | no_show | admin
session_id uuid FK → sessions, nullable
created_at timestamptz
removed_at timestamptz  -- set by admin_remove_host_strike
removed_note text
```

RLS on. No client grants. service_role only. An active strike is `removed_at is null` and `created_at` within 12 months. `host_active_strike_count(host_id)` is security definer, not granted to clients. Backfill dated existing `users.host_strikes` as `'admin'` events at migration time.

### listings

```sql
id uuid PK
host_id uuid FK → users
title text
description text
category text
price_per_person integer  -- cents, e.g. $20 = 2000
max_guests integer        -- spots per session. INSERT on create; after that only set_listing_spots may UPDATE it
duration_mins integer     -- length of sessions added from now on; each session row keeps its own copy
group_pricing boolean default true  -- automatic group discount; host can turn off
area text                 -- FK → planning_areas.name; public planning area, e.g. "Tampines"
full_address text         -- intended to be revealed only after confirmed booking
photo_urls text[]
whats_provided text[]
what_to_bring text[]      -- optional, null or up to 5 trimmed items of 1–40 characters (`00038`). Anon and authenticated SELECT; authenticated INSERT/UPDATE
is_active boolean default true
review_status text default 'pending'  -- 'pending' | 'approved' | 'changes_requested' (`00036`). Only 'approved' is public. Anon and authenticated may SELECT it, never write it
review_note text          -- reviewer's change request, max 500, cleared on approval. Authenticated SELECT only (the host's own row); anon cannot read it
review_requested_at, reviewed_at, review_notified_at timestamptz  -- queue bookkeeping, service role writes only
created_at timestamp
```

**Listing review (`00036`).** `guard_listing_review` (before insert or update, authenticated callers) forces every new listing to `pending` and keeps the review fields as they were on update, except that an edit to a `changes_requested` listing's content puts it back to `pending` with a new `review_requested_at`. Edits to an approved listing stay approved. The public listings SELECT policy requires `review_status = 'approved'` as well as `is_active` and `listing_host_in_good_standing`; the host still reads their own rows through the owner policy. `review_listing(listing_id, decision, note, reviewer_id)` is service role only and writes the decision and a `listing_reviews` row together. `listing_keen_counts`, `create-payment-intent`, `listing-interest`, `notify-interested` and `api/listing-preview.js` all require `approved`. Existing listings were set to `approved` by the migration.

`00016` FKs `area` to `planning_areas`. Unmatched existing values were set to null rather than guessed. Hosts pick from the 55 URA names (uninhabited areas hidden in the picker; existing listings keep their value). Typing a neighbourhood alias resolves to the planning area (`src/data/areaAliases.js`). Create and Edit listing look up the postal code at 6 digits (`PostalAddressFields` → `lookup-postal-code`), show the composed address as a confirmed card, and fill Area guests see from OneMap's planning area when it maps to a host-picker name. Browse filters by region and by planning area (aliases search the same list). Cards and listing detail still show the planning area name. `full_address` is composed from that lookup; it is not free text.

`00018` adds `duration_mins` (at least 1). Existing listings take it from their latest non-cancelled session, else any session, else 60. Editing it changes sessions added afterwards. It does not rewrite `sessions.duration_mins`.

`00020` adds `group_pricing` (default true). Checkout discounts the lesson price per person when this is on: 5% for 2 guests, 10% for 3, 15% for 4, 20% for 5 or more. Never more than 20%. The host can turn it off on Create and Edit listing.

`max_guests` is the listing's spots per session, not a per-booking group cap. Checkout still caps one booking at `min(spots_remaining, 10)`. `set_listing_spots` (`00024`) writes `max_guests` and every future session's `spots_total` in one transaction, never below guests already booked (confirmed plus pending). Edit listing calls that RPC first and does not PATCH `max_guests`. Authenticated has no table UPDATE on `listings`; the re-granted columns do not include `max_guests`. Create listing still INSERTs it.

After `00025`, anon and authenticated have column-level SELECT on every `listings` column except `full_address`. Authenticated INSERT (all columns, so Create listing can still write the address) and UPDATE of the Edit listing columns (`title`, `description`, `category`, `price_per_person`, `duration_mins`, `group_pricing`, `area`, `full_address`, `whats_provided`, `photo_urls`) — not `max_guests`. `00038` adds `what_to_bring` to that SELECT and UPDATE list. Delete is `delete_listing`. `select('*')` and `listings(*)` embeds fail. Address is `listing_address(listing_id)` only.

`00038` adds `what_to_bring` (optional). Hosts set it on Create and Edit listing with the same chip input as custom what's-provided items, plus suggestion chips and a "Nothing, we provide everything" clear. Guests see a "What to bring" section under What's provided when the list has items, and the same list on `/bookings/:id`. The booking confirmation and the team's listing-submitted email show the same row. `listings_what_to_bring_ok` stays EXECUTE-granted: CHECK runs as the caller, so a revoke would block every authenticated listing write. `guard_listing_review` treats a change here as content on a `changes_requested` listing.

**New public table.** Revoke Supabase's default `GRANT ALL` (`REVOKE ALL` from anon and authenticated) and grant only what the client uses. `00025` also revokes default privileges for role `postgres` so a later `CREATE TABLE` does not dump ALL to clients. Grant `service_role` explicitly in the same migration (`GRANT ALL ... TO service_role`): from 30 October 2026 Supabase stops granting new `public` tables to any API role automatically, `service_role` included.

### planning_areas

```sql
name text PK              -- URA planning area, e.g. "Tampines"
region text not null      -- CHECK: Central | North | North-East | East | West
```

Seeded with the 55 Master Plan planning areas (`00016`). Public SELECT. No client INSERT/UPDATE/DELETE. Client list in `src/lib/planningAreas.js` must match the seed.

### sessions

```sql
id uuid PK
listing_id uuid FK → listings
starts_at timestamp
duration_mins integer
spots_total integer
spots_remaining integer
status text              -- documented as 'open' | 'full' | 'completed' | 'cancelled'
payout_released_at timestamp  -- unused for Connect payouts; booking.payout_released_at is the field that matters
host_reminder_sent_at timestamptz  -- send-reminders claim; no client grants (00037)
created_at timestamp
```

`completed` is never written. There is no session auto-complete job. `cancelled` is a soft-delete: `delete_empty_session` (`00012`) sets it when the listing owner removes an upcoming session that has no pending or confirmed bookings. Rows are never hard-deleted. There is no CHECK on status.

Browse still uses `"Anyone can view open sessions"` (`status = 'open'`), so a cancelled session disappears from the listing page. Guests and hosts also read their own sessions in any status via `session_visible_to_me()` (`00009`), so a sold-out (`full`) session still appears on the dashboard; Hosting excludes `cancelled` in its query. Guests who booked an inactive listing read its title via `listing_booked_by_me()`. Clients have SELECT + INSERT on sessions, no UPDATE (`00009`). `host_reminder_sent_at` is revoked from client SELECT, INSERT, and UPDATE (`00037`). `00024` also revokes UPDATE of `starts_at`, `duration_mins`, `spots_total`, and `spots_remaining` from anon and authenticated, so a later table GRANT cannot restore those columns. Changing status to `cancelled` or moving `starts_at` is an RPC, not a client PATCH. New sessions go through `add_listing_session` (`00018`) and take spots from the listing. `edit_open_session` (`00024`) moves an empty session; any pending or confirmed booking raises `session_has_bookings`. A before-insert trigger still refuses an overlapping INSERT that skips the function; the edit RPC checks the same overlap itself because that trigger is INSERT-only. A session occupies `[starts_at, starts_at + duration)`; a session that starts when another ends is allowed. Cancelled rows do not count. The same start and duration as an open or full session adds spots to that row and sets it back to `open`. Booking INSERT locks the session row (`bookings_lock_session`, `00024`) so a checkout and an edit wait on the same `FOR UPDATE`.

### bookings

```sql
id uuid PK
session_id uuid FK → sessions
guest_id uuid FK → users
guests_count integer default 1
total_amount integer      -- cents, guest all-in for the chosen rail
platform_fee integer      -- cents, total_amount - lesson; rounded-up remainder is platform margin
payment_rail text         -- 'card' | 'paynow'
host_fee integer          -- cents, frozen at confirmation
host_payout_amount integer -- cents, lesson minus host_fee, frozen at confirmation
stripe_payment_id text    -- PaymentIntent id
stripe_charge_id text     -- Charge id, used as Transfer source_transaction
stripe_transfer_id text
stripe_refund_id text     -- full refund only; release-payout never pays a row with this set
stripe_partial_refund_ids text[] default '{}'  -- admin-dispute-booking partial refunds (00029); do not block payout
payout_released_at timestamptz  -- booking-level; do not use sessions.payout_released_at for this
payout_hold_reason text   -- 'dispute' | 'chargeback' (CHECK, 00030); release-payout skips as dispute_hold while set. Guest and host can read it, so never free text
payout_held_at timestamptz
status text               -- 'pending' | 'confirmed' | 'cancelled'
cancelled_by text         -- 'guest' | 'host'  (admin-cancel-booking also writes 'host', including reason 'dispute')
cancelled_at timestamptz
refund_amount integer     -- cents, cumulative across partial and full refunds
guest_reminder_sent_at timestamptz  -- send-reminders claim; no client grants (00037)
created_at timestamp
```

After `00005`, anon/authenticated cannot INSERT or UPDATE bookings. `00009` drops the leftover 00001 INSERT/UPDATE policies so a restored GRANT cannot let a guest JWT cancel without `cancel-booking`. Money movement goes through service-role Edge Functions. Authenticated can SELECT (guest own rows + host session bookings). `cancel-booking` writes those rows with the service role, so API logs show `PATCH /rest/v1/bookings` and `PATCH /rest/v1/sessions` even when the function ran; look at Edge Function logs for `cancel-booking invoked`.

### reviews

```sql
id uuid PK
booking_id uuid FK → bookings
reviewer_id uuid FK → users
reviewee_id uuid FK → users
rating integer           -- 1 to 5
comment text
role text                -- 'host' | 'guest'
created_at timestamp
```

Insert policy (`00011`) is guest-only: reviewer is the guest on that booking, `role = 'guest'`, booking is `confirmed`, `now()` is after `starts_at + duration_mins`, and `reviewee_id` is the listing host. Unique on `(booking_id, role)`. Host→guest reviews have no insert path.

### booking_complaints

```sql
id uuid PK
booking_id uuid FK → bookings, unique  -- one report per booking
guest_id uuid FK → users
description text           -- 20 to 2000 characters, the guest's words (escape everywhere)
photo_paths text[]         -- complaint-evidence/{booking_id}/{complaint_id}/{n}.{ext}
photos_purged_at timestamptz  -- set when the 180-day purge removed the photos
created_at timestamptz
```

`00031`. Written only by `report-booking-problem` (service role). The guest can SELECT their own row's `id`, `booking_id`, `created_at` (RLS `guest_id = auth.uid()`) so the booking page shows "You reported a problem on ...". The description and photo paths are not client-readable, and the host has no grant. The `complaint-evidence` bucket is private with no storage policies.

### verification_reviews

```sql
id uuid PK
user_id uuid FK → users        -- the host who was reviewed
reviewer_id uuid FK → users    -- who decided; null for an automated decision
decision text                  -- 'approved' | 'rejected'
reason text                    -- required on rejection
method text                    -- 'manual' | 'stripe_identity'
created_at timestamptz
```

Append-only, service role only, no client grant of any kind. Written by `review_verification` in the same transaction as the status change, so a decision cannot be applied without a record. This is both the PDPA justification trail for holding NRIC copies and the review history the safety protocol assumes.

**Schema is in** `supabase/migrations/`, starting at `00001_baseline.sql`. Signup trigger is `00004_create_profile_on_signup.sql`. Money columns and `confirm_paid_booking` are in `00005_stripe_connect_payments.sql`. Verification functions, the real listing gate, and the `verification-docs` bucket policies are in `00007_verification_security_foundation.sql`. Dashboard session/listing reads for booked-or-hosted rows, and the drop of leftover booking INSERT/UPDATE policies, are in `00009_booking_session_read_and_cancel_rls.sql`. Hourly `release-payout` via pg_cron is `00010_schedule_release_payout.sql`. Listing-page reviews and guest INSERT gating are `00011_reviews_for_listing.sql` (`reviews_for_listing`, `guest_can_leave_review`, one review per booking per role). Empty-session soft-delete is `00012_delete_empty_session.sql` (`delete_empty_session`). `00012` also redefines `confirm_paid_booking` so a session that is not `open` (including `cancelled`) cannot confirm; the webhook refunds that the same way it refunds an oversell. Host-profile reviews are `00013_reviews_for_host.sql` (`reviews_for_host`): guest reviews this user received as a host, plus listing title, without embedding `bookings`. `00013` also redefines `reviews_for_listing` so both RPCs return the reviewer's first name in `users.full_name`. Display names are `00014_display_name.sql`: `users.display_name`, `handle_new_user` from signup metadata, and both review RPCs return `display_name` in jsonb `users.full_name`. Browse-card averages and owner listing delete are `00015_listing_ratings_and_delete_listing.sql` (`listing_ratings`, `delete_listing`). `00015` also redefines `my_verification` so admins get `pending_count` (everyone else gets 0). Planning areas are `00016_planning_areas.sql`: 55 URA names tagged to five regions, public SELECT, `listings.area` FK. Terms agreement is `00017_terms_accepted_at.sql`: `users.terms_accepted_at`, `handle_new_user` from signup metadata `terms_accepted`, `guard_user_self_update` blocks client writes. No SELECT or UPDATE grant. Storage buckets are `00026_lock_storage_policies.sql`: public `listing-photos` (owner INSERT/UPDATE/DELETE in `{auth.uid()}/`, no client SELECT — public URLs still work; the client only `upload`s and `getPublicUrl`s) and private `verification-docs` (owner SELECT/INSERT/UPDATE in `{auth.uid()}/` so upsert on resubmit works; no client DELETE; admins use service-role signed URLs). Suspension is `00027_hide_suspended_hosts.sql`: the public listings SELECT policy also requires `listing_host_in_good_standing(id)` (security definer, by listing id), so a suspended host's listings drop out of every public read; `create-payment-intent` refuses checkout for a suspended host. Price typo guard is `00028_listing_price_ceiling.sql`: `listings_price_ceiling` CHECK `price_per_person <= 50000` (NOT VALID), matching `MAX_PRICE_PER_PERSON_CENTS` in `src/lib/pricing.js`. Guest dispute tooling is `00029_booking_dispute_hold.sql`: `bookings.payout_hold_reason`, `payout_held_at`, and `stripe_partial_refund_ids`. In-app quality complaints are `00031_booking_complaints.sql` (`booking_complaints`, private `complaint-evidence` bucket). `00030` is reserved for the `booking_money_events` branch.
### booking_money_events

```sql
id uuid PK
booking_id uuid            -- no FK: the history must outlive (and not block) the users → bookings cascade
action text                -- 'hold' | 'release_hold' | 'partial_refund' | 'admin_cancel'
actor_user_id uuid         -- admin whose JWT made the call; null only for break_glass / system (CHECK)
auth_method text           -- 'admin_jwt' | 'break_glass' | 'system'
amount_cents integer       -- guest refund made by this action; null for hold / release_hold
host_payout_before integer
host_payout_after integer  -- what the host will be paid after this action (0 after an admin cancel before release)
stripe_object_id text      -- re_ for refunds
note text                  -- free text, 2000 max. Holds start with the code ('dispute: ...'); break-glass starts '[break-glass: <operator>]'
created_at timestamptz
```

`00030`. Admin-only: RLS on with no policies, no grant to anon or authenticated; `service_role` has SELECT and INSERT only. A trigger refuses UPDATE, DELETE, and TRUNCATE for every role, so history cannot be rewritten through the API. Read it in SQL Editor. Written by `admin-dispute-booking` (every `hold`, `release_hold`, `partial_refund`) and `admin-cancel-booking` (every cancel) after the action succeeds; a no-op (`already_released`, `already_cancelled`) writes nothing. A failed insert never fails the action, because a retried refund would move money twice: the function logs the full row and returns `audit_logged: false` with `audit_error`. Row builders are `_shared/money-events.ts`. Free-text hold reasons from `00029` were moved here and the booking column reset to `'dispute'`.

**Schema is in** `supabase/migrations/`, starting at `00001_baseline.sql`. Signup trigger is `00004_create_profile_on_signup.sql`. Money columns and `confirm_paid_booking` are in `00005_stripe_connect_payments.sql`. Verification functions, the real listing gate, and the `verification-docs` bucket policies are in `00007_verification_security_foundation.sql`. Dashboard session/listing reads for booked-or-hosted rows, and the drop of leftover booking INSERT/UPDATE policies, are in `00009_booking_session_read_and_cancel_rls.sql`. Hourly `release-payout` via pg_cron is `00010_schedule_release_payout.sql`. Listing-page reviews and guest INSERT gating are `00011_reviews_for_listing.sql` (`reviews_for_listing`, `guest_can_leave_review`, one review per booking per role). Empty-session soft-delete is `00012_delete_empty_session.sql` (`delete_empty_session`). `00012` also redefines `confirm_paid_booking` so a session that is not `open` (including `cancelled`) cannot confirm; the webhook refunds that the same way it refunds an oversell. Host-profile reviews are `00013_reviews_for_host.sql` (`reviews_for_host`): guest reviews this user received as a host, plus listing title, without embedding `bookings`. `00013` also redefines `reviews_for_listing` so both RPCs return the reviewer's first name in `users.full_name`. Display names are `00014_display_name.sql`: `users.display_name`, `handle_new_user` from signup metadata, and both review RPCs return `display_name` in jsonb `users.full_name`. Browse-card averages and owner listing delete are `00015_listing_ratings_and_delete_listing.sql` (`listing_ratings`, `delete_listing`). `00015` also redefines `my_verification` so admins get `pending_count` (everyone else gets 0). Planning areas are `00016_planning_areas.sql`: 55 URA names tagged to five regions, public SELECT, `listings.area` FK. Terms agreement is `00017_terms_accepted_at.sql`: `users.terms_accepted_at`, `handle_new_user` from signup metadata `terms_accepted`, `guard_user_self_update` blocks client writes. No SELECT or UPDATE grant. Storage buckets are `00026_lock_storage_policies.sql`: public `listing-photos` (owner INSERT/UPDATE/DELETE in `{auth.uid()}/`, no client SELECT — public URLs still work; the client only `upload`s and `getPublicUrl`s) and private `verification-docs` (owner SELECT/INSERT/UPDATE in `{auth.uid()}/` so upsert on resubmit works; no client DELETE; admins use service-role signed URLs). Suspension is `00027_hide_suspended_hosts.sql`: the public listings SELECT policy also requires `listing_host_in_good_standing(id)` (security definer, by listing id), so a suspended host's listings drop out of every public read; `create-payment-intent` refuses checkout for a suspended host. Price typo guard is `00028_listing_price_ceiling.sql`: `listings_price_ceiling` CHECK `price_per_person <= 50000` (NOT VALID), matching `MAX_PRICE_PER_PERSON_CENTS` in `src/lib/pricing.js`. Guest dispute tooling is `00029_booking_dispute_hold.sql`: `bookings.payout_hold_reason`, `payout_held_at`, and `stripe_partial_refund_ids`. The money audit log is `00030_booking_money_events.sql`: `booking_money_events` (append-only, admin-only) and the `bookings_payout_hold_reason_code` CHECK (`'dispute'` or `'chargeback'`).

---



## 4. Rules that must never be broken

These are enforced in code. If you are about to change logic around any of them, flag Caleb first.

1. **Prices are always integers in cents.** $20 = 2000. Never floats. Never dollars in the database.
2. `full_address` **must not appear in a public query.** Reveal is `listing_address(listing_id)` to the host or a confirmed guest. Do not add `full_address` to any listings SELECT or embed. The column is not granted SELECT.
3. **Reviews are gated.** A guest may only review a `confirmed` booking after the session ends (`starts_at` + `duration_mins`), one review per booking per role, and only of that listing's host. The Bookings UI matches this (if duration is missing it uses `starts_at` + 2 hours). RLS is `guest_can_leave_review` in `00011`.
4. `spots_remaining` **must never go below zero.** Decrement on confirmation (`confirm_paid_booking`), increment on cancellation of confirmed rows only.
5. **Only approved hosts can hold active listings.** `verification_status = 'approved'` is the CreateListing gate. There is no server-side block that prevents an unverified user from inserting a listing if they bypass the form.
6. **The platform fee is not a flat percentage.** Guest totals live in `supabase/functions/_shared/booking.ts`. See section 5.
7. **The cancellation policy is four tier**, per below. Do not assume the old two tier rule anywhere.
8. **Never confirm a booking from the browser.** The Stripe webhook is the source of truth. `confirm_paid_booking` and `confirm_booking` are service_role only.



### Cancellation policy, correct version

*Updated 25 October 2026. Guest tiers from 29 July 2026. Published at /cancellation-policy.*


| Scenario                              | Outcome                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest cancels 48hrs+ before           | Full refund, including platform fee                                                                                                                               |
| Guest cancels 24 to 48hrs before      | 50% of lesson fee, platform fee forfeited                                                                                                                         |
| Guest cancels 6 to 24hrs before       | 25% of lesson fee, platform fee forfeited                                                                                                                         |
| Guest cancels under 6hrs, or no shows | No refund                                                                                                                                                         |
| You cancel a booked session           | Every guest gets a full refund and you get one strike. Guests plan their day around your session, so we keep cancellations rare.                                  |
| You remove a date nobody has booked   | No strike. Change your calendar freely. (`delete_empty_session`)                                                                                                  |
| Host no show                          | Full guest refund including platform fee, plus discretionary compensation at TryKai's judgement. Host receives 2 strikes immediately and the account is reviewed. |
| 3 strikes                             | Your listings are taken down automatically (`apply_host_strike` at 3 active strikes)                                                                              |
| How long a strike lasts               | Strikes expire 12 months after they're given (`host_strike_events`, `00039`)                                                                                      |


All boundaries are measured in Singapore time, from the moment of cancellation to session start. Exactly 48:00:00 counts as within the 48 hour tier.

Also decided but **not yet built**: reschedule, once per booking, same 48 hour cutoff. Immediate suspension independent of the strike counter, for safety reports (fields exist; the app does not query them). Host strike appeals: hosts email `hello@trykai.sg` with the booking reference and what happened; `admin_remove_host_strike` is the SQL path (OPERATIONS.md). No admin UI (BUILD_BACKLOG KIV).

---



## 5. Fee structure

*Decided 23 August 2026. See DECISIONS.md for the full modelling and rationale. Code of record:* `supabase/functions/_shared/booking.ts` *and* `src/lib/pricing.js`*.*

**Guest fee.** Card fee is 12% of the lesson total with a S$2.50 floor, then the total is rounded UP to the nearest whole dollar so it can never dip below the floor. Browse cards still show the one-person card all-in so the price never rises between viewing and paying. Checkout recomputes from `guests_count` and the listing's `group_pricing` flag; `create-payment-intent` ignores any client total.

**Group pricing.** When `listings.group_pricing` is true (the default), the lesson price per person is discounted then multiplied by guests, in integer cents: 5% for 2, 10% for 3, 15% for 4, 20% for 5 or more. Never more than 20%. The card fee and the PayNow 5% apply once to that discounted lesson total. A group booking is one booking row.

**PayNow.** Shown as a flat 5% discount off the card all-in total for that guest count, displayed at checkout only. PayNow is refused when the session starts more than `PAYNOW_MAX_DAYS_AHEAD` (80) days from now — Stripe cannot refund PayNow after 90 days. `create-payment-intent` returns `paynow_too_far_ahead`; the checkout UI disables PayNow and keeps card pricing. Card is unaffected.

**Host fee.** 10% of the discounted lesson total, triggered per host: every non founding host's first three **confirmed** bookings are free, their fourth booking onward pays the fee. A group booking counts as one toward those three. Founding hosts (`is_founding_host`) never pay.

Do not hardcode a flat percentage. Worked one-person checks: $10 → $13, $20 → $23, $25 → $28, $30 → $34, $40 → $45. PayNow example: $25 lesson → $26.60. Code of record is `booking.ts` and `pricing.js`; they must agree.

---



## 6. Payout model

**Provider decided 16 August 2026: Stripe Connect, separate charges and transfers, Express accounts.** This is implemented in code.

The host's share is released **72 hours after the session ends** (`starts_at` + `duration_mins`), not after the guest pays. `release-payout` creates a Transfer with `transfer_group = booking_id` and `source_transaction = stripe_charge_id`. Stripe only records that Transfer when the function runs. Two hourly callers:

- **Staging (and any hosted project):** pg_cron job `invoke-release-payout-hourly` from `00010`, at minute 12 UTC. It POSTs using Vault secrets `release_payout_url`, `release_payout_anon_key`, and `payout_cron_secret`.
- **Production extra:** GitHub Action `.github/workflows/release-payout.yml` (schedule plus **Run workflow**). GitHub only fires `schedule` from the default branch (`main`).

Both send `x-cron-secret` (`PAYOUT_CRON_SECRET` or `CRON_SECRET`). Stripe idempotency key is the booking id, so overlap is safe. Each run logs JSON `{ scanned, due, released, failed, skipped_by_reason, skipped }`. `skipped` lists rows that are not merely waiting out the 72h hold. A missing `stripe_charge_id` is loaded from the PaymentIntent (`latest_charge`) and stored before eligibility is decided. Do not omit `source_transaction`; after a platform bank payout that would Transfer someone else's funds.

**Session reminders (`00037`).** The same vault + pg_cron pattern calls `send-reminders` hourly at minute 17 UTC (`invoke-send-reminders-hourly`). Vault names are `send_reminders_url`, `send_reminders_anon_key`, and `reminders_cron_secret`. The function checks `x-cron-secret` against `REMINDERS_CRON_SECRET` (or `CRON_SECRET`). Each run claims then emails, caps at 200, and logs `{ guests_scanned, guests_sent, hosts_scanned, hosts_sent, skipped, failed }`. Apply `00037` before merging the function. Click-by-click: OPERATIONS.md, Session reminders.

**Dispute hold (`00029`, 19 October 2026).** While `bookings.payout_hold_reason` is set, `payoutSkipReason` returns `dispute_hold` and the row is not paid, however long ago the session ended. Right before each Transfer, `release-payout` re-reads `status`, `payout_hold_reason`, `host_payout_amount`, `stripe_refund_id`, and `payout_released_at`, so a hold placed after the hourly scan still wins. `stripe_refund_id` (full refund) also blocks payout. Partial refunds go in `stripe_partial_refund_ids` instead and leave the reduced `host_payout_amount` payable.

**In-app quality complaints (`00031`).** Booking detail shows **Report a problem** on a confirmed booking from `starts_at` until 3 days after `starts_at + duration_mins` (`canReportProblem` in `_shared/complaints.ts`; listing length, then 120 minutes, when the session has none). `COMPLAINT_WINDOW_MS` is `PAYOUT_HOLD_MS`, so the window closes exactly when the payout becomes due. `report-booking-problem` takes multipart form data (`booking_id`, `description`, up to 3 JPEG/PNG/WebP photos of 5 MB each, compressed client-side), checks the guest's JWT and the window again (`complaintDecision`), inserts `booking_complaints`, places the hold (`payout_hold_reason = 'dispute'`, guarded on unreleased, unrefunded, not already held) before uploading photos, then emails `ADMIN_NOTIFY_EMAIL` (reply-to the guest) and the guest. Safety reports stay on email with no time limit; the page links a prefilled `mailto:` on every confirmed booking. `purge-verification-docs` deletes complaint photos 180 days after the report (`COMPLAINT_EVIDENCE_RETENTION_DAYS`) and keeps the text.

`admin-dispute-booking` (`x-admin-secret`, `ADMIN_FUNCTION_SECRET`) is the ops tool. Actions: `hold` (`reason`, 200 characters, refused after release), `release_hold`, and `partial_refund` (`refund_amount_cents`, `new_host_payout_cents`). Before release a partial refund needs the hold, can only lower the host payout, and refunds plus payout can never exceed `total_amount`. After release the host payout is fixed and the refund must fit in TryKai's own share (`total_amount - refund_amount - host_payout_amount`); otherwise it returns 409 with the absorbable amount. The Stripe refund is on the PaymentIntent (platform balance, no `reverse_transfer`), keyed `dispute-refund:<booking>:<prior refund>:<amount>` so a retry returns the same refund. The row write is guarded on the prior `refund_amount`, adds the refund id, lowers `host_payout_amount` (before release), and clears the hold. Rules live in `_shared/disputes.ts`. Clawback from a host after release is still manual.
`admin-dispute-booking` is the ops tool. The caller is an admin's own JWT (`users.is_admin` re-checked server-side, as `admin-verifications` does), or break-glass `x-admin-secret` (`ADMIN_FUNCTION_SECRET`) plus `x-admin-operator` (section 7). Actions: `hold` (`reason` is a neutral code, `'dispute'` by default or `'chargeback'`; required `note` up to 1500 characters goes only to `booking_money_events`; refused after release), `release_hold` (optional `note`), and `partial_refund` (`refund_amount_cents`, `new_host_payout_cents`, optional `note`). Every change writes a `booking_money_events` row with the actor. Before release a partial refund needs the hold, can only lower the host payout, and refunds plus payout can never exceed `total_amount`. After release the host payout is fixed and the refund must fit in TryKai's own share (`total_amount - refund_amount - host_payout_amount`); otherwise it returns 409 with the absorbable amount. The Stripe refund is on the PaymentIntent (platform balance, no `reverse_transfer`), keyed `dispute-refund:<booking>:<prior refund>:<amount>` so a retry returns the same refund. The row write is guarded on the prior `refund_amount`, adds the refund id, lowers `host_payout_amount` (before release), and clears the hold. Rules live in `_shared/disputes.ts`, caller auth in `_shared/admin-auth.ts`, event rows in `_shared/money-events.ts`. Clawback from a host after release is still manual.

**Ops (click-by-click in OPERATIONS.md):** Vault secrets, GitHub secrets, deploy `release-payout`, set platform Stripe payouts to **manual** (or keep a reserve covering outstanding host liability). Automatic platform payouts to Aspire would leave nothing to Transfer.

Under Express accounts, Stripe collects the host's bank details at onboarding. Hosts must finish Connect onboarding (`stripe_payouts_enabled`) before guests can Book. Creating a listing stays allowed. Hosting “Set up payouts” calls `create-account-link`, which creates the Express account if the host does not have one yet.

`stripe_payouts_enabled` is written only from Stripe, never from the query string. `?connect=return` and `?connect=refresh` call `create-account-link` with `{ refresh: true }`, which retrieves the connected account, saves `payouts_enabled`, and does not mint a new Account Link. The refresh response also includes `pending`: true when the v1 account has no `currently_due` or `past_due` requirements and is not disabled for a reason other than `requirements.pending_verification`. Hosting then polls every 5 seconds for up to 60 seconds. Enabled shows “Payouts are set up. Guests can now book you.” Pending shows a WaitingState line (“Stripe is checking your details…”, then “Stripe is still checking…” after 60s) with no Set up button. Something still due keeps “Your payout setup isn't finished yet.” and Continue setup. It never shows “submitted” without that check.

`account.updated` on `stripe-webhook` matches `users.stripe_account_id` and writes the same flag. The function verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`, then `STRIPE_CONNECT_WEBHOOK_SECRET` if that secret is set. A Connected-accounts destination (listening to `account.updated`) is required so those events actually arrive; see OPERATIONS.md.

---



## 7. Auth, RLS, and the trusted functions

Supabase built in auth, email and password for MVP. Session handling is Supabase's default; no manual JWT management.

**Signup.** `Login.jsx` does **not** insert a `public.users` row. Tests assert this. `handle_new_user` (trigger on `auth.users`, `00004`, redefined in `00017`) inserts `id`, `email`, `full_name`, `display_name`, and `terms_accepted_at` from signup metadata. `display_name` falls back to the first word of `full_name`. `terms_accepted_at` is `now()` when metadata `terms_accepted` is true (`true` / `t` / `1`), otherwise null. Signup requires a checkbox that sends `terms_accepted: true`. Existing rows are not backfilled. `guard_user_self_insert` forces `stripe_account_id`, `stripe_payouts_enabled`, and `is_founding_host` off on authenticated inserts.

**Email confirmation (20 October).** With Confirm email on, `signUp` returns a user and no session, and `Login.jsx` switches to a **Check your email** step: a numeric code field (`autocomplete="one-time-code"`), Confirm email, "Send a new code" after a 60-second countdown (`auth.resend({ type: 'signup' })`), and Start again. `verifySignupCode` (`src/lib/emailConfirm.js`) calls `verifyOtp` with type `email` and falls back to `signup` for older Auth servers, never after a rate limit. A login that fails with `email_not_confirmed` sends a fresh code and opens the same step. A signup that returns a user with no identities is an existing account (Supabase sends nothing), so the page says to log in instead. `emailRedirectTo` is the page the guest was heading for, so the email's link lands there; the code step also listens for `SIGNED_IN`, so confirming through the link in another tab of the same browser moves this tab on. The email itself is Supabase's **Confirm signup** template, generated from `confirmSignupTemplateHtml` into `supabase/templates/confirm-signup.html` and pasted into each dashboard; it carries `{{ .Token }}` and `{{ .ConfirmationURL }}`. Auth email goes through Resend SMTP, because the built-in mailer's hourly limit is what silently broke signup earlier. Setup: OPERATIONS.md, Email confirmation at signup.

**Verification submission goes through** `submit_verification` **(**`00007`**).** VerifyIdentity uploads to the private `verification-docs` bucket, then calls the RPC with both paths and an explicit consent flag. The client has **no** UPDATE grant on `verification_status`, `id_photo_url`, or `selfie_url`. The RPC is security definer and still trips `guard_user_self_update`, which permits only unverified/rejected → pending, so it cannot be used to self-approve. A host reads their own state via `my_verification()`.

**Column grants (after** `00023`**), not a public-profile VIEW.** `00005` revokes ALL on `users` then re-grants specific columns; later migrations narrow that further. After `00023`, anon and authenticated SELECT only `id`, `display_name`, `bio`, `avatar_url`, `is_host`, `stripe_payouts_enabled`, and `is_id_verified`. `email`, `full_name`, `phone`, `phone_verified`, `host_strikes`, `created_at`, and `verification_status` are revoked; the caller reads their own row through `my_account()`. The public ID badge is the generated `is_id_verified` column. `id_photo_url` and `selfie_url` are granted to **neither** anon nor authenticated, so the storage bucket is no longer the only barrier. `is_admin` and the verification metadata columns are granted to no client role at all, which is why `my_verification()` exists instead of a wider SELECT grant. `is_founding_host` is likewise ungranted; Create and Edit listing read it through `my_is_founding_host()` (`00022`). `terms_accepted_at` is likewise granted to neither anon nor authenticated (`00017`); `guard_user_self_update` also blocks writes so a later additive GRANT cannot let a client stamp it. `bio` is granted SELECT to anon and authenticated and UPDATE to authenticated (`00021`). RLS `"Anyone can view host profiles" USING (true)` still exists, because the sensitive columns are no longer granted.

**The listing gate is enforced in the database.** `hosts_create_listings_verified` and `hosts_create_sessions_verified` require `can_create_listing()` (`00008`): approved and not suspended. That function is security definer and reads only `auth.uid()`, because the 00007 policies used to subquery `users.is_suspended` as the caller and 00005 never granted that column, so listing INSERT failed with `permission denied for table users`. Do not SELECT-grant `is_suspended`; the public-profile policy is `USING (true)`. Ownership (`host_id = auth.uid()`, session belongs to the caller's listing) still lives in the policies. Before `00007` the only check was `auth.uid() = host_id`, so an unverified account could insert a listing straight through PostgREST; the approval check lived only in `CreateListing.jsx`.

`full_address`**.** Not SELECT-granted. `listing_address(listing_id)` (`00025`) returns it to the **host** or a **confirmed guest**, otherwise null. Execute for authenticated only. ListingDetail, BookingDetail, Bookings, and Edit listing call it. `get_listing_address` is dropped in `00025`.

**Trusted functions that move money or status:**

- `handle_new_user()` — trigger on `auth.users`. Creates the profile row, including `display_name` (`00014`) and `terms_accepted_at` (`00017`).
- `guard_user_self_update()` / `guard_user_self_insert()` — block self-approval and strike/suspension/stripe/founding-host/admin/terms-accepted writes. Does not inspect `display_name` or `bio`; authenticated UPDATE of those granted columns is allowed.
- `submit_verification(id_photo_url, selfie_url, consent)` — the only way a client reaches `pending`. Requires consent.
- `my_verification()` — the caller's own verification state, so a rejection reason and `is_admin` need no table-wide SELECT grant. `pending_count` is the number of `verification_status = 'pending'` rows, and is 0 unless the caller is an admin (`00015`).
- `my_account()` — the caller's own PII (`00023`). Security definer, `auth.uid()` only, execute for authenticated. Returns email, full_name, phone, display_name, bio, avatar_url, is_host, verification_status, stripe_payouts_enabled, and `host_strikes` as the live active count (`host_active_strike_count`, `00039`).
- `my_is_founding_host()` — the caller's own `is_founding_host` boolean (`00022`). Execute for authenticated only. Create and Edit listing use it for the price panel; an error hides "You get" and the fee footnote rather than showing the 10% line. The full-session line still shows. Founding hosts see "Founding host: no host fee, ever."
- `can_create_listing()` — whether the caller may insert a listing or a session. Security definer so the policy does not need a SELECT grant on `is_suspended`.
- `review_verification(user_id, decision, reason, method, reviewer_id)` — writes the decision and an audit row together. **Service role only.**
- `listing_address(listing_id)` — host or confirmed guest (`00025`). Execute for authenticated only. The only client path to `full_address`. `get_listing_address` is dropped in the same migration.
- `reviews_for_listing(listing_id)` — public guest reviews whose booking belongs to a session of that listing. Security definer so the listing page does not embed `bookings` (guest/host SELECT only). Returns review fields and the reviewer's `display_name` in jsonb `users.full_name` (`00014` redefines the `00013` function).
- `listing_ratings(listing_ids)` — average and `review_count` per listing, same reviews → bookings → sessions join as `reviews_for_listing`, `role = 'guest'`. Listings with no guest reviews are omitted. Granted to anon and authenticated. Home and public profiles call it once with every listing id on the page.
- `guest_can_leave_review(booking_id, reviewer_id, reviewee_id)` — INSERT gate for guest reviews. Security definer. Requires confirmed booking, session ended, reviewer is the guest, reviewee is the listing host.
- `delete_empty_session(session_id)` — listing owner only. Soft-deletes an upcoming session (`status = 'cancelled'`) when no booking on it is pending or confirmed. Never hard-deletes. Revoked from anon.
- `add_listing_session(listing_id, starts_at, spots)` — listing owner, and `can_create_listing()` (`00018`). Duration comes from the listing, not the caller. Locks the listing, then either adds spots to the open or full session with that exact start and duration, or inserts one open session. Overlaps raise. A start time that is not in the future raises. Revoked from anon. Direct INSERT is still granted; `sessions_reject_overlap` enforces the same overlap rule.
- `set_listing_spots(listing_id, spots)` — listing owner (`00024`). The only UPDATE of `listings.max_guests`. Locks the listing and its future sessions, writes `max_guests`, and sets each future session to `max(spots, confirmed + pending)`. Returns `{ updated, held }`. Revoked from anon.
- `edit_open_session(session_id, new_start)` — listing owner (`00024`). Locks the listing then the session. Refuses any pending or confirmed booking (`session_has_bookings`), past times, and overlaps (`session_overlap_message`). Revoked from anon.
- `lock_session_on_booking()` — `BEFORE INSERT` on `bookings` (`00024`). `FOR UPDATE` on the session row so checkout and `edit_open_session` cannot both commit.
- `delete_listing(listing_id)` — listing owner only (`00015`, argument `p_listing_id`). Soft-deletes with `is_active = false`. Refuses if any upcoming session has a pending or confirmed booking; otherwise also sets that listing's empty upcoming sessions to `cancelled`, in one transaction. Revoked from anon. The client no longer PATCHes `is_active` for this path.
- `reviews_for_host(host_id)` — guest reviews this user has received as a host, with listing title. Security definer so the public profile does not embed `bookings`. Does not return reviews they wrote as a guest. Reviewer name is `display_name` in jsonb `users.full_name`, same shape as `reviews_for_listing` (`00014`).
- `confirm_paid_booking(...)` and `confirm_booking` wrapper — flip pending → confirmed and decrement `spots_remaining` atomically under a row lock. **Service role only.** Requires `sessions.status = 'open'` (`00012`). The Stripe webhook calls `confirm_paid_booking`. If spots are gone or the session is not open (including cancelled), the webhook refunds instead of confirming.
- `apply_host_strike(host_id, reason default host_cancel, session_id default null)` — inserts a `host_strike_events` row, sets `users.host_strikes` to the active count, and deactivates listings at 3. **Service role only** (`00039`).
- `host_active_strike_count(host_id)` — not removed and given in the last 12 months. Security definer, **not granted to clients**.
- `admin_remove_host_strike(event_id, note)` — SQL Editor only (OPERATIONS.md). Sets `removed_at` and `removed_note`, recomputes `users.host_strikes`. Does not reactivate listings. **Not granted to clients.** The `is_admin` branch in the function never runs.
- `review_listing(listing_id, decision, note, reviewer_id)` — `approved` or `changes_requested` (note required) plus a `listing_reviews` row (`00036`). **Service role only**; `admin-listings` calls it.
- `invoke_release_payout()` — pg_cron POST to `release-payout`. Reads Vault; revoked from anon and authenticated.
- `invoke_send_reminders()` — pg_cron POST to `send-reminders` (`00037`). Reads Vault (`send_reminders_url`, `send_reminders_anon_key`, `reminders_cron_secret`); revoked from anon and authenticated.

**Verification review is on the platform** at `/admin/verifications`, gated by `is_admin`. The hamburger shows a link to it only after `my_verification()` reports that the signed-in user is an admin. Hosting shows a one-line banner (`N verifications waiting · Review`) only to admins and only when `pending_count > 0`. `admin-verifications` authenticates the reviewer's own JWT and then re-checks `is_admin` server-side, because a shared secret cannot be shipped to a browser. Document images are served through signed URLs minted with the service role and valid for `SIGNED_URL_TTL_SECONDS`, so they are never reachable from a public or authenticated non-admin route. The result email, including the rejection reason, is sent from that function rather than a database webhook, the same way booking emails moved into `stripe-webhook`.

The remaining admin actions (set `is_founding_host`, suspend, grant `is_admin`) still run as the service role via the Supabase Table Editor. `admin-cancel-booking` writes `cancelled_by: 'host'` and takes optional `reason: 'host_cancelled' | 'dispute'` (email wording only) and `note`. `admin-dispute-booking` holds payouts and makes partial dispute refunds (section 6). Neither has a UI; OPERATIONS.md has the curl commands.

**Money actions are attributable (`00030`, 19 October 2026).** `admin-dispute-booking` and `admin-cancel-booking` authenticate the caller's own Supabase JWT and re-check `users.is_admin` with the service role, the same way `admin-verifications` does (`_shared/admin-auth.ts`). A signed-in non-admin gets 403 even if they also send the secret. Each action writes a `booking_money_events` row with `actor_user_id`. **Break-glass:** with no user JWT, `x-admin-secret` matching `ADMIN_FUNCTION_SECRET` still works but needs `x-admin-operator` (a name, 100 characters max); the row is `auth_method = 'break_glass'`, `actor_user_id` null, and the note starts `[break-glass: <operator>]`. The secret is only accepted in `x-admin-secret`, never as a bearer token. Unset `ADMIN_FUNCTION_SECRET` to turn break-glass off.

---



## 8. File map

```
api/                             # Vercel serverless functions (plain Node, not bundled)
├── listing-preview.js           # Link-preview HTML for /listings/:id, crawlers only (vercel.json UA rewrite)
└── _lib/linkPreview.js          # Self-contained tag builder; price parity-tested against pricing.js
vercel.json                      # Crawler rewrite to api/listing-preview, then SPA catch-all
src/
├── lib/
│   ├── supabase.js              # Supabase client init
│   ├── authedUser.js            # RequireAuth context: useAuthedUserId
│   ├── cancellationPolicy.js    # Four-tier guest refund copy + arithmetic
│   ├── hostStrikes.js           # Active-strike expiry (12 months) and the 3-strike cutoff
│   ├── pricing.js               # All-in card / PayNow prices; wraps booking.ts group helpers
│   ├── duration.js              # Hours and minutes, never "390 mins"
│   ├── reviewGate.js            # Guest review eligibility (confirmed + session ended)
│   ├── firstName.js             # Split a legal name; not used on public surfaces
│   ├── publicName.js            # Public surfaces: display_name only
│   ├── myAccount.js             # first row of my_account(); notifyAccountUpdated for the nav
│   ├── listingRatings.js        # Map listing_ratings RPC rows onto Card rating props
│   ├── planningAreas.js         # 55 URA planning areas, five regions, host hide list
│   ├── areaSearch.js            # Neighbourhood alias → planning area
│   ├── pageLoad.js              # JWT issued-at-future retry + friendly first-load error
│   ├── unsavedDraft.js          # Settings / Edit listing snapshot for dirty compare
│   ├── listingDelete.js         # Hosting / Edit listing session select + upcoming booking counts
│   ├── useUnsavedChangesGuard.jsx # useBlocker dialog + beforeunload while a form is dirty
│   ├── sessionDate.js           # Session day/time; year only when it is not this year
│   ├── sessionCalendar.js       # Singapore month grid for listing and host calendars
│   ├── sessionBatch.js          # Bulk-create dates, 80-day window, clash preview, 40 cap
│   ├── listingSpots.js          # Listing spots copy, capacity floor, session_has_bookings
│   ├── listingCategories.js     # Shared host/browse category list + area line
│   ├── reportMailto.js          # Report links to hello@trykai.sg
│   ├── share.js                 # Share sheet, else clipboard, else execCommand copy
│   ├── keen.js                  # I'm keen: card pill, host banner copy, RPC row mapping (wraps _shared/interest.ts)
│   └── edgeFunctionError.js     # Read Edge Function error bodies
├── data/
│   └── areaAliases.js           # URA MP2019 subzones + extra aliases (one name may map to several areas)
├── pages/
│   ├── Home.jsx                 # Browse: grid of ui/Card, region + area filters, listing_ratings once per page
│   ├── Login.jsx                # Auth, login + signup (no users insert)
│   ├── ForgotPassword.jsx       # Public: request a reset email
│   ├── ResetPassword.jsx        # Public: set a new password from a recovery link
│   ├── ListingDetail.jsx        # Listing, swipe/mosaic gallery, rail picker, Payment Element
│   ├── Profile.jsx              # /u/:id public listings+reviews; own tabs Bookings/Hosting/Reviews; ?view=public preview
│   ├── CreateListing.jsx        # Verification gate, listing insert, is_host=true, draft autosave
│   ├── EditListing.jsx          # Host edits listing; save calls set_listing_spots; delete + unsaved-changes guard
│   ├── VerifyIdentity.jsx       # What you'll teach, then Singpass (if enabled) or upload ID + selfie
│   ├── SingpassReturn.jsx       # /verify-identity/singpass: Singpass response → read-only review → confirm
│   ├── AdminSingpassKeys.jsx    # /admin/singpass-keys: makes Singpass keys in the browser, is_admin only
│   ├── AdminVerifications.jsx   # /admin/verifications review queue, is_admin only
│   ├── Dashboard.jsx            # Legacy /dashboard → /bookings, or /hosting when ?connect=
│   ├── RedirectToOwnProfile.jsx # /bookings and /hosting → /u/:id?tab=…, query string kept
│   ├── BookingDetail.jsx        # /bookings/:id guest receipt and cancel
│   ├── Bookings.jsx             # Guest view: My Bookings cards link to /bookings/:id, reviews, ?booking= poll; non-host empty host CTA
│   ├── Hosting.jsx              # Host view: listing rows, bulk add sessions, hosted sessions, Connect payouts; shared delete dialog
│   ├── Settings.jsx             # Profile (photo change/remove immediately, names, About) + Account; Log out → /logout; unsaved-changes guard
│   ├── Logout.jsx               # /logout: signOut (local fallback) then Home; PageLoader while it runs
│   ├── StyleGuide.jsx           # UI kit preview at /style-guide
│   ├── RefundPolicy.jsx
│   ├── CancellationPolicy.jsx
│   ├── DisputePolicy.jsx
│   ├── Terms.jsx
│   └── Privacy.jsx
├── components/
│   ├── SiteNav.jsx              # Live chrome: TopNav from session + my_account(); refetches on trykai:account-updated
│   ├── ScrollToTop.jsx          # Scroll to top on PUSH/REPLACE path change; skip POP
│   ├── BackButton.jsx           # Shared header row: circled SVG chevron + optional actions slot
│   ├── Footer.jsx               # Policy links, UEN, privacy@trykai.sg
│   ├── RequireAuth.jsx
│   ├── RequireAdmin.jsx         # is_admin via my_verification(); renders only
│   ├── ReviewCard.jsx           # Public review; Avatar + ⋮ menu with Report review
│   ├── HostRating.jsx           # Profile header and listing-detail Hosted by star + average
│   ├── VerifiedBadge.jsx        # Shield-with-tick + "ID verified"; Profile and listing Hosted by
│   ├── StarPicker.jsx
│   ├── CancellationPolicy.jsx   # Host info block / guest note on the listing card
│   ├── HostTermsContent.jsx     # Part 2 of the Terms, used on /terms and in Create listing
│   ├── HostTermsDialog.jsx      # Full-screen / centred sheet; same crop-dialog shell
│   ├── PhotoCropDialog.jsx      # Shared crop dialog (listing 4:3, profile 1:1 circular)
│   ├── ProfilePhotoFlow.jsx     # Pick → compress → crop → upload/remove avatar_url
│   ├── UnsavedChangesDialog.jsx # Discard your changes? Keep editing / Discard
│   ├── ListingDeleteDialog.jsx  # Shared Hosting / Edit listing delete: confirm, blocked, or sessions-unavailable
│   ├── HeroBadge.jsx            # Home hero poke wrapper + floating category face
│   ├── ViewableAvatar.jsx       # Photo opens lightbox; initials do nothing
│   ├── PlanningAreaSelect.jsx   # Searchable planning-area combobox (host + browse)
│   ├── PostalAddressFields.jsx  # Auto postal lookup, confirmed card, unit, Area guests see
│   ├── SessionCalendar.jsx      # Guest month calendar on listing detail
│   ├── DateMultiSelectCalendar.jsx # Host tap-to-select dates
│   ├── AddSessionsForm.jsx      # Bulk add: quick-fill, times, preview, create
│   ├── PageLoader.jsx           # Page-level wait: spinner after 400ms, "Loading…" for screen readers
│   ├── WaitingState.jsx         # Long wait card: title, illustration, messages at 0 / 4s / 12s
│   ├── LoadingMascot.jsx        # Default WaitingState art (three dots); future mascot home
│   └── ui/
│       ├── TopNav.jsx           # Global top bar; avatar links to own profile, via SiteNav
│       ├── HamburgerMenu.jsx    # Slide-in panel; signed-in adds Profile, Settings, Log out → /logout
│       ├── Button.jsx           # Kit button; `loading` keeps width, spinner + loadingLabel, aria-busy
│       ├── Input.jsx            # Live on Settings and Login (textarea for About); also /style-guide
│       ├── Card.jsx             # Browse mode is live on Home and profile listings
│       ├── OverflowMenu.jsx     # Shared ⋮/⋯ menu; align start|end; Hosting rows, listing/profile/review Report
│       ├── SelectableCard.jsx   # Category cards; /style-guide only
│       └── Avatar.jsx           # Photo or first letter of display_name; ui-avatar centres the initial; Settings, Profile, Hosted by, TopNav, Card, booking detail, reviews
├── App.jsx                      # createBrowserRouter + layout (SiteNav, BackButton, Footer, Outlet)
└── main.jsx

supabase/migrations/
├── 00001_baseline.sql
├── 00002_address_reveal_and_confirm_booking.sql
├── 00003_signup_verification_and_suspension.sql
├── 00004_create_profile_on_signup.sql
├── 00005_stripe_connect_payments.sql
├── 00006_block_host_self_booking.sql
├── 00007_verification_security_foundation.sql
├── 00008_listing_gate_can_create_listing.sql
├── 00009_booking_session_read_and_cancel_rls.sql
├── 00010_schedule_release_payout.sql
├── 00011_reviews_for_listing.sql
├── 00012_delete_empty_session.sql
├── 00013_reviews_for_host.sql
├── 00014_display_name.sql
├── 00015_listing_ratings_and_delete_listing.sql
├── 00016_planning_areas.sql
├── 00017_terms_accepted_at.sql
├── 00018_listing_duration_and_session_overlap.sql
├── 00019_unpaid_checkouts.sql
├── 00020_group_pricing.sql
├── 00021_user_bio.sql
├── 00022_my_is_founding_host.sql
├── 00023_lock_user_pii.sql
├── 00024_session_edit_and_listing_spots.sql
├── 00025_tighten_table_grants.sql
├── 00026_lock_storage_policies.sql
├── 00027_hide_suspended_hosts.sql
├── 00028_listing_price_ceiling.sql
├── 00029_booking_dispute_hold.sql
├── 00030_booking_money_events.sql
├── 00031_booking_complaints.sql
├── 00032_listing_interests.sql
├── 00033_shared_host_availability.sql
├── 00034_verification_teaching_plan.sql
├── 00035_singpass_verification.sql
├── 00036_singpass_auto_approve_and_listing_review.sql
├── 00037_session_reminders.sql
└── 00038_listing_what_to_bring.sql

supabase/functions/
├── _shared/
│   ├── booking.ts               # Guest charge, group discount, host fee, refunds
│   ├── http.ts                  # JSON/CORS/secret helpers
│   ├── connect.ts               # Express account v2 helpers
│   ├── complaints.ts            # Report a problem window (start to 3 days after end), validation, evidence retention
│   ├── disputes.ts              # Dispute hold codes and partial refund rules for admin-dispute-booking
│   ├── admin-auth.ts            # Admin JWT + users.is_admin, x-admin-secret break-glass with operator name
│   ├── money-events.ts          # booking_money_events rows (hold, release, partial refund, admin cancel)
│   ├── interest.ts              # I'm keen: request parsing, who may ask, host email gap, tallies
│   ├── email.ts                 # Resend helper + booking receipt, cancel, dispute refund, host-strike, I'm keen, and session-reminder HTML
│   ├── reminders.ts             # 2–24h session reminder window, 6h fresh-booking skip, host grouping
│   ├── payouts.ts               # 72h-after-session-end Transfer eligibility, skip reasons, charge backfill
│   ├── verification.ts          # Status, Identity params, 30-day retention rules
│   └── onemap.ts                # Postal validation, OneMap token + search + planning area, lookup rate limit
├── create-payment-intent/       # Pending booking + PaymentIntent; refuses PayNow >80 days out
├── abandon-checkout/            # Guest JWT only; drop unpaid pending; leave if PI succeeded
├── stripe-webhook/              # Platform or Connect webhook secret → confirm, identity, account.updated
├── create-connect-account/      # Express account for the signed-in host
├── create-account-link/         # Onboard, or { refresh: true } to re-read payouts_enabled
├── cancel-booking/              # Guest or host cancel + Stripe refund + strikes + emails
├── admin-cancel-booking/        # Admin JWT (or break-glass) full refund; cancelled_by='host'; reason 'dispute' for wording; logs event; no UI
├── admin-dispute-booking/       # Admin JWT (or break-glass) payout hold, release, partial refund; logs events; no UI
├── admin-verifications/         # JWT + is_admin; signed-URL queue with teaching plan, review + result email
├── create-identity-session/     # Dormant: Stripe Identity is not offered to SG businesses
├── singpass-start/              # JWT; PAR to Singpass, stores the attempt, returns the Singpass URL
├── listing-submitted/           # JWT; emails the team about the caller's listings waiting for review
├── admin-listings/              # admin JWT; listing review queue, approve or ask for a change, emails the host
├── singpass-callback/           # JWT; token + Myinfo exchange, 18+ check, review, then record_singpass_verification
├── notify-verification-pending/ # x-notify-secret; emails Caleb on manual pending
├── purge-verification-docs/     # Daily cron; deletes rejected docs after 30 days and complaint photos after 180
├── lookup-postal-code/          # Valid user JWT; 20 lookups / 10 min; address + planning_area; token cached to near expiry
├── release-payout/              # x-cron-secret Transfer 72h after session end; pg_cron + GH Action
├── send-reminders/              # x-cron-secret guest + host emails 2–24h before start; pg_cron (00037)
└── report-booking-problem/      # Guest JWT; in-app quality complaint, auto payout hold, ops + guest email
```


| Looking for                                                | Where                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Deploy every Edge Function                                 | `scripts/deploy-edge-functions.mjs`. CI deploys on push to `staging` and `main`.                    |
| Browse page and filters                                    | `src/pages/Home.jsx`                                                                                |
| Planning areas and browse regions                          | `src/lib/planningAreas.js`, `00016`                                                                 |
| Neighbourhood aliases                                      | `src/data/areaAliases.js`, `src/lib/areaSearch.js`                                                  |
| Postal-code address lookup                                 | `lookup-postal-code` + `_shared/onemap.ts`; JWT; 20 / 10 min; `returnGeom=Y` then `popapi/getPlanningarea` (2019); secrets `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` |
| Listing detail and booking                                 | `src/pages/ListingDetail.jsx`                                                                       |
| Listing-page reviews                                       | `reviews_for_listing` (`00011`); do not embed `bookings` from the client                            |
| Browse and profile listing-card ratings                    | `listing_ratings` (`00015`); one RPC per page, never per card                                       |
| Host-profile reviews                                       | `reviews_for_host` (`00013`); do not embed `bookings` from the client                               |
| Delete an empty hosted session                             | `delete_empty_session` (`00012`); Hosting Delete / Delete selected, not Cancel                      |
| Bulk-create sessions                                       | `src/lib/sessionBatch.js`; each keep is `add_listing_session` with listing spots                    |
| Change spots per session                                   | `set_listing_spots` (`00024`); Edit listing save                                                   |
| Move an empty session                                      | `edit_open_session` (`00024`); Hosting inline Edit; booked rows have none                          |
| Soft-delete a listing                                      | `delete_listing` (`00015`); owner only; refuses active upcoming bookings                            |
| Public profile                                             | `src/pages/Profile.jsx` (`/u/:id`)                                                                  |
| Own-profile private tabs                                   | same page; Bookings/Hosting mounted as panels; `?tab=` (replace, not push)                           |
| Login and signup                                           | `src/pages/Login.jsx`                                                                               |
| Terms of Service                                           | `src/pages/Terms.jsx` (`/terms`); copy in `Markdowns/Policies/terms.md`                             |
| Privacy Policy                                             | `src/pages/Privacy.jsx` (`/privacy`); copy in `Markdowns/Policies/privacy.md`                       |
| Signup terms timestamp                                     | `users.terms_accepted_at` (`00017`); `handle_new_user` from metadata; not client-writable           |
| Forgot password request                                    | `src/pages/ForgotPassword.jsx` (`/forgot-password`)                                                 |
| Reset password from email                                  | `src/pages/ResetPassword.jsx` (`/reset-password`)                                                   |
| Create listing                                             | `src/pages/CreateListing.jsx`                                                                       |
| Edit listing                                               | `src/pages/EditListing.jsx`                                                                         |
| Host verification upload                                   | `src/pages/VerifyIdentity.jsx`                                                                      |
| Host verification review                                   | `src/pages/AdminVerifications.jsx`                                                                  |
| Verification and retention rules                           | `supabase/functions/_shared/verification.ts`                                                        |
| Rejected-document deletion                                 | `supabase/functions/purge-verification-docs/`                                                       |
| Guest bookings                                                 | `src/pages/Bookings.jsx` (own profile Bookings tab; `/bookings` redirects)                          |
| Host listings, sessions, payouts                               | `src/pages/Hosting.jsx` (own profile Hosting tab; `/hosting` redirects)                             |
| Settings                                                       | `src/pages/Settings.jsx` (`/settings`; gear on own profile; Log out → `/logout`)                    |
| Log out                                                        | `src/pages/Logout.jsx` (`/logout`; hamburger and Settings link here, then Home)                     |
| Legacy dashboard redirect                                      | `src/pages/Dashboard.jsx` (`/dashboard` → `/bookings`, or `/hosting` when `?connect=`)              |
| Legacy bookings/hosting redirect                               | `src/pages/RedirectToOwnProfile.jsx`                                                                |
| Global nav and hamburger                                   | `src/components/SiteNav.jsx`, `src/components/ui/TopNav.jsx`, `src/components/ui/HamburgerMenu.jsx` |
| Content back row (every page except Home)                  | `src/components/BackButton.jsx`, mounted in `App.jsx`; listing Report in the actions slot           |
| Report listing / profile / review                          | `src/components/ui/OverflowMenu.jsx`, `src/lib/reportMailto.js`                                     |
| UI kit (Button `loading` on short actions; Input on Settings and Login; SelectableCard preview only) | `src/components/ui/`, `src/pages/StyleGuide.jsx`                                           |
| Page and long-wait loaders                                 | `src/components/PageLoader.jsx`, `src/components/WaitingState.jsx`, `src/components/LoadingMascot.jsx` |
| Colour tokens and all styling                              | `src/index.css`                                                                                     |
| Component preview                                          | `/style-guide` route                                                                                |
| Cancellation arithmetic                                    | `src/lib/cancellationPolicy.js` and `supabase/functions/_shared/booking.ts`                         |
| Host strike events and 12-month expiry                     | `supabase/migrations/00039_host_strike_events.sql`, `src/lib/hostStrikes.js`                        |
| Guest review eligibility                                   | `src/lib/reviewGate.js` and `guest_can_leave_review` (`00011`)                                      |
| Guest-facing prices                                        | `src/lib/pricing.js`                                                                                |
| Routes                                                     | `src/App.jsx`                                                                                       |
| Payment and booking creation                               | `supabase/functions/create-payment-intent/`                                                         |
| Payment confirmation                                       | `supabase/functions/stripe-webhook/`                                                                |
| Refunds                                                    | `supabase/functions/cancel-booking/`                                                                |
| Host payouts                                               | `supabase/functions/release-payout/`                                                                |
| Session reminders                                          | `supabase/functions/send-reminders/`, `_shared/reminders.ts`, `00037`                               |
| Connect onboarding                                         | `supabase/functions/create-account-link/`                                                           |


**Routes in** `App.jsx`**:** `createBrowserRouter` + `createRoutesFromElements`. Chrome (`ScrollToTop`, `SiteNav`, `BackSlotProvider` / `BackButton`, `Footer`) lives on a layout route with `<Outlet />`. Paths: `/`, `/login`, `/forgot-password`, `/reset-password`, `/listings/:id`, `/u/:id`, `/create-listing`, `/verify-identity`, `/edit-listing/:id`, `/bookings/:bookingId` (guest-only booking receipt; anyone else is sent to `/bookings`), `/bookings`, `/hosting`, `/dashboard`, `/settings` (`/create-listing` through `/settings` behind `RequireAuth`; `/dashboard` redirects to `/bookings`, or `/hosting` when `?connect=` is present; `/bookings` and `/hosting` then redirect to `/u/:id` with `?tab=bookings` or `?tab=hosting` and the rest of the query string kept), `/logout` (public; `signOut`, local fallback on failure, then Home), `/verify-identity/singpass` (Singpass return, behind `RequireAuth`), `/admin/listings`, `/admin/verifications` and `/admin/singpass-keys` (behind `RequireAuth` and `RequireAdmin`), `/refund-policy`, `/cancellation-policy`, `/dispute-policy`, `/terms`, `/privacy`, `/style-guide`, and a catch-all `*` that renders `NotFound`. `useBlocker` on Settings and Edit listing needs this data router.

---



## 9. End to end flows

Use these alongside the code. When you are reading a file and wondering what it is actually for, find the relevant scenario here.

### Scenario 1: Guest books a session

*Sarah, 23, saw a latte art session shared on Instagram.*

**1. Lands on trykai.sg.** The Lane 1 headline (“Singapore's not boring…”) sits above the filters and grid. `Home.jsx` fetches listings where `is_active = true` and `review_status = 'approved'` (`00036`), with open future sessions embedded and ordered `created_at` desc, then sorts them in `sortListingsForBrowse`: soonest Singapore session day first, more upcoming sessions on a tie, listings with none last. It then calls `listing_ratings` once with those ids. Each listing renders through `ui/Card` in browse mode: square photo, category badge overlaid top-left, title clamped to two lines (no reserved empty second line), a meta line of the planning area and next session date, then the all-in card price on the left and, only when that listing has guest reviews, `★ 4.8 (12)` on the right in the body font (`--sans`, text colour, count in `--muted`). No reviews means price only, never an empty star. No sort UI. Grid is 2 columns on phone, 3 from 768px, 4 from 1024px. `full_address` is not fetched. `is_suspended` is not queried: the public listings policy (`00027`) already hides a suspended host's listings, and an unapproved listing (`00036`) is hidden from everyone but its host.

**2. Filters by category, region, and area.** Filtering is client side on the already fetched array. The category row shows `All` plus only the categories that have a listing (a category asked for in a `?category=` link stays so it can be cleared); on phones four and a half tabs fit so a half icon peeks as the swipe cue. Quick filters (This weekend, Under $30) show only when they would keep some listings but not all. Region (All, Central, North, North-East, East, West, mapped from `listings.area` via `planningAreas.js`) and area sit behind one "Anywhere" chip, shown only from 8 listings across 2 or more regions (DECISIONS.md, 20 October). The area combobox accepts a planning area or a neighbourhood alias from `areaAliases.js` and stores the planning area. No additional database call. Browse cards show the planning area name; listing detail does too.

**3. Opens the listing.** `ListingDetail.jsx` fetches the listing, the host profile (including `stripe_payouts_enabled`), guest reviews for this listing via `reviews_for_listing`, and the host's public reviews by `reviewee_id` for the "Hosted by" average. That RPC is what scopes the reviews list to the listing; the host line is the average and count across all their listings, hidden when they have none. Hosted by shows the host's display name (falling back to first name) and links to `/u/:hostId`; the avatar is also a link and is top-aligned with the Hosted by line. If the host has a `bio`, the first two lines appear under the rating; when that preview is truncated, an inline "… more" expands the full bio in place and "Less" collapses it. Sessions are not loaded in one list: two queries find the first and last open future session, then the booking card loads one Singapore calendar month at a time (`starts_at` from local midnight to the next month) and caches it. Each date with sessions shows a small dot; the count stays in the `aria-label` (`N sessions`). Choosing a date lists only that day's times, and Book starts checkout for that one. Cancellation policy shown collapsed above the calendar. `full_address` still not shown. Book is disabled until the host can receive payouts.

The gallery is one swipeable 4/3 photo per screen on phone (CSS scroll-snap, with position dots) and a height-capped mosaic from 1024px, laid out by photo count from `data-photo-count` on the scroller. From 1024px the page is two columns, content left and a sticky booking card right. Content order is the same at every width: category, title, area, host, then description, what's provided, what to bring, and reviews last.

**4. Not logged in.** Redirected to `Login.jsx`, then back to the listing after auth. Signup requires a checkbox ("I'm 18 or older and agree to the Terms and Privacy Policy", both linked). Sign up stays disabled until it is ticked. `auth.signUp` sends `full_name`, `display_name`, and `terms_accepted: true` in metadata. The profile row is created by `handle_new_user`, which stamps `terms_accepted_at`.

**5. Phone verification.** OTP required before booking, per progressive disclosure. **Not built.**

**6. Checkout.** Guest picks 1 to N guests, N = min(spots remaining, 10). The per-person lesson price updates live when group pricing is on. Guest then picks Card or PayNow (5% off that card total) *before* `create-payment-intent`. PayNow is disabled when the session is more than 80 days away. The function recomputes the price from `guests_count` and listing settings and ignores any client total. It creates a pending booking (the insert trigger locks the session row), re-reads `starts_at` from the server, then creates a PaymentIntent locked to that rail. No host email is sent here. `confirm_paid_booking` decrements spots by `guests_count`; if not enough remain, the whole booking is refunded. Cancellation is the whole booking only, same four refund tiers.

**7. Payment.** Payment Element `confirmPayment` uses `return_url=/dashboard?booking=<id>`. `stripe-webhook` verifies `Stripe-Signature`, calls `confirm_paid_booking`, freezes host fee/payout, emails guest and host receipts via `_shared/email.ts` (greet by display name, short booking reference, What's provided and What to bring when the listing has any, all-in price lines with no separate booking-fee row, PayNow saving when that rail was used, "Your bank will show this payment as Stripe Payments Singapore" on PayNow only, Add to Google Calendar, View booking to `/bookings/<id>`, one quiet Cancellation policy link — no refund-tier dates). Guest confirmation subject is `You're in! <listing> on <Fri, 28 Aug>`. Guest confirmation sets reply-to `hello@trykai.sg`. Failed/canceled intents mark the pending row cancelled without touching spots. Oversell refunds immediately, including when confirm finds the session cancelled or otherwise not `open`. `account.updated` syncs `stripe_payouts_enabled` (match on `stripe_account_id`; unknown accounts are a no-op). The webhook accepts `STRIPE_WEBHOOK_SECRET` or `STRIPE_CONNECT_WEBHOOK_SECRET`.

**8. Confirmation.** `/dashboard?booking=` redirects to `/bookings?booking=`, then to `/u/:id?booking=&tab=bookings`. `Bookings.jsx` polls until status is `confirmed`. Then `listing_address` returns `full_address` to that guest. The confirmation email's View booking button goes to `/bookings/<id>`. The per-person receipt line is that booking's all-in card total divided by guests, with a group-discount note when that rate changed the card total, then any PayNow saving, then Total paid.

**9. Session happens.** The day before, `send-reminders` (`00037`, hourly at minute 17 UTC) emails each confirmed guest whose booking is older than 6 hours, and one email to the host listing first names and group sizes, for open sessions starting in 2–24 hours. Each row is claimed (`guest_reminder_sent_at` / `host_reminder_sent_at`) before the send. Payout releases 72 hours after the session ends (`starts_at` + `duration_mins`), via `release-payout` (pg_cron `00010` and the GitHub Action). Sessions are not auto-completed. Review prompts appear on the Bookings tab for `confirmed` bookings after the session ends.

**10. Review.** The Bookings tab allows a review if the session has ended, status is `confirmed`, and this reviewer has not already reviewed. Session end is `starts_at` + `duration_mins` (or `starts_at` + 2 hours if duration is missing). Inserts into `reviews` as `role: 'guest'`. RLS (`00011`) requires the same confirmed-and-ended rule and that `reviewee_id` is the listing host. Unique on `(booking_id, role)`.

### Scenario 2: Host creates a listing

*Martin, 27, wants to offer cocktail mixology.*

1. **Signs up.** Same as any guest. `is_host = false` initially. Profile row comes from `handle_new_user`.
2. **Clicks Host a session / Become a host.** The hamburger (and a non-host's Bookings empty state) use `my_verification()`: `approved` is **Host a session** → `/create-listing`; `pending` is **Become a host** → `/verify-identity` (Under review); `unverified` or `rejected` is **Become a host** → the verification flow. `CreateListing.jsx` also gates on `my_verification()`. Founding-host price panel uses `my_is_founding_host()` (`00022`), not a `users` SELECT. Anyone not `approved` is sent to `/verify-identity`. An approved host visiting `/verify-identity` is redirected to `/create-listing`.
3. **Verifies identity, with Singpass or by upload.** **Singpass** (only where `VITE_SINGPASS_ENABLED=true`): the page calls `singpass-start` (no body), which checks the caller can submit, stores state, nonce, PKCE verifier and a fresh DPoP key in `singpass_auth_sessions` (`00035`, service role only), makes the pushed authorization request (scope `openid name dob mobileno`, a Myinfo app) and returns the Singpass URL. Singpass returns the host to `/verify-identity/singpass`, which posts the query string once to `singpass-callback`: it finds the attempt by state for that user (30 minutes), exchanges the code with DPoP and a private_key_jwt assertion, verifies the ID token, fetches Myinfo userinfo with the same DPoP key (`ath` bound), checks its `sub` matches, refuses anyone under 18 (`isAdult`, partial dates read as the latest possible day), stores the details on the attempt and returns them. The page shows name and date of birth locked and the mobile number editable and required (Myinfo's mobile is self-declared; `normalizeHostMobile`). **Confirm and continue** calls `singpass-callback` with `action: 'confirm'` and the mobile, which runs `record_singpass_verification` (service role only, re-checks 18+ on full dates and that the Singpass is not linked elsewhere) to store `singpass_sub` (unique), `verified_name`, `verified_dob`, `verified_mobile` and, since `00036`, set `approved` with method `singpass` and a `verification_reviews` row with no reviewer, then deletes the attempt. The page says "You're verified" and links to `/create-listing`. **Cancel** deletes it. The OIDC client is `_shared/singpass-oidc.ts` (openid-client, as in Singpass's demo app); rules and copy are `_shared/singpass.ts`. Five Edge Function secrets: `SINGPASS_CLIENT_ID`, `SINGPASS_ISSUER`, `SINGPASS_REDIRECT_URI`, `SINGPASS_SIGNING_KEY`, `SINGPASS_ENCRYPTION_KEY`; without them both functions answer 503 and the page offers upload. Keys are made in the browser at `/admin/singpass-keys`. **Upload** (always available; the only route before 23 October). Stripe Identity is not available to Singapore-based businesses, so live sessions were refused on production; `create-identity-session` and the identity events in `stripe-webhook` stay in the tree but nothing calls them. With Singpass on, upload sits behind a small "No Singpass? Upload your ID instead" link. It asks for a passport or NRIC photo (the hint says the NRIC number may be covered) and a selfie, plus a consent box that states retention. Files go to the private `verification-docs` bucket, scoped to a folder named after the user id (`00026`: owner SELECT/INSERT/UPDATE so resubmit upsert can overwrite; no client list or read of anyone else's files). `submit_verification(p_id_photo_url, p_selfie_url, p_consent, p_teaching_plan default null)` (`00034`) records the paths, `verification_consent_at` and `pending`. The page no longer sends a teaching plan (removed 23 October; the listing says what they teach); older answers stay in `teaching_plan`. A database webhook on `users` fires `notify-verification-pending`, which emails `ADMIN_NOTIFY_EMAIL` (default `calebong2002@gmail.com`) with the teaching plan and a link to `/admin/verifications`. That function requires `NOTIFY_FUNCTION_SECRET` as `x-notify-secret` or Bearer; the webhook is set up per project in the dashboard (OPERATIONS.md).
4. **The outcome is recorded.** Singpass hosts are already approved. Upload hosts are reviewed at `/admin/verifications`: both documents side by side (and a teaching plan, if they gave one before 23 October), approve, or reject with a reason. `review_verification` (`00007`, service role only) writes the decision, the reason, and a `verification_reviews` audit row in one transaction, so a decision cannot be applied without a record. `admin-verifications` emails the host. A rejected host also sees the reason on `/verify-identity` when they try again.
5. **Creates the listing.** Title, description, category, price in cents, spots per session (`max_guests`), duration in minutes, postal code (looked up at 6 digits; confirmed address card; optional unit), then Area guests see (filled from OneMap's planning area when it maps to a host-picker name; searchable dropdown; neighbourhood aliases resolve to the planning area; uninhabited areas hidden; the host can change it), up to 5 photos, what's provided. Inserts into `listings` (always `pending` review, `00036`), sets `is_host = true`, calls `listing-submitted` without waiting (it emails `ADMIN_NOTIFY_EMAIL` about each of the caller's pending listings not yet notified since entering the queue, claiming `review_notified_at` first so a repeat sends nothing), navigates to `/hosting`. The team approves or asks for a change at `/admin/listings` (`admin-listings`, admin JWT); the host is emailed either way. **Does not create the first session in the same form.** Host terms checkbox is required.
6. **Adds sessions** from the Hosting tab “Add session”. Calendar dates from tomorrow through today + 80 days, optional quick-fill (weekdays every 1 / 2 weeks), one or more start times. Spots come from the listing (`N spots per session · change in listing settings`). Each date × time is one session; max 40. Preview skips past, host-wide clashes, and in-batch clashes. Each keep is `add_listing_session`. The same start time as an existing open or full session of that length still merges spots if the RPC is reached; the preview treats that overlap as a skip. Any other overlap is refused by the listing-scoped trigger, including a session that starts during another one. A session that starts when another ends is allowed. Booked sessions show first under Upcoming; empty ones on the listing card are one compact line (checkbox · date and time · Edit · Delete), next 3 then “Show all N open sessions”. Empty rows can be edited (`edit_open_session`, date and time only) or deleted one-by-one or tick-selected (`delete_empty_session`, no strike). A session with pending or confirmed bookings has Cancel and no Edit.
7. **Payout setup.** Hosting “Set up payouts” → `create-account-link` → Stripe Express onboarding. Account Link `return_url`/`refresh_url` still use `/dashboard?connect=`, which redirects to `/hosting?connect=`, then `/u/:id?connect=&tab=hosting`. That return re-reads the account from Stripe (`{ refresh: true }`) before showing enabled, “Stripe is checking…”, or “isn't finished yet.” Book stays disabled for guests until `stripe_payouts_enabled`.
8. **Receives bookings.** Email from `stripe-webhook` after confirmation, with guest name, session details, guest count.
9. **Edits and deletes.** `EditListing.jsx` checks `host_id = current user`. Save calls `set_listing_spots` first (the only UPDATE of `max_guests`); if that fails, nothing is PATCHed. The listing PATCH does not include `max_guests`. Success reports how many future sessions were updated, plus any that kept more spots because of bookings. The Hosting listing row opens Edit when tapped. Delete is in the ⋯ menu and at the bottom of Edit listing (`ListingDeleteDialog`): owner only, refuses if any upcoming session has a pending or confirmed booking, otherwise `is_active = false` and empty upcoming sessions become `cancelled`. Session and booking counts come from the same Hosting sessions query; an Edit listing sessions-query failure hides Confirm. RPC errors map to a cancel-those-sessions line or a retry line. A successful delete from Edit listing goes to Hosting without the unsaved-changes dialog.



### Scenario 3: Host cancels

Warning shown: "Cancelling refunds your guest / both guests / all N guests in full and adds a strike to your account" (1 / 2 / 3+). It does not list per-guest payment or refund amounts. Hosts never see an individual guest's payment or refund, only what the host will receive.

On confirmation the Hosting tab calls `cancel-booking` with `session_id`. The function issues Stripe refunds for confirmed bookings (or cancels unpaid PaymentIntents), restores spots only for confirmed rows, sets `cancelled_by = 'host'`, and calls `apply_host_strike`. Each confirmed guest is emailed a full refund plus timing, then a button to the host's other upcoming sessions of that listing or to `/?category=` when there are none. The host is emailed that they cancelled, that guests were refunded in full (no amounts), the new strike count, and a link to `/cancellation-policy#appeals`. `admin-cancel-booking` emails the guest the same host-cancel copy (or, with `reason: 'dispute'`, a refund receipt that does not mention the host) and does not apply a strike or email the host.

Host upcoming list is every future session on the host's listings that is not `cancelled`, including rows with zero bookings.

An empty upcoming session (no pending or confirmed bookings) is Delete, not Cancel: confirm, then `delete_empty_session`. That is a soft-delete (`status = 'cancelled'`), no refunds, no strike. The listing page already only selects `status = 'open'`, so the row disappears there too.

### Scenario 4: Guest cancels

`cancellationPolicy.js` quotes the refund; `cancel-booking` recomputes it and creates the Stripe refund. Pending unpaid cancel voids the PaymentIntent and does not restore spots (none were taken). The guest is then emailed subject `Booking cancelled: <listing> · $X refund` (no amount when $0), body opening "Sorry you can't make it", the session date and time, the refund (including $0) to their PayNow or card, and only the timing line for that rail. Primary button is "Find another time with \<host\>" to the listing; secondary is Browse other experiences. The host is emailed only on a guest cancel, with the same reference and what they will now receive under the refund tier (`You'll receive $Z` or `You won't receive a payout for this booking`) — never the guest's refund amount or method. A Resend failure is logged and cannot fail the refund that already happened.

On confirmation: `status = 'cancelled'`, `cancelled_by = 'guest'`, `refund_amount` and `stripe_refund_id` stored.

### Scenario 5: Verification rejected

Caleb rejects at `/admin/verifications` with a reason, or Stripe Identity fails with a `last_error`. `review_verification` writes `rejected`. The function that made the decision (`admin-verifications` or `stripe-webhook`) emails the host the reason and a resubmit link. The form on `/verify-identity` becomes available again. After 30 days, `purge-verification-docs` deletes whatever is still stored under that rejection and clears the URL columns. Stripe Identity rejections have no stored images, so the job skips them. Approved hosts' documents are kept while the account is active.

---



## 10. Pages (what they actually do)

**Home.jsx** — Lane 1 headline, then browse of active listings. Category row of All plus categories that have a listing, honoured from `?category=` so a "Find something similar" email can land filtered. Quick filters and the "Anywhere" region and area panel appear only when they would narrow the grid (see Scenario 1, step 2). Approved listings only. Hero trust chips are ID-verified hosts, exact address after booking, and "Most sessions S$15–30"; the desktop hero is short enough that the first listing cards sit above the fold at 1280×800. From 1024px a `.home-stage` grid holds the copy and the category tab row; the mascot spans both rows and centres between the nav and the category divider (`align-self: center`, max 260px, then 320px from 1280px). Category badges are pokeable wrappers (`HeroBadge`) with a thin white rim; a poke plays a Web Animations wobble on the wrapper. One `listing_ratings` call for the page; cards show the planning area and next session date, then put price on the left of the meta line and `★ average (count)` on the right only when that listing has guest reviews (body font, count muted). No auth required. No sort by price or reviews. A first-load JWT "issued at future" error is retried once after 1 second; any remaining load failure shows "Something went wrong loading this page. Please refresh.", never the raw error.

**Login.jsx** — kit `Input` for full name, display name ("What should we call you?"), email, and password. Full name, display name, email, and password use floating labels. Display name is required, max 40 characters, with hint "Shown on your profile and reviews." Password uses one eye toggle; the browser's native reveal is hidden. Login and signup. Does not insert into `users`. Login mode links to `/forgot-password`. Signup requires a checkbox ("I'm 18 or older and agree to the Terms and Privacy Policy", both linked); Sign up stays disabled until it is ticked. Sends `terms_accepted: true` in signup metadata.

**ForgotPassword.jsx** — public. Requests `resetPasswordForEmail` with `redirectTo` `/reset-password`. Always confirms; only rate limits and network failures surface as errors.

**ResetPassword.jsx** — public. Shows the new-password form only for a genuine recovery (`type=recovery` in the landing URL or `PASSWORD_RECOVERY`). Expired or missing recovery shows a link back to `/forgot-password`. `updateUser({ password })` then goes to `/bookings` (which redirects to the own-profile Bookings tab).

**ListingDetail.jsx** — listing, gallery (swipe on phone, mosaic from 1024px), host display name/`ViewableAvatar` high under the area (name links to `/u/:hostId`; a photo avatar opens the larger viewer, initials do not; avatar top-aligned with Hosted by; initials are the first letter of `display_name`, or "?"), host rating as `★ average · N reviews` (`HostRating`, star in `--star`) across all their listings (hidden when none), `VerifiedBadge` when the host is ID verified, the first two lines of the host's `bio` with an inline "… more" that expands the full bio in place and "Less" to collapse (hidden when there is no bio), open future sessions, "Pick a date, then a time" only when there are upcoming sessions otherwise "No upcoming sessions yet.", a muted guest cancellation line under the Book area (four refund tiers plus "If the host cancels, you get a full refund"; no host-strike rows), guest reviews for this listing via `reviews_for_listing` (not a bookings embed; reviewer display names from the RPC; each review card has a ⋮ menu with Report review, hidden on your own review), a ⋮ in the back-row actions slot with Report listing (hidden on your own listing; no ⋮ when the menu would be empty), guest stepper (1 to min(spots remaining, 10)) with live per-person group price, Card vs PayNow checkout, booking-terms line above the pay buttons. "Where you'll be" is one row: `<Area>, Singapore` and "Exact address sent once your booking is confirmed." (one pin); a confirmed guest sees the street and a maps link instead. The page footer does not repeat the 48-hour refund line. Duration is shown as hours and minutes (`6 hr 30 min`), never a raw minute count. Session dates show the year only when it is not the current year. Two columns with a sticky booking card from 1024px. `full_address` only via RPC after a confirmed booking. First data loads retry a JWT "issued at future" error once, then show the friendly refresh message.

**Profile.jsx** — `/u/:id` is public. Shared `Avatar` (photo or first letter of `display_name`, or "?"). On your own profile, tapping the avatar opens an OverflowMenu aligned to the start: View photo (if there is one), Change photo (same pick → compress → 1:1 circular crop → upload as Settings), Remove photo (confirm, then `avatar_url` null). The header updates without a reload. On anyone else's profile a photo avatar opens the larger viewer; initials do not. Display name (`display_name` only; Anonymous if empty), `VerifiedBadge` if `is_id_verified`, host rating as `★ average · N reviews` (`HostRating`, star in `--star`) across all listings (hidden when none), then an About section when `bio` is set (typed line breaks kept, long words wrap). Other people's profiles omit About when there is no bio and put a ⋮ on the display-name row with Report profile. Your own empty profile shows "Add a short bio" to `/settings`. Other people's profiles show stacked active listings (browse `Card`s, with `listing_ratings` once for those ids) and reviews received as a host via `reviews_for_host`. Does not show reviews they wrote as a guest. Your own profile adds a gear to `/settings`, a "See your public profile" link (`/u/:id?tab=<current>&view=public`), and a horizontally scrolling tab bar (overflow-x, no visible scrollbar): Bookings (default), Hosting (hosts only), Reviews. The active tab is `?tab=`; unknown tabs including `listings` fall back to Bookings. Switching tabs replaces the current history entry so Back leaves the profile; tabs stay deep-linkable. Bookings and Hosting are the existing page components mounted as panels (`embedded` hides their Dashboard heading). `?view=public` on your own profile renders the guest layout (listings, reviews, avatar viewer, no gear or tabs) plus a bar "This is how guests see your profile" with Back to your profile (same `?tab=` they left); Report profile stays hidden. A non-host's Bookings empty state has the same host CTA as the hamburger.

**CreateListing.jsx** — auth required. Verification gate. Five-step wizard. Missing required fields show a warm inline hint under the field (`.field-hint`, coral-ink), never a red error box. Photos are optional: Continue with none opens a skip dialog; Skip for now advances. The photos step reorders with `@dnd-kit` (mouse, 200ms touch hold, keyboard Space then arrows). First photo is the cover; dragging a photo to first place makes it the cover. Tiles show only the photo, a top-left Cover badge, and ×. Tap or Enter opens Crop, Make cover (later photos), Undo crop (any cropped photo that still has its original, cover included), and Remove. Every photo crops to `--listing-cover-aspect` / `LISTING_COVER_ASPECT` (4:3). Every crop starts from the original and can be reset in this session; already-saved photos have no original, so they can be cropped but not undone. The tile menu closes on a pointerdown that is not inside the open menu or its own tile button, on Escape, and when a drag starts. The page that owns `photos` revokes preview and original blob URLs on unmount and after a successful save — not the editor, which unmounts between wizard steps. Hint: "Drag to reorder. The first photo is your cover." Every chosen image is compressed on the main thread (1600px long edge, JPEG 0.82) before upload — same helper as Settings avatars and VerifyIdentity uploads. HEIC/HEIF is converted to JPEG first (`heic2any`, loaded only when a HEIC file is picked) so Chrome, Android and Firefox can read iPhone photos; a failed conversion is never uploaded. Any other compress failure still uploads the original. The picker accepts HEIC (`IMAGE_ACCEPT`). What's provided is the four presets plus up to five custom items (40 characters) as compact chips, all stored on `listings.whats_provided` (`text[]`). Ticking None clears and disables the other options and the custom field. What guests should bring sits next to it (`listings.what_to_bring`): up to five chips of 40 characters, suggestion chips (Comfortable clothes, Water bottle, Notebook and pen), and "Nothing, we provide everything" which clears the list. A missing `what_to_bring` column retries the save without it, same as `duration_mins` / `group_pricing`. "Where it happens" is postal code first (`PostalAddressFields`). At 6 digits it calls `lookup-postal-code` (no Find addresses button; a status line with the existing spinner and "Looking up your address…"; Try again on failure). Unit number appears only after an address is picked in this session. The composed address is a confirmed card ("Hidden from guests until they book."), not a read-only input. Area guests see is filled from the lookup's `planning_area` when `acceptedPlanningAreaFromLookup` accepts it; the host can change it. `PlanningAreaSelect` is full width and accepts neighbourhood aliases, hiding uninhabited areas. Group-pricing toggle (default on). Required "I agree to the Host terms" checkbox; Host terms opens `HostTermsDialog` on the same page (`HostTermsContent`, the same Part 2 as `/terms#part-2-hosting`) so the wizard stays mounted. Opening the dialog does not tick the box. Continue, Back, Close, and the postal lookup write the same localStorage draft as Save draft, except while the Restore draft prompt is unanswered and except a blank wizard (no answers — that clears a draft this session wrote). Restore draft puts the host back on the saved step. Discard and clearing on publish stay. Photos are still omitted. The price panel (`ListingPricePanel`, shared with Edit listing) is two large figures ("Guests pay $X per person", "You get $Y per person"), then "Full session of N: $X" (N × lesson, no discount, before host fee — never a range), then a muted footnote (`10% host fee from your 4th booking.` or `Founding host: no host fee, ever.`). An ⓘ popover lists the group tiers, what one group of N pays together, and the after-fee amount for non-founding hosts. Under "Offer group discounts", a live muted line shows what a group of N pays the host versus the undiscounted full session. If `my_is_founding_host()` errors, "You get" and the footnote hide; the full-session line still shows. Listing insert then `is_host = true`, then `/hosting`. CancellationPolicyInfo on the last step is collapsed by default (heading, one-sentence summary, See full policy). First session is a separate Hosting-tab action.

**EditListing.jsx** — auth required, ownership checked, pre fills including `full_address` from `listing_address()`, planning area, existing photos, and the group-pricing toggle. Same validation hints, photo editor (including the 0-photo skip dialog on save), price panel, postal-first address fields, custom what's-provided items, and what-to-bring chips as create. The saved address shows in the confirmed card with Change address; it stays until a new postal lookup is picked. Unit number is hidden until that new pick. The listings SELECT does not include `full_address`. Leaving with unsaved field or photo changes (add, remove, reorder, crop) asks "Discard your changes?"; a successful save or an in-flight save does not block. Delete listing at the bottom uses the shared `ListingDeleteDialog` (same blocked/confirm copy as Hosting). If the sessions query fails, the dialog says it couldn't check bookings and hides Confirm. `delete_listing` errors map to a cancel-those-sessions line or a retry line (`listingDeleteErrorMessage`); the raw error is logged. A successful delete goes to Hosting without that dialog.

**VerifyIdentity.jsx** — Singpass's official black **Verify with Singpass** button (`SingpassButton`, `singpass-start`) as the main action where enabled, with upload behind a small "No Singpass? Upload your ID instead"; without Singpass, upload only: ID photo, selfie (same `compressImage` / HEIC→JPEG path as listing photos), consent, then `submit_verification`. Pending users see an under review message. A rejection reason is shown on resubmit.

**Dashboard.jsx** — legacy path. Redirects `/dashboard` to `/bookings`, keeping the query string, except `?connect=` which goes to `/hosting`. Stripe Payment Element `return_url` and Connect Account Links still use `/dashboard`. Booking emails link to `/bookings/<id>`.

**RedirectToOwnProfile.jsx** — auth required. `/bookings` → `/u/:id?tab=bookings`; `/hosting` → `/u/:id?tab=hosting`. Copies every existing query key (so `?booking=` polling and `?connect=` from Stripe still work).

**Bookings.jsx** — guest: upcoming and past bookings with guest count on each card; the title links to `/bookings/:id`. Dates show the year only when it is not the current year. Cancel with calculated refund shown (whole booking only), leave review after the session ends on confirmed only. Polls `?booking=` after Payment Element return, then drops only that key so `tab` stays. Mounted on the own-profile Bookings tab; `/bookings` itself is a redirect. A non-host empty state includes the host CTA (`hostCta` from the profile).

**BookingDetail.jsx** — `/bookings/:bookingId`, guest only (anyone else, including the host, is sent to `/bookings`). Listing photo and title to the listing, host `Avatar` (`display_name` / `avatar_url`) and display name to `/u/:id`, date (year only when it is not this year), time, duration, Add to Google Calendar, `listing_address` plus Open in Google Maps, What's provided, What to bring when the listing has items, guests, total paid, payment method, booking reference, status, and the same cancel + refund preview as the list.

**Hosting.jsx** — host. Own `is_host` and `stripe_payouts_enabled` come from `my_account()`. Upcoming at the top is every session with a confirmed booking, across listings, chronological (listing name, date, time, guests booked; empty copy “No upcoming bookings yet.”). Then My Listings with “+ New listing”; one full-width card per row. Each card is a thumbnail plus title on one line (opens Edit), a ⋯ menu in the top-right corner (View listing, Edit, Delete), a full-width Add session button, then that listing’s empty upcoming sessions (next 3, then “Show all N open sessions” / “Show fewer”). The category/area line omits a dangling “·” when area is empty. Booked sessions are not repeated there. Add session is a calendar + times form with preview. Delete confirms through `delete_listing` (blocked copy when upcoming bookings exist). RPC errors map to a cancel-those-sessions line or a retry line (`listingDeleteErrorMessage`); the raw error is logged. Empty sessions: Delete or tick-select + Delete selected (`delete_empty_session`). Booked sessions: Cancel from Upcoming with "refunds your guest / both guests / all N guests in full" plus a strike, never per-guest amounts. Session dates show the year only when it is not this year; Connect payout setup. Admins with `pending_count > 0` see a one-line “N verifications waiting · Review” banner. A listing in review shows an **In review** badge and "we'll email you when it's live"; one sent back shows **Changes needed**, the reviewer's note and an Edit listing link. The host's own listing page shows "Only you can see this for now" until it is approved. Reads `?connect=` (return/refresh re-read payouts from Stripe, then drop only that key). A signed-in user who is not a host is redirected to `/bookings` if this page is mounted directly. Mounted on the own-profile Hosting tab; `/hosting` itself is a redirect.

**Settings.jsx** — auth required. Loads the signed-in row through `my_account()` (`00023`). Grouped as Profile (shared `Avatar`, Change photo / Remove photo, display name, About you textarea with a live 0/500 count, full name with hint "Private, never shown publicly.") and Account (email read-only, deletion contact line). The photo is saved immediately through `ProfilePhotoFlow` (compress at pick so HEIC is readable, 1:1 circular crop, then upload); form Save writes names and bio only. Leaving with unsaved display name, About, or full name asks "Discard your changes?"; the photo is not part of dirty because it already saved. A successful photo save/remove or profile Save dispatches `trykai:account-updated` so `SiteNav` re-reads `my_account()` and the top-nav face updates without a reload. Status next to the photo actions is "Photo updated" or "Photo removed". Removing sets `users.avatar_url` to null and does not delete the old object in `listing-photos`. Log out on Settings and in the signed-in hamburger is a link to `/logout` (so a dirty form can ask first); that page `signOut`s, clears the local session if that fails, and replaces the URL with Home. UPDATE of `full_name`, `display_name`, `bio`, and `avatar_url` has no trailing `.select()`. After Save, a `role="status"` next to the button says "Saved" and fades after 4 seconds. A save error is `role="alert"` beside the button and stays until the host edits a field or saves again. Page-load errors stay at the top. Linked from the gear on your own profile and from the hamburger.

**StyleGuide.jsx** — private preview of the UI kit at `/style-guide`. Imports `src/assets/categories/{food,fitness,arts,music}.png`, all four of which are now in the repo. Language/Other imports are still commented out; uncommenting either without adding the PNG fails `vite build`, because App always imports this page. It no longer mounts its own TopNav: the live `SiteNav` bar serves the page, and the preview-only "Simulate logged in" toggle is gone.

**Terms.jsx** / **Privacy.jsx** — public policy pages at `/terms` and `/privacy`, same `policy-page` layout as refund, cancellation, and dispute. Terms last updated 25 October 2026. Source copies in `Markdowns/Policies/`. Footer links them as Terms and Privacy, and shows UEN 53526159D and `privacy@trykai.sg`.

---



## 11. Known gaps

Ordered roughly by consequence. Sequencing is in BUILD_BACKLOG.md.

**Launch blocking**

- ~~All Edge Function emails still send from Resend's shared test domain.~~ **Resolved 14 September:** from-address is `TryKai <no-reply@trykai.sg>`. `notify-verification-pending` is secret-gated (`NOTIFY_FUNCTION_SECRET`). Result emails come from `admin-verifications` and `stripe-webhook`; `notify-verification-result` is gone. Booking confirmations are receipts from `stripe-webhook`. Cancellation emails (reference, refund amount including $0, PayNow/card timing) come from `cancel-booking` and `admin-cancel-booking`; a host session cancel also emails the host a strike notice. A missing `RESEND_API_KEY` is logged rather than silent.
- Staging must apply `00005` and run this money path in Stripe **test mode** before production. Platform Stripe payouts must be switched to manual. Mark the eleven founding hosts `is_founding_host = true` in Table Editor. One real test booking on production before warm-contact launch.
- `is_suspended` is never queried in `src/`. Listing and session INSERT are blocked by `can_create_listing()` (`00008`). Browse and Book still ignore the flag. SAFETY_RESPONSE_PROTOCOL.md still requires a hand check that listings are `is_active = false`.
- ~~`listings.full_address` is still SELECT-granted. Public pages do not select it, but a crafted query against an active listing can still read it.~~ **Resolved 18 October 2026:** `00025` grants SELECT on every listings column except `full_address`. `listing_address(listing_id)` is the only client path.
- `StyleGuide.jsx` ~~imports category PNGs that are not in the repo; Navbar requests~~ `/trykai.png`~~, which is not in~~ `public/`~~.~~ **Resolved 9 September:** `food`, `fitness`, `arts`, and `music` PNGs are in `src/assets/categories/`, and `public/trykai.png` exists.

**Serious**

- Host no-show reporting, reschedule, session auto-complete, host→guest reviews: not built. Guest→host insert and uniqueness are in `00011` (P2.3 done).
- UI kit only partly wired: the nav, the browse `Card`, Settings (`Button`, `Input`), Hosting listing rows (`Button`, `OverflowMenu`), and Login (`Input`) are live, but SelectableCard is still `/style-guide` only.
- ~~A host who exits Stripe Connect onboarding without completing it still sees a "Payout setup submitted" success message on the dashboard, because `?connect=return` is treated as success without re-checking `stripe_payouts_enabled`.~~ **Bug 4 fixed 13 October 2026.** Return and refresh re-read `payouts_enabled` from Stripe via `create-account-link` `{ refresh: true }` before showing a message. `account.updated` still syncs the same column.
- ~~Public pages show `display_name`. They still SELECT `full_name` as a fallback when `display_name` is empty. The `full_name` column is still granted SELECT to anon (`00005`).~~ **Resolved 17 October 2026:** `00023` revokes SELECT on `full_name` and the other PII columns. Public pages use `display_name` only. Own PII is `my_account()`.

**Not built, decided**

- Phone OTP before booking
- ~~T&C checkboxes at create listing and checkout (signup is live)~~ Signup, create listing (Host terms), and checkout (Booking terms + Cancellation Policy) are live
- ~~Guest count picker (`guests_count` hardcoded to 1)~~ Live. Partial cancel ("remove a guest") is the first post-launch money item; see BUILD_BACKLOG
- Catch-all 404
- ~~Photography guidance on create listing~~ Live on create and edit (`PhotoTips`).
- Sort by newest / price / most reviewed (DECISIONS.md currently overclaims this as live)
- Host strike appeals, admin dispute log
- Admin UI for `admin-cancel-booking` and `admin-dispute-booking`
- Payout clawback where a dispute is confirmed after release. `admin-dispute-booking` refuses a partial refund larger than TryKai's share once the host is paid; recovering from the host is manual (OPERATIONS.md, Guest dispute refund)
- Host email when a dispute lowers their payout (ops tells them by hand today)

---



## 12. Things to avoid

- Never expose `full_address` in a public query
- Never store prices as floats
- Never allow a review without a confirmed booking after the session ends (UI and RLS both require this)
- Never assume a flat platform fee
- Never confirm a booking from the browser. The webhook is the source of truth.
- Do not over engineer the MVP. Keep it simple and shippable.
- Do not add features that are not in DECISIONS.md without asking
- Do not hardcode a colour in a component; use the tokens at `:root` in `index.css`
- Do not mount a nav on a page. `SiteNav` in `App.jsx` is the only one.

