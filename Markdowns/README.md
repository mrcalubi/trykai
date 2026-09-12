# TryKai

Peer to peer skill and experience marketplace for Singapore. Anyone with a skill can host a short session and earn money; guests browse, book, and pay through the platform.

**Ethos:** anyone can teach, everyone can learn.

---

## Current status

*Updated 31 August 2026. This block is updated at every Saturday scrum. Everything else in these documents changes when a decision or an implementation status changes.*

| | |
|---|---|
| **Phase** | Pre launch, roughly week 5 of 13 (week of 25–31 August) |
| **Soft launch target** | Week of 20 October 2026, warm contacts only, 15 to 20 listings |
| **Revenue to date** | Zero |
| **Entity** | TRYKAI, sole proprietorship, UEN 53526159D |
| **Banking** | Aspire business account, approved 13 August 2026 |
| **Payments** | **Stripe Connect**, separate charges and transfers, Express accounts. Guest checkout, webhook confirmation, Connect onboarding, refunds, and 24h Transfers are **in this tree**. Remaining is ops: apply `00005` on staging, Stripe Dashboard webhook + secrets, platform payouts **manual**, founding-host flags, one test-mode booking. |

**In the repo now (walked 31 August)**
- Staging Supabase environment exists; schema is `supabase/migrations/` `00001`–`00005`
- Signup profile row is created by `handle_new_user` (`00004`), not by Login.jsx
- Host verification is a client UPDATE to `pending`, guarded by `guard_user_self_update`. There is no `submit_verification` RPC
- Atomic `spots_remaining` decrement via `confirm_paid_booking` (service role only)
- Guest address reveal via `get_listing_address` (confirmed guest only). `listings.full_address` is still granted SELECT
- Four tier cancellation refunds via `cancel-booking` (no cancellation emails)
- CI: Vitest coverage floors 92% / 90% / 87%, money files 100%, Playwright desktop + phone, Deno type-check of shared Edge modules
- Component library lives in this tree at `/style-guide`. **Not wired** into real pages; live chrome is still `Navbar.jsx`

**Blocked or in flight**
- Stripe ops on staging (migration, webhook, manual platform payouts, test booking). Do not assume `00005` is applied until someone confirms
- Whether production has the 22 August signup/verification hotfixes. Still needs confirming with Ruiheng
- P0.8 real Resend domain, same week as a secret on the unauthenticated notify-verification functions
- P0.4: `is_suspended` exists; the app never queries it
- StyleGuide imports category PNGs that are not in the repo; Navbar requests `/trykai.png`, which is not in `public/`

**Open and unstarted**
- Internal safety response protocol, drafted (`SAFETY_RESPONSE_PROTOCOL.md`), not ratified, not enforced in the app
- Public liability insurance, still not quoted
- Terms of Service and Privacy Policy, drafted but not lawyer reviewed or published
- Founders' agreement, not yet signed
- Ruiheng still not told about the three way equal profit share

---

## Where things live

| Document | What it covers |
|---|---|
| **README.md** | This file. Orientation and current status. |
| **BUSINESS.md** | Positioning, the two lanes, competition, business model, growth philosophy, team, equity, profit sharing, legal entity. |
| **DECISIONS.md** | Dated log of every decision made, plus the KIV list of things deliberately deferred. |
| **ENGINEERING.md** | Tech stack, database schema, business rules, file map, and end to end user flows. The document Cursor and Ruiheng work from. |
| **OPERATIONS.md** | Week by week execution plan and the pre launch checklist. |
| **BUILD_BACKLOG.md** | What to build next and in what order, derived from walking every user flow. Ruiheng's work queue. |
| **HOST_ONBOARDING.md** | Internal onboarding process, plus host facing guidelines on pricing, photos, and policies. |
| **DESIGN.md** | Visual identity, plus the component library (in-repo at `/style-guide`, not wired into live pages). |
| **FOUNDERS_AGREEMENT.md** | The signed record of equity, profit sharing, roles, and how disputes between founders are handled. |
| **SAFETY_RESPONSE_PROTOCOL.md** | Internal process behind the public promise to suspend on a credible safety report. Drafted 23 August, not yet ratified. |

Published website content, kept separate because it is public facing:
`cancellation-policy.md`, `refund-policy.md`, `dispute-policy.md`

Live data that does not belong in markdown:
- **Host roster and recruitment pipeline** — Google Sheet
- **Expenses and founder loan balance** — EXPENSES.xlsx
- **Bug log** — Ruiheng's tracker
- **Engineering sequencing** — `Markdowns/BUILD_BACKLOG.md`. `TryKai-Launch-Plan.docx` (2 August 2026) is historical.

---

## How to keep these documents honest

These files drifted badly once already, because the same fact was written in three places and only one got updated. Four rules prevent that.

1. **One fact, one home.** The equity split lives in BUSINESS.md and nowhere else. If you are about to write down a number that already exists in another file, link to it instead.
2. **Decisions here, live data in tools.** Anything that changes weekly belongs in a spreadsheet or a tracker, not in markdown.
3. **DECISIONS.md is append only.** New decisions go at the bottom with a date. When something supersedes an earlier decision, say so in the new entry rather than deleting the old one, so the reasoning survives.
4. **Only this status block is updated on a schedule.** Everything else is touched when a decision changes, or when implementation status changes (something marked live that is not in the code, or the reverse). That second case is how ENGINEERING.md and BUILD_BACKLOG.md drifted once already.

**The trigger:** at every Saturday scrum, anything decided that week gets appended to DECISIONS.md before the meeting ends. In the room, not afterwards. Decisions written down a week late get written down wrong.

---

## Working with AI on this project

Claude acts as architect: schema, decisions, strategy, corrections.
Cursor acts as builder: implementation.
Caleb is product owner: testing, direction, final call.

Start every Cursor session with: *"Read ENGINEERING.md and DECISIONS.md first, then..."*
