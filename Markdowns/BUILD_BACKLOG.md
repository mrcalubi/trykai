# TryKai: Build Backlog

Derived by walking every end to end flow the platform promises and marking where it breaks today. Ordered by what blocks launch, then by risk.

**Prepared 16 August 2026. Status rewritten 21 September 2026; updated 19 October 2026 against `staging` and both databases.** Companion to ENGINEERING.md, which describes how things work. This describes what to build next and why.

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
| Hosts paid 72 hours after their session ends | `release-payout`, scheduled hourly (`00010` pg_cron + GitHub Action). Vault/GitHub secrets and platform payouts **manual** are still ops. |
| Refunds issued per the cancellation policy | `cancel-booking` from `/bookings` and `/hosting`. Guest is emailed the refund amount (including $0); host is emailed only on a guest cancel. |
| TryKai can cancel a booking | `admin-cancel-booking` with `ADMIN_FUNCTION_SECRET`. No admin UI. Writes `cancelled_by: 'host'`. |
| Credible safety reports trigger immediate suspension | Table Editor sets `is_suspended`. **The app does not read that flag.** Listings stay visible unless someone also sets `is_active = false`. |
| Quality disputes resolved within 2 business days | Email, then nothing |

Verification approval is now on the platform. Suspension that does not hide listings is the remaining operational hole, and it is the dangerous one under the published dispute policy.

---

## Remaining sequence

Not a calendar. Updated 19 October 2026.

1. **Ops (not app code):** production sync checklist in OPERATIONS.md (Production sync, October 2026): GitHub deploy secrets, OneMap secrets on production, live Connected accounts webhook, one real card booking and refund, cron `pg_net` timeout. Migrations `00022` to `00031` are applied on both environments.
2. **Claude builds, one PR each, in this order:**
   1. Docs consolidation (this PR)
   2. Link previews and Share fallback
   3. Branded email receipt
   4. "I'm keen" on listings with no dates (replaces the weekly host nudge)
3. **Suspend a test host on staging** and confirm browse, listing detail and Book all hide them (P0.4).
4. Browse card rating: the listings fetch does not supply one and there is no aggregate rating column.
5. The rest of P2 in listed order.

Details of the four builds are under Next builds below.

---

## Next builds (Claude, from 19 October)

Claude attaches the repo, branches from `staging`, runs lint and tests, and opens a PR into `staging`. Caleb reviews and merges.

### B1 — Docs consolidation
Repo docs brought up to the 19 October state, HOST_ONBOARDING.md replaced with the 19 October version, docs synced back to the Claude Project.

### B2 — Link previews and Share fallback
Server side Open Graph and Twitter tags for `/listings/:id`: cover photo, title, "S$X per person · Area". Public columns only, anon key, via Vercel middleware or a function. A default preview for the homepage. The existing Share button falls back to clipboard and "Link copied" when `navigator.share` is missing or throws (except `AbortError`). It showed "Could not share this link" in desktop Chrome device mode; check on a real phone.

### B3 — Email receipt
Branded, mobile friendly shared template in `_shared/email.ts`: logo, colours, a receipt block with the price breakdown, booking details, policy link. Table based with inline styles. Tested by sending real staging emails to Gmail and iOS Mail.

### B4 — "I'm keen" on listings with no dates (decided 20 October)
Replaces the weekly "you have no sessions" email, which was nagging. Guests tap **I'm keen** on a listing with no dates, optionally picking Weekdays / Weekends and Morning / Afternoon / Evening and a group size. The host gets "3 people are keen on Latte art" (at most one email a day per listing) and a banner on the Hosting tab. When the host adds sessions, every keen guest is emailed once. Migration `00032`, Edge Functions `listing-interest` and `notify-interested`. Details: DECISIONS.md, 20 October.

Follow-ups, post launch: an email when interest expires after 30 days with no date ("Mei Ling hasn't added a date yet"), and a daily roundup for keen taps that arrive inside the 24-hour email gap (today they show on the Hosting banner and in the next email).

---

## P0: blocks launch

> **Status, 19 October 2026.** `00027` is applied on staging and production, so P0.4 enforcement is live; what remains is a suspension test. **Status, 18 October 2026.** Payment loop is in code (P1.1–P1.4, Connect onboarding, Transfer job). Done earlier: P0.5, P0.6, P0.7. Obsolete: P0.1. Not needed for Connect launch: P0.2 copy-paste payout queue. P0.4 enforcement on browse/Book is in code (`00027`), not yet applied. P0.3 done 10 September. P0.8 domain and cancellation emails shipped 14 September. P0.9 assets resolved 9 September. `00008` listing gate, `00009` session/booking read, `00010` `release-payout` schedule, `00011` review gate, and `00012` empty-session delete are in the tree.

### P0.1 — Host payout details — OBSOLETE
Under Stripe Connect Express, Stripe collects the host's bank details. Do not add `payout_method` / `payout_identifier` columns.

### P0.2 — Admin: payout queue — NOT NEEDED FOR CONNECT LAUNCH
The copy-paste PayNow queue assumed manual disbursement. `release-payout` Transfers 72 hours after the session ends. Keep a later exception log in mind for clawback and disputes; do not build the clipboard UI for launch.

### P0.3 — Admin: verification review — DONE
**Flow:** host submits ID and selfie → Caleb reviews → approve or reject

`/admin/verifications`, gated by `is_admin`, lists pending submissions oldest first with the ID photo and selfie side by side. Approve, or reject with a reason that is emailed to the host and shown to them on `/verify-identity` when they resubmit. Admins reach it from the hamburger (**Verification review**) and from a card at the top of `/hosting`. `admin-verifications` authenticates the reviewer's own JWT and re-checks `is_admin` server-side; the images are served through signed URLs minted with the service role, so they are never reachable from a public or authenticated non-admin route. `review_verification` writes every decision alongside a `verification_reviews` audit row.

Still manual in the Table Editor: granting `is_admin`, which is a one-time action, and `is_founding_host`.

### P0.4 — Admin: account suspension — ENFORCED, `00027` APPLIED ON BOTH ENVIRONMENTS 19 October
**Flow:** credible safety report → account suspended immediately, pending review
**Today:** `is_suspended`, `suspended_at`, `suspension_reason` exist. `00027` makes the public listings read (`"Anyone can view active listings"`) also require `listing_host_in_good_standing(id)`, so setting `is_suspended = true` hides every listing of that host from browse, listing detail and profiles, independent of `host_strikes` and `is_active`. The host still sees their own; a guest who booked still sees the title. `create-payment-intent` refuses checkout for a suspended host. Listing and session INSERT are blocked by `can_create_listing()` (`00008`). Setting the flag back to false restores the listings.

Still to do:
- Suspend a test host on staging and confirm browse, listing detail and Book hide them
- Existing confirmed bookings with a suspended host are not cancelled automatically; use `admin-cancel-booking`
- Host tools (add session, edit) are not yet blocked for a suspended host beyond the INSERT gate
- One-click admin button can follow

### P0.5 — Cancellation logic rebuilt to four tiers — DONE
`calculateGuestRefund` implements 100 / 50 / 25 / 0 at 48, 24, and 6 hours, platform fee forfeited on partial tiers. `cancel-booking` issues the Stripe refund. Spot restore only for confirmed rows. Guests are emailed the refund amount (including $0); the host is emailed only on a guest cancel.

### P0.6 — Spots decrement, atomically — DONE
`confirm_paid_booking` decrements `spots_remaining` by `guests_count` under a row lock in the same operation that flips the booking to confirmed. CHECK constraint `spots_remaining >= 0`. Stripe webhook is the caller. Guest-callable `confirm_booking` from `00002` was dropped; the wrapper in `00005` is service_role only.

### P0.7 — Full address reveal — DONE 18 October
`00025` grants SELECT on every `listings` column except `full_address`. `listing_address(listing_id)` returns the address to the host or a confirmed guest, otherwise null. ListingDetail, BookingDetail, Bookings, and Edit listing call it. Emails and Edge Functions use the service role and still SELECT the column.

### P0.8 — Real email delivery — DONE 14 September
**Flow:** anything happens → the relevant person is told
**Today:** from-address is `TryKai <no-reply@trykai.sg>` in `_shared/email.ts`. trykai.sg is verified in Resend.

`notify-verification-pending` requires `NOTIFY_FUNCTION_SECRET` (`x-notify-secret` or Bearer). `notify-verification-result` is gone; result emails come from `admin-verifications` and `stripe-webhook`. `release-payout` and `admin-cancel-booking` already require a secret; `stripe-webhook` verifies `Stripe-Signature`.

`cancel-booking` emails the guest the refund amount (including $0) and the host only when the guest cancelled. A Resend failure is logged and cannot fail the refund. A missing `RESEND_API_KEY` logs instead of failing silent. `admin-cancel-booking` emails the guest the same receipt (reference, listing, refund amount and method).

### P0.9 — Build assets that CI and chrome depend on — DONE 9 September
`StyleGuide.jsx` imports `src/assets/categories/food.png`, `fitness.png`, `arts.png`, and `music.png`. Those four files are in the repo. Language/Other imports stay commented out; uncommenting either without adding the PNG fails `vite build`, because App always imports this page. `public/trykai.png` exists. `Navbar.jsx` is deleted; TopNav still requests `/trykai.png` for the brand mark.

---

## P1: the payment build — DONE IN CODE, 27–31 August 2026

Stripe Connect (separate charges and transfers, Express) is implemented. Do not adapt `hitpay-wip-2026-08`. Remaining work is ops and lives in OPERATIONS.md (Production sync, October 2026).

### P1.1 — Payment confirmation webhook — DONE
`supabase/functions/stripe-webhook` verifies `Stripe-Signature`, calls `confirm_paid_booking`, emails both parties, refunds on oversell (including a cancelled / not-`open` session), cancels pending on failed/canceled intents, syncs `stripe_payouts_enabled` from `account.updated`.

### P1.2 — Fee calculation — DONE
`calculateGuestCharge` in `_shared/booking.ts`: 12% + S$2.50 floor, round up to a whole dollar, PayNow sliding saving off that total (`paynowDiscountRate`). Browse and listing show the card all-in price. Host fee 10% from the fourth confirmed booking; founding hosts never.

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
**Post launch (P3).** Two way reviews are promised. Insert policy is guest-only. No host UI. After that path exists, the browse rating filter can follow.

### P2.5 — Session auto complete
`sessions.status` documents `'completed'`. Nothing ever writes it. Payouts key off `starts_at` + `duration_mins` + 72h, not this status, so launch can survive without it. Reviews and dispute windows were supposed to key off it.

### P2.6 — Host strike appeals
Within 7 days, reviewed manually. Hosts email `hello@trykai.sg` with their booking reference and what happened. SQL: `admin_remove_host_strike` (`00039`). **No admin UI (KIV).**

### P2.7 — Admin: dispute log
Disputes arrive by email today. At launch volume that is survivable.

### P2.8 — Wire the UI kit and decided browse
**Mostly done, 9–21 September 2026.** TopNav and HamburgerMenu are the live chrome (`Navbar.jsx` is deleted), and Home is the decided browse: Lane 1 headline, 2 / 3 / 4 columns, square images, badge on a cream pill, two-line title clamp, one meta line with the all-in card price. Settings uses Button and Input. Login uses Input (floating + password). Left over: the rating on the browse card needs the listings fetch to supply one (no aggregate rating column exists yet), SelectableCard is still `/style-guide` only, and `ListingCard.jsx` plus its `.listing-card` CSS are dead code waiting on a deletion pass.

### P2.9 — Checkout and legal gaps visible in the app
- ~~`guests_count` hardcoded to 1 in ListingDetail~~ Group bookings shipped 10 October.
- ~~No catch-all 404~~ `NotFound` page, 18 October.
- ~~No T&C checkboxes at signup, create listing, or checkout~~ Checkbox at signup (18+ and Terms) and on create listing; "By booking, you agree to" at checkout.
- Password reset: done (`/forgot-password` and `/reset-password`)
- ~~No photography guidance on CreateListing~~ Live (`PhotoTips` on create and edit).
- No sort UI (DECISIONS.md listed newest / price / most reviewed as live; only newest exists)
- Phone OTP before booking: not built

### P2.10 — JWT "issued at future" on browse — DONE 17 October
`src/lib/pageLoad.js` retries the first load once. Clock skew on the guest JWT can fail the listings fetch. Retry the request once, then show a friendly error. Never surface the raw error text.

### P2.11 — Host cancel warning copy — DONE
The dialog now says "Cancelling refunds your guest(s) in full and adds a strike to your account." Was: replace the per-guest refund amounts in the Hosting confirm dialog with: "Cancelling refunds all N guests in full and adds a strike".

### P2.12 — Review reminder email
**Post launch (P3).** About 3 hours after the session ends, email the guest if they have not left a review.

### P2.13 — First names are UI-only
**Post launch (P3).** Public surfaces show `display_name` (`00014`). Review RPCs return it in jsonb `users.full_name`. Pages still SELECT `full_name` and fall back to `firstName(full_name)` when `display_name` is empty. The `full_name` column is still granted SELECT to anon and authenticated (`00005`). A crafted query can still read the whole name. Revoke that SELECT for anon once nothing public reads the column.

### P2.14 — S$10 to S$40 is guidance, not a rule
Decided 29 September 2026. HANDOVER is updated (19 October). The database caps a listing at S$500 as a typo guard (`00028`). BUSINESS.md still calls the band a positioning asset, which is fine as long as it is not presented to hosts as a rule. Check HOST_ONBOARDING after the 19 October replacement.

---

## P3: post launch

In this order after warm-contact launch:

1. **Remove a guest (partial cancel).** Cancellation is the whole booking only. Let a guest drop one person from a paid group booking and refund that share on the same four tiers. First money-path change after launch. Do not build this before launch.
2. **Linked session series (optional).** Bulk-create of independent sessions is live. Remaining: a real series object if hosts ask to edit or cancel a run as one.
3. **Review reminder email.** About 3 hours after the session ends, email the guest if they have not left a review. (Also listed as P2.12; wait until after launch.)
4. **Saved listings.** Guests bookmark a listing to find it again.
5. **Host-to-guest reviews, then the review filter.** Two-way reviews are promised (P2.4). After that path exists, guests can filter browse by rating.
6. **`full_name` database-level fix.** Revoke anon SELECT once nothing public reads the column (P2.13). Public surfaces already show `display_name`.
7. **Handle `refund.failed`.** Stripe can fail a refund after we have already written `cancelled` and emailed the guest. Listen for the event, alert `hello@trykai.sg`, and do not leave the booking looking refunded when it is not.
8. **Sessions beyond 80 days (closed).** PayNow checkout and the host add-sessions calendar both stop at `PAYNOW_MAX_DAYS_AHEAD` (80). Direct INSERT could still write a later row; no product path does.
9. **Refund Stripe fees after 100 bookings.** Launch absorbs Stripe’s kept processing fee on full refunds (~S$1.45 card / ~S$0.35 PayNow). Review then; leaning towards making the booking fee non-refundable on 48h+ guest cancellations, with notice.
10. ~~**Host-wide session overlap in the database.**~~ Done 20 October as shared availability (`00033`): the first confirmed booking sets the host's other overlapping sessions aside. Follow-up (KIV): a travel buffer between back-to-back sessions at different places.
11. **Revoke client session INSERT.** Hosts still have INSERT on `sessions` for the pre-`00018` duration fallback. A crafted insert can set its own `spots_total`. The product path uses `add_listing_session`.
12. **`add_listing_session` should ignore client `p_spots`.** Hosting sends `listings.max_guests`, but the RPC still accepts any positive number. After launch, take spots from the locked listing row.
13. **Add a Content Security Policy in vercel.json** (test against Stripe, Supabase, Resend links). Do not add `unsafe-eval`. Client image work stays on the main thread.

14. **Move production to Singapore.** Production was created in Mumbai (`ap-south-1`) by accident. Supabase cannot move a project: create a new `ap-southeast-1` project and cut over the database and auth users, storage, Edge Function secrets, Vault and cron, Stripe webhook URLs, Vercel env, and `PRODUCTION_SUPABASE_PROJECT_REF`. Rui Heng's call on timing; a quiet week after the first bookings.
15. **Propose a new time to guests.** Booked sessions cannot be edited. Let a host propose a new time that each guest accepts or declines (cancel with full refund).
16. ~~**Auto-fill area from postal code.**~~ Done 25 October: postal lookup returns OneMap's planning area and fills Area guests see (DECISIONS.md, Postal code drives the listing address and Area).
17. **Unit number formatted `#XX-XX`.**
18. **Book a whole session privately.** One guest pays for every spot.
19. **Per-pair price on the booking card** when group pricing applies.
20. **Structured listing fields:** take-home, host credential, Instagram. Replaces putting them in the description. Then a description template in the create listing wizard.
21. **"Tried by the TryKai team" badge** for listings the team has attended.
22. **"Not as described? Full refund" guarantee.** Rui Heng's call, plus a Terms change.
23. **Review RPC key rename:** `users.full_name` in the review jsonb returns the display name; rename the key to match (see P2.13).
24. **Orphaned photo cleanup.** Storage objects no listing references.
25. **Terms additions from the ToGatherSG review:** group booker responsible for their group; guest conduct and the host's right to end participation; detailed assumption of risk; payout offset right; session photos usable for marketing. Plus a **Host Safety and Standards page**: alcohol licence, domestic workers, MCST and neighbours, NParks permits, allergens and halal, pets.
26. **Profile photo required to host (KIV).** Deferred 26 October (Caleb). Not enforced; hosts can publish and remove their photo. Enforce later at publish and block Remove while a listing is live.

Then: identity and social layer, Date Mode, credit bundles, multi session courses, "this weekend" filter, search, in app notifications, listing performance nudges, listing video, host Pro subscription, payout clawback.

Automated ID verification (Stripe Identity) and auto deletion of rejected verification documents (`purge-verification-docs`) shipped in September. Group bookings with automatic pricing shipped 10 October. Profile About (`users.bio`) shipped 12 October. Do not rebuild them.

All specified in DECISIONS.md. None of the remaining items should be touched before launch, regardless of how much runway appears to be left.

---

## Flows that are complete and should not be refactored for fun

Working today, and stable enough. Do not rewrite them before launch unless you are closing a P0/P2 item above.

- Guest browses and filters listings (the fetch and the filter memos survived the P2.8 grid rebuild untouched; keep it that way)
- Guest views listing detail and pays (guest stepper and group pricing are live; do not add partial cancel here)
- Signup and login (profile row is the `handle_new_user` trigger)
- Host verification submission (client UPDATE + guard trigger)
- Host creates a listing (session is a follow-up `/hosting` action)
- Host adds a session
- Host edits a listing
- Host cancels a session, including the strike increment via `cancel-booking`
- `/bookings` and `/hosting`, including Connect payout setup. `/dashboard` is a redirect.
- Guest cancel with Stripe refund via `cancel-booking` (confirm the two test cancellations on Stripe)
