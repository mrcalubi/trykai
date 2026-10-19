# TryKai: Handover

*Written 19 October 2026 against the repo (`staging` at `4a84219`) and the 17 to 19 October working chat. Supersedes the 21 September handover and the Project file `claude/HANDOVER_2026-10-19.md`.*

---

## What TryKai is

Peer to peer skill and experience marketplace for Singapore. Individuals list short, in person sessions teaching a skill. Most sessions are S$15 to S$30; S$10 to S$40 is guidance, not a rule, and the database caps a listing at S$500 as a typo guard (`00028`). Guests browse, book, and pay through the platform. TryKai takes a booking fee. Runs as a website, not an app.

Sole proprietorship, UEN 53526159D, owned by Ong Kai Le Caleb. Pre launch, zero revenue. **Warm host onboarding starts Wednesday 21 October 2026.** First real paid booking expected within a week of that.

**Team.** Caleb, CEO and product, carries all legal and financial liability. Rui Heng Leong, engineer, 8 hours a week. Aakash Chidambaram, marketing, growth, host recruitment.

---

## Source of truth

**The repo's `Markdowns/` folder is current.** Claude Project copies are synced from it and may lag. One fact, one home. When two docs disagree, say so rather than picking one.

---

## How the work is done now

- **Claude builds directly.** Cursor credits are limited. Claude (Claude Code in the TryKai Project chat) attaches `mrcalubi/trykai`, branches from `staging`, runs lint and tests, and opens a PR into `staging`. Caleb reviews and merges. Claude never pushes to `staging` or `main`.
- If Cursor is used: start the prompt with "Read ENGINEERING.md and DECISIONS.md first", one scope, name the branch, end with "Report anything unmapped".
- **Secrets stay with Caleb.** Never hold or ask for a Supabase access token. Never paste secrets into chat. Caleb applies migrations and sets secrets himself.
- One step at a time. Short lists. Honest pushback over validation. Distinguish verified, inferred and guessed.
- When something touches money, safety or auth, err toward Rui Heng's call.

---

## Environments

| | Staging | Production |
|---|---|---|
| Supabase project | `trykai-staging` (Free plan) | "Kai" (Pro from 21 October; Free until upgraded) |
| Project ref | `hzgybclfvpuxkmytdoos` | `dqqlwofluvhikebtjune` |
| Site | trykai.vercel.app | trykai.sg |
| Branch | `staging` | `main` |

**Both projects show the "PRODUCTION" label in the Supabase dashboard.** Check the ref in the URL before running any SQL. On 18 October migrations were applied to production first by mistake.

**Deploys.** CI (`.github/workflows/ci.yml`) runs lint, unit tests (coverage floors: statements 92%, branches 87%), Playwright, build, and Edge Function checks. A push to `staging` deploys every Edge Function to staging; a push to `main` deploys to production via the `PRODUCTION_SUPABASE_PROJECT_REF` secret. Pull requests never deploy.

**Migrations are not automatic.** Apply by hand in the SQL Editor: staging first, test, then production in the same sitting. Before any SQL on production, confirm a backup from the last 24 hours exists (OPERATIONS.md, Production SQL).

---

## State on 19 October

**Migrations.** Both environments have `00022` through `00031`: checked 18 October (00022 to 00026) and 19 October with a read-only query (00027 to 00031). Earlier migrations are assumed applied, since these build on them.

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

**Branches.** `main` has everything through PR #129 (19 October sync, including `00027` to `00031` and the dispute, complaint and chargeback functions). `staging` is ahead by #130 (cancellation copy), #131 (hosting dashboard fixes) and #132 (location batch C, including the `lookup-postal-code` function).

**Production sync, in progress (Rui Heng).** Before the next merge of `staging` into `main`:
- `PRODUCTION_SUPABASE_PROJECT_REF` and `SUPABASE_ACCESS_TOKEN` GitHub secrets valid
- `ONEMAP_EMAIL` and `ONEMAP_PASSWORD` set on production Edge Function secrets (postal lookup fails without them)

After the merge:
- Live Stripe "Connected accounts" webhook destination (`account.updated`) plus `STRIPE_CONNECT_WEBHOOK_SECRET` on production
- One real card booking and refund on production
- Production cron `pg_net` timeout raised to about 30 seconds

**Plan agreed at the 18 October scrum.** Everything to production now. Production end to end testing (without real checkout) and mobile testing over the next days. Warm host onboarding from 21 October.

**Decided 19 October: production moves to Supabase Pro** (about US$25 a month: daily backups, no inactivity pause). Caleb upgrades before Wednesday 21 October; staging stays on a separate free organisation. No production SQL until Pro is active.

---

## Shipped 17 to 19 October (details in DECISIONS.md)

- **Launch polish.** Back row, overflow report menus, hamburger account items, single password toggle, empty session copy, host bio "more", scroll to top, shorter hero, homepage chip "Most sessions S$15 to 30", 404 page.
- **Sessions.** Recurring bulk create (calendar multi select, quick fill, multiple times, host-wide clash preview, max 40 a batch, 80 day window). Open sessions editable through a locked RPC. Capacity lives on the listing ("Spots per session"). PayNow blocked more than 80 days ahead.
- **Create and edit listing.** Friendly validation, drag to reorder photos, crop every photo, one 4:3 cover ratio, client side compression, simplified price panel, custom "What's provided" chips.
- **Location.** URA subzone aliases, uninhabited areas hidden, OneMap postal code lookup, shared select chevron.
- **Security.** PII lockdown, grant tightening, storage lockdown (`00023` to `00026`).
- **Trust and money.** Suspended hosts hidden (`00027`). Admin dispute tooling: payout hold, partial refund (`00029`). Audit log, admin JWT auth with break glass secret (`00030`). Guest Report a problem within 3 days, which holds the payout (`00031`). Chargebacks hold the payout; Dashboard refunds recorded. Host payout 72 hours after the session ends. Quality complaint window cut from 7 days to 3.

---

## Next work (Claude builds, one PR each, in this order)

1. **Docs consolidation.** This handover and the other repo docs brought up to date; HOST_ONBOARDING.md replaced with the 19 October version; docs synced back to the Project.
2. **Link previews and Share fallback.** Server side Open Graph and Twitter tags for `/listings/:id` (cover photo, title, "S$X per person · Area"; public columns only, anon key) via Vercel middleware or a function, plus a default homepage preview. The existing Share button falls back to clipboard and "Link copied" when `navigator.share` is missing or throws (except `AbortError`). It showed "Could not share this link" in desktop Chrome device mode; check on a real phone.
3. **Email receipt.** Branded, mobile friendly shared template in `_shared/email.ts`: logo, colours, receipt block with price breakdown, booking details, policy link. Table based, inline styles. Test with real staging emails to Gmail and iOS Mail.
4. **Host nudge (no sessions).** Banner on the Hosting tab for active listings with no upcoming sessions. Weekly email to those hosts from a scheduled job (like `release-payout`), with a small migration recording the last nudge so nobody is spammed.

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
