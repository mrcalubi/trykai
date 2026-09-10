# TryKai: Build Backlog

Derived by walking every end to end flow the platform promises and marking where it breaks today. Ordered by what blocks launch, then by risk.

**Prepared 16 August 2026. Status rewritten 31 August 2026 against the current tree.** Companion to ENGINEERING.md, which describes how things work. This describes what to build next and why.

---

## How this is prioritised

Three questions, in order:

1. **Does soft launch fail without it?** If a warm contact books a session and something in this list is missing, does that booking break, or does TryKai break a published promise?
2. **Is the payment loop in the way?** Stripe Connect is in the repo (P1.1–P1.4, Connect onboarding, Transfer job). Remaining payment work is ops and secrets, not a second provider decision. Do not adapt the HitPay stash.
3. **What does it cost if we get it wrong?** Money and safety rank above convenience.

**P0** blocks launch and is still open, or is done and kept here so it is not rebuilt.
**P1** was the payment build. It is done in code.
**P2** is needed at launch, lower consequence if it slips.
**P3** is post launch.

Ruiheng's capacity is 8 hours a week. The remaining P0 list is sized against that, not against an ideal.

---

## Two findings, updated

### 1. Host payout details — obsolete under Express

The 16 August finding was that `users` had no PayNow or bank fields, which would have blocked manual disbursement. Stripe Connect Express collects those details at onboarding. `stripe_account_id` is the payout handle. Do not add manual payout columns.

What is still true: a host cannot be paid until they finish Connect onboarding (`stripe_payouts_enabled`). Book is disabled until then. Creating a listing is allowed.

### 2. There is still no admin interface

Every operational promise still depends on Caleb performing a manual action. Some of the "nothing exists" rows from 16 August now have an Edge Function behind them, still with no UI.

| Promise | How it happens today |
|---|---|
| Hosts verified before listings go live | `/admin/verifications`, gated by `is_admin`. The listing and session insert policies now require `approved` and not suspended (`00007`), so this is enforced by the database rather than by CreateListing.jsx. |
| Hosts paid 24 hours after their session | `release-payout` (cron + secret). Needs scheduling and platform payouts set to manual. |
| Refunds issued per the cancellation policy | `cancel-booking` from the dashboard. No cancellation emails. |
| TryKai can cancel a booking | `admin-cancel-booking` with `ADMIN_FUNCTION_SECRET`. No admin UI. Writes `cancelled_by: 'host'`. |
| Credible safety reports trigger immediate suspension | Table Editor sets `is_suspended`. **The app does not read that flag.** Listings stay visible unless someone also sets `is_active = false`. |
| Quality disputes resolved within 2 business days | Email, then nothing |

Verification approval is now on the platform. Suspension that does not hide listings is the remaining operational hole, and it is the dangerous one under the published dispute policy.

---

## Remaining sequence

Not a calendar. Capacity is 8 hours a week.

1. **Ops (not app code):** apply `00005` on staging, Stripe Dashboard webhook + secrets, platform payouts **manual**, flag eleven `is_founding_host`, one staging test-mode booking.
2. **P0.8** real Resend domain, same week as a secret on the unauthenticated notify-verification functions.
3. **P0.4** app actually filters `is_suspended` (hide listings, block booking, block login or host actions). One-click admin can wait if Table Editor plus this filter is reliable.
4. **Revoke `listings.full_address`** from anon/authenticated SELECT. Public pages already omit the column; the grant is the remaining leak.
5. **Missing assets:** category PNGs imported by StyleGuide (can fail `vite build` because `App.jsx` always imports that page); `/trykai.png` referenced by Navbar and not present in `public/`.
6. Wire the UI kit (Home first) to the browse decisions in DESIGN.md.
7. **P2.3** review gating, then the rest of P2 in listed order.

---

## P0: blocks launch

> **Status, 31 August 2026.** Payment loop is in code (P1.1–P1.4, Connect onboarding, Transfer job). Done earlier: P0.5, P0.6, guest address reveal path of P0.7. Obsolete: P0.1. Not needed for Connect launch: P0.2 copy-paste payout queue. Still open: P0.3, P0.4 enforcement, P0.8, `full_address` column grant, missing StyleGuide/logo assets.

### P0.1 — Host payout details — OBSOLETE
Under Stripe Connect Express, Stripe collects the host's bank details. Do not add `payout_method` / `payout_identifier` columns.

### P0.2 — Admin: payout queue — NOT NEEDED FOR CONNECT LAUNCH
The copy-paste PayNow queue assumed manual disbursement. `release-payout` Transfers 24h after `starts_at`. Keep a later exception log in mind for clawback and disputes; do not build the clipboard UI for launch.

### P0.3 — Admin: verification review — DONE
**Flow:** host submits ID and selfie → Caleb reviews → approve or reject

`/admin/verifications`, gated by `is_admin`, lists pending submissions oldest first with the ID photo and selfie side by side. Approve, or reject with a reason that is emailed to the host and shown to them on `/verify-identity` when they resubmit. `admin-verifications` authenticates the reviewer's own JWT and re-checks `is_admin` server-side; the images are served through signed URLs minted with the service role, so they are never reachable from a public or authenticated non-admin route. `review_verification` writes every decision alongside a `verification_reviews` audit row.

Still manual in the Table Editor: granting `is_admin`, which is a one-time action, and `is_founding_host`.

### P0.4 — Admin: account suspension — FIELDS EXIST, APP DOES NOT ENFORCE
**Flow:** credible safety report → account suspended immediately, pending review
**Today:** `is_suspended`, `suspended_at`, `suspension_reason` exist. Nothing in `src/` queries them. Home still shows `is_active` listings. ListingDetail still books them. SAFETY_RESPONSE_PROTOCOL.md tells Caleb to verify by hand that listings are deactivated.

Still to build:
- Queries and Book path respect `is_suspended` (hide listings, block new bookings, stop host tools)
- Independent of `host_strikes`, per the published dispute policy
- Reason recorded, reversible, timestamped (already true at the column level)
- One-click admin button can follow; the filter is the launch-blocking piece

### P0.5 — Cancellation logic rebuilt to four tiers — DONE
`calculateGuestRefund` implements 100 / 50 / 25 / 0 at 48, 24, and 6 hours, platform fee forfeited on partial tiers. `cancel-booking` issues the Stripe refund. Spot restore only for confirmed rows. **Emails are not sent** (see P0.8 / P2).

### P0.6 — Spots decrement, atomically — DONE
`confirm_paid_booking` decrements `spots_remaining` by `guests_count` under a row lock in the same operation that flips the booking to confirmed. CHECK constraint `spots_remaining >= 0`. Stripe webhook is the caller. Guest-callable `confirm_booking` from `00002` was dropped; the wrapper in `00005` is service_role only.

### P0.7 — Full address reveal — GUEST PATH DONE, GRANT STILL OPEN
**Done:** `get_listing_address(listing_id)` returns `full_address` only to a guest with a confirmed booking. ListingDetail and the guest dashboard call it. Public selects omit the column. Hosts read `full_address` via listings SELECT (the RPC does not return it to the owning host).

**Not done:** `00001` still `GRANT ALL` on `listings` to anon and authenticated. A crafted query on an active listing can read `full_address`. Revoke the column (or all direct SELECT of it) so the RPC is the only guest path.

### P0.8 — Real email delivery — OPEN
**Flow:** anything happens → the relevant person is told
**Today:** from-address is `TryKai <onboarding@resend.dev>` in `_shared/email.ts` and both notify-verification functions. Delivers only to Caleb.

Verify trykai.sg in Resend and switch every sender. **Ship a shared-secret header on `notify-verification-pending` and `notify-verification-result` in the same week**, not after. Those two functions have no secret check today. `release-payout` and `admin-cancel-booking` already require a secret; `stripe-webhook` verifies `Stripe-Signature`.

Also still missing: cancellation emails (policy promises the refund amount in the email). Booking confirmation emails already go out from `stripe-webhook` once Resend can deliver.

### P0.9 — Build assets that CI and chrome depend on — OPEN
`StyleGuide.jsx` unconditionally imports `src/assets/categories/food.png`, `fitness.png`, and `arts.png`. Those files are not in the repo. `App.jsx` always imports StyleGuide, so `vite build` can fail. Navbar and TopNav request `/trykai.png`; `public/` only has `favicon.svg`. Fix the imports or add the files before treating CI as green.

---

## P1: the payment build — DONE IN CODE, 27–31 August 2026

Stripe Connect (separate charges and transfers, Express) is implemented. Do not adapt `hitpay-wip-2026-08`. Remaining work is ops: apply `00005`, Stripe Dashboard webhook + secrets, platform payouts manual, founding-host flags, staging test-mode booking.

### P1.1 — Payment confirmation webhook — DONE
`supabase/functions/stripe-webhook` verifies `Stripe-Signature`, calls `confirm_paid_booking`, emails both parties, refunds on oversell, cancels pending on failed/canceled intents, syncs `stripe_payouts_enabled` from `account.updated`.

### P1.2 — Fee calculation — DONE
`calculateGuestCharge` in `_shared/booking.ts`: 12% + S$2.50 floor, round up to a whole dollar, PayNow 5% off that total. Browse and listing show the card all-in price. Host fee 10% from the fourth confirmed booking; founding hosts never.

### P1.3 — Refund execution — DONE
`cancel-booking` (JWT) issues Stripe refunds, restores spots for confirmed rows only, and applies host strikes server-side.

### P1.4 — Admin: issue refund and cancel a booking — SMALLEST PATH DONE
`admin-cancel-booking` accepts `x-admin-secret` / `ADMIN_FUNCTION_SECRET` and fully refunds. No admin UI.

Connect onboarding (`create-connect-account`, `create-account-link`) and the hourly Transfer job (`release-payout`) shipped with this build.

---

## P2: needed at launch, lower consequence

### P2.1 — Host no show reporting
**Flow:** host does not turn up → guest reports it → 2 strikes, account review, full refund
**Today:** no path exists. The only cancellation flow is host initiated.

### P2.2 — Reschedule
Once per booking, same 48 hour cutoff. Published as available. Recovers bookings that would otherwise be cancelled outright.

### P2.3 — Review gating tightened
Dashboard `canLeaveReview` still allows `pending` or `confirmed` after `starts_at`. RLS insert only checks that the reviewer is the guest on some booking for that id, not that it is confirmed. Should require `confirmed` and a session that has actually happened.

### P2.4 — Host to guest reviews
Two way reviews are promised. Insert policy is guest-only. No host UI.

### P2.5 — Session auto complete
`sessions.status` documents `'completed'`. Nothing ever writes it. Payouts key off `starts_at` + 24h, not this status, so launch can survive without it. Reviews and dispute windows were supposed to key off it.

### P2.6 — Host strike appeals
Within 7 days, reviewed manually. Needs a submission form and an admin view.

### P2.7 — Admin: dispute log
Disputes arrive by email today. At launch volume that is survivable.

### P2.8 — Wire the UI kit and decided browse
**Mostly done, 9 September 2026.** TopNav and HamburgerMenu are the live chrome, and Home is the decided browse: no hero, 2 / 3 / 4 columns, square images, badge on a cream pill, two-line title clamp, one meta line with the all-in price. Left over: the rating on the browse card needs the listings fetch to supply one (no aggregate rating column exists yet), Button and Input are still `/style-guide` only, and `ListingCard.jsx` plus its `.listing-card` CSS are dead code waiting on a deletion pass.

### P2.9 — Checkout and legal gaps visible in the app
- `guests_count` hardcoded to 1 in ListingDetail
- No catch-all 404
- No T&C checkboxes at signup, create listing, or checkout
- No password reset
- No photography guidance on CreateListing
- No sort UI (DECISIONS.md listed newest / price / most reviewed as live; only newest exists)
- Phone OTP before booking: not built

---

## P3: post launch

Identity and social layer, Date Mode, credit bundles, multi session courses, group discounts, "this weekend" filter, search, in app notifications, listing performance nudges, listing video, host Pro subscription, automated ID verification, auto deletion of rejected verification documents, payout clawback.

All specified in DECISIONS.md. None of it should be touched before launch, regardless of how much runway appears to be left.

---

## Flows that are complete and should not be refactored for fun

Working today, and stable enough. Do not rewrite them before launch unless you are closing a P0/P2 item above.

- Guest browses and filters listings (the fetch and the filter memos survived the P2.8 grid rebuild untouched; keep it that way)
- Guest views listing detail and pays (guest-count picker is additive)
- Signup and login (profile row is the `handle_new_user` trigger)
- Host verification submission (client UPDATE + guard trigger)
- Host creates a listing (session is a follow-up dashboard action)
- Host adds a session
- Host edits a listing
- Host cancels a session, including the strike increment via `cancel-booking`
- Dashboard, both views, including Connect payout setup
- Guest cancel with Stripe refund
