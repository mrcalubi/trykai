# TryKai

Peer to peer skill and experience marketplace for Singapore. Anyone with a skill can host a short session and earn money; guests browse, book, and pay through the platform.

**Ethos:** anyone can teach, everyone can learn.

---

## Current status

*Updated 25 August 2026. This block is updated at every Saturday scrum. Everything else in these documents changes only when a decision changes it.*

| | |
|---|---|
| **Phase** | Pre launch, roughly week 4 of 13 |
| **Soft launch target** | Week of 20 October 2026, warm contacts only, 15 to 20 listings |
| **Revenue to date** | Zero |
| **Entity** | TRYKAI, sole proprietorship, UEN 53526159D |
| **Banking** | Aspire business account, approved 13 August 2026 |
| **Payments** | **Stripe Connect**, separate charges and transfers, Express accounts. Guest checkout, webhook confirmation, Connect onboarding, refunds, and 24h Transfers are in the app. Staging still needs Stripe test-mode E2E and `00005` applied; platform payouts must be set to manual. |

**Now working, tested on staging this session (22 to 25 August)**
- Staging Supabase environment stood up and in active use
- Canonical schema in version control
- Signup fixed (was fully broken by an RLS gap), host verification submission fixed, suspension fields added, captured in `00003_staging_hotfixes_22aug.sql`
- Atomic `spots_remaining` decrement built and tested via `confirm_booking`
- Full address reveal on confirmed bookings, via `get_listing_address`
- Four tier cancellation refund built by Ruiheng and verified correct
- Automated CI test suite plus branch protection added by Ruiheng, every merge now runs checks
- A component library and top nav built on the `style-guide-page-staging` branch, previewable at `/style-guide`

**Blocked or in flight right now**
- The component library PR is waiting to merge. Ruiheng's auth fix for the CreateListing redirect landed on `main`, the component PR targets `staging`, so the two may be out of sync. Open question with Ruiheng: retarget the PR to main, or bring staging up to date with main first.
- The staging database hotfixes may not yet be applied to production. Needs confirming with Ruiheng.

**Open and unstarted**
- Internal safety response protocol, **now drafted** (`SAFETY_RESPONSE_PROTOCOL.md`), not yet ratified or built into the app
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
| **DESIGN.md** | Visual identity: palette, typography, logo direction, messaging, photography policy. |
| **FOUNDERS_AGREEMENT.md** | The signed record of equity, profit sharing, roles, and how disputes between founders are handled. |
| **SAFETY_RESPONSE_PROTOCOL.md** | Internal process behind the public promise to suspend on a credible safety report. Drafted 23 August, not yet ratified. |

Published website content, kept separate because it is public facing:
`cancellation-policy.md`, `refund-policy.md`, `dispute-policy.md`

Live data that does not belong in markdown:
- **Host roster and recruitment pipeline** — Google Sheet
- **Expenses and founder loan balance** — EXPENSES.xlsx
- **Bug log** — Ruiheng's tracker
- **Engineering sequencing detail** — `TryKai-Launch-Plan.docx`, 2 August 2026

---

## How to keep these documents honest

These files drifted badly once already, because the same fact was written in three places and only one got updated. Four rules prevent that.

1. **One fact, one home.** The equity split lives in BUSINESS.md and nowhere else. If you are about to write down a number that already exists in another file, link to it instead.
2. **Decisions here, live data in tools.** Anything that changes weekly belongs in a spreadsheet or a tracker, not in markdown.
3. **DECISIONS.md is append only.** New decisions go at the bottom with a date. When something supersedes an earlier decision, say so in the new entry rather than deleting the old one, so the reasoning survives.
4. **Only this status block is updated on a schedule.** Everything else is touched only when a decision changes it.

**The trigger:** at every Saturday scrum, anything decided that week gets appended to DECISIONS.md before the meeting ends. In the room, not afterwards. Decisions written down a week late get written down wrong.

---

## Working with AI on this project

Claude acts as architect: schema, decisions, strategy, corrections.
Cursor acts as builder: implementation.
Caleb is product owner: testing, direction, final call.

Start every Cursor session with: *"Read ENGINEERING.md and DECISIONS.md first, then..."*
