# TryKai — User Scenarios & End-to-End Flows
*Created for Ruiheng's codebase onboarding. Reference this alongside the actual code to understand what each component is doing and why.*

---

## HOW TO USE THIS DOCUMENT

Each scenario below describes a complete user journey from the user's perspective, then maps it to the specific files, database tables, and functions involved. When you're reading a file and wondering "what is this actually for," find the relevant scenario here and it'll give you the context.

---

## SCENARIO 1 — Guest Books a Session

**Who:** Sarah, 23, university student. Never used TryKai before.

**Goal:** Book a latte art session she saw shared on Instagram.

---

### Step 1: Sarah visits trykai.sg for the first time

**What she sees:** The Home page — a hero section with headline and browse CTA, then a grid of listing cards below.

**What's happening in code:**
- `src/pages/Home.jsx` renders the page
- On mount, it fetches all listings where `is_active = true` from Supabase `listings` table
- Each listing is rendered as a `ListingCard` component (`src/components/ListingCard.jsx`)
- ListingCard shows: photo, title, host name + avatar, area, price per person, average rating
- **Note:** `full_address` is NOT fetched at this stage — only general area (e.g. "Tiong Bahru")

**Database involved:** `listings`, `users` (for host name/avatar), `reviews` (for average rating calculation)

---

### Step 2: Sarah filters by category

**What she does:** Clicks the "Food" category pill.

**What's happening in code:**
- Category filter pills are rendered in `Home.jsx`
- Filtering is client-side — all listings are already fetched, the pill just filters the in-memory array
- Area dropdown works the same way — both filters combine (e.g. Food + Tiong Bahru)
- No additional database call is made when filtering

---

### Step 3: Sarah clicks on the latte art listing

**What she sees:** The ListingDetail page — full photos, description, host info, available sessions, reviews, cancellation policy, and a Book button.

**What's happening in code:**
- `src/pages/ListingDetail.jsx` renders the page
- Fetches the specific listing by ID from `listings` table
- Fetches available sessions from `sessions` table where `listing_id` matches and `status = 'open'`
- Fetches host profile from `users` table (name, avatar, average rating)
- Fetches existing reviews from `reviews` table for this listing
- **Critical:** `full_address` is still NOT shown — only area. Full address only revealed after confirmed booking (see Step 7)
- Cancellation policy section is shown collapsed above the Book button

---

### Step 4: Sarah tries to book but isn't logged in

**What happens:** She clicks Book. She's not logged in. She gets redirected to the Login page.

**What's happening in code:**
- `src/pages/Login.jsx` handles both login and signup
- Supabase Auth handles the session — no manual JWT management
- After successful login/signup, she's redirected back to the listing she was trying to book
- On signup: a new row is inserted into `users` table with her auth user ID, name, and email

---

### Step 5: Sarah signs up and completes her profile

**What's happening in code:**
- Supabase Auth creates the auth user
- A trigger or manual insert creates a corresponding row in `users` table
- `is_host` defaults to `false` — she's a guest
- `verification_status` is irrelevant for guests — only hosts need verification
- Phone OTP verification is required before booking (progressive disclosure)

---

### Step 6: Sarah selects a session and proceeds to checkout

**What she sees:** Session options (date, time, spots remaining), guest count selector, price breakdown, PayNow vs card option, cancellation policy acknowledgment checkbox.

**What's happening in code:**
- Session selection updates the total price display (`price_per_person × guests_count`)
- PayNow option shows discounted fee (8% vs 10%) — the difference is shown explicitly ("Save $0.80")
- Checkout calls a Supabase Edge Function: `create-payment-intent`
- The Edge Function:
  1. Validates the session still has spots remaining
  2. Calculates the platform fee (10% or 8% if PayNow, minimum $2 floor)
  3. Creates a HitPay payment request
  4. Returns a redirect URL to the HitPay payment page
- Sarah is redirected to HitPay's hosted payment page

**Database involved:** `sessions` (check spots_remaining > 0), `bookings` (new row created with status = 'pending')
**Edge Function:** `supabase/functions/create-payment-intent/`

---

### Step 7: Sarah completes payment on HitPay

**What happens:** Sarah pays via PayNow on HitPay's page. HitPay sends a webhook back to TryKai confirming payment.

**What's happening in code:**
- HitPay webhook hits a TryKai endpoint
- On confirmed payment:
  - Booking status updated from `pending` to `confirmed`
  - `spots_remaining` decremented by `guests_count` on the session
  - Booking confirmation email sent to Sarah (via Resend)
  - Booking notification email sent to the host (via Resend)
- If payment fails: booking stays `pending` or is marked `cancelled`, no spots decremented

**Database involved:** `bookings` (status → confirmed), `sessions` (spots_remaining decremented)
**Edge Function:** `create-payment-intent` handles the webhook response

---

### Step 8: Sarah receives confirmation and sees full address

**What she sees:** Booking confirmation email with session details. In her dashboard, the booking shows as confirmed — and now the full address of the session is visible.

**What's happening in code:**
- `src/pages/Dashboard.jsx` renders her guest view
- When fetching bookings, it checks: does this user have a `confirmed` booking for this session?
- If yes: `full_address` is returned from `listings` table
- If no: `full_address` is never included in the response (RLS enforces this)
- This is the ONLY place `full_address` is ever shown to a guest

**Database involved:** `bookings`, `listings`, `sessions`

---

### Step 9: The session happens

Sarah attends the latte art session. The host marks it complete (or it auto-completes when `sessions.starts_at` passes).

**What's happening in code:**
- Session `status` updates to `completed` once `starts_at` passes
- A review prompt becomes available to Sarah in her dashboard (the Leave Review button appears)
- A review prompt becomes available to the host in their dashboard
- Payout release logic: 24hrs after `starts_at`, the host's share is released via HitPay marketplace API (this is the `release-payout` Edge Function — currently KIV, not yet wired to HitPay)

---

### Step 10: Sarah leaves a review

**What she does:** Goes to dashboard, clicks "Leave a Review" on the completed booking, gives 5 stars and a comment.

**What's happening in code:**
- Review is only allowed if: `bookings.status = 'confirmed'` AND session `starts_at` has passed AND no existing review from this reviewer for this booking
- New row inserted into `reviews` table: `reviewer_id = Sarah`, `reviewee_id = host`, `role = 'guest'`, `rating`, `comment`, `booking_id`
- Host's average rating recalculated and shown on their listings

**Database involved:** `reviews`, `bookings` (gate check), `users` (host average rating update)

---

## SCENARIO 2 — Host Creates a Listing

**Who:** Martin, 27. Wants to offer cocktail mixology sessions on TryKai.

**Goal:** Get a verified listing live on the platform.

---

### Step 1: Martin signs up

Same as guest signup — creates account, row inserted in `users` table, `is_host = false` initially.

---

### Step 2: Martin tries to create a listing

**What happens:** He clicks "Create Listing" in the navbar. He's redirected to `VerifyIdentity.jsx` — not the listing form — because `verification_status = 'unverified'`.

**What's happening in code:**
- `src/pages/CreateListing.jsx` checks `verification_status` on mount
- `unverified` or `rejected` → redirect to `/verify`
- `pending` → show "your verification is under review" message, block the form
- `approved` → show the listing creation form

---

### Step 3: Martin submits verification

**What he does:** Uploads NRIC photo and a live selfie.

**What's happening in code:**
- Both files uploaded to Supabase Storage, private `verification-docs` bucket (not publicly accessible)
- `users` table updated: `id_photo_url`, `selfie_url`, `verification_status = 'pending'`
- Database webhook fires: triggers `notify-verification-pending` Edge Function
- Caleb receives an email: "New host verification submitted — Martin"
- Martin sees: "Your verification is under review. We'll email you within 24hrs."

**Storage:** `verification-docs` bucket (private)
**Edge Function:** `supabase/functions/notify-verification-pending/`

---

### Step 4: Caleb reviews and approves

**What Caleb does:** Opens Supabase dashboard, navigates to Storage → verification-docs, views Martin's NRIC photo and selfie, confirms they match, updates `verification_status = 'approved'` in the Table Editor.

**What's happening in code:**
- Database webhook fires on the `users` table update
- Triggers `notify-verification-result` Edge Function
- Martin receives email: "You're verified! You can now create your listing."

**Edge Function:** `supabase/functions/notify-verification-result/`

---

### Step 5: Martin creates his listing

**What he fills in:**
- Title: "Learn cocktail mixology — make 3 classic drinks"
- Description: what guests will learn, what to expect, his experience
- Category: Food
- Price per person: $35 (stored as 3500 in database — always cents, never floats)
- Max guests: 4
- Area: "Tiong Bahru" (shown publicly)
- Full address: his actual address (private — only shown after confirmed booking)
- Photos: up to 5 (uploaded to Supabase Storage, public listings bucket)
- What's provided: checkboxes (ingredients, equipment, recipe card, etc.)

**What's happening in code:**
- `src/pages/CreateListing.jsx` handles the form
- On submit: new row inserted into `listings` table
- `host_id` set to Martin's user ID
- `is_active = true` by default
- `is_host` flag on Martin's `users` row updated to `true`
- Martin redirected to add his first session

**Database:** `listings`, `users` (is_host → true)
**Storage:** listings photos bucket (public)

---

### Step 6: Martin adds a session

**What he fills in:** Date, time, duration, number of spots.

**What's happening in code:**
- New row inserted into `sessions` table
- `listing_id` linked to Martin's listing
- `spots_total` and `spots_remaining` both set to the number he enters
- `status = 'open'`
- Session now appears on his listing detail page for guests to book

**Database:** `sessions`

---

### Step 7: Martin receives a booking

When Sarah books his session (Scenario 1), Martin receives an email notification with Sarah's name, session date/time, and guest count. His dashboard shows the upcoming booking.

---

### Step 8: Martin edits his listing

**What he does:** Goes to dashboard, clicks Edit on his listing, changes the price or updates photos.

**What's happening in code:**
- `src/pages/EditListing.jsx` loads the existing listing data
- Checks `host_id = current user` before allowing edits (security check)
- On save: updates the `listings` row
- Existing photos can be removed or added (up to 5 total)

---

## SCENARIO 3 — Host Cancels a Session

**Who:** Martin needs to cancel a session because of an emergency.

---

### Step 1: Martin cancels from dashboard

**What happens:** He clicks Cancel on the session. A warning appears: "Cancelling will result in a strike against your host account. 3 strikes deactivates your listings. All guests will receive a full refund."

**What's happening in code:**
- On confirmation:
  - Booking `status` → `cancelled`, `cancelled_by = 'host'`
  - `refund_amount` set to full `total_amount` (host cancellation = always full refund)
  - `host_strikes` on Martin's `users` row incremented by 1
  - If `host_strikes` reaches 3: all Martin's listings set to `is_active = false`
  - Cancellation email sent to Sarah
  - Cancellation email sent to Martin
  - Actual refund API call: deferred until HitPay integration is complete — refund amount is stored, not yet executed automatically

**Database:** `bookings` (status, cancelled_by, refund_amount), `users` (host_strikes), `listings` (is_active if 3 strikes)

---

## SCENARIO 4 — Guest Cancels a Booking

**Who:** Sarah can no longer attend the session she booked.

---

### Step 1: Sarah cancels from dashboard

**What happens:** She clicks Cancel on her booking. The system calculates her refund based on how far in advance she's cancelling.

**What's happening in code:**
- `src/lib/cancellationPolicy.js` contains the shared refund calculation logic
- Rule: 48hrs+ before session → full refund. Under 48hrs → 50% refund.
- Calculation: `now` vs `session.starts_at` — if difference > 48hrs, `refund_amount = total_amount`, else `refund_amount = total_amount * 0.5`
- On confirmation:
  - Booking `status` → `cancelled`, `cancelled_by = 'guest'`
  - `refund_amount` stored in `bookings` table
  - `spots_remaining` incremented back on the session
  - Cancellation emails sent to both parties
  - Actual refund API call: deferred until HitPay integration is complete

**Database:** `bookings`, `sessions` (spots_remaining incremented)
**Shared logic:** `src/lib/cancellationPolicy.js`

---

## SCENARIO 5 — New Host Verification (Rejected)

**Who:** An unverified person uploads a blurry photo that doesn't match their selfie.

---

### What happens:
- Caleb reviews in Supabase dashboard — photos don't match or are unclear
- Updates `verification_status = 'rejected'`
- Database webhook fires → `notify-verification-result` Edge Function
- Host receives email: "We couldn't verify your identity. Please resubmit with a clearer photo."
- Host can resubmit — the form is available again on `VerifyIdentity.jsx` for rejected users
- Previous rejected documents: scheduled for deletion after 30 days (auto-deletion Edge Function — not yet built, flagged in open items)

---

## KEY RULES TO NEVER VIOLATE
*(These are enforced in code — if you ever change logic around these, flag Caleb first)*

1. **Prices are always stored in cents (integers).** $20 = 2000. Never floats. Never dollars in the database.
2. **`full_address` is never exposed in public queries.** Only returned when the requesting user has a confirmed booking for that session.
3. **Reviews are gated.** A user can only review if they have a `confirmed` booking for that session. One review per booking per direction.
4. **`spots_remaining` must never go below 0.** Always check before allowing a booking. Decrement on confirmed booking, increment on cancellation.
5. **Only approved hosts can have active listings.** `verification_status = 'approved'` is the gate. No exceptions.
6. **Platform fee is tiered, not a flat 15%.** Check DECISIONS.md for the current structure. Do not hardcode a percentage without checking.

---

## FILE MAP — WHERE TO FIND THINGS

| What you're looking for | Where it is |
|---|---|
| Browse page + filters | `src/pages/Home.jsx` |
| Listing detail + booking | `src/pages/ListingDetail.jsx` |
| Login + signup | `src/pages/Login.jsx` |
| Create listing form | `src/pages/CreateListing.jsx` |
| Edit listing | `src/pages/EditListing.jsx` |
| Host verification upload | `src/pages/VerifyIdentity.jsx` |
| Host + guest dashboard | `src/pages/Dashboard.jsx` |
| Navbar | `src/components/Navbar.jsx` |
| Listing card component | `src/components/ListingCard.jsx` |
| Review card component | `src/components/ReviewCard.jsx` |
| Cancellation policy logic | `src/lib/cancellationPolicy.js` |
| Supabase client | `src/lib/supabase.js` |
| Routes | `src/App.jsx` |
| Payment + booking creation | `supabase/functions/create-payment-intent/` |
| Verification pending email | `supabase/functions/notify-verification-pending/` |
| Verification result email | `supabase/functions/notify-verification-result/` |
| Host payout release (KIV) | `supabase/functions/release-payout/` |
