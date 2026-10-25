# TryKai: Handover

*Written 24 October 2026, updated 25 October against `staging` (#161 merged; `main` at #163). Supersedes the 19 October handover. Read this first if you are Cursor, a new Claude chat, or anyone picking up the code.*

---

## What TryKai is

Peer to peer skill and experience marketplace for Singapore. Individuals list short, in person sessions teaching a skill. Most sessions are S$15 to S$30; S$10 to S$40 is guidance, not a rule, and the database caps a listing at S$500 as a typo guard (`00028`). Guests browse, book, and pay through the platform. TryKai takes a booking fee. Runs as a website, not an app.

Sole proprietorship, UEN 53526159D, owned by Ong Kai Le Caleb. **The first host was onboarded on 23 October 2026**; her feedback is the next round of UI work.

**Team.** Caleb, CEO and product, carries all legal and financial liability. Rui Heng Leong, engineer, 8 hours a week. Aakash Chidambaram, marketing, growth, host recruitment.

---

## Source of truth

**The repo's `Markdowns/` folder is current.** Claude Project copies are synced from it and may lag. One fact, one home. When two docs disagree, say so rather than picking one. For any change, read the matching section of `ENGINEERING.md` (how it works), `DECISIONS.md` (why, newest entries at the bottom of the log) and `OPERATIONS.md` (what someone has to do by hand).

---

## How the work is done now (from 24 October)

- **Cursor builds most code again.** Claude (Claude Code in the TryKai Project chat) built everything from 19 to 24 October while Cursor was down; see "Catching up" below. Claude now handles reviews, docs, research, Singpass and anything that needs a long read of the repo.
- Either way: branch from `staging`, one scope per branch, run `npm run verify` (lint, coverage, build), open a PR into `staging`. Caleb merges. Nobody pushes to `staging` or `main` directly.
- Cursor prompt pattern: start with "Read Markdowns/HANDOVER.md, ENGINEERING.md and DECISIONS.md first", one scope, name the branch, end with "Report anything unmapped".
- **Secrets stay with Caleb.** Never hold or ask for a Supabase access token. Never paste secrets or private keys into chat. Caleb applies migrations and sets secrets himself.
- One step at a time. Short lists. Honest pushback over validation. Distinguish verified, inferred and guessed.
- When something touches money, safety or auth, err toward Rui Heng's call.

---

## Environments

| | Staging | Production |
|---|---|---|
| Supabase project | `trykai-staging` (Free plan, "TryKai Staging" org) | "Kai" (Pro, "TryKai" org, region Mumbai `ap-south-1`) |
| Project ref | `hzgybclfvpuxkmytdoos` | `dqqlwofluvhikebtjune` |
| Site | trykai.vercel.app | trykai.sg |
| Branch | `staging` | `main` |

**Both projects show the "PRODUCTION" label in the Supabase dashboard.** Check the ref in the URL before running any SQL. On 18 October migrations were applied to production first by mistake.

**Deploys.** CI (`.github/workflows/ci.yml`) runs lint, unit tests (coverage floors: statements 92%, branches 87%), Playwright, build, and Edge Function checks. A push to `staging` deploys every Edge Function to staging; a push to `main` deploys to production via the `PRODUCTION_SUPABASE_PROJECT_REF` secret. Pull requests never deploy.

**Migrations are not automatic.** Apply by hand in the SQL Editor: staging first, test, then production in the same sitting. Before any SQL on production, confirm a backup from the last 24 hours exists (OPERATIONS.md, Production SQL).

---

## Catching up: what changed 19 to 24 October

Everything below is merged to `staging`; `main` has it up to #149, and #150 is on `staging` only until the next sync. Details and reasons are in DECISIONS.md under the same dates.

**Guests**
- Home hero: Browse sessions button and the "Coming up" heading removed. Browse heading visually hidden; result count under the filters; peeking category row; smaller icon category badge. Cards for listings with no dates show no date line.
- **I'm keen** (`00032`): on a listing with no dates a guest says when suits them; the host sees the tally and keen guests are emailed when dates are added (`listing-interest`, `notify-interested`).
- Link previews for crawlers (`api/listing-preview.js`) and Share falls back to copying the link.
- Branded email frame and booking receipt (`_shared/email.ts`).
- **Email confirmation at signup**: a 6-digit code in the same tab (`Login.jsx`, `confirm-signup.html` generated from `_shared/email.ts`). The dashboard steps are in OPERATIONS.md.

**Hosts**
- **Shared availability** (`00033`): a host can't be booked in two places at once; overlapping sessions show as "Taken".
- **Verification**: Stripe Identity is gone (not offered to Singapore businesses). **Singpass Myinfo** is the main route (`00035`, `singpass-start`, `singpass-callback`, `/verify-identity/singpass`): name, date of birth and mobile, never NRIC. A Singpass host is **approved on the spot** (`00036`). Upload (ID photo and selfie) is the fallback, reviewed by hand at `/admin/verifications`. The "What would you like to teach?" question was added (`00034`) and then removed from the page; old answers stay in `users.teaching_plan`.
- **Listing review** (`00036`): every new listing is hidden from guests until approved at `/admin/listings`. The team is emailed on save (`listing-submitted`); approve or ask for one change (`admin-listings`); the host is emailed either way. Hosting shows "In review" and "Changes needed" with the note.

**Rules not to break**
- **Singpass button**: use Singpass's own artwork in `src/assets/singpass/` (`SingpassButton.jsx`). Don't restyle it, recolour it or retype the label; Singpass's specification forbids it and production approval depends on it.
- **"Check your details"** (`SingpassReturn.jsx`): name and date of birth stay locked; mobile stays editable and required. Retrieved data is shown as-is and nothing is saved until the host confirms. This is what was submitted to Singpass on 24 October.
- **No NRIC numbers**, ever (DECISIONS.md, 23 October).
- **`listings.review_status`**: clients can never write it (trigger `guard_listing_review`). Any new public listing read must also require `approved`, as browse, profiles, keen counts, checkout and link previews do.
- **`review_note`** is readable by authenticated users only. Never add it to a query an anonymous visitor runs; the whole query fails.
- `VITE_SINGPASS_ENABLED` decides whether the Singpass button shows: `true` on Preview (staging) only until Singpass approves production.

---

## Shipped 24 to 25 October (Cursor builds, Claude reviews)

From the first host's feedback (23 October onboarding) and Aakash. Details in DECISIONS.md.

- **Photos** (#154, #156, #157): drag and drop files onto the drop zone, which now says "Add photos". Every photo can be cropped at 4:3; each crop starts from the original and can be undone in this session ("Undo crop" in the tile menu, "Reset to original" in the dialog). Editor tiles are 4:3. The tile menu closes on any tap outside it.
- **Loading states** (#155): Button `loading`, `PageLoader`, and `WaitingState` with `LoadingMascot.jsx` (three bouncing dots now; the mascot replaces it later). Used on checkout, payouts, Singpass, Create listing ("Uploading photo 2 of 4") and most buttons. Checkout keeps Stripe's PaymentElement mounted behind the waiting panel; never unmount it while confirmPayment runs.
- **Session reminders** (#158, #160, `00037`): hourly `send-reminders` emails the guest (per booking) and the host (per session) when a session starts in 2 to 24 hours, skipping bookings made in the last 6 hours. "Today" or "Tomorrow" by Singapore date, weekday in the date, warm copy, "Don't forget to bring" when the listing has items. Needs `REMINDERS_CRON_SECRET` plus three Vault secrets per project (OPERATIONS.md, Session reminders). Tested on staging 24 October.
- **What to bring** (#159, `00038`): optional `listings.what_to_bring` (up to 5 items, 40 characters each) on Create and Edit listing, the listing page, booking detail, the confirmation email, the reminder, and the admin review card. The CHECK function must stay EXECUTE-granted to anon and authenticated, or every listing save fails.
- **Payout return** (#161, merged): back from Stripe with nothing due, Hosting says "Stripe is checking your details" and re-checks for 60 seconds instead of "needs your bank details".
- **Decided, not built:** host pricing rounding left as it is (DECISIONS.md, 24 October).

---

## State on 25 October

**Migrations.** See OPERATIONS.md, Migration state, for what is applied where. Added since 19 October:

| | What it does |
|---|---|
| `00032` | `listing_interests` (I'm keen), `listing_keen_counts`, host notices |
| `00033` | Shared availability across a host's listings |
| `00034` | `users.teaching_plan` (no longer asked) |
| `00035` | Singpass Myinfo: `singpass_sub`, `verified_name`, `verified_dob`, `verified_mobile`, `singpass_auth_sessions` |
| `00036` | Singpass approves on the spot; listing review (`review_status`, `listing_reviews`, `review_listing`) |
| `00037` | Session reminders: `guest_reminder_sent_at`, `host_reminder_sent_at`, hourly `invoke_send_reminders` |
| `00038` | `listings.what_to_bring` |

Earlier, from the 19 October handover:

| | What it does |
|---|---|
| `00022` | `my_is_founding_host()` |
| `00023` | User PII locked: clients cannot read email, full name, phone. `my_account()`, generated `is_id_verified` |
| `00024` | `edit_open_session`, `set_listing_spots`, column UPDATE revokes on sessions and listings |
| `00025` | Table grants tightened. `full_address` only through `listing_address()`. No TRUNCATE, TRIGGER, REFERENCES for clients |
| `00026` | Storage: `listing-photos` no client list; `verification-docs` private, owner insert and update |
| `00027` | Suspended hosts' listings hidden from browse, detail and profiles |
| `00028` | Listing price ceiling S$500 |
| `00029` | Dispute payout hold, partial refunds |
| `00030` | `booking_money_events` audit log |
| `00031` | `booking_complaints` (guest Report a problem) |

**Singpass production.** The Myinfo app was submitted for approval on 24 October (up to 2 weeks), with the user journey PDF. Production secrets are being set. Once approved: `VITE_SINGPASS_ENABLED=true` for Production in Vercel, redeploy, test on trykai.sg (OPERATIONS.md, Singpass Myinfo).

**Production sync.** `main` is at #163. Done 25 October.

**Also open, owned by Caleb.**
- Singpass production: app submitted 24 October (up to 2 weeks). The five production secrets are being set. On approval: `VITE_SINGPASS_ENABLED=true` for Production in Vercel, redeploy, test.
- Production verification-alert database webhook (`notify-verification-pending`), for upload hosts.
- Email confirmation dashboard steps on production, if not done.
- Phone numbers for upload hosts and guests (KIV). Edits to an approved listing are not re-reviewed (KIV).

**Production is on Supabase Pro** (daily backups, no inactivity pause). Production sits in Mumbai by accident; moving it to Singapore is post-launch. All TryKai money goes through Aspire.

---

## Next work

1. **More of the first host's feedback**: Caleb has another batch.
2. Singpass production switch-on after approval.
3. BUILD_BACKLOG.md for everything else.

---

## Carried, status not rechecked this session

From the 21 September handover. Confirm or close at the next scrum.

- Whether the two September test cancellations were refunded on Stripe
- Insurance quote
- Founders' agreement unsigned; Rui Heng not yet told about the profit share
- Safety response protocol drafted, not ratified
- Account deletion needs an anonymisation design (Rui Heng). Manual via contact us until then

---

## Operational rules

These cost real hours. Treat them as rules.

1. **Check the project ref in the URL before any SQL.** The dashboard label is not enough.
2. **Confirm production has a backup from the last 24 hours before any production SQL.**
3. **Verify the branch every time.** `git branch --show-current` after every checkout.
4. **Commit as soon as something looks right on localhost.**
5. **A push to `staging` or `main` deploys every Edge Function.** Each function bundles `_shared/` at deploy time. Deploy only by merging, never from a feature branch.
6. **Set new function secrets on production before merging to `main`.** A function that needs a secret goes live the moment `main` deploys it.
7. **Check that secrets exist before debugging code.** A missing `RESEND_API_KEY` once failed silently for an hour.
8. **Grant and revoke breakages share a shape:** a policy or write touching a column that was not granted. Test every flow that touches a table after a grant change.
