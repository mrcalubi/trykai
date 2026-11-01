# TryKai: Handover

*Written 1 November 2026 against `staging` at #234, with the release to `main` open as #235. Supersedes the 25 October handover. Read this first if you are Cursor, a new Claude chat, or anyone picking up the code.*

---

## What TryKai is

Peer to peer skill and experience marketplace for Singapore. Individuals list short, in person sessions teaching a skill. Most sessions are S$15 to S$30 (S$10 to S$40 is guidance; the database caps a listing at S$500 as a typo guard). Guests browse, book and pay through the platform. Runs as a website, not an app.

Sole proprietorship, UEN 53526159D, owned by Ong Kai Le Caleb. **Hosts so far:** the first host (23 October) and **Nicholas** (flower arranging, late October, `is_founding_host` set on production). Most of the 28 October to 1 November work came from Nicholas's feedback.

**Team.** Caleb, CEO and product, carries all legal and financial liability. Rui Heng Leong, engineer, 8 hours a week. Aakash Chidambaram, marketing, growth, host recruitment. TryKai's own earnings go to the business account (Aspire); how they reach the founders is set by the founders' agreement.

---

## Source of truth

**The repo's `Markdowns/` folder is current.** Claude Project copies are synced from it and may lag (synced 1 November). One fact, one home. When two docs disagree, say so rather than picking one. For any change, read the matching section of `ENGINEERING.md` (how it works), `DECISIONS.md` (why, newest entries at the bottom of the log) and `OPERATIONS.md` (what someone has to do by hand, and the migration table).

---

## How the work is done now

- **Cursor builds.** Claude (Claude Code in the TryKai Project) writes Cursor prompts, reviews every PR (migration and money paths line by line), fixes small things directly on the PR branch, resolves merge conflicts, and opens the `staging` → `main` release PRs.
- **Design happens on the canvas first.** Design artifact "TryKai profile card layout" (https://claude.ai/artifact/JS7ACYVJxdeND4idRJcpCU), pages: Profile v2, Add-ons, Booking page. Cursor cannot see the canvas, so prompts describe it in words and Claude checks the result with screenshots or Caleb checks on staging.
- Branch from `staging`, one scope per branch, `npm run verify` and `npm run test:e2e`, PR into `staging`. **Caleb merges.** Nobody pushes to `staging` or `main` directly.
- Cursor prompt pattern: branch name, numbered scope, a Docs section (DECISIONS, ENGINEERING, OPERATIONS), a Tests section ("keep the coverage floors"), and "Report the PR link and any unmapped items".
- **Secrets stay with Caleb.** Never hold or ask for a Supabase access token. Caleb applies migrations and sets secrets himself.
- Caleb's preferences: one step at a time, plain language, honest pushback over validation, numbers over adjectives, **no em dashes in anything written for him or shown to users**.

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

## State on 1 November

**Migrations.** `00001` to `00046` are applied on **staging and production**. The newest: `00042` listing add-ons, `00043` booking add-ons, `00044` reschedule, `00045` drop the second bookings to sessions key, `00046` cutoff, arrival, day-of number. A test now fails if two migrations share a number.

**Production.** `main` has everything to #231. **#235** (booking page layout #233, site title #234, Singpass docs #232) is open; merge when green. Stripe live: Connected accounts webhook done (25 October), platform payout schedule **Manual** (set 1 November), payout cron running hourly.

**Manual payouts, how to.** Host money moves automatically. TryKai's own share waits in the Stripe balance until someone clicks Balances → Pay out. Before paying out, run on production:
```sql
select coalesce(sum(host_payout_amount), 0) / 100.0 as owed_to_hosts_sgd
from public.bookings
where status = 'confirmed' and payout_released_at is null and stripe_refund_id is null;
```
Safe to pay out = Stripe Available minus `owed_to_hosts_sgd` minus about S$50 buffer. Monthly is fine.

---

## Next work

1. **Merge #235**, hard refresh trykai.sg, check a booking page on a phone.
2. **Prompt C, review photos** (ready, not started). Guests attach up to 3 photos to a review; migration `00047_review_photos.sql` (`reviews.photo_urls`, public `review-photos` bucket with own-folder policies, `reviews_for_listing` and `reviews_for_host` return the photos); one shared review form used by Bookings and BookingDetail; thumbnails and lightbox on the listing, profile and featured review; a quiet Report link; privacy policy line. The full prompt is in the appendix below.
3. More host feedback as it comes.
4. BUILD_BACKLOG.md for everything else.

---

## Carried, status not rechecked

- Whether the two September test cancellations were refunded on Stripe
- Insurance quote
- Founders' agreement unsigned
- Safety response protocol drafted, not ratified
- Account deletion needs an anonymisation design (Rui Heng). Manual via contact us until then
- One real card booking on production, then refund it (OPERATIONS checklist)

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

---

## Appendix: prompt C (review photos), ready to paste into Cursor

```
Branch: feat/review-photos (from staging)

Guests can attach up to 3 photos to a review. Match the canvas board "Booking page · Day of, after, cancelled" (After state: stars, comment, photo tiles, consent line).

1. Migration supabase/migrations/00047_review_photos.sql (Caleb applies it):
   - reviews.photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 3);
     trigger: every url must contain '/storage/v1/object/public/review-photos/' || reviewer_id || '/'.
   - Public bucket 'review-photos'; storage policies like listing-photos in 00026: insert, update, delete only in the caller's own folder; no list.
   - Redefine reviews_for_listing and reviews_for_host to also return photo_urls (keep signatures and grants; follow 00013).
2. Review form: ONE shared component used by Bookings.jsx and BookingDetail.jsx (both insert reviews today). Stars and comment as now, plus up to 3 photo tiles using the same picker, HEIC conversion, compression, "TryKai just updated" message and upload as listing photos. Line under the tiles: "Add up to 3 photos of what you made. Only photos you took, and ask before including anyone else." Upload before inserting the review; if an upload fails, keep the text and say which photo failed.
3. Display: ReviewCard shows thumbnails; tapping opens the existing lightbox. Listing page, host profile, featured review.
4. Moderation: a quiet "Report" link on reviews with photos (mailto hello@trykai.sg with the review id). OPERATIONS: how to remove a photo (Table Editor photo_urls, then delete the object). Privacy policy: review photos are public.
5. Docs: DECISIONS, ENGINEERING, OPERATIONS (apply 00047).
6. Tests: migration (cap, folder check, storage policies, read functions return photo_urls), form (0 to 3 photos, upload failure, HEIC), display and lightbox, the migration-number guard. Keep the coverage floors.

Run npm run verify and npm run test:e2e. Report the PR link and any unmapped items.
```

