# TryKai: Operations

Week by week execution plan and the pre launch checklist. Updated live at the Saturday scrum.

**Target: soft launch, week of 20 October 2026.** Warm contacts only, 15 to 20 listings across two or three categories. **Warm host onboarding starts Wednesday 21 October**; first real paid booking expected within a week.

**Before touching either Supabase project, read Environments and production SQL below.**

---

## How this document works

Each week has three sections, one per founder, tagged **[CRITICAL]**, **[HIGH]**, or **[STANDARD]**.

**Carry over.** At every Saturday scrum each person reports what they finished and what they did not. Anything unfinished is moved into the following week at the same priority, unless the group agrees to downgrade or drop it. This document is edited live during scrum, so it always reflects the real state rather than the original plan.

**Phases** are kept only as a reference for why the sequencing is what it is. Roughly: weeks 1 to 4 build the foundation, weeks 5 to 9 rebuild payments, weeks 10 to 13 harden and launch. The actual unit of planning is the week.

**Saturday scrum, 9 to 11pm, non negotiable.**
1. Each person reports what was completed and what was not
2. Unfinished work is cut and pasted into next week
3. Blockers surfaced and resolved in the room, not carried silently
4. **Anything decided this week is appended to DECISIONS.md before the meeting ends**
5. The status block in README.md is updated

**Monthly, first Saturday:** contribution log updated by each founder. This is the evidence base for equity refresh conversations.

**Ongoing, Caleb:** every TryKai cost paid from the Aspire card and logged in EXPENSES.xlsx the day it occurs; every transfer into Aspire logged as founder loan the day it lands (BUSINESS.md, How money moves). The founder loan balance must always be current.

---

## Progress snapshot, 19 October 2026

Week 13 of the original plan. Read this snapshot first. HANDOVER.md has the full state; this block is what ops needs.

**Migrations.** `00022` to `00031` verified on both staging and production (18 and 19 October). See Environments and production SQL for the per environment table.

**Branches.** `main` has everything through PR #129. `staging` is ahead by #130, #131 and #132 (location batch C, including the `lookup-postal-code` Edge Function).

**Edge Functions in the tree:** `abandon-checkout`, `admin-cancel-booking`, `admin-dispute-booking`, `admin-verifications`, `cancel-booking`, `create-account-link`, `create-connect-account`, `create-identity-session`, `create-payment-intent`, `lookup-postal-code`, `notify-verification-pending`, `purge-verification-docs`, `release-payout`, `report-booking-problem`, `send-reminders`, `stripe-webhook`.

**This week (agreed at the 18 October scrum):**
- Production sync (Rui Heng): see Production sync, October 2026 below
- Production end to end testing without real checkout, then mobile testing
- Wednesday 21 October: warm host onboarding begins (HOST_ONBOARDING.md)
- First real paid booking within a week of onboarding

**Production is on Supabase Pro from 19 October** (DECISIONS.md). Staging is in its own free organisation. Run no SQL on production until the first daily backup shows under Database, Backups.

---

## Progress snapshot, 21 September 2026

*History. Superseded by the 19 October snapshot.* Week 8 of the original plan (15–21 September) was ending.

**In the tree now (not true of the 31 August snapshot):**
- Schema is `00001`–`00012`. `00008` is `can_create_listing()` for listing and session INSERT. `00009` is booked/hosted session and listing reads, plus the drop of leftover booking INSERT/UPDATE policies. `00010` schedules `release-payout` hourly via pg_cron. `00011` is `reviews_for_listing` plus guest review INSERT (confirmed, session ended, one per booking per role). `00012` is `delete_empty_session` (soft-delete empty upcoming sessions) and `confirm_paid_booking` requiring `status = 'open'`. Not yet applied on staging.
- `Navbar.jsx` is deleted. `SiteNav` mounts `TopNav` once in `App.jsx`. Signed-in hamburger is Browse, Host a session (verified) / Become a host (not yet verified), Verification review for admins. Avatar goes to your own profile.
- Browse uses the kit `Card` and shows the card all-in price. Input is live on Settings and Login. Button is live on Settings. SelectableCard is still `/style-guide` only.
- Guest bookings and host tools live as tabs on your own `/u/:id`. `/bookings` and `/hosting` redirect there. `/settings` is the account page. `/dashboard` redirects.
- trykai.sg is verified in Resend. From-address is `TryKai <no-reply@trykai.sg>`. `notify-verification-pending` is secret-gated. `notify-verification-result` is gone. Staging booking confirmation emails confirmed arriving.
- `cancel-booking` emails the guest the refund amount (including $0) and the host only on a guest cancel. `/bookings` and `/hosting` invoke that function.
- StyleGuide category PNGs and `public/trykai.png` are in the repo.
- Edge Functions: `create-payment-intent`, `stripe-webhook`, `create-connect-account`, `create-account-link`, `cancel-booking`, `admin-cancel-booking`, `admin-dispute-booking`, `admin-verifications`, `create-identity-session`, `notify-verification-pending`, `purge-verification-docs`, `release-payout`.

**Still ops, not app code:**
- Confirm `00005`, `00008`, `00009`, `00010`, `00011`, and `00012` on each environment. Confirm production has `RESEND_API_KEY` and current function deploys. This repo cannot see production.
- Apply `00010` and set Vault secrets so `release-payout` actually runs. The GitHub Action only fires from `main`. Platform payouts must stay **manual**. See **Host Transfers** below.
- Stripe Dashboard webhook + secrets, `is_founding_host` flags, one test-mode booking.
- Confirm the two test cancellations were refunded on Stripe. API PATCH 204s are the expected service-role writes from `cancel-booking`, not proof of a client bypass.

**Open in the app:**
- P0.4: browse and Book ignore `is_suspended`. INSERT is already gated by `00008`. (18 October: fixed in code by `00027` plus a `create-payment-intent` check; apply `00027` per environment.)
- Forgot password is not built.

**P0.7 done:** `00025` grants SELECT on every `listings` column except `full_address`. `listing_address(listing_id)` returns the address to the host or a confirmed guest. `get_listing_address` is dropped. Emails still SELECT the column with the service role.

**Carried non-engineering:** insurance quote, unsigned founders' agreement, Ruiheng not told about the profit share, safety protocol drafted but not ratified, production `00003` hotfix confirmation.

The 31 August and 25 August snapshots below are kept for history. They still describe Navbar, unverified Resend, and migrations stopping at `00007` / `00005`. That is no longer the tree.

---

## Progress snapshot, 31 August 2026

Week 5 of the original plan (25–31 August) is ending. The week-by-week sections below stay as the historical plan. Read this snapshot first.

**Payment code (original weeks 5–7 and most of 9) is in the tree:**
- Fee module matches DECISIONS.md: 12% card fee, S$2.50 floor, round up to a whole dollar, PayNow 5% off that all-in total, host fee 10% from the fourth confirmed booking, founding hosts never
- `stripe-webhook` confirms bookings, `confirm_paid_booking` decrements spots, `cancel-booking` refunds on the four-tier rule
- Connect Express onboarding and `release-payout` Transfers 72 hours after the session ends
- Guest `full_address` reveal via RPC. Column grant on `listings` still too wide

**Still the original week 8:** trykai.sg is not verified in Resend. Notify-verification functions have no shared-secret header.

**Also in the tree since 22–25 August:** staging project, migrations `00001`–`00005`, signup trigger, verification guard, suspension columns (unenforced in the app), CI, component library at `/style-guide` (not wired).

**Ops, not code:** apply `00005` on staging, Stripe Dashboard webhook + secrets, platform payouts manual, `is_founding_host` flags, one test-mode booking. Confirm whether production has the 22 August signup hotfix.

**Carried non-engineering:** insurance quote, unsigned founders' agreement, Ruiheng not told about profit share, safety protocol drafted but not ratified.

The 25 August snapshot below is kept for history. It still says the component library was on a side branch; that is no longer true.

---

## Progress snapshot, 25 August 2026


A working session across 22 to 25 August closed out a large block of foundation work, some of it ahead of its planned week. This block records what is now genuinely done, so the week by week sections below are read as the historical plan rather than the current state.

**Done and verified on staging:**
- Staging Supabase environment stood up and in active use. Closes the carried forward week 2 and 3 item.
- Canonical schema in version control. Closes the top priority technical fix carried from week 2.
- Signup was completely broken by an RLS gap that stopped a new account writing its own row. Fixed. Host verification submission was blocked the same way. Fixed. Suspension fields added. Captured in what is now `00003_signup_verification_and_suspension.sql` (this snapshot originally called it `00003_staging_hotfixes_22aug.sql`). The three security self audit holes from week 2 and 3 (self approving `verification_status`, resetting `host_strikes`, reading another user's verification documents) are closed by column grants, RLS policies, and a guard trigger.
- Atomic `spots_remaining` decrement built and tested via a `confirm_booking` security definer function. This was a week 5 critical item, now done early.
- Full address reveal on confirmed bookings, via a `get_listing_address` security definer function. Closes the `full_address` written but never read gap.
- Four tier cancellation refund built by Ruiheng and verified correct against the published policy. This was a week 5 item.
- Automated CI test suite (318 unit and component tests plus 58 browser tests) and branch protection added by Ruiheng. Every merge now runs checks. This is new infrastructure not in the original plan.
- A UI component library and top nav built: Button, Input, Card, SelectableCard, TopNav, HamburgerMenu, previewable at a private `/style-guide` route. **(Updated 31 August: this is in the current tree, not waiting on a merge. Still not wired into Home or Navbar.)**

**Still open from the plan:**
- Safety response protocol is now drafted (`SAFETY_RESPONSE_PROTOCOL.md`) but not ratified or enforced in the app. The suspension fields exist but nothing in the app enforces them yet, so a suspended account's listings are not automatically hidden.
- Insurance quote, still not obtained.
- Founders' agreement, still unsigned. Ruiheng still not told about the three way equal profit share.
- The two pricing decisions (guest fee restructure and host fee trigger) are now **decided**, see DECISIONS.md, so the week 5 fee rebuild has final numbers to build against.

**In flight, needs Ruiheng (as of 25 August; see 31 August snapshot above):**
- Confirm the staging database hotfixes have been applied to production, since they do not travel through a code merge.

---

## WEEK 1 ✅ complete
*28 July to 3 August*

### CALEB
- ✅ Walked Ruiheng through the full codebase, 2hr session
- ✅ Drafted and published refund, cancellation, and dispute policy pages, finalised 29 July with the four tier structure
- ✅ Emailed HitPay requesting full payment method approval, card and GrabPay approved
- ✅ Set up business contact email as `trykaisg@gmail.com`. **Superseded in week 2**, disabled by Google, replaced with Zoho.
- ✅ Flagged the Yide day trading listing risk and the Joash bouldering venue question
- ✅ Reached out to 3 more warm contact hosts

### RUIHENG
- ✅ Read all project documentation in full
- ✅ Local dev environment running at localhost:5173
- ✅ `vercel.json` rewrite rule, so direct policy page URLs resolve rather than 404
- ✅ CI/CD pipeline, lint and build on every PR

### AAKASH
- ✅ Instagram and TikTok accounts set up

**Outcome:** everything closed, no carry over.

---

## WEEK 2 ✅ mostly complete
*4 to 10 August*

### CALEB
- ✅ Email infrastructure finalised, Zoho Mail Lite, individual mailboxes plus `hello@` and `privacy@` aliases
- ✅ HitPay payout timing clarified, T+1 card settlement, split API ruled out
- ✅ Business banking applied for, Aspire
- ⬜ [HIGH] Internal safety response protocol — **not started, carried forward**
- ⬜ [STANDARD] Public liability insurance quote — **not started, carried forward**

### RUIHENG
- 🔄 [CRITICAL] Database schema into version control — **top priority technical fix, carried forward**
- 🔄 [CRITICAL] Staging Supabase environment — **carried forward**
- ⬜ [HIGH] Security self audit, first pass: can a user self approve `verification_status`, reset `host_strikes`, or read another user's verification documents?

### AAKASH
- ✅ Content idea bank, 10+ short form video ideas
- ✅ Host recruitment tracker created, now the single source of truth for the host roster

---

## WEEK 3
*11 to 17 August*

### CALEB
- ✅ Aspire account approved, 13 August
- ✅ Flow of funds document prepared and sent to HitPay compliance
- ✅ Business plan with three year projections prepared and sent to Aspire
- ✅ Documentation consolidated and reconciled
- 🔄 [CRITICAL] **Resolve the HitPay payment block.** Raised with Aditya, compliance copied. Awaiting reply. This is the largest risk to the October date.
- ⬜ [HIGH] Founders' agreement circulated and signed by all three
- ⬜ [HIGH] Internal safety response protocol, carried from week 2
- ⬜ [STANDARD] Insurance quote, carried from week 2

### RUIHENG
- [CRITICAL] Database schema into version control, carried from week 2
- [CRITICAL] Staging environment, carried from week 2
- [HIGH] Security self audit, second pass, written up as a checklist to re run once payments are finished
- **Do not start payment integration.** The provider and account model are unresolved. Foundation work is valuable regardless of who processes payments.

### AAKASH
- [STANDARD] Research competitor social presence for content style reference

---

## WEEK 4: foundation wrap up
*18 to 24 August* · Phase 1

**Goal:** all foundation work closed out, ready to start the payment rebuild in week 5 if the provider question is settled.

### RUIHENG
- [CRITICAL] Close out any carried over foundation items
- [HIGH] Review the fee structure ahead of building it. Now decided, see DECISIONS.md: guest fee 12% card with S$2.50 floor rounded up to a clean all in total shown from browse through checkout, PayNow shown as a flat 5% discount at checkout, host fee 10% starting per host from their fourth booking with the first three free.
- [STANDARD] Mobile responsiveness on real devices, iOS Safari and Android Chrome
- [STANDARD] C4 diagram for architectural reference

### CALEB
- [CRITICAL] Payment provider decision made, whichever way HitPay resolves. If unresolved by this Saturday, choose the fallback rather than continuing to wait.
- [HIGH] Insurance decision made, not just quoted
- [STANDARD] Continue warm contact confirmations at a steady pace

### AAKASH
- [STANDARD] Continue content bank and outreach list prep

**Risk:** if the payment question is still open at the end of this week, week 5 cannot start on schedule. Decide at Saturday scrum rather than drifting.

---

## WEEK 5: fee logic
*25 to 31 August* · Phase 2

**Goal:** platform fee rebuilt correctly. This starts the critical path. Protect Ruiheng's time from here on; this work does not survive being fragmented into small evening slices.

### RUIHENG
- [CRITICAL] Rebuild the fee module to the structure decided on 23 August (see DECISIONS.md), replacing the old hardcoded flat fee. Built first because it is pure logic, easy to test in isolation, and the piece most likely to be silently wrong. Note the stashed HitPay work in progress already contains a fee calculation that can be adapted rather than starting from nothing.

### CALEB
- [CRITICAL] Layered T&C acceptance flow: signup, create listing, checkout. Legal requirement, do not skip.
- [HIGH] Begin verification review for the full host roster

### AAKASH
- [HIGH] Small business outreach can start now, it does not depend on the tech being ready. Target 10 businesses.

**Risk:** this is the honest checkpoint. Once real pace on unfamiliar code is known, revisit whether the October date still holds. Discuss explicitly at this Saturday's scrum.

---

## WEEK 6: payment confirmation
*1 to 7 September* · Phase 2

**Goal:** payment success is actually recorded. The single highest consequence item in the plan.

### RUIHENG
- [CRITICAL] Payment confirmation webhook, with signature verification. An unverified webhook that flips bookings to `confirmed` means anyone who finds the URL can grant themselves free sessions. This has to be built correctly, not just built.

### CALEB
- [CRITICAL] Publish Terms of Service and Privacy Policy, reviewed by the law student contact or LegalWise if possible
- [HIGH] Confirm every warm contact host verbally, one to one. Group chat enthusiasm is not commitment.

### AAKASH
- [HIGH] Continue content production, founder story and teaser, real session footage is not possible yet

**Risk:** do not let this slip into fragmented time. If the week must be split, move a phase 1 or phase 3 task instead.

---

## WEEK 7: capacity enforcement
*8 to 14 September* · Phase 2

### RUIHENG
- [CRITICAL] Atomic `spots_remaining` decrement, in the same transaction as booking confirmation, so a confirmed booking and reduced capacity can never come apart

### CALEB
- [HIGH] Continue host verification reviews
- [STANDARD] Review listing quality drafts as hosts prepare them, hold go live until phase 3

### AAKASH
- [HIGH] Continue small business outreach, follow up on week 5 responses

---

## WEEK 8: real email delivery
*15 to 21 September* · Phase 2

**Goal:** notifications reach real users, and the security gap that opens alongside it closes in the same week.

### RUIHENG
- [x] Verify trykai.sg in Resend, switch the from-address to `TryKai <no-reply@trykai.sg>` (14 September; one constant in `_shared/email.ts`, used by every sender)
- [x] Shared secret header check on the unauthenticated function endpoints (11 September). `notify-verification-pending` requires `NOTIFY_FUNCTION_SECRET`. `notify-verification-result` is deleted. `release-payout`, `admin-cancel-booking`, and `purge-verification-docs` are secret-gated. `stripe-webhook` verifies `Stripe-Signature`.

### CALEB
- [STANDARD] Continue host verification and listing quality reviews

### AAKASH
- [HIGH] Continue content calendar and outreach

**Risk:** these two items were deliberately paired. Both landed: from-address 14 September, secret headers 11 September.

---

## WEEK 9: address reveal and cancellation logic
*22 to 28 September* · Phase 2

**Goal:** remaining payment adjacent logic closed. This week also holds the plan's slack; if phase 2 has run long anywhere, it absorbs here.

### RUIHENG
- [HIGH] `full_address` reveal logic, actually built and read on the guest side, gated on confirmed booking status
- [HIGH] Cancellation and refund logic rebuilt to the four tier structure
- [STANDARD] Catch up on anything carried from weeks 5 to 8

### CALEB
- [HIGH] Finalise insurance and safety protocol if still open
- [STANDARD] Continue host roster prep

### AAKASH
- [STANDARD] Continue outreach and content

**Risk:** if this week is fully consumed by carry over, that is useful information about whether phase 3 needs to shift. Raise it at scrum rather than absorbing it silently.

---

## WEEK 10: security verification
*29 September to 5 October* · Phase 3

**Goal:** payment layer complete, now verify it.

### RUIHENG
- [CRITICAL] Re run the week 2 and 3 security checklist now the payment layer exists
- [HIGH] Scheduled job to auto complete sessions once start time passes
- [HIGH] Host to guest review flow, and tighten review gating to accept only `confirmed` bookings

### CALEB
- [CRITICAL] Push toward all hosts verified and listings drafted, not necessarily live
- [HIGH] Brief every host on what to expect at soft launch

### AAKASH
- [HIGH] Personally confirm every host is on track

**Risk:** stragglers in the host roster are the most likely delay point from here. Chase individually, not in group messages.

---

## WEEK 11: QA pass
*6 to 12 October* · Phase 3

### RUIHENG
- [CRITICAL] Manual QA pass using the end to end flows in ENGINEERING.md as the actual test script
- [STANDARD] Smoke test covering signup, browse, and book, plus a catch all 404 route

### CALEB
- [CRITICAL] Final QC on every listing: photos, descriptions, pricing, category
- [HIGH] Full end to end test on production. Real test booking, real payment, real confirmation.

### AAKASH
- [STANDARD] Prep soft launch content, authentic rather than polished

**Risk:** bugs found here may take longer to fix than expected. Do not schedule this for the last possible days before launch.

---

## WEEK 12: buffer and final prep
*13 to 19 October* · Phase 3

Deliberately held as buffer. If everything is on track, use it for final polish, a second QA pass, and host briefings. If anything has slipped, this is where it absorbs without moving the launch date.

### CALEB
- [CRITICAL] Every launch checklist item below marked done, not done, or blocked
- [HIGH] Manual refund process documented and ready, before real money moves

### RUIHENG
- [CRITICAL] All critical bugs from the QA pass resolved

### AAKASH
- [HIGH] Final host confirmations, everyone briefed again right before launch

---

## WEEK 13: soft launch
*20 to 26 October* · Phase 3

**Goal:** TryKai is live to warm contacts. Real friends booking real sessions with real payment.

**Revised at the 18 October scrum:** production sync and production testing first; warm host onboarding from Wednesday 21 October; first real paid booking within a week of that.

### CALEB
- [CRITICAL] Launch day, personal messages to warm contacts, not a group blast
- [CRITICAL] Monitor the Supabase dashboard actively for the first 48 hours

### RUIHENG
- [CRITICAL] On call for the full first 48 hours, any critical bug fixed same day

### AAKASH
- [HIGH] Complete real bookings as a guest. You are also a tester, not just a marketer.
- [HIGH] Collect qualitative feedback from every host after their first session

**Risks:** low participation, follow up personally within 48 hours if there are no bookings. Payment failures on production, have the manual refund process ready before the week starts. Hosts unprepared, brief again immediately beforehand.

---

## Known risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Payment provider unresolved** | Closed 16 August (Stripe Connect). Remaining risk is ops: secrets, `00005`, manual platform payouts, test-mode booking. | **Critical** | Code is in the tree. Do not reopen HitPay as a blocker. |
| Payment weeks 5 to 8 get fragmented | High | High | Protect these as blocked, uninterrupted time. Fragment weeks 1 to 4 or 9 to 12 instead if something must give. |
| Estimates prove optimistic for a solo dev on unfamiliar code | Medium | Medium | Honest checkpoint at the week 5 scrum. The carry over process makes slippage visible weekly rather than all at once. |
| Warm contact hosts go quiet over a longer runway | Medium | High | One to one confirmation, repeated close to week 10, not assumed from week 1 commitments. |
| Listing quality too low at launch | Medium | High | QC every listing in week 11. Reject with specific feedback. Do not approve to be polite. |
| Feature creep during a longer runway | High | Medium | Everything new goes on the post launch list regardless of how much time appears to be left. A longer timeline is not permission to add scope. |
| A founder disengages over a longer runway | Low | High | Monthly check ins make this visible early. |
| Yide day trading listing creates liability | Low | High | Frame as experience sharing only, explicit disclaimer, law student review. |
| Off platform leakage | Low at this scale | Medium | Reviews only through TryKai, brief hosts during onboarding. |
| SQL run on the wrong Supabase project | Happened 18 October | High | Both dashboards show "PRODUCTION". Check the ref in the URL every time. Staging first. See Environments and production SQL. |
| Production data lost with no backup | Low | **Critical** | Production on Supabase Pro from 19 October (daily backups, kept 7 days). Check a backup from the last 24 hours exists before any production SQL. |
| A new Edge Function goes live on production without its secret | Medium | Medium | Merging to `main` deploys every function. Set the secrets on production first. |

---

# Environments and production SQL

| | Staging | Production |
|---|---|---|
| Supabase project | `trykai-staging` (Free plan, "TryKai Staging" org) | "Kai" (Pro, "TryKai" org, region Mumbai `ap-south-1`) |
| Project ref | `hzgybclfvpuxkmytdoos` | `dqqlwofluvhikebtjune` |
| Dashboard | https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos | https://supabase.com/dashboard/project/dqqlwofluvhikebtjune |
| Site | trykai.vercel.app | trykai.sg |
| Git branch | `staging` | `main` |
| Edge Function deploy | Automatic on push to `staging` | Automatic on push to `main` (`PRODUCTION_SUPABASE_PROJECT_REF` GitHub secret, required) |
| Migrations | By hand, SQL Editor | By hand, SQL Editor |

**Both dashboards show the "PRODUCTION" label.** It is not a guide. The ref in the URL is. The runbooks below are written against staging; for production, swap in `dqqlwofluvhikebtjune`.

Who does what: Caleb applies migrations and sets secrets. Claude and Cursor never hold a Supabase access token, and nobody pastes secrets into chat. `SUPABASE_ACCESS_TOKEN` lives only in GitHub Actions secrets.

## Production SQL

Every migration, and any other SQL that writes on production.

1. **Apply on staging first.** Open the SQL Editor, confirm the URL contains `hzgybclfvpuxkmytdoos`, run the migration, test the flows it touches.
2. **Check production has a recent backup.** Production dashboard, Database, Backups: the latest daily backup should be from the last 24 hours. If there is none (still on the Free plan, or the backup failed), stop and do not run the SQL.
3. **Apply on production in the same sitting.** Confirm the URL contains `dqqlwofluvhikebtjune`, then run.
4. **Record it.** Update the migration table below.

A manual dump gives a restore point from the minute before a risky change, newer than the daily backup. It is optional and needs Docker Desktop and the production database password, so it is for whoever has those set up (Rui Heng): `npx supabase link --project-ref dqqlwofluvhikebtjune`, then `npx supabase db dump -f prod-schema.sql` and `npx supabase db dump --data-only -f prod-data.sql`, run outside the repo folder. Dumps hold users' personal data: never commit them (`.gitignore` blocks `prod-*.sql`) and never upload them to chat.

## Migration state

| Migrations | Staging | Production | Checked |
|---|---|---|---|
| `00022` to `00026` | Applied | Applied | 18 October (production was applied first, by mistake) |
| `00027` to `00031` | Applied | Applied | 19 October, read-only check query |
| `00032` (I'm keen) | Applied | Applied | 21 October, run before the #142 sync. Re-check with the query in the sync steps if in doubt |
| `00033` (shared availability) | Applied | Applied | 21 October, same sitting |
| `00034` (teaching plan) | Applied | Applied | 23 October, before #145. |
| `00035` (Singpass) | Applied | Applied | Staging 23 October, before #146; production 23 October, before #149 |
| `00036` (Singpass auto-approve, listing review) | Applied | Applied | **Run before the PR's code reaches that environment**: Hosting, listing pages, I'm keen and checkout read `listings.review_status`. Run after `00035`. Existing listings stay live (they are marked approved) |
| `00037` (session reminders) | Applied | Applied | Staging 24 October; production 25 October, before #163 |
| `00038` (what guests should bring) | Applied | Applied | Production 25 October, before #163. After `00037`. |

Earlier migrations are assumed applied on both, since these build on them.

---

# Production sync, October 2026

Merging `staging` into `main` so production runs the current tree. Owner: Rui Heng. PR #129 (19 October) brought `main` up to `00031` and the dispute, complaint and chargeback functions. #130 to #132 are still on `staging` only.

**Before the next merge into `main`:**
- [ ] GitHub secrets `PRODUCTION_SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN` valid (the deploy step fails without them)
- [ ] `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` set as production Edge Function secrets (`lookup-postal-code`, from #132)

**After the merge:**
- [x] Live Stripe "Connected accounts" webhook destination for `account.updated`, and `STRIPE_CONNECT_WEBHOOK_SECRET` on production (see Connected accounts webhook below). Done 25 October: `account.updated` only, snapshot payload, and `STRIPE_CONNECT_WEBHOOK_SECRET` set on production.
- [ ] One real card booking on production, then refund it
- [ ] Production cron `pg_net` timeout raised to about 30 seconds (the hourly `release-payout` call)
- [ ] Production end to end test without real checkout, then on a phone

---

# Email confirmation at signup (Supabase Auth)

New accounts confirm their email before they can sign in (DECISIONS.md, 20 October). Supabase sends one email with a 6-digit code and a link; the site asks for the code in the same tab. The code ships first; the dashboard switch is last, so nothing breaks in between: with confirmation off, signup still signs people straight in.

Do every step on **staging** (`hzgybclfvpuxkmytdoos`, site trykai.vercel.app), test, then repeat on **production** (`dqqlwofluvhikebtjune`, site trykai.sg) once the code is on `main`. Owner: Caleb.

1. **Send auth email through Resend.** Authentication, Emails, SMTP Settings, turn on custom SMTP:
   - Sender email `no-reply@trykai.sg`, sender name `TryKai`
   - Host `smtp.resend.com`, port `465`, username `resend`
   - Password: a new Resend API key with sending access only, one per project ("Supabase Auth staging", "Supabase Auth production"). Paste it straight into Supabase; it never goes in chat or the repo.

   This is what broke signup before (ENGINEERING.md section 7): Supabase's built-in mailer sends only a few emails an hour, and only to team members. Password reset emails go through Resend too once this is on.
2. **Raise the email rate limit.** Authentication, Rate Limits, "Rate limit for sending emails": 100 per hour.
3. **Paste the branded template.** Authentication, Emails, Templates, **Confirm signup**:
   - Subject: `Your TryKai code: {{ .Token }}`
   - Body: the whole of `supabase/templates/confirm-signup.html`, from the branch that environment runs.

   The file is generated from `confirmSignupTemplateHtml` in `_shared/email.ts`. After changing that function, regenerate with `UPDATE_AUTH_TEMPLATES=1 npx vitest run auth-templates` and paste again on both projects.
4. **Check the URLs.** Authentication, URL Configuration. Site URL is that environment's site. Redirect URLs include `https://trykai.sg/**` (production) or `https://trykai.vercel.app/**` (staging). The link returns the guest to the page they were heading for; an address not on the list falls back to the Site URL, and the email is still confirmed.
5. **Check the code settings.** Authentication, Sign In / Providers, Email: Email OTP Length 6, Email OTP Expiration 3600 seconds (the email says "works for an hour").
6. **Turn on Confirm email** on the same page. Existing accounts are already confirmed (signup stamped them while this was off); to check, `select count(*) from auth.users where email_confirmed_at is null;` should be 0. Anyone it counts will be asked for a code at their next login, which the site handles.
7. **Test with a fresh Gmail address**, on a phone:
   - [ ] The email arrives in the inbox (not spam) within a minute, branded, with the code in the subject
   - [ ] Typing the code signs you in and returns you to where you were (start from a listing's I'm keen)
   - [ ] The button in the email also confirms (try it in the mail app's browser)
   - [ ] "Send a new code" works after the 60-second countdown, and only the newest code works
   - [ ] Logging in before confirming asks for a code instead of failing
   - [ ] Signing up again with the same address says to log in instead

| Step | Staging | Production |
|---|---|---|
| 1 to 5 | Not yet | Not yet |
| 6 Confirm email on | Not yet | Not yet |
| 7 Tested | Not yet | Not yet |

---

# Singpass Myinfo (host verification)

Hosts can confirm who they are with Singpass instead of uploading an ID (DECISIONS.md, 23 October). Singpass gives TryKai their name, date of birth and mobile number and a Singpass identifier; no NRIC number and no documents. The host sees these and confirms before anything is saved. Do staging end to end first. Production needs Singpass's approval (up to 2 weeks), and the button stays hidden there until it is approved. Owner: Caleb. Never paste a private key into chat.

**Staging** (Supabase `hzgybclfvpuxkmytdoos`, site trykai.vercel.app, Singpass portal set to **Staging**):

1. **Run `00035`** in the staging SQL Editor, then merge the Singpass PR.
2. **Make keys.** Signed in as an admin on the staging site, open `/admin/singpass-keys` and click Generate keys. Keep the page open for steps 3 and 4.
3. **Create the Singpass app.** Singpass Developer Portal, Staging, **+ New app**:
   - App type: **Singpass Myinfo**
   - App name: `TryKai`
   - Redirect URI: `https://trykai.vercel.app/verify-identity/singpass`
   - JWKS: paste box 3 from the keys page (the public set)
   - Scopes (data items): **openid**, **Name**, **Date of birth**, **Mobile number**. Nothing else: not NRIC/FIN, email, address or nationality. Justifications if asked: name, to confirm the host is a real, identifiable person; date of birth, to confirm hosts are 18 or older as our Terms require; mobile number, to reach a host about their sessions or in a safety incident.
   - Submit, then copy the **App ID** (32 letters and digits).
4. **Add five Edge Function secrets** (staging Supabase, Edge Functions, Secrets):
   - `SINGPASS_CLIENT_ID` = the App ID
   - `SINGPASS_ISSUER` = `https://stg-id.singpass.gov.sg/fapi`
   - `SINGPASS_REDIRECT_URI` = `https://trykai.vercel.app/verify-identity/singpass`
   - `SINGPASS_SIGNING_KEY` = box 1
   - `SINGPASS_ENCRYPTION_KEY` = box 2

   Then close the keys page.
5. **Show the button on staging.** Vercel, Settings, Environment Variables: `VITE_SINGPASS_ENABLED` = `true`, for **Preview** only (staging). Redeploy staging.
6. **Test** with a Myinfo test persona (Singpass portal, Testing; the staging Singpass app from TestFlight). On `/verify-identity`, tap Verify with Singpass, log in, check "Check your details" shows the persona's name and date of birth locked and the mobile editable (try a persona with no mobile: the page asks for one), tap Confirm and continue, and land on "You're verified" (with `00036`; before it, "Under review"). Create your listing should open the listing form. Then:
   - the same persona from a second TryKai account should say the Singpass is already linked
   - a persona under 18, if the test set has one, should say hosts must be 18 or older
   - tapping Cancel on "Check your details" should return to the verify page and save nothing

If the button says Singpass isn't available, the function logs name the missing or malformed secret.

**Production** (after staging passes):

1. Run `00035` on production before the code syncs to `main`.
2. New keys from `/admin/singpass-keys` on trykai.sg (never reuse staging keys).
3. Portal set to **Production**: same app settings with redirect URI `https://trykai.sg/verify-identity/singpass`. Upload the user journey document and submit for approval (up to 2 weeks).
4. Production secrets: the same five, with `SINGPASS_ISSUER` = `https://id.singpass.gov.sg/fapi` and the production App ID and keys.
5. Once Singpass approves: `VITE_SINGPASS_ENABLED` = `true` for **Production**, then redeploy.

Rotate keys at least once a year: add the new public key to the app before switching secrets, then remove the old one an hour later (Singpass caches keys for about an hour).

| Step | Staging | Production |
|---|---|---|
| `00035` | Done | Done |
| App created | Done | Submitted 24 October, awaiting approval |
| Secrets set | Done | Not yet |
| Button on (`VITE_SINGPASS_ENABLED`) | Done (Preview, `staging` branch) | Not yet, after approval |
| Tested | Done 23 October (persona with no mobile) | Not yet |

---

# Listing review (`listing-submitted`, `admin-listings`)

Every new listing is hidden from guests until someone on the team approves it (DECISIONS.md, 23 October, `00036`). The host can add dates straight away; only guests are kept out. Owner: Caleb, with Rui Heng as backup.

**When a listing comes in.** `listing-submitted` emails `ADMIN_NOTIFY_EMAIL` ("New listing to review: <title>") the moment the host saves. Open `/admin/listings` (also in the menu as Listing review, admins only). Aim to decide within a few hours: the host is waiting to share it.

**What to check.**
- It is a real, in-person session this host can plausibly teach (Singpass name and the description agree; for an upload host, they are also on Verification review)
- The photos look like theirs and show the activity, not stock images
- It is not on the turn-away list (BUSINESS.md): nothing medical, risky without certification, or adult
- Price, length and group size make sense; the description says what guests will do and what level it is for

**Deciding.**
- **Approve and go live**: the listing appears in browse at once and the host gets "<title> is live on TryKai" with a link.
- **Ask for a change**: write the one thing to fix (up to 500 characters; it is emailed to the host and shown on their Hosting page). The listing moves to "Waiting on the host". When they save an edit, it comes back to the queue and you get "Listing updated for review".

**If the email never came.** The page is the source of truth: anything waiting is on `/admin/listings` whether or not the email arrived. `listing-submitted` needs `RESEND_API_KEY` and `ADMIN_NOTIFY_EMAIL` (defaults to calebong2002@gmail.com); its logs show any failure. The host's next save retries.

**Not reviewed again:** edits to a listing that is already approved (KIV). To pull a live listing, ask for a change with the SQL below, or suspend the host.

```sql
-- Send a live listing back to review (it disappears from browse at once).
update public.listings
set review_status = 'changes_requested', review_note = 'What needs fixing', reviewed_at = now()
where id = '<listing id>';
```

| Step | Staging | Production |
|---|---|---|
| `00036` run | Done 23 October | Done 23 October |
| New listing emails the team | Not yet | Not yet |
| Approve and ask-for-change emails reach the host | Not yet | Not yet |

---

# New verification alert (`notify-verification-pending`)

Every host now verifies by upload, so Caleb needs an email when one arrives. The email comes from a **database webhook**, set up per project in the dashboard. Production had none on 23 October (no `NOTIFY_FUNCTION_SECRET` secret). Until it is set up, check `/admin/verifications` yourself after each onboarding call.

1. **Make a secret.** Any long random string, for example from a password manager. Add it as the Edge Function secret `NOTIFY_FUNCTION_SECRET` (Edge Functions, Secrets).
2. **Create the webhook.** Database, Webhooks, Create a new hook:
   - Name `notify-verification-pending`, table `public.users`, events **Update** only
   - Type: Supabase Edge Functions, function `notify-verification-pending`, method POST
   - HTTP header `x-notify-secret` = the secret from step 1
3. **Test:** submit a verification with a test account. An email titled "New host verification pending review" should arrive at `ADMIN_NOTIFY_EMAIL` (default calebong2002@gmail.com), with what they want to teach.

The function ignores every update except a move into `pending`, so other profile edits send nothing.

| | Staging | Production |
|---|---|---|
| Secret and webhook | Check | Not set up |

---

# Platform webhook (`stripe-webhook`)

The platform destination (signing secret `STRIPE_WEBHOOK_SECRET`) carries every event on the TryKai account. `stripe-webhook` answers 200 to anything it does not handle, so a missing event is silent: check this list whenever the function learns a new event.

**Do this once per Stripe mode (test, then live) and once per function project (staging, then production).**

1. Open https://dashboard.stripe.com (Test mode on for staging).
2. **Developers → Webhooks**, open the **Your account** destination whose URL is `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` (create it with **Add destination → Your account** if it is missing, then set its `whsec_…` as `STRIPE_WEBHOOK_SECRET`).
3. **Edit destination → Select events.** It must listen to exactly these:
   - `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`: confirm or cancel the booking.
   - `identity.verification_session.verified`, `identity.verification_session.requires_input`: host verification outcome.
   - `charge.dispute.created`: hold the host payout and email ops (**Card chargeback** below).
   - `charge.dispute.closed`: email ops the outcome. The hold is not cleared.
   - `charge.refunded`: record refunds made in the Stripe Dashboard on the booking.
4. Save. Adding events keeps the same signing secret, so no secret changes.
5. Set `ADMIN_NOTIFY_EMAIL` as an Edge Function secret if ops mail should not go to the default (`calebong2002@gmail.com`). The chargeback emails and `notify-verification-pending` both use it.

Check it in test mode with the Stripe CLI: `stripe trigger charge.dispute.created`. That makes a new test payment with no booking, so `stripe-webhook` logs should show `webhook: chargeback opened` with `outcome: 'no_booking'`, and ops should get the email.

---

# Connected accounts webhook (`account.updated`)

The platform webhook (`STRIPE_WEBHOOK_SECRET`) receives payment and Identity events on the TryKai account. Connect `account.updated` for Express hosts is sent to a **Connected accounts** destination, which has its own signing secret. Without that destination, Hosting return still re-reads the account via `create-account-link` `{ refresh: true }`, but later payout capability changes never reach the database.

**Do this once per Stripe mode (test, then live) and once per function project (staging, then production).**

1. Open https://dashboard.stripe.com (Test mode on for staging).
2. **Developers → Webhooks → Add destination** (or **Add endpoint**).
3. Choose **Connected accounts** (not your account / platform events).
4. Endpoint URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook` (same URL as the platform webhook).
5. Listen to **`account.updated`** only. Save.
6. Copy the destination signing secret (`whsec_…`).
7. Set it as an Edge Function secret. Dashboard: https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/functions/secrets — add `STRIPE_CONNECT_WEBHOOK_SECRET`. CLI: `supabase secrets set STRIPE_CONNECT_WEBHOOK_SECRET='whsec_…' --project-ref hzgybclfvpuxkmytdoos`
8. Redeploy `stripe-webhook` so it reads the new secret: `supabase functions deploy stripe-webhook --project-ref hzgybclfvpuxkmytdoos`

`stripe-webhook` tries `STRIPE_WEBHOOK_SECRET` first, then `STRIPE_CONNECT_WEBHOOK_SECRET` if set. A signature that matches neither is rejected. An `account.updated` for an `acct_` that is not in `users.stripe_account_id` is ignored.

Keep the existing platform destination for `payment_intent.*`, Identity, and `charge.*` events (**Platform webhook** above). Do not put those on the Connected-accounts destination.

---

# Host Transfers (`release-payout`)

Stripe logs a Transfer (`tr_`) only when `release-payout` creates one. The function was in the repo but nothing called it, which is why Overview showed platform **STRIPE PAYOUT** (`po_` to Aspire) and refunds, but no host Transfers.

Merging the GitHub PR does **not** do any of this. You still have to click in Stripe and in the **trykai-staging** Supabase project. Do the same later on production, with production URLs and keys.

**Project:** trykai-staging, ref `hzgybclfvpuxkmytdoos`  
**Dashboard:** https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos

Write one password-manager note called `PAYOUT_CRON_SECRET (staging)` and reuse that exact string in steps 2, 3, and 4. Generate it with `openssl rand -hex 32` in Terminal, or any 32+ character random string. Do not commit it.

## 1. Stripe: stop automatic payouts to the bank

This is the **platform** Stripe account (TryKai), not a host's Connect account. Automatic payouts empty the platform balance. Host Transfers then fail, and retrying without pinning to the original charge would take a later guest's funds.

1. Open https://dashboard.stripe.com (the TryKai account).
2. Turn **Test mode** on if you are working on staging sandbox charges (toggle in the top right). Live mode is a separate setting; you will repeat this on live before real money.
3. Go to **Settings** (gear) → **Payouts**, or open https://dashboard.stripe.com/settings/payouts (add `/test` after `.com` when Test mode is on: https://dashboard.stripe.com/test/settings/payouts). Some accounts label this **Bank accounts and scheduling**.
4. Set the payout schedule to **Manual**. Save.
5. Confirm: you should no longer see daily/weekly automatic **STRIPE PAYOUT** (`po_`) emptying the balance. You pay TryKai's own bank later, by hand, from **Balances → Pay out**, only after host Transfers have run.

Leave historical test charges that already paid out to the bank. Those cannot be Transferred from the original `source_transaction`. New bookings after this switch can.

## 2. Deploy `release-payout` and set `PAYOUT_CRON_SECRET`

The function checks header `x-cron-secret` against the Edge Function secret `PAYOUT_CRON_SECRET` (or fallback `CRON_SECRET`). Setting the secret is instant; the **new** skip-reason logs and charge backfill only exist after you deploy the merged function.

**Secret (Dashboard, no CLI):**

1. Open https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/functions/secrets
2. If the left nav says **Edge Functions**, click **Secrets**.
3. Add key `PAYOUT_CRON_SECRET` and paste the string from your password note. Save.
4. You do not need to redeploy just for the secret. You **do** need to deploy for the new code.

A push to `staging` or `main` deploys every function in `supabase/functions/` through `.github/workflows/ci.yml` (`scripts/deploy-edge-functions.mjs`). That needs the `SUPABASE_ACCESS_TOKEN` GitHub secret, created at https://supabase.com/dashboard/account/tokens for an account that can deploy Edge Functions. Do not commit the token. Production also needs `PRODUCTION_SUPABASE_PROJECT_REF`. Pull requests only check that each function directory matches `config.toml`. The commands below are the manual path for one function.

**Deploy the function (CLI; this function imports `_shared`, so do not paste it into the Dashboard editor):**

```bash
supabase login
supabase link --project-ref hzgybclfvpuxkmytdoos
supabase functions deploy release-payout --project-ref hzgybclfvpuxkmytdoos
```

Confirm at https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/functions that `release-payout` shows a fresh deploy time.

Optional CLI equivalent for the secret: `supabase secrets set PAYOUT_CRON_SECRET='paste-the-same-string' --project-ref hzgybclfvpuxkmytdoos`

## 3. Apply migration `00010` and the three Vault secrets

`00010` creates `invoke_release_payout()` and the hourly pg_cron job. Vault holds the URL, anon key, and cron secret because those differ per project and must not live in git. The database cron **cannot** read Edge Function secrets; that is why Vault is a second copy.

**Apply the migration**

1. Open the file https://github.com/mrcalubi/trykai/blob/staging/supabase/migrations/00010_schedule_release_payout.sql and copy the whole file.
2. Open the SQL editor: https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/sql/new
3. Paste, click **Run**. Success is enough. Notices about `pg_cron not available` mean the Database → Extensions page needs `pg_cron` and `pg_net` enabled; enable both, then run the file again.

**Confirm the cron row** (new query in the same SQL editor):

```sql
select jobid, jobname, schedule, command from cron.job
where jobname = 'invoke-release-payout-hourly';
```

You want one row, schedule `12 * * * *` (minute 12 every hour, UTC).

**Copy the anon public key**

1. Open https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/settings/api
2. Copy the **anon** / **public** key (sometimes labelled publishable). Not the `service_role` key.

**Create the Vault secrets** (skip any name that already exists):

```sql
select name from vault.decrypted_secrets
where name in ('release_payout_url', 'release_payout_anon_key', 'payout_cron_secret');

select vault.create_secret(
  'https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/release-payout',
  'release_payout_url',
  'Hourly host Transfer job'
);
select vault.create_secret(
  'PASTE_ANON_PUBLIC_KEY',
  'release_payout_anon_key',
  'Gateway JWT; the function still checks x-cron-secret'
);
select vault.create_secret(
  'PASTE_SAME_VALUE_AS_PAYOUT_CRON_SECRET',
  'payout_cron_secret',
  'x-cron-secret for release-payout'
);
```

`payout_cron_secret` in Vault must match `PAYOUT_CRON_SECRET` on the function. If a name already exists and the value is wrong, update it with `vault.update_secret(id, 'new value')` using the `id` from `vault.decrypted_secrets`. You can also add named secrets under **Integrations → Vault** in the Dashboard.

Production uses that project's URL and keys, not the staging ref above.

## 4. Run it once now (do not wait until minute 12)

Replace the two placeholders with the **anon public key** and the **same cron secret**.

On macOS / Linux / Git Bash, backslash continues the line:

```bash
curl -fsS -X POST 'https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/release-payout' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer PASTE_ANON_PUBLIC_KEY" \
  -H "apikey: PASTE_ANON_PUBLIC_KEY" \
  -H "x-cron-secret: PASTE_PAYOUT_CRON_SECRET" \
  -d '{}'
```

On **Windows PowerShell**, `curl` is `Invoke-WebRequest`, which does not accept `-H`. Use `curl.exe` (one line is safest) or the native cmdlet:

```powershell
curl.exe -fsS -X POST "https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/release-payout" -H "Content-Type: application/json" -H "Authorization: Bearer PASTE_ANON_PUBLIC_KEY" -H "apikey: PASTE_ANON_PUBLIC_KEY" -H "x-cron-secret: PASTE_PAYOUT_CRON_SECRET" -d "{}"
```

```powershell
Invoke-RestMethod -Method Post -Uri "https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/release-payout" -ContentType "application/json" -Headers @{ Authorization = "Bearer PASTE_ANON_PUBLIC_KEY"; apikey = "PASTE_ANON_PUBLIC_KEY"; "x-cron-secret" = "PASTE_PAYOUT_CRON_SECRET" } -Body "{}"
```

If the cron secret itself contains `"` or `'`, do not put it inside the header quotes. Paste it between `@'` and `'@` (the closing `'@` must be at the start of its own line):

```powershell
$secret = @'
PASTE_PAYOUT_CRON_SECRET
'@
$key = "PASTE_ANON_PUBLIC_KEY"
Invoke-RestMethod -Method Post -Uri "https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/release-payout" -ContentType "application/json" -Headers @{ Authorization = "Bearer $key"; apikey = $key; "x-cron-secret" = $secret } -Body "{}"
```

**What you should see**

- `401 Unauthorized`: the `x-cron-secret` does not match `PAYOUT_CRON_SECRET`, or you used the wrong project.
- JSON with `scanned`, `due`, `released`, `failed`, `skipped_by_reason`, `skipped`: the function ran. That is success even if `released` is `0`.
- `released` greater than 0: look in Stripe Test mode under **Payments → Transfers** (or **Balance → Transfers**) for `tr_` rows.

Also open **Edge Functions → release-payout → Logs** and look for a line starting `release-payout`.

| Log field | Meaning |
|---|---|
| `hold_not_elapsed` | Session ended less than 72 hours ago (end = `starts_at` + `duration_mins`). Expected. |
| `invalid_duration` | Session has no positive `duration_mins`, so its end time is unknown. Fix the row; the next run pays it. |
| `dispute_hold` | Ops placed a guest dispute hold (`payout_hold_reason`). Not paid until the hold is released or a partial refund clears it. See **Guest dispute refund**. |
| `missing_charge_id` | Stripe PaymentIntent has no `latest_charge` yet. |
| `host_not_connected` / `host_payouts_disabled` | Host has not finished Connect onboarding. |
| `failed` + insufficient available funds | Platform available balance is too low (automatic payouts already sent it to the bank). Two Transfers can succeed and the rest fail in the same run. In **test mode**, Stripe's own message is the fix: create a charge with card `4000000000000077` (any future expiry and CVC) so funds land in the available balance, then run the same command again. Bookings already in `released` are not paid twice. |

GitHub secrets `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_PAYOUT_CRON_SECRET` (and `PRODUCTION_*`) are optional on staging because of the database cron. They are needed for production once `.github/workflows/release-payout.yml` is on `main`. GitHub **schedule** only runs from `main`. **Actions → Release host payouts → Run workflow** works after that.

---

# Session reminders (`send-reminders`)

Guests and hosts get one email when an open session starts in 2–24 hours. The function claims `bookings.guest_reminder_sent_at` / `sessions.host_reminder_sent_at` first, so a second run sends nothing. A booking created less than 6 hours ago is skipped so the reminder does not stack on the confirmation. Each run caps at 200 emails.

Merging the GitHub PR deploys the function (CI on push to `staging`). **Apply `00037` on the project before you merge**, or the first hourly call will query columns that are not there yet. Do the same later on production, with production URLs and keys, before that deploy.

Production is set up as of 25 October (`REMINDERS_CRON_SECRET` and the three Vault secrets).

**Project:** trykai-staging, ref `hzgybclfvpuxkmytdoos`  
**Dashboard:** https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos

Write one password-manager note called `REMINDERS_CRON_SECRET (staging)` and reuse that exact string in the Edge Function secret and in Vault. Generate it with `openssl rand -hex 32` in Terminal. Do not commit it.

## 1. Apply migration `00037` before merging

1. Open https://github.com/mrcalubi/trykai/blob/feat/session-reminders/supabase/migrations/00037_session_reminders.sql (or the file on the PR) and copy the whole file.
2. Open the SQL editor: https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/sql/new
3. Paste, click **Run**. Success is enough. Notices about `pg_cron not available` mean the Database → Extensions page needs `pg_cron` and `pg_net` enabled; enable both, then run the file again. Safe to run twice.

**Confirm the cron row** (new query in the same SQL editor):

```sql
select jobid, jobname, schedule, command from cron.job
where jobname = 'invoke-send-reminders-hourly';
```

You want one row, schedule `17 * * * *` (minute 17 every hour, UTC). That is five minutes after `invoke-release-payout-hourly` so the two jobs do not start together.

## 2. Deploy `send-reminders` and set `REMINDERS_CRON_SECRET`

The function checks header `x-cron-secret` against the Edge Function secret `REMINDERS_CRON_SECRET` (or fallback `CRON_SECRET`). Setting the secret is instant; the new code only exists after you deploy (or after CI deploys on merge to `staging`).

**Secret (Dashboard, no CLI):**

1. Open https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/functions/secrets
2. If the left nav says **Edge Functions**, click **Secrets**.
3. Add key `REMINDERS_CRON_SECRET` and paste the string from your password note. Save.

A push to `staging` or `main` deploys every function through `.github/workflows/ci.yml`. The commands below are the manual path for one function.

```bash
supabase login
supabase link --project-ref hzgybclfvpuxkmytdoos
supabase functions deploy send-reminders --project-ref hzgybclfvpuxkmytdoos
```

Confirm at https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/functions that `send-reminders` shows a fresh deploy time.

Optional CLI equivalent for the secret: `supabase secrets set REMINDERS_CRON_SECRET='paste-the-same-string' --project-ref hzgybclfvpuxkmytdoos`

## 3. The three Vault secrets

Vault holds the URL, anon key, and cron secret because those differ per project and must not live in git. The database cron **cannot** read Edge Function secrets; that is why Vault is a second copy.

**Copy the anon public key**

1. Open https://supabase.com/dashboard/project/hzgybclfvpuxkmytdoos/settings/api
2. Copy the **anon** / **public** key (sometimes labelled publishable). Not the `service_role` key.

**Create the Vault secrets** (skip any name that already exists):

```sql
select name from vault.decrypted_secrets
where name in ('send_reminders_url', 'send_reminders_anon_key', 'reminders_cron_secret');

select vault.create_secret(
  'https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/send-reminders',
  'send_reminders_url',
  'Hourly session reminder job'
);
select vault.create_secret(
  'PASTE_ANON_PUBLIC_KEY',
  'send_reminders_anon_key',
  'Gateway JWT; the function still checks x-cron-secret'
);
select vault.create_secret(
  'PASTE_SAME_VALUE_AS_REMINDERS_CRON_SECRET',
  'reminders_cron_secret',
  'x-cron-secret for send-reminders'
);
```

`reminders_cron_secret` in Vault must match `REMINDERS_CRON_SECRET` on the function. If a name already exists and the value is wrong, update it with `vault.update_secret(id, 'new value')` using the `id` from `vault.decrypted_secrets`. You can also add named secrets under **Integrations → Vault** in the Dashboard.

Production uses that project's URL and keys, not the staging ref above.

## 4. Run it once now (do not wait until minute 17)

Replace the two placeholders with the **anon public key** and the **same cron secret**.

```bash
curl -fsS -X POST 'https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/send-reminders' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer PASTE_ANON_PUBLIC_KEY" \
  -H "apikey: PASTE_ANON_PUBLIC_KEY" \
  -H "x-cron-secret: PASTE_REMINDERS_CRON_SECRET" \
  -d '{}'
```

**What you should see**

- `401 Unauthorized`: the `x-cron-secret` does not match `REMINDERS_CRON_SECRET`, or you used the wrong project.
- JSON with `guests_scanned`, `guests_sent`, `hosts_scanned`, `hosts_sent`, `skipped`, `failed`: the function ran. That is success even if both `*_sent` values are `0`.
- A second curl in the same minute should send nothing: the claim timestamps are already set.

Also open **Edge Functions → send-reminders → Logs** and look for a line starting `send-reminders`.

**Check the cron is still scheduled** (any time later):

```sql
select jobid, jobname, schedule, command from cron.job
where jobname = 'invoke-send-reminders-hourly';
```

To see recent runs: **Database → Extensions** has `pg_cron` enabled, then:

```sql
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'invoke-send-reminders-hourly')
order by start_time desc
limit 10;
```

---

# Guest dispute refund

Use this for a quality complaint (Dispute Policy: raised within 3 days after the session ends, reply within 2 business days). Decline complaints raised later. The window closes when the 72-hour payout hold does, so place the hold the moment a complaint arrives; one sent on the last day can otherwise miss the hourly payout run. Safety reports follow SAFETY_RESPONSE_PROTOCOL.md first; money is handled the same way. Do not edit `bookings` rows in Table Editor for any of this.

Two functions:

- `admin-dispute-booking`: hold the host payout, release the hold, or make a **partial** refund without cancelling the booking.
- `admin-cancel-booking` with `"reason": "dispute"`: **full** refund and cancel. The guest gets a refund receipt, not "your host had to cancel". No strike, no host email.

Both run as **you**: they check your own sign-in and that your account has `is_admin`, and every hold, release, partial refund, and admin cancel writes a row to `booking_money_events` with your user id (step 5). Needs migrations `00029` and `00030` applied and both functions deployed. Amounts are **cents** (S$15.50 is `1550`).

## Sign in and get your access token

1. Open the TryKai site for the project you are working on and sign in with your admin account.
2. Open the browser DevTools console and run:

```js
JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token')))).access_token
```

3. Copy the long `eyJ...` value. It is your session: treat it like a password, do not paste it in chat, and expect it to expire after about an hour (get a fresh one the same way).

```powershell
$h = @{ Authorization = "Bearer PASTE_ACCESS_TOKEN"; apikey = "PASTE_ANON_PUBLIC_KEY" }
```

- `401 Unauthorized`: the token expired or was not pasted whole. Get a fresh one.
- `403 Not authorised`: your account does not have `is_admin`.

**Break-glass (only if no admin can sign in).** The old shared secret still works, but the log cannot tell who used it, so it needs your name in `x-admin-operator`. Tell the team afterwards. Unsetting `ADMIN_FUNCTION_SECRET` turns this off.

```powershell
$h = @{ Authorization = "Bearer PASTE_ANON_PUBLIC_KEY"; apikey = "PASTE_ANON_PUBLIC_KEY"; "x-admin-secret" = "PASTE_ADMIN_FUNCTION_SECRET"; "x-admin-operator" = "Your name" }
```

## In-app reports (Report a problem)

Most complaints now arrive from the guest's booking page (`report-booking-problem`, migration `00031`). The function refuses anything outside the window (session start to 3 days after the end), saves the text in `booking_complaints`, puts photos in the private Storage bucket `complaint-evidence`, **places the payout hold itself** (`payout_hold_reason = 'dispute'`), and emails `ADMIN_NOTIFY_EMAIL` with the report. Replying to that email goes to the guest. The guest gets an acknowledgement promising a reply within 2 business days.

- If the ops email says **Not held**, the payout had already gone out, was refunded, or was already on hold. Check the booking (step 0) before step 3.
- Photos: **Storage → complaint-evidence →** `<booking id>/<complaint id>/`. They are deleted 180 days after the report by `purge-verification-docs` (same daily run); the text stays.
- One report per booking. Anything the guest adds comes by email.
- Skip step 1 for these; go to step 2.

Emailed complaints still follow every step below. Safety reports have no time limit and never go through the in-app form.

## 0. Find the booking

The guest quotes a booking reference: the first 8 characters of `bookings.id`, uppercase. In **SQL Editor** (read only):

```sql
select id, status, total_amount, refund_amount, host_payout_amount,
       payout_released_at, payout_hold_reason, stripe_refund_id, stripe_partial_refund_ids
from public.bookings
where id::text ilike 'a1b2c3d4%';
```

## 1. Hold the payout as soon as the complaint arrives

Payouts go out 72 hours after the session ends. Hold first, investigate second.

```powershell
$url = "https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/admin-dispute-booking"
Invoke-RestMethod -Method Post -Uri $url -ContentType "application/json" -Headers $h -Body '{"action":"hold","booking_id":"FULL-BOOKING-UUID","reason":"dispute","note":"Quality complaint: guest says the host arrived 40 minutes late. Support thread 2026-10-19."}'
```

```bash
curl -fsS -X POST 'https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/admin-dispute-booking'   -H 'Content-Type: application/json'   -H "Authorization: Bearer PASTE_ACCESS_TOKEN"   -H "apikey: PASTE_ANON_PUBLIC_KEY"   -d '{"action":"hold","booking_id":"FULL-BOOKING-UUID","reason":"dispute","note":"Quality complaint: guest says the host arrived 40 minutes late. Support thread 2026-10-19."}'
```

`reason` is a code, `"dispute"` (the default) or `"chargeback"`, and is the only thing written to the booking. The **guest and host can both read it** on their own booking, so the database refuses anything else. `note` is required and goes only to the admin-only `booking_money_events` log: say what happened and where the support thread is. It is kept permanently and cannot be edited, so keep it factual; evidence stays in the support thread.

- `409 ... already released`: the host was already paid. Skip to step 3, "After release".
- `release-payout` logs the booking as `dispute_hold` from the next hourly run.

## 2. Decide, then reply within 2 business days

Agree an outcome with the team: no action, partial refund, or full refund. Note it in the support thread with the booking reference.

## 3a. No refund

```json
{"action":"release_hold","booking_id":"FULL-BOOKING-UUID","note":"No action: host showed the session started on time."}
```

Same headers and URL as step 1. `note` is optional but say why. If the 72 hours have passed, the next hourly run pays the host.

## 3b. Partial refund (booking stays confirmed)

Pick the guest refund and what the host should still get. Guest refunds plus host payout can never exceed what the guest paid (`total_amount`). The host payout can only go down.

```json
{"action":"partial_refund","booking_id":"FULL-BOOKING-UUID","refund_amount_cents":1500,"new_host_payout_cents":2500,"note":"Agreed 50/50 on the late start."}
```

The function refunds that amount on the original PaymentIntent, adds it to `refund_amount`, lowers `host_payout_amount`, records the Stripe refund id in `stripe_partial_refund_ids`, **clears the hold**, and emails the guest a refund receipt. The host is paid the new amount on the next hourly run once 72 hours have passed. Tell the host by email yourself; there is no automatic host email yet.

The response shows `total_refunded_cents`, `host_payout_cents`, and `platform_keeps_cents`. Stripe keeps its processing fee, so TryKai's real margin is lower than `platform_keeps_cents`.

**After release** (`payout_released_at` is set): omit `new_host_payout_cents`. The refund has to fit inside TryKai's own share (`total_amount - refund_amount - host_payout_amount`). If it does not, the function refuses with a `409` that names the most TryKai can absorb. Then either refund up to that amount, or recover money from the host first (Stripe Dashboard → the Transfer → **Reverse**, after telling the host), then use 3c or a manual Stripe refund. Note anything done by hand in DECISIONS.md or the support thread.

**Errors**

- `409 Place a dispute hold first`: run step 1, then retry.
- `400 ... Lower new_host_payout_cents`: the split adds up to more than the guest paid.
- `500 Stripe refund re_... was created but the booking was not updated`: if `refund_amount` on the row is unchanged, send the **same** request again (the idempotency key returns the same refund, no double refund). If it changed, someone else refunded at the same time; record the `re_` id by hand and check Stripe before anything else.

## 3c. Full refund and cancel

```powershell
Invoke-RestMethod -Method Post -Uri "https://hzgybclfvpuxkmytdoos.supabase.co/functions/v1/admin-cancel-booking" -ContentType "application/json" -Headers $h -Body '{"booking_id":"FULL-BOOKING-UUID","reason":"dispute","note":"Upheld: session did not match the listing."}'
```

Refunds whatever is left on the payment (after any earlier partial refund), cancels the booking, clears the hold, and emails the guest a refund receipt. Without `"reason":"dispute"` the guest is told their host cancelled. If the response has `"payout_already_released": true`, the host had been paid and the whole refund came out of TryKai's balance: recover it from the host as in 3b.

## 4. Afterwards

- Strikes or warnings for the host are separate (Dispute Policy); use the existing strike process.
- Production uses that project's URL, anon key, your sign-in on the production site, and (break-glass only) that project's admin secret, not the staging ref above.

## 5. Audit trail

Every hold, release, partial refund, and admin cancel is a row in `booking_money_events`: who (`actor_user_id`, or `break_glass` with the operator name in `note`), what, how much, the host payout before and after, and the Stripe refund id. It is admin-only (no app user can read it) and append-only (nobody can edit or delete rows, not even the service role). In **SQL Editor**:

```sql
select e.created_at, e.action, e.auth_method, u.email as actor, e.amount_cents,
       e.host_payout_before, e.host_payout_after, e.stripe_object_id, e.note
from public.booking_money_events e
left join public.users u on u.id = e.actor_user_id
where e.booking_id = 'FULL-BOOKING-UUID'
order by e.created_at;
```

If a response has `"audit_logged": false`, the action **did** happen but its row was not saved. Do not retry the action (a retried refund refunds twice). Copy the row from the function log line `booking_money_events insert failed` and insert it in SQL Editor, keeping the same values and adding to the note that it was recorded by hand.

---

# Card chargeback

A guest's bank opened a dispute on the card payment. Stripe takes the disputed amount plus a dispute fee from the platform balance immediately, whatever the outcome. This is not the Dispute Policy complaint flow above; the guest went to their bank instead of TryKai.

**What happens automatically** (needs the `charge.dispute.*` events on the platform webhook):

- `charge.dispute.created`: `stripe-webhook` finds the booking by charge id, then PaymentIntent. If the payout has not gone out it sets `payout_hold_reason` to `chargeback` (replacing a `dispute` hold) and `release-payout` skips it as `dispute_hold`. The dispute id and bank reason are in `booking_money_events` (`select * from public.booking_money_events where booking_id = '…' order by created_at;`). Ops get an email at `ADMIN_NOTIFY_EMAIL` with the booking reference, amount, bank reason, evidence deadline, and whether the hold landed, was already in place, came too late (host already paid), or found no booking.
- `charge.dispute.closed`: ops get the outcome. **The hold is never cleared automatically.**

## 1. Respond in Stripe before the evidence deadline

Use the email's **Respond in Stripe** link. Evidence: the booking confirmation email, session date and address, any guest messages, and the host's account of the session. Ask the host for theirs. Missing the deadline loses the dispute.

Do not refund the guest while the dispute is open, in Stripe or through `admin-dispute-booking` / `admin-cancel-booking`. A won or lost dispute already settles the money, and a refund on top can pay the guest twice.

If the email says the host was **already paid**, decide with the team whether to recover from the host (Stripe Dashboard → the Transfer → **Reverse**, after telling them). Otherwise TryKai carries the loss if the dispute is lost.

## 2. When it closes

- **won** or **warning_closed** (an inquiry that never became a chargeback): `{"action":"release_hold","booking_id":"FULL-BOOKING-UUID"}` (Guest dispute refund, step 1 headers and URL). The host is paid on the next hourly run once 72 hours have passed.
- **lost**: the guest has their money back from the bank. Leave the hold in place if the host should not be paid (`release-payout` keeps skipping it), or release it if the host delivered and TryKai absorbs the loss. Do not use `partial_refund` or `admin-cancel-booking`; both would refund the guest again. Note the decision in the support thread with the booking reference.

## Refunds made in the Stripe Dashboard

`charge.refunded` raises `refund_amount` to the charge's total refunded and adds the `re_` id to `stripe_partial_refund_ids`. It does **not** lower `host_payout_amount`, set `stripe_refund_id`, or hold the payout, so the host is still paid in full on schedule. Use `admin-dispute-booking` / `admin-cancel-booking` for refunds instead. If a Dashboard refund is unavoidable before the payout, place a hold first (Guest dispute refund, step 1) and fix the split after.

---

# Pre launch checklist

Run through this before soft launch. Mark every item done, not done, or blocked.

## Payments
- [x] Payment provider and account model resolved (Stripe Connect, separate charges and transfers, Express, 16 August)
- [ ] End to end flow working on staging test-mode: guest pays → booking confirmed → host notified
- [ ] Booking status updates correctly, pending to confirmed (code path exists; needs a live Stripe test)
- [x] Booking confirmation email to guest (staging, 14–21 September; production `RESEND_API_KEY` unconfirmed)
- [x] Booking notification email to host (same)
- [ ] Platform fee correctly calculated: 12% of lesson, S$2.50 floor, round up to a whole dollar (see DECISIONS.md). Code exists in `_shared/booking.ts`
- [ ] PayNow 5% off the advertised all-in total at checkout (not 8% versus 10%)
- [ ] Failed payment handled gracefully, clear error, no ghost booking
- [ ] Payout flow tested, Transfer 72 hours after the session ends (`release-payout` scheduled; platform payouts must be manual). See **Host Transfers** above.
- [x] Refund, cancellation, and dispute policy pages live
- [x] Policy page URLs resolve when typed directly, not just via in site navigation

## Listings
- [ ] Creation flow complete: title, description, category, price, area, photos, what's provided
- [ ] Photo upload working, up to 5
- [ ] Listing appears on browse after creation
- [ ] Category pills working
- [ ] Area dropdown working
- [ ] Detail page shows all information correctly
- [ ] Full address hidden on browse, revealed only after confirmed booking
- [ ] Host name and avatar visible
- [ ] Average rating on card and detail page
- [ ] Edit working
- [ ] Soft delete working, `is_active = false` rather than deletion
- [ ] Prices displayed in dollars everywhere guest facing

## Sessions
- [ ] Host can add sessions with date, time, spots
- [ ] Spots decrement correctly on booking
- [ ] Spots increment correctly on cancellation
- [ ] Session shows as full at zero spots
- [ ] Past sessions not bookable

## Host verification
- [ ] ID upload working, private bucket
- [ ] Selfie upload working, private bucket
- [ ] Status updates to pending on submission
- [ ] Caleb receives email on new submission
- [ ] Host receives email on approval
- [ ] Host receives email on rejection
- [ ] Unverified host redirected when trying to create a listing
- [ ] Pending host sees the under review message
- [ ] Approved host can create listings

## Cancellations
- [ ] Guest can cancel from the Bookings tab (invokes `cancel-booking`; `/bookings` redirects there)
- [ ] Four tier refund correctly calculated, 100 / 50 / 25 / 0 at 48hr, 24hr, 6hr, with platform fee forfeited on partial tiers
- [x] Refund amount stored and included directly in the cancellation email
- [ ] Guest can reschedule instead of cancelling, once per booking, 48hr cutoff
- [ ] Host can cancel from the Hosting tab (`/hosting` redirects there)
- [ ] Host cancellation increments strikes
- [ ] Guest can report a host no show, distinct from host initiated cancel, triggering 2 strikes and account review
- [ ] Host can appeal a strike within 7 days
- [ ] Immediate suspension works independently of the strike counter
- [ ] 3 strikes deactivates listings
- [ ] Cancellation policy shown on the listing detail page before booking
- [ ] Both parties emailed on cancellation
- [ ] Manual refund process documented and ready (dispute partial and full refunds: **Guest dispute refund** above)

## Reviews
- [ ] Guest can review only after a confirmed, completed booking
- [ ] Host can review only after a confirmed, completed booking
- [ ] One review per booking per direction enforced
- [ ] Reviews visible on listing detail and host profile
- [ ] Average rating calculated correctly
- [ ] Review prompt appears after the session date passes

## Dashboard
- [ ] Host view on own profile Hosting tab (`/hosting` redirects): listings, upcoming sessions, Add Session, Edit, payout setup
- [ ] Host view: Cancel with strike warning
- [ ] Guest view on own profile Bookings tab (`/bookings` redirects): upcoming and past bookings
- [ ] Guest view: Cancel with refund amount shown (calls `cancel-booking`, does not PATCH bookings from the browser)
- [ ] Guest view: Leave review after the session
- [ ] Both views on one account (own profile tabs: Bookings; Hosting if `is_host`)

## Auth and accounts
- [ ] Signup, login, logout working
- [ ] User row created on signup
- [ ] Password reset working (built: Forgot password on Login and `/reset-password`; test once auth email goes through Resend)
- [ ] Email confirmed before first sign-in (see Email confirmation at signup)
- [ ] Phone OTP required before booking
- [ ] `is_host` set true on first listing
- [ ] Avatar or initial in navbar when logged in (`SiteNav` / `TopNav`; `Navbar.jsx` is deleted)

## Legal, required before any real money moves
- [x] Terms of Service live at /terms
- [x] Privacy Policy live at /privacy
- [x] Refund Policy live
- [x] Cancellation Policy live
- [x] Dispute Policy live
- [x] DPO contact, privacy@trykai.sg, visible in the Privacy Policy and site footer
- [x] UEN 53526159D visible in the footer or About page
- [x] T&C checkbox at signup
- [ ] T&C checkbox at create listing
- [ ] T&C acknowledgment at checkout
- [x] Age 18+ gate in signup terms
- [ ] Founders' agreement signed by all three

## Email
- [x] All Edge Functions off the Resend test domain in code, sending from trykai.sg (staging confirmed; production `RESEND_API_KEY` unconfirmed)
- [x] Booking confirmation to guest (staging)
- [x] Booking notification to host (staging)
- [ ] Verification submission to Caleb
- [ ] Verification approved to host
- [ ] Verification rejected to host
- [ ] Cancellation notification to both parties
- [ ] All emails render correctly
- [ ] All emails reach the inbox, not spam. Test across multiple providers.

## UI and design
- [ ] Navy #16264B and cream #F4F1EA consistent throughout
- [ ] Bricolage Grotesque for display, Manrope for body, monospace for prices and tags
- [x] Logo and favicon implemented (`public/trykai.png`, `favicon.svg` / png sizes, apple-touch-icon)
- [ ] Mobile responsive on iOS Safari and Android Chrome
- [x] No broken images or missing assets for StyleGuide categories or `/trykai.png` (language/other PNG imports stay commented out)
- [ ] Loading states on all async actions
- [ ] Error states handled, no blank screens or raw errors
- [ ] Empty states handled

## Security and data
- [ ] RLS enabled on all tables
- [ ] RLS audit complete: no self approval of verification status, no self reset of strikes, no cross user document access
- [x] `full_address` never exposed in a public query (`00025` column grant; `listing_address()` is the only client path)
- [ ] Verification documents in a private bucket
- [ ] Prices stored as integers in cents
- [ ] No sensitive data in client side code or console logs
- [x] Database schema in version control (`supabase/migrations/` `00001`–`00012`)

## Infrastructure
- [x] trykai.sg pointing at Vercel
- [x] SSL active
- [x] 404 page exists (catch-all route, `NotFound.jsx`)
- [ ] Basic meta tags on key pages
- [x] Favicon showing

## Host onboarding experience
- [x] Photography guidance shown during listing creation
- [ ] Creation flow is clear to a non technical host
- [ ] Host knows what to expect after submitting verification
- [ ] Host knows what to expect once the listing is live
