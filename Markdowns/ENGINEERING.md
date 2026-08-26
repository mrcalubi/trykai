# TryKai: Engineering

The working document for anyone touching the codebase, human or AI. Covers stack, schema, business rules, file map, and end to end user flows.

**Always read this and DECISIONS.md before making changes.** Visual identity is in DESIGN.md.

> **Read before you start, updated 25 August 2026.**
> 1. **Payment provider is decided: Stripe Connect, separate charges and transfers, decided 16 August 2026.** Building against Stripe Connect is now correct. The real payment flow is not built yet, but a largely complete webhook and fee calculation exist, pointed at HitPay, stashed as `hitpay-wip-2026-08`. Adapt that to Stripe rather than rebuilding from scratch. See DECISIONS.md.
> 2. **The four tier cancellation logic has now been built and verified correct** (Ruiheng, 23 August). The old two tier rule is gone. The correct rule is in section 4 below and in DECISIONS.md.
> 3. **A staging Supabase environment now exists** and is the place to test database and flow changes. The canonical schema is in version control at `supabase/schema.sql`. Hotfixes applied by hand to staging on 22 August are captured in `00003_staging_hotfixes_22aug.sql`, confirm these are also applied to production.
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
| Payments | **Stripe Connect**, separate charges and transfers, Express accounts | Decided 16 August. Supports PayNow in Singapore at 1.3%, platform is merchant of record, transfers can be held until 24h after the session. Real flow not built yet; adaptable webhook and fee logic stashed as `hitpay-wip-2026-08`. |
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
stripe_account_id text           -- Stripe Connect Express account id, the host payout handle
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
total_amount integer      -- cents
platform_fee integer      -- cents, tiered, see section 5
stripe_payment_id text    -- legacy, payment provider unresolved
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

**No schema exists in the repository.** The live Supabase database has no version history and cannot be rebuilt from source. This is the top priority technical fix and it is also what blocks a proper staging environment.

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

Do not hardcode a flat percentage. The old flat fee in `create-payment-intent` is superseded. The stashed HitPay work in progress contains a fee calculation close to this that can be adapted.

---

## 6. Payout model

**Provider decided 16 August 2026: Stripe Connect, separate charges and transfers, Express accounts.** The real flow is not built yet, but the model is settled.

The host's share is released **24 hours after the session has taken place**, not 24 hours after the guest pays. Guests book days or weeks ahead, and the hold is what makes the published refund guarantees possible. Stripe Connect with separate charges and transfers preserves this, transfers can be delayed until after the session. Any implementation must keep the hold.

Under Express accounts, Stripe collects the host's bank details at onboarding and pays them via the connected account, so `stripe_account_id` is the payout handle and no manual payout details are stored, pending a sandbox confirmation.

---

## 7. Auth, RLS, and the trusted functions

Supabase built in auth, email and password for MVP. On signup, a row is created in `users` with the auth user's id. RLS protects data. Session handling is Supabase's default; no manual JWT management.

**Signup note:** a required email confirmation setting plus the free tier mailer's low hourly send limit was silently breaking signup. Email confirmation was turned off on staging to unblock testing. Confirm the production setting deliberately before launch.

**RLS review, now done (22 August).** The three flagged holes are closed. A logged in user physically cannot write their own `verification_status`, `host_strikes`, or suspension fields, because those columns are simply not granted to the authenticated role; only the service role (admin) or the controlled functions below can change them. Cross user reads of verification documents are blocked by row level policies and a safe public profile view.

**Three security definer functions carry the transitions that must be trusted:**
- `submit_verification(id_photo_url, selfie_url)` moves a user from unverified or rejected to pending and sets their document urls. There is no path to approved, so a user can request review but never approve themselves.
- `confirm_booking(booking_id)` flips a pending booking to confirmed and decrements `spots_remaining` atomically under a row lock. Granted to the service role only, so the payment webhook calls it and no logged in user can confirm without paying. Testable directly on a pending booking, which is how the spots decrement was verified this session.
- `get_listing_address(listing_id)` returns `full_address` only to the owning host or a guest holding a confirmed booking for one of the listing's sessions. This is the only read path for `full_address`.

Admin actions (approve verification, add strikes, suspend) run as the service role, currently via the Supabase Table Editor by hand, and bypass RLS. The admin UI to replace the manual Table Editor work is still the P0.4 build item.

---

## 8. File map

```
src/
├── lib/
│   ├── supabase.js            # Supabase client init
│   └── cancellationPolicy.js  # Shared refund calculation — WRONG, still 2-tier
├── pages/
│   ├── Home.jsx               # Browse, category + area filters
│   ├── Login.jsx              # Auth, login + signup
│   ├── ListingDetail.jsx      # Single listing, booking, cancellation policy
│   ├── CreateListing.jsx      # Host creates listing, requires verification
│   ├── EditListing.jsx        # Host edits listing
│   ├── VerifyIdentity.jsx     # Host ID + selfie submission
│   └── Dashboard.jsx          # Host + guest views
├── components/
│   ├── Navbar.jsx
│   ├── ListingCard.jsx
│   └── ReviewCard.jsx
├── App.jsx                    # Routes
└── main.jsx

supabase/functions/
├── create-payment-intent/         # Booking + payment + host notification
├── notify-verification-pending/   # Emails Caleb on submission
├── notify-verification-result/    # Emails host on approval/rejection
└── release-payout/                # KIV, not wired to any provider
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
| Cancellation logic | `src/lib/cancellationPolicy.js` |
| Routes | `src/App.jsx` |
| Payment and booking creation | `supabase/functions/create-payment-intent/` |

---

## 9. End to end flows

Use these alongside the code. When you are reading a file and wondering what it is actually for, find the relevant scenario here.

### Scenario 1: Guest books a session
*Sarah, 23, saw a latte art session shared on Instagram.*

**1. Lands on trykai.sg.** `Home.jsx` fetches all listings where `is_active = true`, renders each as a `ListingCard` showing photo, title, host name and avatar, area, price, average rating. `full_address` is not fetched at this stage.

**2. Filters by category.** Filtering is client side on the already fetched array. Category pills and the area dropdown combine. No additional database call.

**3. Opens the listing.** `ListingDetail.jsx` fetches the listing, its open sessions, the host profile, and existing reviews. Cancellation policy shown collapsed above the Book button. `full_address` still not shown.

**4. Not logged in.** Redirected to `Login.jsx`, then back to the listing after auth. On signup a row is inserted into `users` with `is_host = false`.

**5. Phone verification.** OTP required before booking, per progressive disclosure. Ask for information at the moment it is relevant, not upfront.

**6. Checkout.** Session selection updates the total. PayNow shows the discounted fee with the saving stated explicitly. Calls the `create-payment-intent` Edge Function, which validates spots remaining, calculates the platform fee, creates the payment request, and returns a redirect URL. A booking row is created with `status = 'pending'`.

**7. Payment.** The real payment webhook is not built yet, this is still the gap on the critical path. But the confirmation step it needs to call now exists and is tested: `confirm_booking(booking_id)` sets `status = 'confirmed'` and decrements `spots_remaining` atomically. The webhook, once built on Stripe, verifies the signature then calls this function. A staging only "Mark as paid" test button currently calls it manually so the downstream flow can be exercised; that button must be gated to staging or removed before real payments go live. Confirmation emails to both parties still to be wired.

**8. Confirmation.** `Dashboard.jsx` shows the booking as confirmed. Because the user now holds a confirmed booking for that session, `full_address` is returned. RLS enforces this.

**9. Session happens.** `sessions.status` moves to `completed` once `starts_at` passes. Review prompts appear for both parties. Payout releases 24 hours after `starts_at`, via `release-payout`, which is not built.

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

On confirmation: booking `status = 'cancelled'`, `cancelled_by = 'host'`, `refund_amount` set to the full `total_amount`, `host_strikes` incremented, listings deactivated if strikes reach 3, emails to both parties. The refund is calculated and stored; the actual refund call depends on the unresolved payment integration.

### Scenario 4: Guest cancels
`cancellationPolicy.js` calculates the refund. **This file currently implements the old two tier rule and must be rebuilt to the four tier structure in section 4.**

On confirmation: `status = 'cancelled'`, `cancelled_by = 'guest'`, `refund_amount` stored, `spots_remaining` incremented back, emails to both parties.

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
- No payment confirmation webhook. Bookings never leave `pending`.
- `spots_remaining` is never decremented. Sessions can be booked past capacity.
- All four Edge Functions send from Resend's shared test domain, delivering only to Caleb's address. Real users receive nothing.
- Payment provider and account model unresolved.

**Serious**
- No database schema in version control. The live database cannot be rebuilt from source.
- Platform fee hardcoded at a flat 15%.
- `full_address` is written at listing creation but never read anywhere. The reveal after confirmed booking promise does not functionally exist.
- Cancellation logic implements the superseded two tier rule.
- RLS policy review not done. Privilege escalation risks unverified.
- Review gating accepts `pending` bookings, should require `confirmed`.

**Not built, decided**
- Reschedule flow
- Host no show reporting, distinct from host initiated cancellation
- Host strike appeals
- Admin initiated cancellation
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
- Never assume a payment provider is wired in. Check current status first.
- Do not over engineer the MVP. Keep it simple and shippable.
- Do not add features that are not in DECISIONS.md without asking
