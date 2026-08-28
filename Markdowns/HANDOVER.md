# TryKai: Handover

*Written 25 August 2026 to carry context into a new conversation. Paste this at the start of a fresh chat, along with the other documents. Supersedes the 16 August handover.*

---

## What TryKai is

Peer to peer skill and experience marketplace for Singapore. Individuals list short, in person sessions teaching a skill, priced S$10 to S$40. Guests browse, book, and pay through the platform. TryKai takes a booking fee. It runs as a website (trykai.sg), not an app, which is a deliberate advantage: someone can open a shared listing link and browse instantly with no install.

Sole proprietorship, UEN 53526159D, owned by Ong Kai Le Caleb. Pre launch, zero revenue. **Soft launch target: week of 20 October 2026**, warm contacts only, 15 to 20 listings.

**Team.** Caleb, CEO and product, carries all legal and financial liability, identifies as a vibe coder with limited technical depth. Rui Heng Leong, sole engineer, **8 hours a week, which is the binding constraint on everything, roughly 64 engineering hours left to launch**. Aakash Chidambaram, marketing, growth, and host recruitment.

---

## Read these first

| File | Purpose |
|---|---|
| README.md | Status snapshot, index, and the rules that keep the docs honest |
| BUSINESS.md | Positioning, lanes, competition (now includes ToGatherSG), model, growth, team, equity, entity |
| DECISIONS.md | Current state by theme, an append only log, and an explicit list of things analysed but not decided |
| ENGINEERING.md | Stack, schema, business rules, file map, end to end flows. The document Cursor reads first. |
| BUILD_BACKLOG.md | Prioritised build queue, P0 to P3, with done items marked |
| OPERATIONS.md | Week by week plan and pre launch checklist, plus a 25 August progress snapshot |
| HOST_ONBOARDING.md | Internal onboarding process plus host facing guidelines |
| DESIGN.md | Visual identity, plus the component library and UI decisions built this session |
| SAFETY_RESPONSE_PROTOCOL.md | Drafted 23 August, the process behind the public suspension promise, not yet ratified |
| FOUNDERS_AGREEMENT.md | Unsigned. Equity, profit sharing, roles, removal process |
| cancellation / refund / dispute policy | Published website content |

Live data deliberately kept out of markdown: host roster in a Google Sheet, expenses in EXPENSES.xlsx, bugs in Ruiheng's tracker.

**Core doc rule, which this project has been burned by before: one fact, one home.** The same fact written in three places is how the equity split, the launch date, and the cancellation rule all drifted. When two docs disagree, say so rather than picking one.

---

## State of play, 25 August

**Payments.** Stripe Connect, separate charges and transfers, Express accounts, decided 16 August. The money loop is now in the codebase: all-in card prices, Card vs PayNow PaymentIntents, signed `stripe-webhook` → `confirm_paid_booking`, Connect Express onboarding, `cancel-booking` refunds, and `release-payout` Transfers 24h after `starts_at`. Do not adapt the HitPay stash. Ops still required: Stripe Dashboard webhook + secrets, platform payouts set to **manual**, founding hosts flagged `is_founding_host`, staging test-mode booking.

**The requirement that constrains all payment design:** the host's share is held until 24 hours after the session takes place, not after the guest pays. Guests book weeks ahead. Every published refund guarantee depends on that hold. Stripe Connect preserves it.

**What now works, all built and tested on staging this session (22 to 25 August):**
- Staging Supabase environment exists and is in active use, it is a full copy of the live database.
- Canonical schema in version control.
- Signup was completely broken by an RLS gap that stopped a new account writing its own row. Fixed. Host verification submission was blocked the same way. Fixed. Suspension fields added. All captured in `00003_staging_hotfixes_22aug.sql`.
- The three flagged RLS escalation holes are closed: a user can no longer self approve verification, reset their own strikes, or read another user's verification documents.
- Three trusted security definer functions exist: `submit_verification` (user can reach pending, never approved), `confirm_booking` (atomic spots decrement, tested), `get_listing_address` (address only for host or confirmed guest).
- Full end to end guest and host journey works on staging: signup, verification, create listing, browse, book, confirm, address reveal, cancel with correct four tier refund.
- Ruiheng added an automated CI test suite (318 unit and component tests plus 58 browser tests) and branch protection. Every merge now runs checks. Do not expect to merge with red checks.
- A UI component library and top nav built on `style-guide-page-staging`, previewable at `/style-guide`.

**In flight, needs Ruiheng:**
- The component PR is waiting to merge. Ruiheng's CreateListing auth fix landed on `main`; the PR targets `staging`; they may be out of sync. Open question sent to him: retarget the PR to main, or sync staging with main first.
- Confirm the staging database hotfixes have been applied to production, since they do not travel through a code merge. Signup being broken is very likely also true on production until this is done.

**Banking.** Aspire, approved 13 August.
**Email.** Zoho Mail Lite for team mail, Resend for transactional (still on a shared test domain, delivers only to Caleb, needs the real domain verified).

---

## Decisions made this session (22 to 25 August)

All logged in DECISIONS.md Part B. The two big pricing decisions that were previously open are now closed:

**Guest fee.** Card fee 12% with a S$2.50 floor, rounded up to a clean all in total shown identically from browse through checkout, the price never rises between viewing and paying. PayNow shown as a flat 5% discount at checkout, as a bold percentage. Tested 4/5/6/8%; 5% is where the guest saving stays real and margin holds across the whole S$10 to S$40 band. Presentation is likely all in pricing with the discount at checkout, so the price only ever gets cheaper than advertised.

**Host fee.** 10%, triggered per host, not platform wide. Every non founding host's first three bookings free, fourth onward pays, starting immediately. Replaces the old 500 cumulative bookings trigger, which would never have activated in year one (481 projected bookings). Checked against Airbnb's 15.5% and GrabFood/Foodpanda's 15 to 30%; 10% is well below both. Founding hosts still permanently exempt.

**Off platform leakage** flagged as requiring three conditions together (fee pain, mutual benefit, established relationship), most likely in Lane 2, and the per host waiver concentrates the fee's onset near where relationships form.

**Competitor on record: ToGatherSG.** Direct peer, same idea, launched June 2026, building since October 2025. After roughly two months live: 22 listings, only 5 reviews. Weaknesses to exploit: app download required to browse, two separate apps for host and guest, no date/couples framing, group minimum sessions, chaotic S$15 to S$125 pricing. Their design is polished but cartoonish, the exact direction DESIGN.md already rejected. Full writeup in BUSINESS.md.

**Also this session:** safety response protocol drafted. Component library and top nav built. Mobile-first, top nav not bottom nav for launch (bottom nav collides with browser chrome on the web; revisit when TryKai is an app).

---

## Open, needing attention

- **Insurance quote**, slipped three times now. Non technical, genuinely just requesting one. Real launch blocker.
- **Founders' agreement unsigned**, and Ruiheng still has not been told about the three way equal profit share.
- **Safety protocol** drafted but not ratified, and the app does not yet enforce the suspension fields that exist.
- Remaining P0 admin work: the payout queue and suspension enforcement are the two that are genuinely dangerous to keep doing by hand. Verification approval survives the Table Editor for now.
- Still deferred in DECISIONS.md: price ceiling for businesses, which axis drives top level navigation, five year transaction retention.
- Caleb has a standing KIV to re run the four tier cancellation refund check on `main` once the merges settle.

---

## Useful numbers

Stripe Singapore: cards 3.4% + S$0.50, PayNow 1.3%. Processing charged on the full amount collected.

Under the new fee structure, all in totals a guest sees: S$10 lesson shows S$13, S$20 shows S$23, S$25 shows S$28, S$30 shows S$34, S$40 shows S$45. Kai nets roughly S$1.25 to S$3.14 per booking depending on price and rail, no dead spot anywhere in the band. PayNow shows a real saving of roughly S$0.90 to S$2.25 across the band.

Year one projection: 481 bookings, roughly break even. Year three: about 5,040 bookings, S$26,688 revenue. Host fee is the single largest revenue lever.

Host economics at S$25 with four guests: about S$34 an hour after materials, S$17 with two. Fill rate is worth about four times what the host fee costs. A 10% host fee removes exactly 14.7% of after-materials profit at any group size.

Cheap date band: S$15 to S$25 per person, since under S$60 for two is where the "good for a date" framing is literally true.

---

## How to work on this

**Honest pushback over validation.** Caleb asks "what am I missing" and "is this right" and means it. Several of the best calls in this project, including the per host fee trigger and catching bugs before merge, came from him rejecting a first suggestion or checking a claim. He is fine being told his premise is wrong.

**Be specific about uncertainty.** Distinguish verified, inferred, and guessed. Real errors in this project came from confident wrong claims, for example an early assertion that Stripe meant losing PayNow (false), and, this session, a confident wrong claim that Airbnb's mobile browse is a single column (it is two columns). Caleb catches these; make it easy by flagging confidence honestly.

**Numbers over adjectives.** Modelling changed the strategy more than discussion did.

**Do not narrate process.** Caleb moves fast and prefers the answer to the how.

**Formatting:** no dashes or em dashes in anything generated. Reasonably concise.

**Workflow reality:** Claude is architect and strategist, Cursor is builder, Caleb is product owner and tester. Cursor prompts start with "Read ENGINEERING.md and DECISIONS.md first, then...". The project uses plain CSS in `index.css`, not Tailwind. When giving Cursor build prompts, tell it to continue on the current branch rather than spawn new ones if that is the intent, and to match the existing CSS approach.

**Caleb is not technical.** For anything hands on, give exact steps and exact things to check, not explanations of why the code works. When something touches money, safety, or auth, err toward caution and toward it being Ruiheng's call rather than a vibe coded fix.

---

## What to pick up next

1. Resolve the component PR merge with Ruiheng (retarget to main, or sync staging), then merge it and confirm checks are green.
2. Confirm the staging hotfixes are applied to production, signup may be broken on the live site until then.
3. Wire the built components into the real pages, Home first, then continue the mobile-first browse build.
4. Stripe ops: apply `00005` on staging, wire the webhook, set platform payouts to manual, run one test-mode booking. The code path is in the repo.
5. Get the insurance quote. Tell Ruiheng about the profit share, then circulate the founders' agreement.
6. Push the updated docs (this whole set) to the repo so Cursor reads current versions, this is the first thing to do after starting the new chat.
