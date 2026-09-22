# TryKai: Operations

Week by week execution plan and the pre launch checklist. Updated live at the Saturday scrum.

**Target: soft launch, week of 20 October 2026.** Warm contacts only, 15 to 20 listings across two or three categories.

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

**Ongoing, Caleb:** every cost logged in EXPENSES.xlsx the day it occurs. The founder loan balance must always be current.

---

## Progress snapshot, 21 September 2026

Week 8 of the original plan (15–21 September) is ending. The week-by-week sections below stay as the historical plan. Read this snapshot first.

**In the tree now (not true of the 31 August snapshot):**
- Schema is `00001`–`00010`. `00008` is `can_create_listing()` for listing and session INSERT. `00009` is booked/hosted session and listing reads, plus the drop of leftover booking INSERT/UPDATE policies. `00010` schedules `release-payout` hourly via pg_cron.
- `Navbar.jsx` is deleted. `SiteNav` mounts `TopNav` once in `App.jsx`. Hamburger is navigation only. Avatar is Settings and Log out.
- Browse uses the kit `Card` and shows the card all-in price. Input is live on Settings and Login. Button is live on Settings. SelectableCard is still `/style-guide` only.
- Guest bookings at `/bookings`, host tools and payout setup at `/hosting`, profile at `/settings`. `/dashboard` redirects.
- trykai.sg is verified in Resend. From-address is `TryKai <no-reply@trykai.sg>`. `notify-verification-pending` is secret-gated. `notify-verification-result` is gone. Staging booking confirmation emails confirmed arriving.
- `cancel-booking` emails the guest the refund amount (including $0) and the host only on a guest cancel. `/bookings` and `/hosting` invoke that function.
- StyleGuide category PNGs and `public/trykai.png` are in the repo.
- Edge Functions: `create-payment-intent`, `stripe-webhook`, `create-connect-account`, `create-account-link`, `cancel-booking`, `admin-cancel-booking`, `admin-verifications`, `create-identity-session`, `notify-verification-pending`, `purge-verification-docs`, `release-payout`.

**Still ops, not app code:**
- Confirm `00005`, `00008`, `00009`, and `00010` on each environment. Confirm production has `RESEND_API_KEY` and current function deploys. This repo cannot see production.
- Apply `00010` and set Vault secrets so `release-payout` actually runs. The GitHub Action only fires from `main`. Platform payouts must stay **manual**. See **Host Transfers** below.
- Stripe Dashboard webhook + secrets, `is_founding_host` flags, one test-mode booking.
- Confirm the two test cancellations were refunded on Stripe. API PATCH 204s are the expected service-role writes from `cancel-booking`, not proof of a client bypass.

**Open in the app:**
- Bug 4: Hosting treats `?connect=return` as "Payout setup submitted" without re-checking `stripe_payouts_enabled`.
- P0.4: browse and Book ignore `is_suspended`. INSERT is already gated by `00008`.
- P0.7: `listings.full_address` grant still too wide.
- Forgot password is not built.

**Carried non-engineering:** insurance quote, unsigned founders' agreement, Ruiheng not told about the profit share, safety protocol drafted but not ratified, production `00003` hotfix confirmation.

The 31 August and 25 August snapshots below are kept for history. They still describe Navbar, unverified Resend, and migrations stopping at `00007` / `00005`. That is no longer the tree.

---

## Progress snapshot, 31 August 2026

Week 5 of the original plan (25–31 August) is ending. The week-by-week sections below stay as the historical plan. Read this snapshot first.

**Payment code (original weeks 5–7 and most of 9) is in the tree:**
- Fee module matches DECISIONS.md: 12% card fee, S$2.50 floor, round up to a whole dollar, PayNow 5% off that all-in total, host fee 10% from the fourth confirmed booking, founding hosts never
- `stripe-webhook` confirms bookings, `confirm_paid_booking` decrements spots, `cancel-booking` refunds on the four-tier rule
- Connect Express onboarding and `release-payout` Transfers 24h after `starts_at`
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

**What you should see**

- `401 Unauthorized`: the `x-cron-secret` does not match `PAYOUT_CRON_SECRET`, or you used the wrong project.
- JSON with `scanned`, `due`, `released`, `failed`, `skipped_by_reason`, `skipped`: the function ran. That is success even if `released` is `0`.
- `released` greater than 0: look in Stripe Test mode under **Payments → Transfers** (or **Balance → Transfers**) for `tr_` rows.

Also open **Edge Functions → release-payout → Logs** and look for a line starting `release-payout`.

| Log field | Meaning |
|---|---|
| `hold_not_elapsed` | Session started less than 24 hours ago. Expected. |
| `missing_charge_id` | Stripe PaymentIntent has no `latest_charge` yet. |
| `host_not_connected` / `host_payouts_disabled` | Host has not finished Connect onboarding. |
| `failed` + insufficient available funds | Platform available balance is too low (automatic payouts already sent it to the bank). Two Transfers can succeed and the rest fail in the same run. In **test mode**, Stripe's own message is the fix: create a charge with card `4000000000000077` (any future expiry and CVC) so funds land in the available balance, then run the same command again. Bookings already in `released` are not paid twice. |

GitHub secrets `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_PAYOUT_CRON_SECRET` (and `PRODUCTION_*`) are optional on staging because of the database cron. They are needed for production once `.github/workflows/release-payout.yml` is on `main`. GitHub **schedule** only runs from `main`. **Actions → Release host payouts → Run workflow** works after that.

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
- [ ] Payout flow tested, Transfer 24 hours after the session (`release-payout` scheduled; platform payouts must be manual). See **Host Transfers** above.
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
- [ ] Guest can cancel from `/bookings` (invokes `cancel-booking`)
- [ ] Four tier refund correctly calculated, 100 / 50 / 25 / 0 at 48hr, 24hr, 6hr, with platform fee forfeited on partial tiers
- [x] Refund amount stored and included directly in the cancellation email
- [ ] Guest can reschedule instead of cancelling, once per booking, 48hr cutoff
- [ ] Host can cancel from `/hosting`
- [ ] Host cancellation increments strikes
- [ ] Guest can report a host no show, distinct from host initiated cancel, triggering 2 strikes and account review
- [ ] Host can appeal a strike within 7 days
- [ ] Immediate suspension works independently of the strike counter
- [ ] 3 strikes deactivates listings
- [ ] Cancellation policy shown on the listing detail page before booking
- [ ] Both parties emailed on cancellation
- [ ] Manual refund process documented and ready

## Reviews
- [ ] Guest can review only after a confirmed, completed booking
- [ ] Host can review only after a confirmed, completed booking
- [ ] One review per booking per direction enforced
- [ ] Reviews visible on listing detail and host profile
- [ ] Average rating calculated correctly
- [ ] Review prompt appears after the session date passes

## Dashboard
- [ ] Host view at `/hosting`: listings, upcoming sessions, Add Session, Edit, payout setup
- [ ] Host view: Cancel with strike warning
- [ ] Guest view at `/bookings`: upcoming and past bookings
- [ ] Guest view: Cancel with refund amount shown (calls `cancel-booking`, does not PATCH bookings from the browser)
- [ ] Guest view: Leave review after the session
- [ ] Both views reachable from one account (hamburger: My bookings; Hosting if `is_host`)

## Auth and accounts
- [ ] Signup, login, logout working
- [ ] User row created on signup
- [ ] Password reset working (not built; Login has no reset link)
- [ ] Phone OTP required before booking
- [ ] `is_host` set true on first listing
- [ ] Avatar or initial in navbar when logged in (`SiteNav` / `TopNav`; `Navbar.jsx` is deleted)

## Legal, required before any real money moves
- [ ] Terms of Service live at /terms
- [ ] Privacy Policy live at /privacy
- [x] Refund Policy live
- [x] Cancellation Policy live
- [x] Dispute Policy live
- [ ] DPO contact, privacy@trykai.sg, visible in the Privacy Policy and site footer
- [ ] UEN 53526159D visible in the footer or About page
- [ ] T&C checkbox at signup
- [ ] T&C checkbox at create listing
- [ ] T&C acknowledgment at checkout
- [ ] Age 18+ gate in signup terms
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
- [ ] `full_address` never exposed in a public query
- [ ] Verification documents in a private bucket
- [ ] Prices stored as integers in cents
- [ ] No sensitive data in client side code or console logs
- [x] Database schema in version control (`supabase/migrations/` `00001`–`00010`)

## Infrastructure
- [x] trykai.sg pointing at Vercel
- [x] SSL active
- [ ] 404 page exists
- [ ] Basic meta tags on key pages
- [x] Favicon showing

## Host onboarding experience
- [ ] Photography guidance shown during listing creation
- [ ] Creation flow is clear to a non technical host
- [ ] Host knows what to expect after submitting verification
- [ ] Host knows what to expect once the listing is live
