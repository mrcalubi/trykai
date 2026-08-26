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

## Progress snapshot, 25 August 2026

A working session across 22 to 25 August closed out a large block of foundation work, some of it ahead of its planned week. This block records what is now genuinely done, so the week by week sections below are read as the historical plan rather than the current state.

**Done and verified on staging:**
- Staging Supabase environment stood up and in active use. Closes the carried forward week 2 and 3 item.
- Canonical schema in version control. Closes the top priority technical fix carried from week 2.
- Signup was completely broken by an RLS gap that stopped a new account writing its own row. Fixed. Host verification submission was blocked the same way. Fixed. Suspension fields added. All captured in `00003_staging_hotfixes_22aug.sql`. The three security self audit holes from week 2 and 3 (self approving `verification_status`, resetting `host_strikes`, reading another user's verification documents) are closed by column grants, RLS policies, and a guard trigger.
- Atomic `spots_remaining` decrement built and tested via a `confirm_booking` security definer function. This was a week 5 critical item, now done early.
- Full address reveal on confirmed bookings, via a `get_listing_address` security definer function. Closes the `full_address` written but never read gap.
- Four tier cancellation refund built by Ruiheng and verified correct against the published policy. This was a week 5 item.
- Automated CI test suite (318 unit and component tests plus 58 browser tests) and branch protection added by Ruiheng. Every merge now runs checks. This is new infrastructure not in the original plan.
- A UI component library and top nav built: Button, Input, Card, SelectableCard, TopNav, HamburgerMenu, previewable at a private `/style-guide` route. On the `style-guide-page-staging` branch, not yet merged.

**Still open from the plan:**
- Safety response protocol is now drafted (`SAFETY_RESPONSE_PROTOCOL.md`) but not ratified or enforced in the app. The suspension fields exist but nothing in the app enforces them yet, so a suspended account's listings are not automatically hidden.
- Insurance quote, still not obtained.
- Founders' agreement, still unsigned. Ruiheng still not told about the three way equal profit share.
- The two pricing decisions (guest fee restructure and host fee trigger) are now **decided**, see DECISIONS.md, so the week 5 fee rebuild has final numbers to build against.

**In flight, needs Ruiheng:**
- The component library PR is waiting to merge. Ruiheng's CreateListing auth fix landed on `main`, the PR targets `staging`, so they may be out of sync. Resolve whether to retarget the PR or sync staging with main.
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

## WEEK 3, current
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
- [CRITICAL] Verify trykai.sg in Resend, switch all four Edge Functions off the shared test domain
- [CRITICAL] Shared secret header check on the unauthenticated function endpoints. **Must land the same week**, not after. Once a real domain is sending, an unauthenticated endpoint becomes an open phishing relay.

### CALEB
- [STANDARD] Continue host verification and listing quality reviews

### AAKASH
- [HIGH] Continue content calendar and outreach

**Risk:** these two items are deliberately paired. Do not ship the Resend change without the header check.

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
| **Payment provider unresolved** | **Live now** | **Critical** | Decide by end of week 4 regardless of HitPay's response. Fallbacks documented in DECISIONS.md. |
| Payment weeks 5 to 8 get fragmented | High | High | Protect these as blocked, uninterrupted time. Fragment weeks 1 to 4 or 9 to 12 instead if something must give. |
| Estimates prove optimistic for a solo dev on unfamiliar code | Medium | Medium | Honest checkpoint at the week 5 scrum. The carry over process makes slippage visible weekly rather than all at once. |
| Warm contact hosts go quiet over a longer runway | Medium | High | One to one confirmation, repeated close to week 10, not assumed from week 1 commitments. |
| Listing quality too low at launch | Medium | High | QC every listing in week 11. Reject with specific feedback. Do not approve to be polite. |
| Feature creep during a longer runway | High | Medium | Everything new goes on the post launch list regardless of how much time appears to be left. A longer timeline is not permission to add scope. |
| A founder disengages over a longer runway | Low | High | Monthly check ins make this visible early. |
| Yide day trading listing creates liability | Low | High | Frame as experience sharing only, explicit disclaimer, law student review. |
| Off platform leakage | Low at this scale | Medium | Reviews only through TryKai, brief hosts during onboarding. |

---

# Pre launch checklist

Run through this before soft launch. Mark every item done, not done, or blocked.

## Payments
- [ ] Payment provider and account model resolved
- [ ] End to end flow working: guest pays → booking confirmed → host notified
- [ ] Booking status updates correctly, pending to confirmed
- [ ] Booking confirmation email to guest
- [ ] Booking notification email to host
- [ ] Platform fee correctly calculated, tiered not flat, S$2 floor applied
- [ ] PayNow discount working at checkout, 8% versus 10%
- [ ] Failed payment handled gracefully, clear error, no ghost booking
- [ ] Payout flow tested, released 24 hours after the session
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
- [ ] Guest can cancel from dashboard
- [ ] Four tier refund correctly calculated, 100 / 50 / 25 / 0 at 48hr, 24hr, 6hr, with platform fee forfeited on partial tiers
- [ ] Refund amount stored and included directly in the cancellation email
- [ ] Guest can reschedule instead of cancelling, once per booking, 48hr cutoff
- [ ] Host can cancel from dashboard
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
- [ ] Host view: listings, upcoming sessions, Add Session, Edit
- [ ] Host view: Cancel with strike warning
- [ ] Guest view: upcoming and past bookings
- [ ] Guest view: Cancel with refund amount shown
- [ ] Guest view: Leave review after the session
- [ ] Both views accessible from one account

## Auth and accounts
- [ ] Signup, login, logout working
- [ ] User row created on signup
- [ ] Password reset working
- [ ] Phone OTP required before booking
- [ ] `is_host` set true on first listing
- [ ] Avatar or initial in navbar when logged in

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
- [ ] All Edge Functions off the Resend test domain, sending from trykai.sg
- [ ] Booking confirmation to guest
- [ ] Booking notification to host
- [ ] Verification submission to Caleb
- [ ] Verification approved to host
- [ ] Verification rejected to host
- [ ] Cancellation notification to both parties
- [ ] All emails render correctly
- [ ] All emails reach the inbox, not spam. Test across multiple providers.

## UI and design
- [ ] Navy #16264B and cream #F4F1EA consistent throughout
- [ ] Bricolage Grotesque for display, Manrope for body, monospace for prices and tags
- [ ] Logo and favicon implemented
- [ ] Mobile responsive on iOS Safari and Android Chrome
- [ ] No broken images or missing assets
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
- [ ] Database schema in version control

## Infrastructure
- [x] trykai.sg pointing at Vercel
- [x] SSL active
- [ ] 404 page exists
- [ ] Basic meta tags on key pages
- [ ] Favicon showing

## Host onboarding experience
- [ ] Photography guidance shown during listing creation
- [ ] Creation flow is clear to a non technical host
- [ ] Host knows what to expect after submitting verification
- [ ] Host knows what to expect once the listing is live
