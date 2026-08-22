# TryKai

Peer to peer skill and experience marketplace for Singapore. Anyone with a skill can host a short session and earn money; guests browse, book, and pay through the platform.

**Ethos:** anyone can teach, everyone can learn.

---

## Current status

*Updated 16 August 2026. This block is updated at every Saturday scrum. Everything else in these documents changes only when a decision changes it.*

| | |
|---|---|
| **Phase** | Pre launch, week 3 of 13 |
| **Soft launch target** | Week of 20 October 2026, warm contacts only, 15 to 20 listings |
| **Revenue to date** | Zero |
| **Entity** | TRYKAI, sole proprietorship, UEN 53526159D |
| **Banking** | Aspire business account, approved 13 August 2026 |
| **Payments** | Moving to **Stripe Connect**, separate charges and transfers. In sandbox, not yet built. HitPay abandoned after payment capability was disabled on 13 August. |

**Blocked right now**
- Nothing hard blocked. The payment path is decided (Stripe Connect) but unbuilt, and it remains the largest single risk to the October date.

**Open and unstarted**
- Internal safety response protocol, not drafted
- Public liability insurance, not yet quoted
- Terms of Service and Privacy Policy, drafted but not lawyer reviewed or published
- Founders' agreement, not yet signed

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
