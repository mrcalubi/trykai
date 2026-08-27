# TryKai: Engineering

The working document for anyone touching the codebase, human or AI. Covers stack, schema, business rules, file map, and end to end user flows.

**Always read this and DECISIONS.md before making changes.** Visual identity is in DESIGN.md.

> **Read before you start, updated 27 August 2026.**
> 1. **Stripe Connect is live in code: separate charges and transfers, Express accounts, decided 16 August 2026.** Guests pay the platform; host share is Transferred 24 hours after `starts_at`. Platform Stripe payouts must stay **manual** so auto-payout to Aspire does not drain funds needed for those Transfers. See DECISIONS.md.
> 2. **The four tier cancellation logic has now been built and verified correct** (Ruiheng, 23 August). The old two tier rule is gone. The correct rule is in section 4 below and in DECISIONS.md. Refunds are issued by the `cancel-booking` Edge Function, not the browser.
> 3. **Schema lives in `supabase/migrations/`.** A staging Supabase environment exists. Apply new migrations there before production. Do not expect `supabase/schema.sql` — that file is gone.
> 4. **A CI test suite and branch protection now gate every merge.** Do not expect to merge with red checks. Match the existing plain CSS approach in `index.css`, the project does not use Tailwind.

---

## 1. What the platform does

Two user types, one account. A user is a guest by default and becomes a host when they create their first listing. The `is_host` flag on the users table handles the distinction. The dashboard shows both views.

- **Hosts** list a skill or experience to teach
- **Guests** browse and book sessions

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite | Familiar, fast, well supported by Cursor |
| Routing | React Router v6 | |
| Backend, DB, Auth, Storage | Supabase | Handles backend, auth, storage, and RLS out of the box |
| Hosting | Vercel | Free tier, auto deploy on push |
| Payments | **Stripe Connect**, separate charges and transfers, Express accounts | Decided 16 August. Supports PayNow in Singapore at 1.3%, platform is merchant of record, Transfers held until 24h after the session. Implemented: Payment Element + webhook confirmation, Connect onboarding, refunds, hourly Transfer job. |
| Transactional email | Resend | **Currently on a shared test domain, delivers only to Caleb** |
| Business email | Zoho Mail Lite | caleb@, aakash@, ruiheng@trykai.sg |
| AI coding | Cursor | Implementation. Claude handles architecture. |

---

## 3. Database schema

### users
```sql
id uuid PK                       -- references auth.users(id)
full_name text
email text unique
phone text
phone_verified boolean default false
avatar_url text
is_host boolean default false
stripe_account_id text           -- Stripe Connect Express account id, the host payout handle. Not client-readable.
stripe_payouts_enabled boolean default false  -- synced from Stripe account.updated; gates Book
is_founding_host boolean default false        -- Table Editor for the eleven; never a host fee
id_photo_url text                -- private, verification-docs bucket
selfie_url text                  -- private, verification-docs bucket
verification_status text default 'unverified'  -- unverified | pending | approved | rejected
host_strikes integer default 0
is_suspended boolean default false        -- added 22 Aug, for the P0.4 suspend action
suspended_at timestamptz                  -- added 22 Aug
suspension_reason text                     -- added 22 Aug
created_at timestamptz default now()
```
Note: manual payout columns (payout_method, identifier, name) were considered and deliberately not added. Under Stripe Connect Express, Stripe collects the host's bank details at onboarding and pays them via the connected account, so `stripe_account_id` is the payout handle. Add manual columns only if a sandbox check shows manual disbursement is needed.

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
full_address text         -- only revealed after confirmed booking
photo_urls text[]
whats_provided text[]
is_active boolean default true
created_at timestamp
```

### sessions
```sql
id uuid PK
listing_id uuid FK → listings
starts_at timestamp
duration_mins integer
spots_total integer
spots_remaining integer
status text              -- 'open' | 'full' | 'completed'
payout_released_at timestamp
created_at timestamp
```

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
cancelled_by text         -- 'guest' | 'host'
cancelled_at timestamptz
refund_amount integer     -- cents
created_at timestamp
```

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

**Schema is in `supabase/migrations/`**, starting at `00001_baseline.sql`. New money columns and `confirm_paid_booking` are in `00005_stripe_connect_payments.sql`.

---

## 4. Rules that must never be broken

These are enforced in code. If you are about to change logic around any of them, flag Caleb first.

1. **Prices are always integers in cents.** $20 = 2000. Never floats. Never dollars in the database.
2. **`full_address` is never exposed in a public query.** Only returned when the requesting user has a confirmed booking for that session. This is the only place it is ever shown to a guest.
3. **Reviews are gated.** A user may only review if they hold a `confirmed` booking for that session. One review per booking per direction.
4. **`spots_remaining` must never go below zero.** Check before allowing a booking. Decrement on confirmation, increment on cancellation.
5. **Only approved hosts can hold active listings.** `verification_status = 'approved'` is the gate. No exceptions.
6. **The platform fee is tiered, not a flat percentage.** Do not hardcode. See section 5.
7. **The cancellation policy is four tier**, per below. Do not assume the old two tier rule anywhere.

### Cancellation policy, correct version
*Updated 29 July 2026. Supersedes the old two tier rule. Published at /cancellation-policy.*

| Scenario | Outcome |
|---|---|
| Guest cancels 48hrs+ before | Full refund, including platform fee |
| Guest cancels 24 to 48hrs before | 50% of lesson fee, platform fee forfeited |
| Guest cancels 6 to 24hrs before | 25% of lesson fee, platform fee forfeited |
| Guest cancels under 6hrs, or no shows | No refund |
| Host cancels, any time | Full guest refund including platform fee. Host receives 1 strike. |
| Host no show | Full guest refund including platform fee, plus discretionary compensation at TryKai's judgement. Host receives 2 strikes immediately and the account is reviewed. |
| 3 host strikes | Listings auto deactivated |

All boundaries are measured in Singapore time, from the moment of cancellation to session start. Exactly 48:00:00 counts as within the 48 hour tier.

Also decided but **not yet built**: reschedule, once per booking, same 48 hour cutoff. Host strike appeals within 7 days. Immediate suspension independent of the strike counter, for safety reports.

---

## 5. Fee structure

*Decided 23 August 2026. See DECISIONS.md for the full modelling and rationale.*

**Guest fee.** Card fee is 12% of the lesson price with a S$2.50 floor, then the total is rounded UP to the nearest whole dollar so it can never dip below the floor. This all in total is shown identically from the browse card through to card checkout, the price never rises between viewing and paying.

**PayNow.** Shown as a flat 5% discount off that same all in total, displayed prominently at checkout and never before, as a bold percentage. The price only ever gets cheaper than advertised, never more expensive.

**Host fee.** 10% of the booking, triggered per host: every non founding host's first three bookings are free, their fourth booking onward pays the fee, starting immediately with no platform wide cumulative count. Founding hosts are grandfathered permanently and never pay.

Do not hardcode a flat percentage. Guest totals are calculated in `supabase/functions/_shared/booking.ts` (`calculateGuestCharge`) and shown on browse via `src/lib/pricing.js`. Worked checks: $10 → $13, $20 → $23, $25 → $28, $30 → $34, $40 → $45.

---

## 6. Payout model

**Provider decided 16 August 2026: Stripe Connect, separate charges and transfers, Express accounts.** This is implemented.

The host's share is released **24 hours after `starts_at`**, not 24 hours after the guest pays. `release-payout` creates a Transfer with `transfer_group = booking_id` and `source_transaction = stripe_charge_id`. It is secret-gated (`PAYOUT_CRON_SECRET`); schedule it hourly.

**Ops:** set platform Stripe payouts to **manual** (or keep a reserve covering outstanding host liability). Automatic platform payouts to Aspire would leave nothing to Transfer.

Under Express accounts, Stripe collects the host's bank details at onboarding. `stripe_account_id` is the payout handle. Hosts must finish Connect onboarding (`stripe_payouts_enabled`) before guests can Book. Creating a listing stays allowed.

---

## 7. Auth, RLS, and the trusted functions

Supabase built in auth, email and password for MVP. On signup, a row is created in `users` with the auth user's id. RLS protects data. Session handling is Supabase's default; no manual JWT management.

**Signup note:** a required email confirmation setting plus the free tier mailer's low hourly send limit was silently breaking signup. Email confirmation was turned off on staging to unblock testing. Confirm the production setting deliberately before launch.

**RLS review, now done (22 August).** The three flagged holes are closed. A logged in user physically cannot write their own `verification_status`, `host_strikes`, or suspension fields, because those columns are simply not granted to the authenticated role; only the service role (admin) or the controlled functions below can change them. Cross user reads of verification documents are blocked by row level policies and a safe public profile view.

**Trusted functions that move money or status:**
- `submit_verification(id_photo_url, selfie_url)` moves a user from unverified or rejected to pending and sets their document urls. There is no path to approved, so a user can request review but never approve themselves.
- `confirm_paid_booking(...)` (and the `confirm_booking` wrapper) flips a pending booking to confirmed and decrements `spots_remaining` atomically under a row lock. **Service role only.** The Stripe webhook calls it. If spots are gone, the webhook refunds instead of confirming.
- `apply_host_strike(host_id)` increments strikes and deactivates listings at 3. Service role only; the client cannot write `host_strikes`.
- `get_listing_address(listing_id)` returns `full_address` only to the owning host or a guest holding a confirmed booking for one of the listing's sessions. This is the only read path for `full_address`.

Admin actions (approve verification, add strikes, suspend) run as the service role, currently via the Supabase Table Editor by hand, and bypass RLS. The admin UI to replace the manual Table Editor work is still the P0.4 build item.

---

## 8. File map

```
src/
├── lib/
│   ├── supabase.js            # Supabase client init
│   ├── cancellationPolicy.js  # Four-tier guest refund copy + arithmetic
│   └── pricing.js             # All-in card price shown on browse and listing
├── pages/
│   ├── Home.jsx               # Browse, category + area filters
│   ├── Login.jsx              # Auth, login + signup
│   ├── ListingDetail.jsx      # Single listing, rail picker, Payment Element
│   ├── CreateListing.jsx      # Host creates listing, requires verification
│   ├── EditListing.jsx        # Host edits listing
│   ├── VerifyIdentity.jsx     # Host ID + selfie submission
│   └── Dashboard.jsx          # Host + guest views, Connect payout setup, cancel via function
├── components/
│   ├── Navbar.jsx
│   ├── ListingCard.jsx        # Shows all-in card total, never the raw lesson
│   └── ReviewCard.jsx
├── App.jsx                    # Routes
└── main.jsx

supabase/functions/
├── _shared/booking.ts             # Guest charge, host fee, refunds
├── create-payment-intent/         # Pending booking + PaymentIntent (no emails)
├── stripe-webhook/                # Signature verify → confirm_paid_booking + emails
├── create-connect-account/        # Express account for the signed-in host
├── create-account-link/           # Account Links back to /dashboard?connect=
├── cancel-booking/                # Guest or host cancel + Stripe refund + strikes
├── admin-cancel-booking/          # Shared-secret full refund (P1.4, no admin UI)
├── notify-verification-pending/   # Emails Caleb on submission
├── notify-verification-result/    # Emails host on approval/rejection
└── release-payout/                # Secret-gated Transfer 24h after starts_at
```

| Looking for | Where |
|---|---|
| Browse page and filters | `src/pages/Home.jsx` |
| Listing detail and booking | `src/pages/ListingDetail.jsx` |
| Login and signup | `src/pages/Login.jsx` |
| Create listing | `src/pages/CreateListing.jsx` |
| Edit listing | `src/pages/EditListing.jsx` |
| Host verification upload | `src/pages/VerifyIdentity.jsx` |
| Dashboard, both views | `src/pages/Dashboard.jsx` |
| Cancellation logic | `src/lib/cancellationPolicy.js` and `supabase/functions/_shared/booking.ts` |
| Guest-facing prices | `src/lib/pricing.js` |
| Routes | `src/App.jsx` |
| Payment and booking creation | `supabase/functions/create-payment-intent/` |
| Payment confirmation | `supabase/functions/stripe-webhook/` |
| Refunds | `supabase/functions/cancel-booking/` |
| Host payouts | `supabase/functions/release-payout/` |

---

## 9. End to end flows

Use these alongside the code. When you are reading a file and wondering what it is actually for, find the relevant scenario here.

### Scenario 1: Guest books a session
*Sarah, 23, saw a latte art session shared on Instagram.*

**1. Lands on trykai.sg.** `Home.jsx` fetches all listings where `is_active = true`, renders each as a `ListingCard` showing photo, title, host name, area, and the **all-in card price**. `full_address` is not fetched at this stage.

**2. Filters by category.** Filtering is client side on the already fetched array. Category pills and the area dropdown combine. No additional database call.

**3. Opens the listing.** `ListingDetail.jsx` fetches the listing, its open sessions, the host profile (including `stripe_payouts_enabled`), and existing reviews. Cancellation policy shown collapsed above the Book button. `full_address` still not shown. Book is disabled until the host can receive payouts.

**4. Not logged in.** Redirected to `Login.jsx`, then back to the listing after auth. On signup a row is inserted into `users` with `is_host = false`.

**5. Phone verification.** OTP required before booking, per progressive disclosure. **Not built.** Ask for information at the moment it is relevant, not upfront.

**6. Checkout.** Guest picks Card or PayNow (5% off, shown only here) *before* `create-payment-intent`. The function creates a pending booking, then a PaymentIntent locked to that rail (`payment_method_types`, amount, `transfer_group = booking_id`). No host email is sent here.

**7. Payment.** Payment Element `confirmPayment` uses `return_url=/dashboard?booking=<id>`. `stripe-webhook` verifies `Stripe-Signature`, calls `confirm_paid_booking`, freezes host fee/payout, emails guest and host. Failed/canceled intents mark the pending row cancelled without touching spots. Oversell refunds immediately.

**8. Confirmation.** `Dashboard.jsx` polls `/dashboard?booking=` until status is `confirmed`. Because the user now holds a confirmed booking for that session, `full_address` is returned. RLS enforces this.

**9. Session happens.** Payout releases 24 hours after `starts_at`, via `release-payout` (no session auto-complete required). Review prompts appear for both parties after `starts_at`.

**10. Review.** Allowed only if the booking is `confirmed`, `starts_at` has passed, and no review exists from this reviewer for this booking. Inserts into `reviews` and recalculates the host's average.

### Scenario 2: Host creates a listing
*Martin, 27, wants to offer cocktail mixology.*

1. **Signs up.** Same as any guest. `is_host = false` initially.
2. **Clicks Create Listing.** `CreateListing.jsx` checks `verification_status` on mount. `unverified` or `rejected` redirects to `/verify`. `pending` blocks the form with an under review message. `approved` shows the form.
3. **Submits verification.** ID photo and live selfie upload to the private `verification-docs` bucket. The status change to `pending` goes through the `submit_verification` security definer function, which only permits the unverified-or-rejected to pending transition, so a user can never set themselves to approved. A database webhook fires `notify-verification-pending`, emailing Caleb.
4. **Caleb reviews.** Compares photos in Supabase Storage, sets `approved` or `rejected` in the Table Editor. The status change fires `notify-verification-result`, emailing the host.
5. **Creates the listing.** Title, description, category, price in cents, max guests, public area, private full address, up to 5 photos, what's provided. Inserts into `listings`, sets `is_host = true`.
6. **Adds a session.** Date, time, duration, spots. `spots_total` and `spots_remaining` both set to the entered number, `status = 'open'`.
7. **Receives bookings.** Email notification with guest name, session details, guest count.
8. **Edits.** `EditListing.jsx` checks `host_id = current user` before allowing changes.

### Scenario 3: Host cancels
Warning shown: cancelling results in a strike, three strikes deactivates listings, all guests receive a full refund.

On confirmation the dashboard calls `cancel-booking` with `session_id`. The function issues Stripe refunds for confirmed bookings (or cancels unpaid PaymentIntents), restores spots only for confirmed rows, sets `cancelled_by = 'host'`, and calls `apply_host_strike`.

### Scenario 4: Guest cancels
`cancellationPolicy.js` quotes the refund; `cancel-booking` recomputes it with `calculateGuestRefund` / `refundAmountForCancel` and creates the Stripe refund. Pending unpaid cancel voids the PaymentIntent and does not restore spots (none were taken).

On confirmation: `status = 'cancelled'`, `cancelled_by = 'guest'`, `refund_amount` and `stripe_refund_id` stored.

### Scenario 5: Verification rejected
Caleb sets `verification_status = 'rejected'`. Webhook fires `notify-verification-result` with a resubmit prompt. The form becomes available again. Rejected documents are scheduled for deletion after 30 days, via an Edge Function that is not yet built.

---

## 10. Pages

**Home.jsx** — browse all active listings. Category pills (All, Food, Fitness, Arts, Music, Language, Other) and area dropdown, combinable. No auth required.

**Login.jsx** — email and password, login and signup. Inserts into `users` on signup.

**ListingDetail.jsx** — full listing, photo gallery, host profile and rating, available sessions, collapsible cancellation policy above the Book button, reviews. `full_address` only after a confirmed booking.

**CreateListing.jsx** — auth required. Verification gate as described in Scenario 2. Form, then first session.

**EditListing.jsx** — auth required, ownership checked, pre fills all fields including existing photos.

**VerifyIdentity.jsx** — two uploads to the private bucket. Pending users see an under review message instead of the form.

**Dashboard.jsx** — host view: listings with Add Session and Edit, upcoming sessions with Cancel and strike warning. Guest view: upcoming and past bookings, Cancel with calculated refund shown, leave review after the session.

---

## 11. Known gaps

Ordered roughly by consequence. Full engineering sequencing is in `TryKai-Launch-Plan.docx`, 2 August 2026, which is authoritative on implementation order.

**Launch blocking**
- All Edge Function emails still send from Resend's shared test domain, delivering only to Caleb's address. Real users receive nothing until trykai.sg is verified.
- Staging must run this money path in Stripe **test mode** (test cards + PayNow test) and apply `00005` before production. One real test booking on production before warm-contact launch.
- Platform Stripe payouts must be switched to manual (or a reserve). Confirm Singapore Connect per-active-account fee (still unverified in DECISIONS.md). Mark the eleven founding hosts `is_founding_host = true` in Table Editor.

**Serious**
- Review gating still accepts `pending` bookings in the dashboard UI, should require `confirmed` (P2.3).
- P0.4 suspension fields exist; the app does not yet hide listings or block bookings for a suspended account.
- Host no-show reporting, reschedule, and session auto-complete are not built.

**Not built, decided**
- Reschedule flow
- Host no show reporting, distinct from host initiated cancellation
- Host strike appeals
- Admin UI for `admin-cancel-booking` (the function exists; Caleb can call it with `ADMIN_FUNCTION_SECRET`)
- Immediate account suspension independent of the strike counter
- Refund amount included directly in the cancellation confirmation email
- Payout clawback where a dispute is confirmed after release
- Auto deletion of rejected verification documents after 30 days
- Scheduled job to auto complete sessions once start time passes

---

## 12. Things to avoid

- Never expose `full_address` in a public query
- Never store prices as floats
- Never allow a review without a confirmed booking
- Never assume a flat platform fee
- Never confirm a booking from the browser. The webhook is the source of truth.
- Do not over engineer the MVP. Keep it simple and shippable.
- Do not add features that are not in DECISIONS.md without asking
