# TryKai: Handover

*Written 21 September 2026. Checked against the repo on 22 September 2026. Supersedes every earlier handover, including the one generated partway through the 9 to 21 September session, which was wrong and should be discarded.*

---

## What TryKai is

Peer to peer skill and experience marketplace for Singapore. Individuals list short, in person sessions teaching a skill, priced S$10 to S$40. Guests browse, book, and pay through the platform. TryKai takes a booking fee. Runs as a website, not an app.

Sole proprietorship, UEN 53526159D, owned by Ong Kai Le Caleb. Pre launch, zero revenue. **Soft launch target: week of 20 October 2026**, warm contacts only, 15 to 20 listings.

**Team.** Caleb, CEO and product, carries all legal and financial liability, vibe coder with limited technical depth. Rui Heng Leong, sole engineer, 8 hours a week, the binding constraint. Aakash Chidambaram, marketing, growth, host recruitment.

---

## Source of truth

**The repo's `Markdowns/` folder is current. Claude project file copies may be stale.** ENGINEERING, DESIGN and DECISIONS were already current through 21 September. README, OPERATIONS and BUILD_BACKLOG were stale and have been brought in line with this handover and the tree. Re upload the repo versions to the Claude project before starting a new chat.

Rule that keeps the docs honest: one fact, one home. When two docs disagree, say so rather than picking one.

---

## Done this session, merged to staging

**UI**
- Global nav: `Navbar.jsx` deleted. `SiteNav` mounted once in `App.jsx` feeds real auth into `TopNav`.
- Hamburger is navigation only: Browse, My bookings, Hosting (hosts only), Create listing / Become a host (always, so non hosts have a route to hosting), Verification review (admins only, gated via `my_verification()`).
- Avatar is the account menu: Settings, Log out. Profile omitted until it exists.
- Colour token set at `:root` in `index.css`, including `--scrim`. Status colours use a strong token for text and a tint for backgrounds. Coral stays functional only.
- Browse grid uses the UI kit `Card`. Square images, 2 line title clamp, one line meta. Hero removed. The price on that card is the card all-in total from `formatGuestFacingPrice`, not the raw lesson price.
- Listing detail: responsive layout, photo mosaic for 1 to 5 photos, sticky booking card on desktop, host block kept high.
- Gallery lightbox: opaque dark backdrop, `object-fit: contain`, quiet chrome, full keyboard and focus handling, scroll lock that restores cleanly.
- CreateListing states the 5 photo limit, read from the enforcing constant.
- Dashboard split: `/bookings` (guest), `/hosting` (host, includes Stripe payout setup). `/dashboard` redirects so emails and Stripe return URLs keep working.
- Settings at `/settings`: edit full name and avatar. Email read only. Account deletion is a "contact us" line, deliberately not a button.
- Login uses the kit `Input`. Width bug fixed in the component. Floating label is now a behaviour that combines with password. Autofill floats the label via CSS. PR #56.

**Data and email**
- Listing creation was 403ing because `hosts_create_listings_verified` read `users.is_suspended`, which `00005` never re granted. Fixed with a `can_create_listing()` security definer function rather than granting the column, since users RLS is `USING (true)` and a grant would expose suspension status platform wide. Same CREATE-side fix applied to `hosts_create_sessions_verified`. That is migration **`00008`**. It is the listing/session INSERT gate. It is not the sessions SELECT fix.
- Guests and hosts can read their own sessions in any status (`session_visible_to_me`), and a guest who booked an inactive listing can still read its title (`listing_booked_by_me`). Leftover 00001 booking INSERT/UPDATE policies were dropped so a restored GRANT cannot let a guest JWT cancel without `cancel-booking`. That is migration **`00009`**. Schema in this tree is `00001` through `00010`.
- Resend domain `trykai.sg` verified. `RESEND_FROM = 'TryKai <no-reply@trykai.sg>'`. PR #45.
- `RESEND_API_KEY` was missing from trykai-staging entirely. Now set. Booking confirmation emails to guest and host confirmed arriving end to end on staging.
- Cancellation emails built in `cancel-booking`. Guest always gets one stating the refund amount, including $0. Host gets one only when the guest cancelled. Send cannot block the refund. `sendResendEmail` now logs a missing API key. `Bookings.jsx` and `Hosting.jsx` invoke `cancel-booking`; they do not PATCH bookings from the browser.

**Stripe live platform account**
- Category: Other educational services. Description frames TryKai as a marketplace, not the service provider.
- Statement descriptor `TRYKAI.SG`, shortened `TRYKAI`.
- Aspire linked for payouts, schedule **manual**. Automatic would sweep funds needed for host transfers 24h after sessions.

**Landed on staging from other work**
- Verification review queue (#32), Stripe Identity (#34). `notify-verification-result` is not in the tree; result mail now from `admin-verifications` and `stripe-webhook`.
- `release-payout` is scheduled hourly via pg_cron (`00010`) and a GitHub Action that fires from `main`. Host transfers had never actually run before this. Applying the migration, Vault secrets, and the GitHub `PAYOUT_CRON_SECRET` are still ops per environment. Rule in DECISIONS: never transfer without `source_transaction` after a platform bank payout.

**Edge Functions in this tree** (matches `supabase/functions/` and `config.toml`): `create-payment-intent`, `stripe-webhook`, `create-connect-account`, `create-account-link`, `cancel-booking`, `admin-cancel-booking`, `admin-verifications`, `create-identity-session`, `notify-verification-pending`, `purge-verification-docs`, `release-payout`. Shared modules: `booking`, `http`, `connect`, `email`, `payouts`, `verification`. `notify-verification-result` is gone.

---

## Open and serious

**The two test cancellations still need a Stripe check.** Cancelling from `/bookings` calls `cancel-booking`. That function writes bookings and sessions with the service role, so API logs show `PATCH /rest/v1/bookings` and `PATCH /rest/v1/sessions` 204 even when the function ran. That is not proof of an RLS bypass. `00009` also dropped the leftover 00001 INSERT/UPDATE policies so a restored GRANT cannot come back as a client cancel. Look at Edge Function logs for `cancel-booking invoked`. **Unchecked: whether the two test cancellations were actually refunded on Stripe.** Cancellation emails on those tests were not verified because the PATCH lines were read as a bypass.

**Bug 4, misfiled as UI.** A host who exits Stripe onboarding without completing it still sees "Payout setup submitted." `Hosting.jsx` treats `?connect=return` as success without re-checking `stripe_payouts_enabled`. They cannot be paid. Money path. Ruiheng's.

**Production vs staging is unconfirmed from this repo.** `00008`, `00009`, `00010`, the Resend from-address, and the Edge Function code are in the tree. Applying those migrations, setting `RESEND_API_KEY` and Vault/`PAYOUT_CRON_SECRET`, and deploying functions are ops per environment. Confirm production has `00008` through `00010`, `RESEND_API_KEY`, and current function deploys before launch. Do not treat staging-only secrets and deploys as production facts.

---

## Open, lower priority

- "Unknown listing" bookings with no cancel button. The RLS change for that is in `00009` (`listing_booked_by_me` / `session_visible_to_me`). Confirm it is applied on staging. Parked if cards persist after that.
- Forgot password: not built. Supabase's default reset email address is acceptable. Login has no reset link.
- Prices far outside S$10 to S$40 are accepted ($7,580, $137,027 seen). CreateListing only checks `priceCents > 0`. The listings CHECK is `price_per_person >= 0`. No 1000–4000 band.
- Browse card rating cannot render: nothing fetches it, no aggregate column. The price on the card is already the all-in card total.
- `ListingCard` is dead code. Home still joins host `full_name` that the browse `Card` never receives.
- Category cut to four (Food, Fitness, Arts, Music): undecided. Touches docs, CreateListing, data, possibly a CHECK constraint. CreateListing still offers Language and Other. StyleGuide language/other PNG imports stay commented out.
- Rating star colour: undecided.
- Account deletion: needs an anonymisation design (retain transactions for dispute and tax, strip personal data). Ruiheng's. Manual via contact us until then.
- Gamified, shareable dashboard: parked until there is usage data to build it on. Recorded in DECISIONS as not decided.
- Carried: insurance quote, founders' agreement unsigned, Ruiheng not told about the profit share, safety protocol unratified, production `00003` hotfix confirmation.

---

## Operational lessons from this session

These cost real hours. Treat them as rules.

1. **Verify the branch every time.** Run `git branch --show-current` after every checkout and read the output. Work was stranded on the wrong branch twice this session.
2. **Commit as soon as something looks right on localhost.** Uncommitted work is work that can vanish.
3. **Merging does not deploy Edge Functions.** CI only lints, tests and builds. After any merge touching `supabase/functions/`, deploy manually from an up to date `staging` checkout: `npx supabase functions deploy <name> --project-ref hzgybclfvpuxkmytdoos`. Each function bundles `_shared/` at deploy time, so a shared fix needs every dependent function redeployed.
4. **Deploy from `staging` after merge, never from a feature branch.**
5. **Never give Cursor a Supabase access token.** Run deploys yourself.
6. **Check that secrets actually exist** before debugging code. A missing `RESEND_API_KEY` failed silently for an hour.
7. **`00005` revoke breakages share a shape:** a policy or write touching a column that was not re granted. Signup, verification, listing creation and sessions all hit it. Worth one systematic sweep rather than finding the next at launch.

---

## How to work on this

- Honest pushback over validation. Caleb means it when he asks what he is missing.
- Distinguish verified, inferred and guessed. Confident wrong claims caused real errors.
- Do not dump ten items at once. Lead with the one thing that blocks the next step.
- No dashes or em dashes in generated content. Reasonably concise.
- Claude is architect, Cursor is builder, Caleb is product owner and tester. Cursor prompts start with "Read ENGINEERING.md and DECISIONS.md first". Scope each prompt to one visible step, tell Cursor to read real files rather than assume, forbid git commands, and ask it to report what it could not map rather than guess.
- When something touches money, safety or auth, err toward Ruiheng's call.

---

## What to pick up next

1. Re upload current repo `Markdowns/` to the Claude project.
2. Check on Stripe whether the two test cancellations were refunded. Confirm Edge Function logs show `cancel-booking invoked`.
3. Get Ruiheng on bug 4, production (`00008` through `00010`, `RESEND_API_KEY`, function deploys), and applying `00010` plus Vault secrets on each environment.
4. Forgot password.
5. Insurance quote. Tell Ruiheng about the profit share.
