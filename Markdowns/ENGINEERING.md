# TryKai: Engineering

The working document for anyone touching the codebase, human or AI. Covers stack, schema, business rules, file map, and end to end user flows.

**Always read this and DECISIONS.md before making changes.** Visual identity is in DESIGN.md. The remaining build queue is in BUILD_BACKLOG.md.

> **Read before you start, updated 9 September 2026.**
>
> 1. **Stripe Connect is implemented in this tree: separate charges and transfers, Express accounts, decided 16 August 2026.** Guests pay the platform; host share is Transferred 24 hours after `starts_at`. Remaining payment work is ops, not a second product decision. Platform Stripe payouts must stay **manual** so auto-payout to Aspire does not drain funds needed for those Transfers. See DECISIONS.md.
> 2. **The four tier cancellation logic is built.** Refunds are issued by the `cancel-booking` Edge Function, not the browser. The function does not send cancellation emails.
> 3. **Schema lives in** `supabase/migrations/` **(**`00001` **through** `00005`**).** There is no `supabase/schema.sql`. Apply new migrations on staging before production.
> 4. **A CI test suite and branch protection gate every merge.** Do not expect to merge with red checks. Match the existing plain CSS approach in `index.css`; the project does not use Tailwind.
> 5. `Navbar.jsx` **is deleted.** `SiteNav` **is mounted once in** `App.jsx` **and renders** `TopNav` **for every route. No page mounts its own nav.** **Home has no hero and renders the kit's** `Card` **in browse mode.** `ListingCard.jsx` still exists but no page renders it. Button, Input, and SelectableCard are still used only by `/style-guide`.
> 6. **All colours come from the tokens at** `:root` **in** `index.css`**.** Never hardcode a hex value in a component. See section 2, Styling.

---



## 1. What the platform does

Two user types, one account. A user is a guest by default and becomes a host when they create their first listing. The `is_host` flag on the users table handles the distinction. The dashboard shows both views.

- **Hosts** list a skill or experience to teach
- **Guests** browse and book sessions

---



## 2. Stack


| Layer                      | Choice                                                               | Why                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend                   | React 19 + Vite 8                                                    | Familiar, fast, well supported by Cursor                                                                                                                                                                                                                                                                                                     |
| Routing                    | React Router v7                                                      |                                                                                                                                                                                                                                                                                                                                              |
| Backend, DB, Auth, Storage | Supabase                                                             | Handles backend, auth, storage, and RLS out of the box                                                                                                                                                                                                                                                                                       |
| Hosting                    | Vercel                                                               | Free tier, auto deploy on push                                                                                                                                                                                                                                                                                                               |
| Payments                   | **Stripe Connect**, separate charges and transfers, Express accounts | Decided 16 August. Supports PayNow in Singapore at 1.3%, platform is merchant of record, Transfers held until 24h after the session. In code: Payment Element + webhook confirmation, Connect onboarding, refunds, hourly Transfer job. Connect account creation uses Stripe Accounts **v2** (`2026-08-26.preview`) in `_shared/connect.ts`. |
| Transactional email        | Resend                                                               | **Still on the shared test domain.** From-address in code is `TryKai <onboarding@resend.dev>`. Delivers only to Caleb until trykai.sg is verified.                                                                                                                                                                                           |
| Business email             | Zoho Mail Lite                                                       | caleb@, aakash@, [ruiheng@trykai.sg](mailto:ruiheng@trykai.sg)                                                                                                                                                                                                                                                                               |
| AI coding                  | Cursor                                                               | Implementation. Claude handles architecture.                                                                                                                                                                                                                                                                                                 |


**CI** (`.github/workflows/ci.yml`): lint, Vitest with coverage, `vite build`, Playwright (desktop + phone Chromium), Deno type-check of `_shared/{booking,http,connect,email,payouts}.ts`. Handler type-check is advisory (`continue-on-error`). Coverage floors: lines 92%, functions 90%, branches 87%; money files 100%.

### Styling

Plain CSS in `src/index.css`. No Tailwind, no CSS modules, no styling dependencies.

**All colours come from the tokens at** `:root` **in** `index.css`**.** Never hardcode a
hex value in a component. The full set and the usage rules are in DECISIONS.md
(9 September entry) and DESIGN.md section 7.

**Mobile first.** Base styles are written for phone with no media query, then
scaled up with `min-width` queries only. Never `max-width`.

Fonts are referenced through `--display` (Bricolage Grotesque), `--sans`
(Manrope), and `--mono` (Space Mono) so the typefaces can be changed in one
place. `--heading` and `--logo` alias `--display`.

---



## 3. Database schema



### users

```sql
id uuid PK                       -- references auth.users(id); created by handle_new_user on auth.users insert
full_name text
email text unique
phone text
phone_verified boolean default false
avatar_url text
is_host boolean default false
stripe_account_id text           -- Stripe Connect Express account id. Not granted to anon/authenticated SELECT.
stripe_payouts_enabled boolean default false  -- synced from Stripe account.updated; gates Book
is_founding_host boolean default false        -- Table Editor for the eleven; never a host fee. Not client-writable.
id_photo_url text                -- path in private verification-docs bucket
selfie_url text                  -- path in private verification-docs bucket
verification_status text default 'unverified'  -- unverified | pending | approved | rejected
host_strikes integer default 0   -- not client-writable; apply_host_strike is service_role only
is_suspended boolean default false
suspended_at timestamptz
suspension_reason text
created_at timestamptz default now()
```

Manual payout columns (payout_method, identifier, name) were considered and not added. Under Stripe Connect Express, Stripe collects the host's bank details at onboarding. `stripe_account_id` is the payout handle.

### listings

```sql
id uuid PK
host_id uuid FK → users
title text
description text
category text
price_per_person integer  -- cents, e.g. $20 = 2000
max_guests integer
area text                 -- general area shown publicly, e.g. "Tampines"
full_address text         -- intended to be revealed only after confirmed booking
photo_urls text[]
whats_provided text[]
is_active boolean default true
created_at timestamp
```

`00001` still `GRANT ALL` on `listings` to anon and authenticated. Public pages do not SELECT `full_address`, but a crafted query against an active listing can still read the column. P0.7 is incomplete at the data layer. See BUILD_BACKLOG.

### sessions

```sql
id uuid PK
listing_id uuid FK → listings
starts_at timestamp
duration_mins integer
spots_total integer
spots_remaining integer
status text              -- documented as 'open' | 'full' | 'completed'
payout_released_at timestamp  -- unused for Connect payouts; booking.payout_released_at is the field that matters
created_at timestamp
```

`completed` is never written. There is no session auto-complete job.

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
stripe_refund_id text
payout_released_at timestamptz  -- booking-level; do not use sessions.payout_released_at for this
status text               -- 'pending' | 'confirmed' | 'cancelled'
cancelled_by text         -- 'guest' | 'host'  (admin-cancel-booking also writes 'host')
cancelled_at timestamptz
refund_amount integer     -- cents
created_at timestamp
```

After `00005`, anon/authenticated cannot INSERT or UPDATE bookings. Money movement goes through service-role Edge Functions. Authenticated can SELECT (guest own rows + host session bookings).

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

Insert policy is guest-only: reviewer is the guest on that booking, `role = 'guest'`. It does **not** require `bookings.status = 'confirmed'`. Host→guest reviews have no insert path.

**Schema is in** `supabase/migrations/`, starting at `00001_baseline.sql`. Signup trigger is `00004_create_profile_on_signup.sql`. Money columns and `confirm_paid_booking` are in `00005_stripe_connect_payments.sql`.

---



## 4. Rules that must never be broken

These are enforced in code. If you are about to change logic around any of them, flag Caleb first.

1. **Prices are always integers in cents.** $20 = 2000. Never floats. Never dollars in the database.
2. `full_address` **must not appear in a public query.** Guest reveal is `get_listing_address` after a confirmed booking. Do not add `full_address` to Home or ListingDetail selects. The column grant on `listings` is still too wide; do not widen it further.
3. **Reviews are gated.** The product rule is: a user may only review if they hold a `confirmed` booking for that session, one review per booking per direction. The dashboard UI still allows `pending`. RLS only checks that a guest booking exists.
4. `spots_remaining` **must never go below zero.** Decrement on confirmation (`confirm_paid_booking`), increment on cancellation of confirmed rows only.
5. **Only approved hosts can hold active listings.** `verification_status = 'approved'` is the CreateListing gate. There is no server-side block that prevents an unverified user from inserting a listing if they bypass the form.
6. **The platform fee is not a flat percentage.** Guest totals live in `supabase/functions/_shared/booking.ts`. See section 5.
7. **The cancellation policy is four tier**, per below. Do not assume the old two tier rule anywhere.
8. **Never confirm a booking from the browser.** The Stripe webhook is the source of truth. `confirm_paid_booking` and `confirm_booking` are service_role only.



### Cancellation policy, correct version

*Updated 29 July 2026. Supersedes the old two tier rule. Published at /cancellation-policy.*


| Scenario                              | Outcome                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guest cancels 48hrs+ before           | Full refund, including platform fee                                                                                                                               |
| Guest cancels 24 to 48hrs before      | 50% of lesson fee, platform fee forfeited                                                                                                                         |
| Guest cancels 6 to 24hrs before       | 25% of lesson fee, platform fee forfeited                                                                                                                         |
| Guest cancels under 6hrs, or no shows | No refund                                                                                                                                                         |
| Host cancels, any time                | Full guest refund including platform fee. Host receives 1 strike.                                                                                                 |
| Host no show                          | Full guest refund including platform fee, plus discretionary compensation at TryKai's judgement. Host receives 2 strikes immediately and the account is reviewed. |
| 3 host strikes                        | Listings auto deactivated (`apply_host_strike` at 3)                                                                                                              |


All boundaries are measured in Singapore time, from the moment of cancellation to session start. Exactly 48:00:00 counts as within the 48 hour tier.

Also decided but **not yet built**: reschedule, once per booking, same 48 hour cutoff. Host strike appeals within 7 days. Immediate suspension independent of the strike counter, for safety reports (fields exist; the app does not query them). Cancellation emails that include the refund amount.

---



## 5. Fee structure

*Decided 23 August 2026. See DECISIONS.md for the full modelling and rationale. Code of record:* `supabase/functions/_shared/booking.ts` *and* `src/lib/pricing.js`*.*

**Guest fee.** Card fee is 12% of the lesson price with a S$2.50 floor, then the total is rounded UP to the nearest whole dollar so it can never dip below the floor. This all in total is shown identically from the browse card through to card checkout, the price never rises between viewing and paying.

**PayNow.** Shown as a flat 5% discount off that same all in total, displayed prominently at checkout and never before, as a bold percentage. The price only ever gets cheaper than advertised, never more expensive.

**Host fee.** 10% of the lesson, triggered per host: every non founding host's first three **confirmed** bookings are free, their fourth booking onward pays the fee. Founding hosts (`is_founding_host`) never pay.

Do not hardcode a flat percentage. Worked checks: $10 → $13, $20 → $23, $25 → $28, $30 → $34, $40 → $45. PayNow example: $25 lesson → $26.60.

---



## 6. Payout model

**Provider decided 16 August 2026: Stripe Connect, separate charges and transfers, Express accounts.** This is implemented in code.

The host's share is released **24 hours after** `starts_at`, not 24 hours after the guest pays. `release-payout` creates a Transfer with `transfer_group = booking_id` and `source_transaction = stripe_charge_id`. It is secret-gated (`PAYOUT_CRON_SECRET` or `CRON_SECRET`); schedule it hourly.

It does **not** check for open disputes. The only money hold besides the 24h timer is `stripe_refund_id IS NULL`.

**Ops:** set platform Stripe payouts to **manual** (or keep a reserve covering outstanding host liability). Automatic platform payouts to Aspire would leave nothing to Transfer.

Under Express accounts, Stripe collects the host's bank details at onboarding. Hosts must finish Connect onboarding (`stripe_payouts_enabled`) before guests can Book. Creating a listing stays allowed. The dashboard calls `create-account-link`, which creates the Express account if the host does not have one yet.

---



## 7. Auth, RLS, and the trusted functions

Supabase built in auth, email and password for MVP. Session handling is Supabase's default; no manual JWT management.

**Signup.** `Login.jsx` does **not** insert a `public.users` row. Tests assert this. `handle_new_user` (trigger on `auth.users`, `00004`) inserts `id`, `email`, `full_name` from signup metadata. `guard_user_self_insert` forces `stripe_account_id`, `stripe_payouts_enabled`, and `is_founding_host` off on authenticated inserts.

**Signup note:** a required email confirmation setting plus the free tier mailer's low hourly send limit was silently breaking signup. Email confirmation was turned off on staging to unblock testing. Confirm the production setting deliberately before launch.

There is **no** `submit_verification` **function.** VerifyIdentity uploads to the private `verification-docs` bucket, then a client `UPDATE` of `id_photo_url`, `selfie_url`, and `verification_status: 'pending'`. The guard is `guard_user_self_update`: authenticated users may only move unverified/rejected → pending; they cannot self-approve; they cannot write strikes, suspension, stripe, or founding-host fields.

**Column grants (after** `00005`**), not a public-profile VIEW.** `00005` revokes ALL on `users` then re-grants specific columns. `verification_status` **is** granted for UPDATE (needed for pending). `id_photo_url` and `selfie_url` **are** granted SELECT to authenticated. RLS `"Anyone can view host profiles" USING (true)` still exists. The real barrier for ID images is the private storage bucket, not a missing SELECT grant.

`full_address`**.** `get_listing_address(listing_id)` returns the address only to a **confirmed guest** for that listing. It does **not** return to the owning host. Hosts read `full_address` via listings SELECT (EditListing). Public pages do not select the column.

**Trusted functions that move money or status:**

- `handle_new_user()` — trigger on `auth.users`. Creates the profile row.
- `guard_user_self_update()` / `guard_user_self_insert()` — block self-approval, strike/suspension/stripe/founding-host writes.
- `get_listing_address(listing_id)` — confirmed guest only.
- `confirm_paid_booking(...)` and `confirm_booking` wrapper — flip pending → confirmed and decrement `spots_remaining` atomically under a row lock. **Service role only.** The Stripe webhook calls `confirm_paid_booking`. If spots are gone, the webhook refunds instead of confirming.
- `apply_host_strike(host_id)` — increments strikes and deactivates listings at 3. **Service role only.**

Admin actions (approve verification, set `is_founding_host`, suspend) run as the service role, currently via the Supabase Table Editor. There is no admin UI. `admin-cancel-booking` exists and is secret-gated; it writes `cancelled_by: 'host'`.

---



## 8. File map

```
src/
├── lib/
│   ├── supabase.js              # Supabase client init
│   ├── authedUser.js            # RequireAuth context: useAuthedUserId
│   ├── cancellationPolicy.js    # Four-tier guest refund copy + arithmetic
│   ├── pricing.js               # All-in card / PayNow prices shown in the UI
│   └── edgeFunctionError.js     # Read Edge Function error bodies
├── pages/
│   ├── Home.jsx                 # Browse: grid of ui/Card, category/area filters, newest first
│   ├── Login.jsx                # Auth, login + signup (no users insert)
│   ├── ListingDetail.jsx        # Listing, rail picker, Payment Element
│   ├── CreateListing.jsx        # Verification gate, listing insert, is_host=true
│   ├── EditListing.jsx          # Host edits listing, including full_address
│   ├── VerifyIdentity.jsx       # Client UPDATE to pending after private uploads
│   ├── Dashboard.jsx            # Both views, Connect setup, cancel via function
│   ├── StyleGuide.jsx           # UI kit preview at /style-guide
│   ├── RefundPolicy.jsx
│   ├── CancellationPolicy.jsx
│   └── DisputePolicy.jsx
├── components/
│   ├── SiteNav.jsx              # Live chrome: feeds real auth into TopNav
│   ├── Footer.jsx               # Policy links only
│   ├── RequireAuth.jsx
│   ├── ListingCard.jsx          # Superseded by ui/Card browse mode; no page renders it
│   ├── ReviewCard.jsx
│   ├── StarPicker.jsx
│   ├── CancellationPolicy.jsx   # Collapsible / info blocks
│   └── ui/
│       ├── TopNav.jsx           # Global top bar, mounted once via SiteNav
│       ├── HamburgerMenu.jsx    # Slide-in panel, contents adapt to auth state
│       ├── Button.jsx           # /style-guide only
│       ├── Input.jsx            # /style-guide only
│       ├── Card.jsx             # Browse mode is live on Home; booking mode /style-guide only
│       ├── SelectableCard.jsx   # Category cards; /style-guide only
│       └── getInitials.js       # Avatar fallback initials
├── App.jsx
└── main.jsx

supabase/migrations/
├── 00001_baseline.sql
├── 00002_address_reveal_and_confirm_booking.sql
├── 00003_signup_verification_and_suspension.sql
├── 00004_create_profile_on_signup.sql
└── 00005_stripe_connect_payments.sql

supabase/functions/
├── _shared/
│   ├── booking.ts               # Guest charge, host fee, refunds
│   ├── http.ts                  # JSON/CORS/secret helpers
│   ├── connect.ts               # Express account v2 helpers
│   ├── email.ts                 # Resend helper + booking HTML
│   └── payouts.ts               # 24h Transfer eligibility
├── create-payment-intent/       # Pending booking + PaymentIntent (no emails)
├── stripe-webhook/              # Stripe-Signature → confirm_paid_booking + emails
├── create-connect-account/      # Express account for the signed-in host
├── create-account-link/         # Creates account if needed, Account Link to /dashboard?connect=
├── cancel-booking/              # Guest or host cancel + Stripe refund + strikes; no emails
├── admin-cancel-booking/        # x-admin-secret full refund; cancelled_by='host'; no UI
├── notify-verification-pending/ # Emails Caleb; no shared-secret header
├── notify-verification-result/  # Emails host on approval/rejection; no shared-secret header
└── release-payout/              # x-cron-secret Transfer 24h after starts_at
```


| Looking for                                                | Where                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Browse page and filters                                    | `src/pages/Home.jsx`                                                                                |
| Listing detail and booking                                 | `src/pages/ListingDetail.jsx`                                                                       |
| Login and signup                                           | `src/pages/Login.jsx`                                                                               |
| Create listing                                             | `src/pages/CreateListing.jsx`                                                                       |
| Edit listing                                               | `src/pages/EditListing.jsx`                                                                         |
| Host verification upload                                   | `src/pages/VerifyIdentity.jsx`                                                                      |
| Dashboard, both views                                      | `src/pages/Dashboard.jsx`                                                                           |
| Global nav and hamburger                                   | `src/components/SiteNav.jsx`, `src/components/ui/TopNav.jsx`, `src/components/ui/HamburgerMenu.jsx` |
| UI kit not yet wired (Button, Input, SelectableCard)       | `src/components/ui/`, `src/pages/StyleGuide.jsx`                                                    |
| Colour tokens and all styling                              | `src/index.css`                                                                                     |
| Component preview                                          | `/style-guide` route                                                                                |
| Cancellation arithmetic                                    | `src/lib/cancellationPolicy.js` and `supabase/functions/_shared/booking.ts`                         |
| Guest-facing prices                                        | `src/lib/pricing.js`                                                                                |
| Routes                                                     | `src/App.jsx`                                                                                       |
| Payment and booking creation                               | `supabase/functions/create-payment-intent/`                                                         |
| Payment confirmation                                       | `supabase/functions/stripe-webhook/`                                                                |
| Refunds                                                    | `supabase/functions/cancel-booking/`                                                                |
| Host payouts                                               | `supabase/functions/release-payout/`                                                                |
| Connect onboarding                                         | `supabase/functions/create-account-link/`                                                           |


**Routes in** `App.jsx`**:** `/`, `/login`, `/listings/:id`, `/create-listing`, `/verify-identity`, `/edit-listing/:id`, `/dashboard` (the last four behind `RequireAuth`), `/refund-policy`, `/cancellation-policy`, `/dispute-policy`, `/style-guide`. No `/terms`, `/privacy`, or 404 route. Unknown paths still render SiteNav + Footer.

---



## 9. End to end flows

Use these alongside the code. When you are reading a file and wondering what it is actually for, find the relevant scenario here.

### Scenario 1: Guest books a session

*Sarah, 23, saw a latte art session shared on Instagram.*

**1. Lands on trykai.sg.** The grid leads the page; there is no hero. `Home.jsx` fetches listings where `is_active = true`, ordered `created_at` desc, and renders each through `ui/Card` in browse mode: square photo, category badge overlaid top-left, title clamped to two lines, then one meta line carrying the all-in card price. No rating is shown because the fetch does not select one. No sort UI. Grid is 2 columns on phone, 3 from 768px, 4 from 1024px. `full_address` is not fetched. `is_suspended` is not queried; a suspended host's active listings still appear.

**2. Filters by category and area.** Filtering is client side on the already fetched array. Category pills are derived from listing data (not a hardcoded six-category list). No additional database call.

**3. Opens the listing.** `ListingDetail.jsx` fetches the listing, its open future sessions, the host profile (including `stripe_payouts_enabled`), and guest→host reviews. Cancellation policy shown collapsed above the Book button. `full_address` still not shown. Book is disabled until the host can receive payouts.

**4. Not logged in.** Redirected to `Login.jsx`, then back to the listing after auth. Signup calls `auth.signUp` with `full_name` in metadata. The profile row is created by `handle_new_user`.

**5. Phone verification.** OTP required before booking, per progressive disclosure. **Not built.**

**6. Checkout.** `guests_count` is hardcoded to 1. Guest picks Card or PayNow (5% off, shown only here) *before* `create-payment-intent`. The function creates a pending booking, then a PaymentIntent locked to that rail. No host email is sent here.

**7. Payment.** Payment Element `confirmPayment` uses `return_url=/dashboard?booking=<id>`. `stripe-webhook` verifies `Stripe-Signature`, calls `confirm_paid_booking`, freezes host fee/payout, emails guest and host via `_shared/email.ts`. Failed/canceled intents mark the pending row cancelled without touching spots. Oversell refunds immediately. `account.updated` syncs `stripe_payouts_enabled`.

**8. Confirmation.** `Dashboard.jsx` polls `/dashboard?booking=` until status is `confirmed`. Then `get_listing_address` returns `full_address` to that guest.

**9. Session happens.** Payout releases 24 hours after `starts_at`, via `release-payout`. Sessions are not auto-completed. Review prompts appear in the dashboard for `pending` or `confirmed` bookings after `starts_at`.

**10. Review.** Dashboard allows a review if the booking is past, status is `pending` or `confirmed`, and this reviewer has not already reviewed. Inserts into `reviews` as `role: 'guest'`. RLS does not require confirmed.

### Scenario 2: Host creates a listing

*Martin, 27, wants to offer cocktail mixology.*

1. **Signs up.** Same as any guest. `is_host = false` initially. Profile row comes from `handle_new_user`.
2. **Clicks Create Listing.** `CreateListing.jsx` checks `verification_status` on mount. `unverified` or `rejected` redirects to `/verify-identity`. `pending` blocks the form with an under review message. `approved` shows the form.
3. **Submits verification.** ID photo and live selfie upload to the private `verification-docs` bucket. A client UPDATE sets urls + `pending`. The trigger blocks any other status change. A database webhook is expected to fire `notify-verification-pending`, emailing `calebong2002@gmail.com`. That function has **no shared-secret header**.
4. **Caleb reviews.** Compares photos in Supabase Storage, sets `approved` or `rejected` in the Table Editor. The status change should fire `notify-verification-result`. Same unauthenticated-endpoint problem.
5. **Creates the listing.** Title, description, category, price in cents, max guests, public area, private full address, up to 5 photos, what's provided. Inserts into `listings`, sets `is_host = true`, navigates to dashboard. **Does not create the first session in the same form.** No photography guidance. No T&C checkbox.
6. **Adds a session** from Dashboard “Add Session”. Date, time, duration, spots. `spots_total` and `spots_remaining` both set to the entered number, `status = 'open'`.
7. **Payout setup.** Dashboard “Set up payouts” → `create-account-link` → Stripe Express onboarding. Book stays disabled for guests until `stripe_payouts_enabled`.
8. **Receives bookings.** Email from `stripe-webhook` after confirmation, with guest name, session details, guest count.
9. **Edits.** `EditListing.jsx` checks `host_id = current user`. Soft-delete is `is_active = false` from the dashboard.



### Scenario 3: Host cancels

Warning shown: cancelling results in a strike, three strikes deactivates listings, all guests receive a full refund.

On confirmation the dashboard calls `cancel-booking` with `session_id`. The function issues Stripe refunds for confirmed bookings (or cancels unpaid PaymentIntents), restores spots only for confirmed rows, sets `cancelled_by = 'host'`, and calls `apply_host_strike`. **No emails.**

Host upcoming list is sessions that already have pending or confirmed bookings, not every open session.

### Scenario 4: Guest cancels

`cancellationPolicy.js` quotes the refund; `cancel-booking` recomputes it and creates the Stripe refund. Pending unpaid cancel voids the PaymentIntent and does not restore spots (none were taken). **No emails**, so the published promise that the refund amount appears in the cancellation email is not kept.

On confirmation: `status = 'cancelled'`, `cancelled_by = 'guest'`, `refund_amount` and `stripe_refund_id` stored.

### Scenario 5: Verification rejected

Caleb sets `verification_status = 'rejected'`. Webhook should fire `notify-verification-result` with a resubmit prompt. The form becomes available again. Rejected documents are scheduled for deletion after 30 days, via an Edge Function that is not yet built.

---



## 10. Pages (what they actually do)

**Home.jsx** — browse of active listings, grid first, no hero. Category pills derived from data, area dropdown, combinable, newest first. No auth required. No sort by price or reviews.

**Login.jsx** — email and password, login and signup. Does not insert into `users`. No password reset. No T&C checkbox.

**ListingDetail.jsx** — listing, gallery, host name/avatar, open future sessions, collapsible cancellation policy, guest→host reviews, Card vs PayNow checkout. `guests_count` always 1. `full_address` only via RPC after a confirmed booking.

**CreateListing.jsx** — auth required. Verification gate. Listing insert then `is_host = true`, then dashboard. CancellationPolicyInfo on the form. First session is a separate dashboard action.

**EditListing.jsx** — auth required, ownership checked, pre fills including `full_address` and existing photos.

**VerifyIdentity.jsx** — two uploads to the private bucket, then client UPDATE to pending. Pending users see an under review message.

**Dashboard.jsx** — Connect payout setup. Host: listings with Add Session, Edit, soft-delete; upcoming sessions that have active bookings, with Cancel and strike warning. Guest: upcoming and past bookings, Cancel with calculated refund shown, leave review after `starts_at` on pending or confirmed. Polls `?booking=` after Payment Element return.

**StyleGuide.jsx** — private preview of the UI kit at `/style-guide`. Imports `src/assets/categories/{food,fitness,arts,music}.png`, all four of which are now in the repo. Language/Other imports are still commented out; uncommenting either without adding the PNG fails `vite build`, because App always imports this page. It no longer mounts its own TopNav: the live `SiteNav` bar serves the page, and the preview-only "Simulate logged in" toggle is gone.

---



## 11. Known gaps

Ordered roughly by consequence. Sequencing is in BUILD_BACKLOG.md.

**Launch blocking**

- All Edge Function emails still send from Resend's shared test domain. Real users receive nothing until trykai.sg is verified. **Same week:** shared-secret header on `notify-verification-pending` and `notify-verification-result` (release-payout and admin-cancel-booking are already secret-gated; the webhook uses Stripe-Signature).
- Staging must apply `00005` and run this money path in Stripe **test mode** before production. Platform Stripe payouts must be switched to manual. Mark the eleven founding hosts `is_founding_host = true` in Table Editor. One real test booking on production before warm-contact launch.
- `is_suspended` is never queried in `src/`. Setting the flag in Table Editor does not hide listings or block booking. SAFETY_RESPONSE_PROTOCOL.md still requires a hand check that listings are `is_active = false`.
- `listings.full_address` is still `GRANT ALL` from `00001`.
- `StyleGuide.jsx` ~~imports category PNGs that are not in the repo; Navbar requests~~ `/trykai.png`~~, which is not in~~ `public/`~~.~~ **Resolved 9 September:** `food`, `fitness`, `arts`, and `music` PNGs are in `src/assets/categories/`, and `public/trykai.png` exists.

**Serious**

- Review gating still accepts `pending` in the dashboard UI, and RLS does not require confirmed (P2.3).
- Host no-show reporting, reschedule, session auto-complete, host→guest reviews: not built.
- `cancel-booking` does not email either party.
- Admin verification review is still Table Editor (P0.3).
- UI kit only partly wired: the nav and the browse `Card` are live, but Button, Input, and SelectableCard are still `/style-guide` only. `ListingCard.jsx` and its `.listing-card` CSS are now dead code that only its own test renders; deleting them is a separate cleanup.
- The browse card can never show a rating: the `listings` select does not fetch one and there is no aggregate rating column, so `Card` gets no `rating` prop from Home. The price-only card is correct for a new listing but wrong for a listing with reviews.
- A host who exits Stripe Connect onboarding without completing it still sees a "Payout setup submitted" success message on the dashboard, because `?connect=return` is treated as success without re-checking `stripe_payouts_enabled`. That host believes they can be paid and cannot. If they take a booking, the guest pays and there is no payout path, discovered after the session.

**Not built, decided**

- Phone OTP before booking
- Password reset
- Terms of Service and Privacy Policy routes
- T&C checkboxes at signup, create listing, and checkout
- Guest count picker (`guests_count` hardcoded to 1)
- Catch-all 404
- Photography guidance on create listing
- Sort by newest / price / most reviewed (DECISIONS.md currently overclaims this as live)
- Host strike appeals, admin dispute log
- Admin UI for `admin-cancel-booking`
- Refund amount in a cancellation email
- Payout clawback where a dispute is confirmed after release
- Auto deletion of rejected verification documents after 30 days

---



## 12. Things to avoid

- Never expose `full_address` in a public query
- Never store prices as floats
- Never allow a review without a confirmed booking (the UI currently does; do not make it worse)
- Never assume a flat platform fee
- Never confirm a booking from the browser. The webhook is the source of truth.
- Do not over engineer the MVP. Keep it simple and shippable.
- Do not add features that are not in DECISIONS.md without asking
- Do not hardcode a colour in a component; use the tokens at `:root` in `index.css`
- Do not mount a nav on a page. `SiteNav` in `App.jsx` is the only one.

