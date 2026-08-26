# TryKai: Build Backlog

Derived by walking every end to end flow the platform promises and marking where it breaks today. Ordered by what blocks launch, then by risk.

**Prepared 16 August 2026.** Companion to ENGINEERING.md, which describes how things work. This describes what to build next and why.

---

## How this is prioritised

Three questions, in order:

1. **Does soft launch fail without it?** If a warm contact books a session and something in this list is missing, does that booking break, or does TryKai break a published promise?
2. **Is it blocked by the payment decision?** Payments are unresolved. Anything that depends on knowing the provider is deferred, not because it is unimportant but because building it now risks building it twice.
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

### P0.1 — Host payout details
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

### P0.4 — Admin: account suspension
**Flow:** credible safety report → account suspended immediately, pending review
**Today:** nothing. The only path to deactivation is accumulating three strikes.

- Suspend a user, immediately deactivating their listings and blocking new bookings
- Independent of `host_strikes`, per the published dispute policy
- Reason recorded, reversible, timestamped

*Why: the dispute policy publicly commits to immediate suspension on a credible safety report. Right now that commitment cannot be honoured. This is the single largest gap between what is published and what exists.*

### P0.5 — Cancellation logic rebuilt to four tiers
**Flow:** guest cancels → correct refund calculated and shown before confirming
**Today:** `cancellationPolicy.js` implements the superseded two tier rule

- 100 / 50 / 25 / 0 at the 48, 24, and 6 hour boundaries
- Platform fee forfeited on all partial tiers
- Singapore time, measured cancellation moment to session start, 48:00:00 exactly falls inside the 48 hour tier
- Amount shown to the guest before they confirm, and included in the confirmation email

*Why: the published policy and the code disagree. Whichever is wrong, a guest will find out at the worst possible moment.*

### P0.6 — Spots decrement, atomically
**Flow:** booking confirmed → capacity reduced, in the same transaction
**Today:** never decremented. Sessions can be booked past capacity.

*Note: the trigger for this is payment confirmation, so the wiring waits on P1.1. Build and test the decrement itself now with a manual trigger, so only the connection is left.*

### P0.7 — Full address reveal
**Flow:** booking confirmed → guest can see where to go
**Today:** written at listing creation, never read anywhere

Without this a guest pays and has no idea where the session is. Gate on a confirmed booking for that session, enforced by RLS, not just hidden in the UI.

### P0.8 — Real email delivery
**Flow:** anything happens → the relevant person is told
**Today:** all four Edge Functions send from Resend's shared test domain and deliver only to Caleb

Verify trykai.sg in Resend and switch all four over. **Ship the shared secret header check on the unauthenticated endpoints in the same week**, not after. Once a real domain is sending, an unauthenticated endpoint is an open phishing relay.

---

## P1: blocks launch, waits on the payment decision

Do not start these until the provider and account model are settled. Building them now risks building them twice.

### P1.1 — Payment confirmation
**Flow:** guest pays → booking becomes confirmed → capacity reduced → both parties emailed
**Today:** no webhook. A guest can pay and the booking sits at `pending` forever.

With signature verification. An unverified endpoint that flips bookings to confirmed means anyone who finds the URL grants themselves free sessions.

### P1.2 — Fee calculation
Hardcoded at a flat 15 per cent. Should be 10 per cent guest, S$2 floor, 8 per cent on PayNow, host fee waived at Stage 1.

*Buildable now as pure logic, testable in isolation, only the wiring waits. Worth pulling forward if there is idle time.*

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
