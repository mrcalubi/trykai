# TryKai: Build Backlog

Derived by walking every end to end flow the platform promises and marking where it breaks today. Ordered by what blocks launch, then by risk.

**Prepared 16 August 2026. Status rewritten 21 September 2026 against the current tree.** Companion to ENGINEERING.md, which describes how things work. This describes what to build next and why.

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
| Hosts verified before listings go live | `/admin/verifications`, gated by `is_admin`. Listing and session INSERT require `can_create_listing()` (`00008`). Browse still does not filter `is_suspended`. |
| Hosts paid 24 hours after their session | `release-payout`, scheduled hourly (`00010` pg_cron + GitHub Action). Vault/GitHub secrets and platform payouts **manual** are still ops. |
| Refunds issued per the cancellation policy | `cancel-booking` from `/bookings` and `/hosting`. Guest is emailed the refund amount (including $0); host is emailed only on a guest cancel. |
| TryKai can cancel a booking | `admin-cancel-booking` with `ADMIN_FUNCTION_SECRET`. No admin UI. Writes `cancelled_by: 'host'`. |
| Credible safety reports trigger immediate suspension | Table Editor sets `is_suspended`. **The app does not read that flag.** Listings stay visible unless someone also sets `is_active = false`. |
| Quality disputes resolved within 2 business days | Email, then nothing |

Verification approval is now on the platform. Suspension that does not hide listings is the remaining operational hole, and it is the dangerous one under the published dispute policy.

---

## Remaining sequence

Not a calendar. Capacity is 8 hours a week.

1. **Ops (not app code):** confirm `00005`, `00008`, `00009`, `00010`, and `00011` on each environment; Vault/GitHub secrets for `release-payout`; Stripe Dashboard webhook + secrets; `RESEND_API_KEY` and current Edge Function deploys on production; platform payouts **manual**; flag eleven `is_founding_host`; one staging test-mode booking; confirm the two test cancellations were refunded on Stripe.
2. **Bug 4:** Hosting treats `?connect=return` as "Payout setup submitted" without re-checking `stripe_payouts_enabled`. Money path.
3. **P0.4** app actually filters `is_suspended` on browse and Book. Listing/session INSERT is already gated by `can_create_listing()` (`00008`). One-click admin can wait if Table Editor plus this filter is reliable.
4. **Revoke `listings.full_address`** from anon/authenticated SELECT. Public pages already omit the column; the grant is the remaining leak.
5. Browse card rating: the listings fetch does not supply one and there is no aggregate rating column. The card already shows the all-in card price.
6. **P2.3** review gating is done (`00011`). Then the rest of P2 in listed order.

---

## P0: blocks launch

> **Status, 21 September 2026.** Payment loop is in code (P1.1–P1.4, Connect onboarding, Transfer job). Done earlier: P0.5, P0.6, guest address reveal path of P0.7. Obsolete: P0.1. Not needed for Connect launch: P0.2 copy-paste payout queue. Still open: P0.4 enforcement on browse/Book, `full_address` column grant. P0.3 done 10 September. P0.8 domain and cancellation emails shipped 14 September. P0.9 assets resolved 9 September. `00008` listing gate, `00009` session/booking read, `00010` `release-payout` schedule, and `00011` review gate are in the tree.

### P0.1 — Host payout details — OBSOLETE
Under Stripe Connect Express, Stripe collects the host's bank details. Do not add `payout_method` / `payout_identifier` columns.

### P0.2 — Admin: payout queue — NOT NEEDED FOR CONNECT LAUNCH
The copy-paste PayNow queue assumed manual disbursement. `release-payout` Transfers 24h after `starts_at`. Keep a later exception log in mind for clawback and disputes; do not build the clipboard UI for launch.

### P0.3 — Admin: verification review — DONE
**Flow:** host submits ID and selfie → Caleb reviews → approve or reject

`/admin/verifications`, gated by `is_admin`, lists pending submissions oldest first with the ID photo and selfie side by side. Approve, or reject with a reason that is emailed to the host and shown to them on `/verify-identity` when they resubmit. Admins reach it from the hamburger (**Verification review**) and from a card at the top of `/hosting`. `admin-verifications` authenticates the reviewer's own JWT and re-checks `is_admin` server-side; the images are served through signed URLs minted with the service role, so they are never reachable from a public or authenticated non-admin route. `review_verification` writes every decision alongside a `verification_reviews` audit row.

Still manual in the Table Editor: granting `is_admin`, which is a one-time action, and `is_founding_host`.

### P0.4 — Admin: account suspension — FIELDS EXIST, APP DOES NOT ENFORCE
**Flow:** credible safety report → account suspended immediately, pending review
**Today:** `is_suspended`, `suspended_at`, `suspension_reason` exist. Nothing in `src/` queries them. Home still shows `is_active` listings. ListingDetail still books them. Listing and session INSERT are blocked by `can_create_listing()` (`00008`). SAFETY_RESPONSE_PROTOCOL.md tells Caleb to verify by hand that listings are deactivated.

Still to build:
- Queries and Book path respect `is_suspended` (hide listings, block new bookings, stop host tools)
- Independent of `host_strikes`, per the published dispute policy
- Reason recorded, reversible, timestamped (already true at the column level)
- One-click admin button can follow; the filter is the launch-blocking piece

### P0.5 — Cancellation logic rebuilt to four tiers — DONE
`calculateGuestRefund` implements 100 / 50 / 25 / 0 at 48, 24, and 6 hours, platform fee forfeited on partial tiers. `cancel-booking` issues the Stripe refund. Spot restore only for confirmed rows. Guests are emailed the refund amount (including $0); the host is emailed only on a guest cancel.

### P0.6 — Spots decrement, atomically — DONE
`confirm_paid_booking` decrements `spots_remaining` by `guests_count` under a row lock in the same operation that flips the booking to confirmed. CHECK constraint `spots_remaining >= 0`. Stripe webhook is the caller. Guest-callable `confirm_booking` from `00002` was dropped; the wrapper in `00005` is service_role only.

### P0.7 — Full address reveal — GUEST PATH DONE, GRANT STILL OPEN
**Done:** `get_listing_address(listing_id)` returns `full_address` only to a guest with a confirmed booking. ListingDetail and `/bookings` call it. Public selects omit the column. Hosts read `full_address` via listings SELECT (the RPC does not return it to the owning host).

**Not done:** `00001` still `GRANT ALL` on `listings` to anon and authenticated. A crafted query on an active listing can read `full_address`. Revoke the column (or all direct SELECT of it) so the RPC is the only guest path.

### P0.8 — Real email delivery — DONE 14 September
**Flow:** anything happens → the relevant person is told
**Today:** from-address is `TryKai <no-reply@trykai.sg>` in `_shared/email.ts`. trykai.sg is verified in Resend.

`notify-verification-pending` requires `NOTIFY_FUNCTION_SECRET` (`x-notify-secret` or Bearer). `notify-verification-result` is gone; result emails come from `admin-verifications` and `stripe-webhook`. `release-payout` and `admin-cancel-booking` already require a secret; `stripe-webhook` verifies `Stripe-Signature`.

`cancel-booking` emails the guest the refund amount (including $0) and the host only when the guest cancelled. A Resend failure is logged and cannot fail the refund. A missing `RESEND_API_KEY` logs instead of failing silent. `admin-cancel-booking` still does not email.

### P0.9 — Build assets that CI and chrome depend on — DONE 9 September
`StyleGuide.jsx` imports `src/assets/categories/food.png`, `fitness.png`, `arts.png`, and `music.png`. Those four files are in the repo. Language/Other imports stay commented out; uncommenting either without adding the PNG fails `vite build`, because App always imports this page. `public/trykai.png` exists. `Navbar.jsx` is deleted; TopNav still requests `/trykai.png` for the brand mark.

---

## P1: the payment build — DONE IN CODE, 27–31 August 2026

Stripe Connect (separate charges and transfers, Express) is implemented. Do not adapt `hitpay-wip-2026-08`. Remaining work is ops: confirm `00005` / `00008` / `00009` / `00010` / `00011`, Vault/GitHub secrets for `release-payout`, Stripe Dashboard webhook + secrets, `RESEND_API_KEY` and function deploys on production, platform payouts manual, founding-host flags, staging test-mode booking.

### P1.1 — Payment confirmation webhook — DONE
`supabase/functions/stripe-webhook` verifies `Stripe-Signature`, calls `confirm_paid_booking`, emails both parties, refunds on oversell, cancels pending on failed/canceled intents, syncs `stripe_payouts_enabled` from `account.updated`.

### P1.2 — Fee calculation — DONE
`calculateGuestCharge` in `_shared/booking.ts`: 12% + S$2.50 floor, round up to a whole dollar, PayNow 5% off that total. Browse and listing show the card all-in price. Host fee 10% from the fourth confirmed booking; founding hosts never.

### P1.3 — Refund execution — DONE
`cancel-booking` (JWT) issues Stripe refunds, restores spots for confirmed rows only, and applies host strikes server-side.

### P1.4 — Admin: issue refund and cancel a booking — SMALLEST PATH DONE
`admin-cancel-booking` accepts `x-admin-secret` / `ADMIN_FUNCTION_SECRET` and fully refunds. No admin UI.

Connect onboarding (`create-connect-account`, `create-account-link`) and the hourly Transfer job (`release-payout`) shipped with this build. Scheduling is `00010` (pg_cron) plus `.github/workflows/release-payout.yml` (fires from `main`). Until those run, Stripe logs have no `tr_` Transfers.

---

## P2: needed at launch, lower consequence

### P2.1 — Host no show reporting
**Flow:** host does not turn up → guest reports it → 2 strikes, account review, full refund
**Today:** no path exists. The only cancellation flow is host initiated.

### P2.2 — Reschedule
Once per booking, same 48 hour cutoff. Published as available. Recovers bookings that would otherwise be cancelled outright.

### P2.3 — Review gating tightened
**Done.** `/bookings` and RLS (`00011` `guest_can_leave_review`) both require a `confirmed` booking after `starts_at + duration_mins`, with `reviewee_id` the listing host. Unique on `(booking_id, role)`. Host→guest reviews are still P2.4.

### P2.4 — Host to guest reviews
Two way reviews are promised. Insert policy is guest-only. No host UI.

### P2.5 — Session auto complete
`sessions.status` documents `'completed'`. Nothing ever writes it. Payouts key off `starts_at` + 24h, not this status, so launch can survive without it. Reviews and dispute windows were supposed to key off it.

### P2.6 — Host strike appeals
Within 7 days, reviewed manually. Needs a submission form and an admin view.

### P2.7 — Admin: dispute log
Disputes arrive by email today. At launch volume that is survivable.

### P2.8 — Wire the UI kit and decided browse
**Mostly done, 9–21 September 2026.** TopNav and HamburgerMenu are the live chrome (`Navbar.jsx` is deleted), and Home is the decided browse: Lane 1 headline, 2 / 3 / 4 columns, square images, badge on a cream pill, two-line title clamp, one meta line with the all-in card price. Settings uses Button and Input. Login uses Input (floating + password). Left over: the rating on the browse card needs the listings fetch to supply one (no aggregate rating column exists yet), SelectableCard is still `/style-guide` only, and `ListingCard.jsx` plus its `.listing-card` CSS are dead code waiting on a deletion pass. Home still joins host `full_name` that the browse `Card` never receives.

### P2.9 — Checkout and legal gaps visible in the app
- `guests_count` hardcoded to 1 in ListingDetail
- No catch-all 404
- No T&C checkboxes at signup, create listing, or checkout
- Password reset: done (`/forgot-password` and `/reset-password`)
- No photography guidance on CreateListing (the 5 photo limit copy is not that)
- No sort UI (DECISIONS.md listed newest / price / most reviewed as live; only newest exists)
- Phone OTP before booking: not built

---

## P3: post launch

Identity and social layer, Date Mode, credit bundles, multi session courses, group discounts, "this weekend" filter, search, in app notifications, listing performance nudges, listing video, host Pro subscription, payout clawback.

Automated ID verification (Stripe Identity) and auto deletion of rejected verification documents (`purge-verification-docs`) shipped in September. Do not rebuild them.

All specified in DECISIONS.md. None of the remaining items should be touched before launch, regardless of how much runway appears to be left.

---

## Flows that are complete and should not be refactored for fun

Working today, and stable enough. Do not rewrite them before launch unless you are closing a P0/P2 item above.

- Guest browses and filters listings (the fetch and the filter memos survived the P2.8 grid rebuild untouched; keep it that way)
- Guest views listing detail and pays (guest-count picker is additive)
- Signup and login (profile row is the `handle_new_user` trigger)
- Host verification submission (client UPDATE + guard trigger)
- Host creates a listing (session is a follow-up `/hosting` action)
- Host adds a session
- Host edits a listing
- Host cancels a session, including the strike increment via `cancel-booking`
- `/bookings` and `/hosting`, including Connect payout setup. `/dashboard` is a redirect.
- Guest cancel with Stripe refund via `cancel-booking` (confirm the two test cancellations on Stripe)
