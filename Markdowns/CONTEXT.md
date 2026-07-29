# TryKai — Project Context for Cursor AI

## What is TryKai?
A peer-to-peer skill and experience marketplace built for Singapore.
The core idea: anyone with a skill can host a session and earn money.
Guests browse, discover, book and pay for experiences through the platform.

Think Airbnb Experiences but local, casual, cheap and peer-to-peer.
Examples: "Learn latte art with me — $20/person", "Boxing basics — $15/30mins", "Learn to draw — $20/person, supplies provided"

For full product, business, and legal decisions, see DECISIONS.md.
For visual identity (color, type, logo, hero copy), see DESIGN.md.
Always read DECISIONS.md and DESIGN.md alongside this file before making changes.

---

## The two types of users
1. **Hosts** — people listing a skill or experience to teach/share
2. **Guests** — people browsing and booking sessions

A single user can be both a host and a guest (unified accounts, no separate logins).

---

## Tech stack
- **Frontend:** React (Vite)
- **Routing:** React Router v6
- **Backend/DB:** Supabase (Postgres + Auth + Storage)
- **Payments:** HitPay (Singapore-optimised, low PayNow fees, MAS-licensed) — replacing Stripe. See DECISIONS.md for full fee structure and integration status.
- **Email:** Resend (transactional emails — booking notifications, verification status)
- **Styling:** Navy + cream palette with sparing coral/terracotta accent; Bricolage Grotesque (display), Manrope (body/UI), monospace (prices/tags). Full spec in DESIGN.md. No heavy UI libraries.

---

## File structure
```
src/
├── lib/
│   └── supabase.js        # Supabase client init
├── pages/
│   ├── Home.jsx           # Browse listings, category + area filters
│   ├── Login.jsx          # Auth (login + signup)
│   ├── ListingDetail.jsx  # Single listing + booking + cancellation policy
│   ├── CreateListing.jsx  # Host creates a listing (requires verification)
│   ├── EditListing.jsx    # Host edits an existing listing
│   ├── VerifyIdentity.jsx # Host ID + selfie submission
│   └── Dashboard.jsx      # Host + guest listings/bookings/cancellations
├── components/
│   ├── Navbar.jsx
│   ├── ListingCard.jsx
│   └── ReviewCard.jsx
├── lib/
│   └── cancellationPolicy.js  # Shared refund calculation logic
├── App.jsx                # Routes
└── main.jsx

supabase/functions/
├── create-payment-intent/         # Booking + payment + host email notification
├── notify-verification-pending/   # Emails Caleb when a host submits verification
├── notify-verification-result/    # Emails host on approval/rejection
└── release-payout/                # KIV — host payout release, not yet wired to HitPay
```

---

## Database schema

### users
```sql
id uuid PK
full_name text
email text unique
phone text
phone_verified boolean default false
avatar_url text
is_host boolean default false
stripe_account_id text          -- legacy from Stripe; will be replaced/supplemented by a HitPay equivalent
id_photo_url text                -- private, verification-docs bucket
selfie_url text                  -- private, verification-docs bucket
verification_status text default 'unverified'  -- unverified | pending | approved | rejected
host_strikes integer default 0   -- increments on host-initiated cancellation; 3 strikes deactivates listings
created_at timestamp
```

### listings
```sql
id uuid PK
host_id uuid FK → users
title text
description text
category text
price_per_person integer  -- stored in cents e.g. $20 = 2000
max_guests integer
area text                 -- general area shown publicly e.g. "Tampines"
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
status text              -- 'open', 'full', 'completed'
payout_released_at timestamp
created_at timestamp
```

### bookings
```sql
id uuid PK
session_id uuid FK → sessions
guest_id uuid FK → users
guests_count integer default 1
total_amount integer     -- in cents
platform_fee integer     -- in cents; see DECISIONS.md for the tiered fee structure (not a flat 15%)
stripe_payment_id text    -- legacy; HitPay equivalent to be added during integration
status text              -- 'pending', 'confirmed', 'cancelled'
cancelled_by text         -- 'guest' or 'host'
cancelled_at timestamp with time zone
refund_amount integer     -- in cents; calculated per the 48hr cancellation policy in DECISIONS.md
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
role text                -- 'host' or 'guest'
created_at timestamp
```

---

## Key business rules
1. **Prices are always stored in cents** — never floats. $20 = 2000.
2. **full_address is private** — only return it when the requesting user has a confirmed booking for that session. Never expose it in browse/search queries.
3. **Platform fee is tiered, not a flat percentage** — see DECISIONS.md "Payment model" section for the full current structure (peer vs. business hosts, PayNow discount, $2 floor, new-host fee waiver). Do not assume 15% flat.
4. **Payout timing** — host receives funds 24 hours after session starts_at passes. Currently being migrated from Stripe Connect to HitPay's marketplace/split payment API — see DECISIONS.md for integration status.
5. **Reviews are gated** — a user can only leave a review if they have a confirmed booking for that session. One review per booking per direction (guest reviews host, host reviews guest).
6. **spots_remaining** — must be decremented on confirmed booking and incremented on cancellation. Never allow booking if spots_remaining = 0.
7. **is_host flag** — set to true on users table when a user successfully creates their first listing.
8. **Hosts must be verification_status = 'approved'** before they can create or have active listings. Unverified/rejected hosts are redirected to VerifyIdentity.jsx; pending hosts see an under-review message.
9. **Cancellation policy (updated 29 July 2026, supersedes the old 2-tier rule)** — guest cancels 48hrs+ before session: full refund including platform fee. Guest cancels 24 to 48hrs before: 50% of lesson fee refunded, platform fee forfeited. Guest cancels 6 to 24hrs before: 25% of lesson fee refunded, platform fee forfeited. Guest cancels under 6hrs, or no-show: no refund. Host cancels any time: full guest refund including platform fee, host gets 1 strike. Host no-show: full guest refund including platform fee plus possible discretionary compensation, host gets 2 strikes immediately and account is reviewed. 3 strikes deactivates the host's listing(s). Full logic, including reschedule and appeal flows, is at /cancellation-policy — do not assume the old 2-tier rule anywhere in the code. Refund amounts are calculated and stored now; actual refund API calls are deferred until the HitPay integration is complete (see DECISIONS.md).

---

## Auth flow (Supabase Auth)
- Use Supabase's built-in auth (email + password for MVP)
- On signup, create a row in the users table with the auth user's id
- Use Supabase RLS (Row Level Security) to protect data
- Store session in Supabase's default session handling — no manual JWT management needed

---

## Payment flow (HitPay — in progress)
TryKai is migrating from Stripe to HitPay. See DECISIONS.md for the full rationale (PayNow fees are dramatically lower than Stripe's for Singapore's low-value transactions) and current status (business registered, Corppass set up, HitPay business verification completed, bank payout account linked).

Target flow once integration is complete:
1. Guest selects a session and clicks Book
2. Frontend calls a Supabase Edge Function to create a HitPay payment request
3. Guest pays via card, PayNow, or GrabPay — PayNow shown with a discount reflecting TryKai's lower processing cost
4. HitPay holds funds via its marketplace/split payment API
5. 24hrs after the session, the host's share is released per the fee structure in DECISIONS.md
6. TryKai's platform fee is retained automatically

The current live implementation (`create-payment-intent` Edge Function) still uses Stripe — this is the next major build item, not yet done. Do not assume HitPay is wired into the codebase yet; check with Caleb before building against it.

---

## Pages and what they do

### Home.jsx
- Browse all active listings
- Category filter pills (All / Food / Fitness / Arts / Music / Language / Other) and area filter dropdown, combinable
- Each listing shown as a ListingCard
- No auth required to browse

### Login.jsx
- Email + password login and signup
- On success, redirect to Home or intended page
- On signup, insert row into users table

### ListingDetail.jsx
- Show full listing info, photo gallery, host profile + average rating
- Show available sessions with dates/times/spots
- Collapsible cancellation policy section above the Book button
- Book button → triggers payment flow
- Show reviews from past guests
- Only show full_address after confirmed booking

### CreateListing.jsx
- Auth required (redirect to login if not)
- Checks verification_status first: unverified/rejected → redirect to VerifyIdentity.jsx; pending → block form with under-review message; approved → form works
- Form: title, description, category, price, max_guests, area, full_address, photo upload (Supabase storage), whats_provided checkboxes
- On submit: insert into listings, then add first session date
- Set is_host = true on users table

### EditListing.jsx
- Auth required; loads existing listing where host_id = current user
- Pre-fills all fields including existing photos (can add/remove)
- Updates the listing row on save

### VerifyIdentity.jsx
- Auth required
- Two uploads: NRIC/passport photo, live selfie — both go to the private `verification-docs` storage bucket
- On submit: sets id_photo_url, selfie_url, verification_status = 'pending'
- Pending and already-submitted users see an under-review message instead of the form again

### Dashboard.jsx
- Auth required
- Host view: their listings (with Add Session and Edit buttons), upcoming hosted sessions with a Cancel option (shows strike warning)
- Guest view: upcoming/past bookings, Cancel booking option (shows calculated refund), leave reviews after sessions

---

## Component notes

### ListingCard.jsx
- Shows: photo, title, host name + avatar, area, price per person, average rating
- Clicking navigates to ListingDetail

### Navbar.jsx
- Logo "TryKai" on left, links to Home
- If logged out: Login button
- If logged in: Create listing button, Dashboard link, avatar circle with initial and a logout dropdown

### ReviewCard.jsx
- Shows: reviewer avatar, name, rating (stars), comment, date

---

## Visual identity (see DESIGN.md for full detail)
- **Palette:** cream (#F4F1EA) background, deep navy (#16264B) primary text/UI, coral/terracotta accent used sparingly and functionally (e.g. PayNow savings badge) — not as a general highlight
- **Typography:** Bricolage Grotesque for display/headlines/listing titles; Manrope for body/UI (buttons, filters, nav, dashboard); a monospace face (Space Mono / JetBrains Mono) for prices and area/location tags specifically
- **Hero copy (Home.jsx):** Headline "Singapore's not boring. You just haven't found your thing yet." Subhead "Solo, with friends, or on a date — something better than scrolling for the tenth time." Single primary CTA: "Browse skills." No secondary "Become a host" CTA on the public hero (that's a post-session email nudge instead, per DESIGN.md).
- Do not introduce a second color system or swap fonts for any future "Build a Skill" section — DESIGN.md explicitly keeps one type system and palette across the whole product, with restraint (spacing, density, reduced accent) doing the work of differentiating sections.

---

## Things to avoid
- Never expose full_address in any public query
- Never store prices as floats — always integers in cents
- Never let a user review without a confirmed booking
- Never assume a flat 15% platform fee — check DECISIONS.md for the current tiered structure
- Never assume HitPay is already integrated — check current status with Caleb first
- Don't over-engineer MVP — keep it simple and shippable
- Don't add features not listed here without checking DECISIONS.md and asking first

---

## MVP definition — what done looks like
See DECISIONS.md "What done looks like (MVP)" for the authoritative, up-to-date checklist — it is updated more frequently than this file's summary below.

1. ✅ User can sign up and log in
2. ✅ Host can create a listing with photos, and edit it later
3. ✅ Host can add sessions with dates and spots
4. ✅ Guest can browse (with filters) and view listing detail
5. ✅ Guest can book and pay for a session (currently via Stripe; HitPay migration pending)
6. ✅ Both sides can leave a review after the session
7. ✅ Host identity verification, with email notifications throughout
8. 🔄 Cancellation policy — UI and database logic need rebuilding to the new 4-tier structure decided 29 July 2026 (previously built for the old 2-tier rule); refund API still pending HitPay regardless
9. ⬜ HitPay payment integration (replacing Stripe)
10. ⬜ Host T&C accepted in-app (layered acceptance flow)
11. ⬜ Deploy to Vercel + point trykai.sg at it

That's it. Everything else is v2.
