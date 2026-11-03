# TryKai: Handover

*Written 3 November 2026 against `staging` at #246 (two-way reviews), with `main` at #245. Supersedes the 1 November handover. Read this first if you are Cursor, a new Claude chat, or anyone picking up the code.*

---

## What TryKai is

Peer to peer skill and experience marketplace for Singapore. Individuals list short, in person sessions teaching a skill. Most sessions are S$15 to S$30 (S$10 to S$40 is guidance; the database caps a listing at S$500 as a typo guard). Guests browse, book and pay through the platform. Runs as a website, not an app.

Sole proprietorship, UEN 53526159D, owned by Ong Kai Le Caleb. **Hosts so far:** the first host (23 October), **Nicholas** (flower arranging, late October, `is_founding_host` set on production) and **Aakash** (DJ Basics). Most of the 28 October to 1 November work came from Nicholas's feedback. **First real booking: 2 November**, Caleb and Airica on Aakash's DJ class, paid by PayNow on production.

**Team.** Caleb, CEO and product, carries all legal and financial liability. Rui Heng Leong, engineer, 8 hours a week. Aakash Chidambaram, marketing, growth, host recruitment. TryKai's own earnings go to the business account (Aspire); how they reach the founders is set by the founders' agreement.

---

## Source of truth

**The repo's `Markdowns/` folder is current.** Claude Project copies are synced from it and may lag (synced 3 November). One fact, one home. When two docs disagree, say so rather than picking one. For any change, read the matching section of `ENGINEERING.md` (how it works), `DECISIONS.md` (why, newest entries at the bottom of the log) and `OPERATIONS.md` (what someone has to do by hand, and the migration table).

---

## How the work is done now

- **Normally Cursor builds** and Claude (Claude Code in the TryKai Project) writes Cursor prompts, reviews every PR (migration and money paths line by line), fixes small things directly on the PR branch, resolves merge conflicts, and opens the `staging` → `main` release PRs.
- **3 November: Cursor hit its monthly limit.** Until it resets, Claude builds too. Caleb decided against a separate reviewer agent (cost). So on Claude-built PRs: Claude does a separate line-by-line pass of migrations and money paths after building, ships a staging check script (`supabase/tests/*.sql`, runs inside `begin … rollback`) with every migration, attaches screenshots for anything on screen, lists what was not verified in the PR, and asks Caleb to look **before** merging when a real phone or real Stripe matters.
- **Design happens on the canvas first.** Design artifact "TryKai profile card layout" (https://claude.ai/artifact/JS7ACYVJxdeND4idRJcpCU), pages: Profile v2, Add-ons, Booking page, Two-way reviews, Who's coming. Cursor cannot see the canvas, so prompts describe it in words and Claude checks the result with screenshots or Caleb checks on staging.
- Branch from `staging`, one scope per branch, `npm run verify` and `npm run test:e2e`, PR into `staging`. **Caleb merges.** Nobody pushes to `staging` or `main` directly.
- Cursor prompt pattern: branch name, numbered scope, a Docs section (DECISIONS, ENGINEERING, OPERATIONS), a Tests section ("keep the coverage floors"), and "Report the PR link and any unmapped items".
- **Secrets stay with Caleb.** Never hold or ask for a Supabase access token. Caleb applies migrations and sets secrets himself.
- Caleb's preferences: one step at a time, plain language, honest pushback over validation, numbers over adjectives, **no em dashes in anything written for him or shown to users**. UI copy is short lines, not paragraphs: "Reviewed you · 5 days left", not three sentences of explanation (3 November). Fewer steps beats more explanation: an extra tap or an extra block of text on checkout is a regression even if it is "clearer".

---

## Environments

| | Staging | Production |
|---|---|---|
| Supabase project | `trykai-staging` (Free plan) | "Kai" (Pro, Mumbai `ap-south-1`) |
| Project ref | `hzgybclfvpuxkmytdoos` | `dqqlwofluvhikebtjune` |
| Site | trykai.vercel.app | trykai.sg |
| Branch | `staging` | `main` |

**Both projects show the "PRODUCTION" label in the Supabase dashboard.** Check the ref in the URL before any SQL.

CI runs lint, unit tests (floors: statements 92%, branches 87%), Playwright, build and Edge Function checks. A push to `staging` deploys every Edge Function to staging; a push to `main` deploys to production. Pull requests never deploy. Migrations are applied by hand: staging first, then production, with a production backup from the last 24 hours.

---

## Shipped 2 to 3 November

Details and reasons are in DECISIONS.md under the same dates.

- **Review photos** (#239, `00047`): guests attach up to 3 photos to a review. `reviews.photo_paths` stores storage object paths, not URLs; public `review-photos` bucket is insert-only in the caller's folder, 3 MB, JPEG and WebP. Thumbnails and lightbox on listing, profile and featured review; quiet Report link. The "TryKai just updated. Refresh the page" HEIC message actually shipped here (the 1 November handover said it already had).
- **Review form matches the canvas** (#240): "Leave a review" on the Bookings list opens `/bookings/:id#review`; outlined empty stars; one "Post review" button.
- **Emails send from `hello@trykai.sg`** (#241), so replies from guests and hosts reach the team. Supabase Auth emails stay `no-reply@`.
- **Telegram in-app browser** (#242): a cream band above the fixed nav so scrolled photos do not show through above it.
- **PayNow stays on Stripe's pop-up** (#243 reverted by #244). An own QR panel was built and tested on iPhone: worse (extra tap, and Save QR could not use the share sheet because Stripe's QR image host blocks our fetch, so it opened the bare PNG on qr.stripe.com). Only a short "take a screenshot" line on the PayNow payment step remains; Stripe's pop-up already gives similar advice.
- **Two-way reviews** (#246, `00048`, `00049`): on staging, not production. See "In flight".

## Shipped 26 October to 1 November

Details and reasons are in DECISIONS.md under the same dates.

**Profile, home and polish (#173 to #217).** Profile v2 (`00041`): banner, pills, stat cards, About, featured review, medals; Bookings, Hosting, Listings and Reviews as tabs on `/u/:id`. Unsaved-changes guard. Profile photo editor. Checkout asks "pick a method, then continue". Footer and email social icons. Payout gating and host setup checklist. Fresh Home from the logo, back restores scroll. Host strike events with 12-month expiry (`00039`), `host_sessions_held` (`00040`). SEO and canonical www host. Sentry. Singpass Myinfo live on production (26 October).

**From Nicholas's feedback (#218 to #234).**
- **Photos:** 8 per listing, View in the tile menu, Show all on desktop, warmer five-shot tips. HEIC failures after a deploy now say "TryKai just updated. Refresh the page" and go to Sentry.
- **Sessions:** different times on different dates; the Add sessions draft survives leaving the page; **bookings close 3, 6, 12, 24 or 48 hours before** a session (per listing, default 3).
- **PayNow saving slides with the basket:** 5% under $20, 4% under $30, 3% under $60, 2% from $60, so PayNow never earns less than card after Stripe fees.
- **Add-ons** (`00042`, `00043`): up to 3 per listing, per person or per booking, optional photo and per-session limit. Guest pays the host's price plus 12%, rounded up per unit. **Host keeps 100%; no host fee on add-ons.** Never pre-selected. Bookings snapshot what was bought.
- **Booking fee is not refunded on guest cancellations** (any tier). Host, no-show and admin cancels still refund everything. Disclosed on the policy pages and one checkout line, no amounts.
- **Rescheduling** (`00044`, `00045`): a guest can move a confirmed booking once, up to 48 hours before, to another open session of the same listing. Price never changes.
- **Booking page rebuilt** to the canvas: When (Add to calendar, Invite a friend), Where (How to find it, Get directions, Copy address, day-of Call and WhatsApp), host card, receipt, a Manage booking sheet (move first, cancel one tap further), day-of, after and cancelled states.
- **How to find me, day-of number, note to host** (`00046`): private arrival directions, an opt-in host phone shown to confirmed guests from 24 hours before until the session ends, and a note on every booking.
- **Fixes:** a second bookings to sessions foreign key broke every PostgREST embed (now one key only, guarded by a test); supabase-js requests use `cache: 'no-store'`; buttons inherit the page font; site title "TryKai · Find your thing in Singapore".

**Decided, not built:** chat (deferred until in-app or WhatsApp notifications; the higher-value use is pre-booking questions). No "Verified with Singpass" badge: Singpass asked us not to; every verified host keeps "ID verified".

---

## Money model now

| | Rule | Code |
|---|---|---|
| Guest price | Host price + 12% (S$2.50 floor), rounded up to the dollar; group discount 5/10/15/20% on the lesson only | `booking.ts`, `pricing.js` |
| PayNow | Sliding 5/4/3/2% off the whole card total, add-ons included | `paynowDiscountRate` |
| Add-ons | `ceil(host price × 1.12)` per unit; host keeps the host price | `calculateBookingCharge` |
| Host fee | 10% of the **lesson only**, after the host's first 3 confirmed bookings; founding hosts never | `hostPayoutBreakdown` |
| Guest cancel | 48h+: everything except the booking fee; 24 to 48h: 50% of lesson and add-ons; 6 to 24h: 25%; under 6h: nothing | `calculateGuestRefund` |
| Host payout | 72 hours after the session ends, by the hourly `release-payout` job | OPERATIONS, Host Transfers |

**Decided 1 November:** on a late guest cancel the host fee stays 10% of the whole lesson, even when the host keeps only half or a quarter of it. The host is paid without teaching, so the full fee stands. Hosts see only the final "You'll receive" amount.

---

## State on 3 November

**Migrations.** `00001` to `00047` are on **staging and production** (`00047` was the prerequisite for release #245; confirm it is on production if in doubt). `00048` two-way reviews and `00049` lock reviews are on **staging only**. A test fails if two migrations share a number.

**Production.** `main` has everything to #245 (review photos, review form, hello@ sender, in-app nav band, PayNow note). Stripe live: Connected accounts webhook done (25 October), platform payout schedule **Manual** (set 1 November), payout cron running hourly.

**Staging ahead of production:** #246 two-way reviews. The next `staging` → `main` release carries it, so it is held until:
1. Caleb runs `supabase/tests/two_way_reviews_check.sql` on staging (no errors) and tests both sides on trykai.vercel.app.
2. Caleb approves the Terms §7 and privacy wording drafted in #246's description (with Claude's tweak: a host's star rating of a guest "is not shown publicly; it only counts toward your own milestones"), and the shorter guest waiting line "Thanks! Live when {host} reviews you, or on {date}." (KIV as of 3 November.)
3. Production order: backup, `00048`, merge the release, **then** `00049`. `00049` before the release would break listing ratings and review submit on trykai.sg.

**Manual payouts, how to.** Host money moves automatically. TryKai's own share waits in the Stripe balance until someone clicks Balances → Pay out. Before paying out, run on production:
```sql
select coalesce(sum(host_payout_amount), 0) / 100.0 as owed_to_hosts_sgd
from public.bookings
where status = 'confirmed' and payout_released_at is null and stripe_refund_id is null;
```
Safe to pay out = Stripe Available minus `owed_to_hosts_sgd` minus about S$50 buffer. Monthly is fine.

---

## In flight

**Two-way reviews** (#246, on staging). Hosts review guests; both reviews stay hidden until both post or 7 days after the session ends (blind reveal). Guests now also have a 7-day window. A host gives stars + a written review; the guest's stars are never shown (TryKai and milestones only); the words are public on the guest's profile under "From hosts". Both sides get an optional private note "Anything TryKai should know?" that only TryKai sees (`review_notes`, emailed to hello@). One guest review per booking; **one host review per person on a booking** (ready for companions). All writes go through `post_review`; reads go through RPCs that only return public reviews. New milestones: First kind words, Host favourite (guests), Good host (hosts). `review-emails` Edge Function nudges the other side and forwards private notes.

**Who's coming** (designed on the canvas page "Who's coming", being built by Claude). Group bookings get seats for friends: the booker sends one link, a friend signs in and takes a seat, gets a read-only booking page (directions, day-of number, no prices, no cancel or move), the session counts on their profile and milestones, and the host can review them. Only the booker reviews the host. One link per booking; Remove frees the seat and makes a new link. Claims stay open until 7 days after the session.

## Next work

1. Two-way reviews to production (see "State on 3 November").
2. Who's coming: PR from Claude, then staging check script, then Caleb tests with two accounts.
3. Founders' agreement, card booking test, insurance (see Carried). Only Caleb can do these.
4. More host feedback as it comes. BUILD_BACKLOG.md for everything else.

---

## Carried, status not rechecked

- Whether the two September test cancellations were refunded on Stripe
- Insurance quote
- Founders' agreement unsigned
- Safety response protocol drafted, not ratified
- Account deletion needs an anonymisation design (Rui Heng). Manual via contact us until then
- One real card booking on production, then refund it (OPERATIONS checklist). PayNow is proven on production (2 November); card is the last payment path never run with real money

---

## Operational rules

These cost real hours. Treat them as rules.

1. **Check the project ref in the URL before any SQL.** The dashboard label is not enough.
2. **Confirm production has a backup from the last 24 hours before any production SQL.**
3. **Apply a migration before merging code that reads it.** Code that selects a missing column breaks the page (or, in `stripe-webhook`, leaves a paid booking pending). Merging deploys Edge Functions immediately.
4. **Migration numbers are unique.** Two PRs once both shipped `00045`; renumber before merging (a test now catches it).
5. **Keep `bookings.session_id` the only foreign key from bookings to sessions.** A second one makes every `bookings (...)` or `sessions (...)` embed fail as ambiguous (HTTP 300, PGRST201).
6. **A browser can cache an API error.** If a page keeps failing after a database fix, check DevTools Network for "(disk cache)". Our client now sends `cache: 'no-store'`.
7. **After a deploy, hard refresh before testing.** A tab opened before a release asks for old code chunks (HEIC once failed this way).
8. **Verify the branch every time** (`git branch --show-current`). Cursor sometimes keeps work in its own workspace without pushing; ask it to push to a named branch.
9. **A push to `staging` or `main` deploys every Edge Function.** Set new function secrets on production before merging to `main`.
10. **Grant and revoke breakages share a shape:** a policy or query touching a column that was not granted. Test every flow that touches a table after a grant change.
11. **Date-relative tests break at month ends.** Pin the clock (`vi.setSystemTime`) when a test builds sessions "N hours from now" and checks a month view.
12. **Rule 3 applies to staging too.** #246 was merged before `00048` (3 November) and staging review posting broke until the migration went on. On production the same order would break trykai.sg.
13. **A lock-down migration ships separately from the code that stops needing the old access.** Two-way reviews: `00048` adds RPCs and changes nothing old; `00049` revokes table reads only after the new code is live. Any trigger or guard that reads a table you are locking must be `security definer` (the featured-review guard nearly broke this way).
14. **Anything built on a third party's UI or files (Stripe, Telegram, iOS share sheet) is tested on a real phone before merge, not after.** #243 passed every test and was still worse in Caleb's hand.
15. **Cursor branches from whatever `staging` was when it started.** If a revert lands meanwhile, the merge conflicts; keep `staging`'s side for the reverted part.
