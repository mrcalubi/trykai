# TryKai: Build Backlog

Derived by walking every end to end flow the platform promises and marking where it breaks today. Ordered by what blocks launch, then by risk.

**Prepared 16 August 2026.** Companion to ENGINEERING.md, which describes how things work. This describes what to build next and why.

---

## How this is prioritised

Three questions, in order:

1. **Does soft launch fail without it?** If a warm contact books a session and something in this list is missing, does that booking break, or does TryKai break a published promise?
2. **Is it blocked by the payment build?** The provider is now decided (Stripe Connect, 16 August), so P1 is no longer blocked on a decision, only on the build itself. The stashed HitPay work in progress shortens that build considerably.
3. **What does it cost if we get it wrong?** Money and safety rank above convenience.

**P0** blocks launch and is buildable now.
**P1** blocks launch but waits on the payment decision.
**P2** is needed at launch, lower consequence if it slips a week.
**P3** is post launch.

Ruiheng's capacity is 8 hours a week. The P0 list is sized against that, not against an ideal.

---

## Two findings that change the plan

### 1. There is no way to pay a host

The `users` table has no field for a host's PayNow number or bank account. Under HitPay's marketplace model this was fine, the sub merchant held their own payout details. Under manual disbursement, which is now the most likely model, TryKai must collect and store them.

This needs a schema change, a form field in host onboarding, and validation. It is launch blocking and it is not blocked by the payment decision, because every remaining option except the dead split API requires TryKai to know where to send the money.

### 2. There is no admin interface

Every operational promise TryKai makes depends on Caleb performing a manual action:

| Promise | How it happens today |
|---|---|
| Hosts verified before listings go live | Supabase Table Editor |
| Hosts paid 24 hours after their session | Nothing exists |
| Refunds issued per the cancellation policy | Nothing exists |
| Credible safety reports trigger immediate suspension | Nothing exists |
| Quality disputes resolved within 2 business days | Email, then nothing |
| TryKai can cancel a booking | Nothing exists |

Verification approval survives being done in a database table. Paying eleven hosts weekly, while working out which sessions completed more than 24 hours ago, which have open disputes, and what each host is owed after fees, does not. That is exactly the kind of manual reconciliation that produces a wrong payment, and a wrong payment to a host in week one of a trust based marketplace is expensive in a way a UI bug is not.

**An admin area is not a nice to have deferred to v2. It is the operational half of the product.**

---

## P0: blocks launch, buildable now

> **Status, 25 August 2026.** Several P0 items are now done or changed, marked inline below. Done: P0.5 (cancellation, built by Ruiheng, verified), P0.6 (spots decrement, via `confirm_booking`), P0.7 (address reveal, via `get_listing_address`). Changed: P0.1 likely dissolves under Stripe Connect. Partly done: P0.4 (suspension fields exist, app enforcement pending). Still fully open: P0.2, P0.3, P0.8, and the admin UI generally.

### P0.1 — Host payout details — LIKELY OBSOLETED
> Under Stripe Connect Express (decided 16 August), Stripe collects the host's bank details at onboarding and pays them via the connected account. So `stripe_account_id` becomes the payout handle and the manual columns below are probably unnecessary. Confirm in the Stripe sandbox before building anything here. Do not add the manual columns unless the sandbox shows manual disbursement is needed.
**Flow:** host completes verification → enters payout details → can receive money
**Today:** no field exists anywhere

- Add to `users`: `payout_method` (paynow_mobile, paynow_nric, bank_transfer), `payout_identifier`, `payout_name`, `payout_verified_at`
- Collect during host onboarding, after verification approval and before the first listing goes live
- Validate format per method. A mistyped PayNow number sends money to a stranger and it is not recoverable.
- Store the payout name separately and check it against the verified ID name. A mismatch is either a typo or a red flag.

*Why first: nothing about paying hosts can be built or tested until this exists.*

### P0.2 — Admin: payout queue
**Flow:** session completes → 24 hours pass → Caleb pays the host → payment recorded
**Today:** nothing

A single screen listing every payout that is due:
- Sessions where `starts_at + 24 hours < now`, booking `status = 'confirmed'`, `payout_released_at IS NULL`, and no open dispute
- Per row: host name, payout method and identifier, session title and date, guest count, gross amount, platform fee, **net owed to host**
- Copy to clipboard on the payout identifier and the amount, since these get typed into a banking app
- "Mark as paid" writes `payout_released_at`, the amount, and a reference field for the bank transaction ID
- A separate tab for held payouts, showing why each is held

*Why: this is the manual disbursement model. Without it, Caleb is running a weekly reconciliation by hand across three database tables while real money moves.*

### P0.3 — Admin: verification review
**Flow:** host submits ID and selfie → Caleb reviews → approve or reject
**Today:** works, but entirely in the Supabase Table Editor

- List of pending submissions with ID photo and selfie side by side
- Approve or reject, with a rejection reason that goes into the email
- Never expose these images in any public or authenticated non admin route

*Why: this one genuinely works today, so it is lower risk than the rest of P0, but it is the highest frequency admin task before launch and doing it in a database table invites approving the wrong row.*

### P0.4 — Admin: account suspension — PARTLY DONE
**Flow:** credible safety report → account suspended immediately, pending review
**Today:** the database fields exist (`is_suspended`, `suspended_at`, `suspension_reason`, added 22 August), and suspension can be done by hand in the Table Editor. What is missing: the app does not yet enforce suspension, so a suspended account's listings are not automatically hidden and bookings not automatically blocked. And there is no one click admin button. The SAFETY_RESPONSE_PROTOCOL.md assumes the manual Table Editor path for now.

- Suspend a user, immediately deactivating their listings and blocking new bookings
- Independent of `host_strikes`, per the published dispute policy
- Reason recorded, reversible, timestamped

*Why: the dispute policy publicly commits to immediate suspension on a credible safety report. Right now that commitment cannot be honoured. This is the single largest gap between what is published and what exists.*

### P0.5 — Cancellation logic rebuilt to four tiers — DONE
**Built by Ruiheng, verified 23 August.** `calculateGuestRefund` now implements 100 / 50 / 25 / 0 at the 48, 24, and 6 hour boundaries, platform fee forfeited on partial tiers, measured cancellation moment to session start. Verified correct against the published policy by direct testing. Cancellation also now correctly returns the spot to `spots_remaining`. Caleb has a standing KIV to re run the four tier refund check on `main` after merges settle.

### P0.6 — Spots decrement, atomically — DONE
**Built and tested this session.** `confirm_booking(booking_id)` decrements `spots_remaining` by `guests_count` atomically under a row lock, in the same operation that flips the booking to confirmed. A CHECK constraint guarantees it can never go below zero. Currently exercised via a staging only "Mark as paid" test button; the real trigger is the payment webhook (P1.1), which will call the same function.

### P0.7 — Full address reveal — DONE
**Built and tested this session.** `get_listing_address(listing_id)` returns `full_address` only to the owning host or a guest with a confirmed booking for one of the listing's sessions. Enforced at the data layer, `full_address` has no direct read grant at all. Wired into ListingDetail and the guest dashboard.

### P0.8 — Real email delivery
**Flow:** anything happens → the relevant person is told
**Today:** all four Edge Functions send from Resend's shared test domain and deliver only to Caleb

Verify trykai.sg in Resend and switch all four over. **Ship the shared secret header check on the unauthenticated endpoints in the same week**, not after. Once a real domain is sending, an unauthenticated endpoint is an open phishing relay.

---

## P1: blocks launch, the payment build

Provider is now decided (Stripe Connect), so these are no longer blocked on a decision, only on the build. The stashed HitPay work in progress (`hitpay-wip-2026-08`) already contains most of P1.1 and P1.2 pointed at the wrong provider, so the job is closer to swapping the API target than building from scratch.

### P1.1 — Payment confirmation webhook
**Flow:** guest pays → booking becomes confirmed → capacity reduced → both parties emailed
**Today:** no live webhook. But the confirmation step it calls, `confirm_booking`, is built and tested. The webhook verifies the Stripe signature then calls that function. The stashed HitPay webhook has this shape already.

With signature verification. An unverified endpoint that flips bookings to confirmed means anyone who finds the URL grants themselves free sessions.

### P1.2 — Fee calculation — DECIDED, ADAPTABLE
The structure is now decided (see DECISIONS.md and ENGINEERING.md section 5): 12% card with a S$2.50 floor rounded up to a clean all in total, PayNow shown as a flat 5% discount at checkout, host fee 10% per host from the fourth booking. The stashed HitPay work contains a fee calc close to this to adapt. Also gate: delete or staging-lock the temporary "Mark as paid" test button before real payments go live.

### P1.3 — Refund execution
Refund amounts are calculated and stored but no refund is ever actually issued. Needs the provider.

### P1.4 — Admin: issue refund and cancel a booking
TryKai has published the right to cancel a booking for safety, fraud, or policy violation, with a full refund. There is no mechanism to do either.

---

## P2: needed at launch, lower consequence

### P2.1 — Host no show reporting
**Flow:** host does not turn up → guest reports it → 2 strikes, account review, full refund
**Today:** no path exists. The only cancellation flow is host initiated.

A guest who travelled across the island to meet nobody currently has no button to press. This is the worst experience the platform can produce and it is entirely unhandled.

### P2.2 — Reschedule
Once per booking, same 48 hour cutoff. Published as available. Recovers bookings that would otherwise be cancelled outright.

### P2.3 — Review gating tightened
Currently accepts reviews on `pending` bookings. Should require `confirmed` and a session that has actually happened.

### P2.4 — Host to guest reviews
Two way reviews are promised in the terms and in the trust model. Only guest to host exists.

### P2.5 — Session auto complete
Scheduled job moving sessions to `completed` once `starts_at` passes. Everything downstream, reviews, payouts, dispute windows, keys off this.

### P2.6 — Host strike appeals
Within 7 days, reviewed manually. Needs a submission form and an admin view.

### P2.7 — Admin: dispute log
Disputes arrive by email today and live in an inbox. At launch volume that is survivable. It stops being survivable quickly, and an unanswered dispute breaks a published 2 business day commitment.

---

## P3: post launch

Identity and social layer, Date Mode, credit bundles, multi session courses, group discounts, "this weekend" filter, search, in app notifications, listing performance nudges, listing video, host Pro subscription, automated ID verification, auto deletion of rejected verification documents, payout clawback.

All specified in DECISIONS.md. None of it should be touched before launch, regardless of how much runway appears to be left.

---

## Suggested sequence at 8 hours a week

| Week | Focus |
|---|---|
| Now | P0.1 payout details, schema and form. Small, unblocks everything about paying hosts. |
| Next | P0.2 payout queue. The largest single piece of admin work and the one that makes the operating model function. |
| Then | P0.3 verification review, P0.4 suspension. Same admin area, shared patterns, faster together. |
| Then | P0.5 cancellation logic, P0.6 spots, P0.7 address reveal. Core booking correctness. |
| Then | P0.8 email plus the header check, same week, no exceptions. |
| Then | P1, once the payment decision is made. |
| Then | P2 in listed order. |

If the payment question resolves early, P1.1 jumps ahead of the remaining P0 items, since nothing can be end to end tested without it.

---

## Flows that are complete and should not be touched

Working today, and stable. Do not refactor them before launch.

- Guest browses and filters listings
- Guest views listing detail
- Signup and login
- Host verification submission
- Host creates a listing
- Host adds a session
- Host edits a listing
- Host cancels a session, including the strike increment
- Dashboard, both views
