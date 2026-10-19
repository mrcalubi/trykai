# TryKai

Peer to peer skill and experience marketplace for Singapore. Anyone with a skill can host a short session and earn money; guests browse, book, and pay through the platform.

**Ethos:** anyone can teach, everyone can learn.

---

## Current status

*Updated 19 October 2026. This block is updated at every Saturday scrum. Everything else in these documents changes when a decision or an implementation status changes. Full state: HANDOVER.md.*

| | |
|---|---|
| **Phase** | Pre launch. Production sync this week; warm host onboarding from Wednesday 21 October |
| **Soft launch target** | Week of 20 October 2026, warm contacts only, 15 to 20 listings. First real paid booking expected within a week of onboarding |
| **Revenue to date** | Zero |
| **Entity** | TRYKAI, sole proprietorship, UEN 53526159D |
| **Banking** | Aspire business account. All TryKai money goes through it from 19 October (BUSINESS.md, How money moves) |
| **Payments** | Stripe Connect, separate charges and transfers, Express accounts. Built. Remaining is production ops (OPERATIONS.md, Production sync, October 2026) |
| **Infrastructure** | Supabase production on Pro (daily backups) from 19 October; staging on its own free organisation. Migrations `00001` to `00031` on both. Production sits in Mumbai; moving it to Singapore is post launch |

**Blocked or in flight**
- Production sync (Rui Heng): deploy secrets, OneMap secrets on production, live Connected accounts webhook, one real card booking and refund, cron timeout
- Production end to end and mobile testing before Wednesday
- No SQL on production until the first daily backup appears
- Claude's build queue: docs consolidation, link previews and Share fallback, email receipt, host nudge (BUILD_BACKLOG.md, Next builds)

**Carried, status not rechecked on 19 October**
- Internal safety response protocol, drafted (`SAFETY_RESPONSE_PROTOCOL.md`), not ratified
- Public liability insurance, not quoted
- Terms of Service and Privacy Policy published in the app; lawyer review not recorded
- Founders' agreement, not yet signed
- Rui Heng not yet told about the three way equal profit share

---

## Where things live

| Document | What it covers |
|---|---|
| **README.md** | This file. Orientation and current status. |
| **BUSINESS.md** | Positioning, the two lanes, competition, business model, growth philosophy, team, equity, profit sharing, legal entity. |
| **DECISIONS.md** | Dated log of every decision made, plus the KIV list of things deliberately deferred. |
| **ENGINEERING.md** | Tech stack, database schema, business rules, file map, and end to end user flows. The document anyone building works from, human or AI. |
| **OPERATIONS.md** | Week by week execution plan and the pre launch checklist. |
| **BUILD_BACKLOG.md** | What to build next and in what order, derived from walking every user flow. The build queue for Rui Heng and Claude. |
| **HOST_ONBOARDING.md** | Internal onboarding process, plus host facing guidelines on pricing, photos, and policies. |
| **DESIGN.md** | Visual identity. Component library lives in-repo at `/style-guide`; browse Card, Settings Button/Input, and Login Input are wired into live pages. |
| **FOUNDERS_AGREEMENT.md** | The signed record of equity, profit sharing, roles, and how disputes between founders are handled. |
| **SAFETY_RESPONSE_PROTOCOL.md** | Internal process behind the public promise to suspend on a credible safety report. Drafted 23 August, not yet ratified. |
| **HANDOVER.md** | Session handover. Current copy is 19 October 2026. Read it first in a new chat. |

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

Claude acts as architect and, from 19 October, as builder: Claude Code in the TryKai Project chat attaches `mrcalubi/trykai`, branches from `staging`, runs lint and tests, and opens a PR into `staging`. It never pushes to `staging` or `main`.
Caleb is product owner: testing, direction, review, merging, final call. Caleb applies migrations and sets secrets; no AI tool holds a Supabase access token or sees a secret.
Cursor is used for small edits when credits allow.

Start every build session, Claude or Cursor, with: *"Read ENGINEERING.md and DECISIONS.md first, then..."* For Cursor: one scope per prompt, name the branch, end with "Report anything unmapped".
