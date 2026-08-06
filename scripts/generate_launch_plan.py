"""Generate the TryKai launch implementation plan as a Word document.

Usage:
    python scripts/generate_launch_plan.py

Requires python-docx (pip install python-docx). Writes TryKai-Launch-Plan.docx to
the repository root, overwriting any existing copy, so close the file in Word
before running.
"""

import os
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor, Inches

NAVY = RGBColor(0x16, 0x26, 0x4B)
CORAL = RGBColor(0xC1, 0x5F, 0x3C)
GREY = RGBColor(0x5A, 0x60, 0x70)

# Set TRYKAI_PLAN_OUT to write elsewhere, e.g. to preview changes while the
# published copy is open in Word and therefore locked.
OUT = Path(
    os.environ.get(
        "TRYKAI_PLAN_OUT",
        Path(__file__).resolve().parent.parent / "TryKai-Launch-Plan.docx",
    )
)

doc = Document()

# ---------------------------------------------------------------- base styles
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10.5)
normal.paragraph_format.space_after = Pt(8)
normal.paragraph_format.line_spacing = 1.15

for name, size in (("Heading 1", 16), ("Heading 2", 12.5), ("Heading 3", 11)):
    style = doc.styles[name]
    style.font.name = "Calibri"
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = NAVY
    style.paragraph_format.space_before = Pt(16)
    style.paragraph_format.space_after = Pt(6)

for section in doc.sections:
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)
    section.top_margin = Inches(0.9)
    section.bottom_margin = Inches(0.9)


# ---------------------------------------------------------------- helpers
def h1(text):
    doc.add_heading(text, level=1)


def h2(text):
    doc.add_heading(text, level=2)


def para(text, italic=False, color=None, size=None, space_after=None):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.italic = italic
    if color is not None:
        run.font.color.rgb = color
    if size is not None:
        run.font.size = Pt(size)
    if space_after is not None:
        p.paragraph_format.space_after = Pt(space_after)
    return p


def rich(segments, style=None):
    """segments: list of (text, bold) tuples."""
    p = doc.add_paragraph(style=style)
    for text, bold in segments:
        run = p.add_run(text)
        run.bold = bold
    return p


def bullet(segments):
    return rich(segments, style="List Bullet")


def table(headers, rows, widths=None, total_row=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Light Grid Accent 1"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER

    hdr = t.rows[0].cells
    for i, head in enumerate(headers):
        hdr[i].text = ""
        run = hdr[i].paragraphs[0].add_run(head)
        run.bold = True
        run.font.size = Pt(9.5)

    for row in rows:
        cells = t.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run(str(value))
            run.font.size = Pt(9.5)

    if total_row:
        cells = t.add_row().cells
        for i, value in enumerate(total_row):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run(str(value))
            run.bold = True
            run.font.size = Pt(9.5)

    if widths:
        for row in t.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Inches(width)

    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


# ---------------------------------------------------------------- title block
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.LEFT
run = title.add_run("TryKai")
run.font.size = Pt(28)
run.font.bold = True
run.font.color.rgb = NAVY
title.paragraph_format.space_after = Pt(0)

sub = doc.add_paragraph()
run = sub.add_run("Launch Implementation Plan")
run.font.size = Pt(15)
run.font.color.rgb = CORAL
sub.paragraph_format.space_after = Pt(4)

meta = doc.add_paragraph()
run = meta.add_run(
    "Prepared 2 August 2026   |   Start: week of 3 August 2026   |   "
    "Capacity: 8 hours per week   |   Target soft launch: week of 19 October 2026"
)
run.font.size = Pt(9)
run.font.color.rgb = GREY
meta.paragraph_format.space_after = Pt(2)

# ---------------------------------------------------------------- exec summary
h1("Executive summary")

para(
    "TryKai is closer to launch than it looks. The parts customers touch are already built: "
    "people can sign up, hosts can list a skill with photos and set session dates, guests can "
    "browse and filter, reviews work, and identity verification with email notifications is in "
    "place. Roughly steps 1 through 8 of the ten-item MVP checklist are done."
)
para(
    "What is missing is not features. It is the money plumbing and the operational safety net "
    "underneath it. Three specific gaps mean the platform cannot yet be trusted with real "
    "payments: the system never records that a payment actually succeeded, it never reduces the "
    "number of available spots when someone books, and every automated email currently goes out "
    "from a test address that real users will never receive. None of these are visible when "
    "clicking around the app, which is exactly why they are dangerous."
)
para(
    "Alongside that, the project has no safe place to test changes and no copy of its own "
    "database structure. Today there is one live database, edited by hand, with no version "
    "history and no way to rebuild it. That is the single largest risk to long-term "
    "maintainability, and it is fixed early in this plan."
)
para(
    "The plan below covers twelve weeks of work at eight hours per week, roughly 85 hours of "
    "essential work inside 96 hours of capacity. Sequenced properly, that puts a deliberately "
    "small soft launch in the week of 19 October 2026: warm contacts only, 15 to 20 listings "
    "across two or three categories, in line with the month one target already agreed in "
    "STRATEGY.md."
)
para(
    "Security review is included, but folded into weeks that already exist rather than added as a "
    "separate phase: access-control testing happens alongside the database audit in weeks 2 and 3, "
    "and a verification pass sits in week 11. The launch date does not move as a result. See "
    "\"Security and data protection\" for the reasoning, for issues already identified, and for why "
    "a paid penetration test is not the right spend yet."
)
rich([
    ("The main risk is outside our control. ", True),
    (
        "HitPay is now the sole payment provider, and its marketplace payment access depends on "
        "Corppass and UEN verification. If that approval is not through by week 6 (mid September), "
        "the payment work stalls and the launch date moves. The plan therefore starts chasing "
        "that approval in week 1, not week 6.",
        False,
    ),
])

# ---------------------------------------------------------------- current state
h1("Where the project stands today")

para("Already in place, and not repeated in the plan below:")
bullet([("Continuous integration", True), (" — .github/workflows/ci.yml runs lint and build on every pull request and push to main.", False)])
bullet([("Single-page app routing for hosting", True), (" — vercel.json contains the rewrite rule that lets deep links such as /dashboard work.", False)])
bullet([("Legal content drafted and live in-app", True), (" — cancellation, refund and dispute policies exist in Markdowns/ and render through src/pages/DisputePolicy.jsx and CancellationPolicy.jsx.", False)])
bullet([("Documentation consolidated", True), (" — CONTEXT.md, DECISIONS.md, DESIGN.md, STRATEGY.md and USER_SCENARIOS.md now sit together under Markdowns/.", False)])

para("Technical shape, for reference:")
bullet([("React 19 and Vite single-page app, React Router v7, no TypeScript, no test suite.", False)])
bullet([("Supabase for database, authentication, file storage and four Deno edge functions.", False)])
bullet([("Payments currently wired to Stripe in code; HitPay is the agreed destination and is not yet written.", False)])
bullet([("Transactional email through Resend.", False)])

# ---------------------------------------------------------------- blockers
h1("The three launch blockers")

para(
    "These are ordered by consequence. Each one means that going live would take real money "
    "incorrectly, so all three sit inside P0."
)

h2("1. Payment success is never recorded")
para(
    "The create-payment-intent edge function inserts a booking with status 'pending' and hands a "
    "payment secret back to the browser. Nothing ever changes that status when the payment "
    "succeeds, because no webhook exists. The only thing that currently confirms a booking is the "
    "release-payout function, which runs 24 hours after the session has already happened. In "
    "practice a guest pays and the platform has no durable record that they did."
)

h2("2. Available spots are never reduced")
para(
    "The edge function reads spots_remaining as a guard (line 39) but never writes to it. The only "
    "writes in the codebase are increments, in the Dashboard cancellation handlers (lines 418 and "
    "479). Two consequences follow: a session can be booked an unlimited number of times, and each "
    "cancellation pushes capacity above the original spots_total. This must be fixed atomically, "
    "inside the database, so that confirming a booking and reducing capacity cannot come apart."
)

h2("3. Emails do not reach real users")
para(
    "All four edge functions send from 'TryKai <onboarding@resend.dev>'. That shared Resend test "
    "domain only delivers to the account owner's own verified address, so every host booking "
    "notification and every verification email to an actual user fails silently in production. The "
    "fix is about two hours (verify trykai.sg in Resend, change the sender), but until it is done "
    "the entire notification layer is non-functional for anyone who is not Caleb."
)

h2("Two more that matter almost as much")
bullet([
    ("Platform fee is wrong. ", True),
    (
        "create-payment-intent hardcodes a flat 15% (line 42), while DECISIONS.md specifies a "
        "tiered structure: 10% guest fee, 10% host fee for peer hosts, a $2 minimum floor, a PayNow "
        "discount, and a fee waiver on a new host's first three bookings.",
        False,
    ),
])
bullet([
    ("The full address is never revealed. ", True),
    (
        "CreateListing and EditListing write full_address, but no page ever reads it, so the "
        "promise in USER_SCENARIOS.md step 8 that a confirmed guest sees the address does not "
        "exist yet.",
        False,
    ),
])

# ---------------------------------------------------------------- P0
doc.add_page_break()
h1("P0 — cannot launch without these")

para(
    "85 hours total. Ordered by dependency rather than importance: reproducibility first, because "
    "a staging environment cannot be built without the database structure in the repository, and "
    "the payment rebuild should not happen anywhere except staging."
)

table(
    ["#", "Item", "Why it blocks launch", "Est."],
    [
        [1, "Secrets hygiene: add .env.example, untrack supabase/.temp/, audit git history for the previously removed .env",
         "Nobody else can run the project, and a committed pooler URL is exposed", "3h"],
        [2, "Export database schema and row-level security policies into supabase/migrations/",
         "The database exists in one hand-edited place with no version history", "10h"],
        [3, "Create staging Supabase project from those migrations; separate Vercel production and preview environment variables; seed realistic test data",
         "No safe place to build or test payments", "8h"],
        [4, "Fee module: tiered rates, $2 floor, PayNow discount, new-host waiver, with unit tests",
         "Live code charges a flat 15%, contradicting the agreed model", "6h"],
        [5, "HitPay payment request integration, replacing the Stripe path",
         "Agreed provider is not yet written", "12h"],
        [6, "HitPay webhook: verify signature, confirm booking, and decrement spots atomically via a Postgres function",
         "Blockers 1 and 2 — payments unrecorded, sessions overbookable", "13h"],
        [7, "Wire refunds to the existing cancellation logic; make release-payout actually move money",
         "Refund amounts are calculated and stored but never paid", "8h"],
        [8, "Verify trykai.sg in Resend, change the sender address in all four functions, and add a shared-secret check on the webhook-triggered functions",
         "Blocker 3 — no email reaches real users; verifying the domain without the secret check creates an open relay", "2h"],
        [9, "Record terms and conditions acceptance in-app",
         "Outstanding MVP item; needed before strangers transact", "3h"],
        [10, "Reveal full_address only for a confirmed booking, enforced by row-level security",
         "Documented guest promise does not exist", "4h"],
        [11, "Error monitoring via Sentry free tier",
         "Currently blind to production failures", "2h"],
        [12, "Manual QA pass against USER_SCENARIOS.md on staging",
         "No automated tests exist; this is the only safety net at launch", "6h"],
        [13, "Security verification pass (OWASP-informed): access-control abuse cases, unauthenticated endpoints, CORS, response headers, dependency audit",
         "Row-level security is the entire authorization boundary, and the anon key is public by design", "8h"],
    ],
    widths=[0.35, 2.5, 2.6, 0.55],
    total_row=["", "Total", "", "85h"],
)

# ---------------------------------------------------------------- P1 / P2
h1("P1 — first month after launch")

para("Roughly 30 hours. Valuable, but none of it should delay the soft launch.")
bullet([("Scheduled job to auto-complete sessions once their start time passes.", False)])
bullet([("Host-to-guest reviews, and tighten review gating (it currently accepts 'pending' bookings, so an unpaid booking can produce a review).", False)])
bullet([("One Playwright smoke test covering signup, browse and book.", False)])
bullet([("A ProtectedRoute wrapper and a catch-all 404 route (an unknown URL currently renders a blank page under the navbar).", False)])
bullet([("Backup restore drill against staging, so recovery is proven rather than assumed.", False)])
bullet([("Extract duplicated constants and helpers shared between CreateListing.jsx and EditListing.jsx (CATEGORIES, SINGAPORE_AREAS, formatPrice).", False)])
bullet([("Basic product analytics: listing views, view-to-booking conversion, repeat bookings.", False)])
bullet([("Remove the now-unused @stripe/stripe-js and @stripe/react-stripe-js dependencies.", False)])

h1("P2 — when traction justifies it")

bullet([("Server-side rendering or pre-rendering for the public browse and listing pages, for search visibility and rich link previews when hosts share their own listings. This is the largest known long-term architectural limitation.", False)])
bullet([("Split the 922-line Dashboard.jsx into host and guest views.", False)])
bullet([("TypeScript migration.", False)])
bullet([("Automated identity verification, replacing manual review, at roughly 50 new hosts per month.", False)])
bullet([("Lane 2, \"Build a Skill\": credit bundles, multi-session courses, and the skill-verified badge.", False)])
bullet([("A paid third-party penetration test, once there is meaningful transaction volume, an external funding round, or a Pte Ltd conversion.", False)])

# ---------------------------------------------------------------- timeline
doc.add_page_break()
h1("Timeline and sequence")

para(
    "Twelve weeks at eight hours per week, starting the week of 3 August 2026. The 11 hours of "
    "slack between 85 hours of essential work and 96 hours of capacity is deliberate: it absorbs "
    "the HitPay integration running long, which is the most likely place for that to happen."
)

table(
    ["Week", "Dates", "Focus", "Output"],
    [
        [1, "3–9 Aug", "Secrets hygiene; start HitPay and Corppass approval; request sandbox credentials",
         "Project runnable by anyone; approval clock started"],
        [2, "10–16 Aug", "Export schema to migrations; begin row-level security audit, written as abuse cases rather than descriptions",
         "Database structure under version control"],
        [3, "17–23 Aug", "Finish the audit by running those abuse cases against live policies; create staging Supabase project from migrations",
         "Reproducible second environment; access control proven rather than assumed"],
        [4, "24–30 Aug", "Separate Vercel production and preview environments; seed staging data",
         "Every pull request gets a safe clickable preview"],
        [5, "31 Aug–6 Sep", "Fee module with unit tests (Vitest)",
         "Correct, tested pricing; first test suite in the project"],
        [6, "7–13 Sep", "HitPay payment request creation; retire the Stripe path",
         "Guests can reach a real HitPay checkout"],
        [7, "14–20 Sep", "HitPay webhook handler including signature verification; booking confirmation",
         "Blocker 1 closed — payments are recorded and cannot be forged"],
        [8, "21–27 Sep", "Atomic spots decrement via Postgres function; overbooking tests",
         "Blocker 2 closed — sessions cannot be overbooked"],
        [9, "28 Sep–4 Oct", "Refund execution and payout release",
         "Cancellations actually return money"],
        [10, "5–11 Oct", "Resend domain and sender plus the shared-secret check; terms acceptance; full address reveal",
         "Blocker 3 closed; trust obligations met"],
        [11, "12–18 Oct", "Sentry; smoke test; 404 and route protection; backup restore drill; security verification pass",
         "Failures become visible and recoverable; security findings closed"],
        [12, "19–25 Oct", "Full QA pass on staging; point trykai.sg at production; soft launch",
         "Live, with warm contacts only"],
    ],
    widths=[0.45, 1.0, 2.5, 2.05],
)

h2("Why this order")
para(
    "Weeks 1 to 4 look like the least exciting work and are the highest leverage. Putting the "
    "schema under version control is what makes the staging environment a genuine mirror of "
    "production rather than a second hand-built database that quietly drifts. Building payments "
    "before that safety net exists would mean testing money flows against the live database."
)
para(
    "Weeks 5 to 9 are the critical path. The fee module comes first because it is pure logic, easy "
    "to test in isolation, and the piece most likely to be silently wrong. The webhook and the "
    "atomic spots decrement follow, since together they are what turn a payment into a trustworthy "
    "booking."
)
para(
    "Weeks 10 to 12 are deliberately lighter, to absorb overrun from the payment block. If nothing "
    "slips, the spare hours go to P1 items, starting with the smoke test."
)

# ---------------------------------------------------------------- risks
h1("Risks and dependencies")

h2("HitPay and Corppass approval — the critical dependency")
para(
    "From week 6 onward, everything depends on HitPay marketplace access, which requires Corppass "
    "and UEN verification that DECISIONS.md still records as in progress. This is an "
    "administrative wait that cannot be compressed by working harder. Two mitigations: start the "
    "chase in week 1, and request sandbox credentials at the same time, since the integration "
    "cannot be built without them either. If approval has not landed by week 6, pull P1 work "
    "forward (host-to-guest reviews, smoke tests, the shared-constants refactor) rather than "
    "losing the week, and keep the payment block queued behind it."
)

h2("Eight hours per week fragments badly")
para(
    "The payment work in weeks 6 to 8 does not survive being done in 45-minute evening slices. "
    "Protect the time as a single uninterrupted block. Weeks 1 to 4 and 10 to 11, by contrast, "
    "break into small pieces comfortably, so if a week has to be fragmented, fragment those."
)

h2("Staging environment cost")
para(
    "Supabase's free tier allows a second project, but free projects pause after around a week of "
    "inactivity, which is awkward for an environment touched once a week. Budget for roughly $25 "
    "per month on staging if the pausing becomes a nuisance, and seed it with realistic fake "
    "listings and sessions, since an empty database will not exercise the booking flow."
)

h2("No test coverage exists today")
para(
    "The fee module in week 5 is the first test suite in the project. Everything before launch "
    "otherwise rests on the manual QA pass in week 12, which is why USER_SCENARIOS.md should be "
    "treated as the QA script rather than as background reading."
)

h2("Single maintainer")
para(
    "Right now the project cannot be handed over: there is no environment template and no database "
    "structure in the repository. Items 1 and 2 in P0 fix that, which is a second reason they come "
    "first."
)

# ---------------------------------------------------------------- security
doc.add_page_break()
h1("Security and data protection")

para(
    "The question behind this section was whether OWASP Top 10 style penetration testing is viable "
    "before launch. It is, but not in its usual form. A formal paid engagement is the wrong shape "
    "and cost for TryKai today, while a targeted self-audit of roughly eight hours would surface "
    "more real problems than a generic scan. That is P0 item 13, and it fits inside existing slack "
    "without moving the launch date."
)

h2("Why the standard Top 10 maps unevenly onto this architecture")
para(
    "TryKai has no server of its own. The frontend is static files, and the browser talks straight "
    "to Supabase using a key that is public by design: VITE_SUPABASE_ANON_KEY ships inside the "
    "JavaScript bundle, which is expected and is not itself a vulnerability. That removes several "
    "Top 10 categories almost entirely, since there is no server-side template rendering, no "
    "hand-written session management, and no query builder to inject into."
)
para(
    "What it does instead is concentrate risk in one place. Row-level security is the entire "
    "authorization boundary. Anyone can extract the anon key from the bundle in seconds and query "
    "the database directly, so a missing or overly permissive policy is not a theoretical finding, "
    "it is an open API. Broken access control is therefore not one of ten items to work through "
    "here; it is roughly seventy per cent of the genuine attack surface."
)

h2("What to actually test")
para(
    "Each of the following is testable with curl and the public anon key, with no tooling and no "
    "specialist knowledge required. They should be written down as a checklist during the week 2 "
    "audit and re-run in week 11 once the payment layer is finished."
)
bullet([("Can a logged-in user update their own users row to set verification_status to 'approved'? If the policy is a broad \"users can update their own row,\" a host can self-approve and bypass identity verification entirely.", False)])
bullet([("Can that same user reset host_strikes to zero, escaping the three-strike listing deactivation rule?", False)])
bullet([("Can any authenticated user read another user's id_photo_url and selfie_url, and are the underlying verification-docs objects genuinely private rather than merely unlinked?", False)])
bullet([("Can a guest read full_address without a confirmed booking? Nothing reads it today, so this is currently fail-safe, but week 10 adds the reveal and that is when the policy has to be correct.", False)])
bullet([("Can user A read user B's bookings, or alter total_amount or refund_amount on their own booking?", False)])
bullet([("Can a review be inserted with no corresponding booking at all?", False)])

h2("Issues already visible in the code")
para(
    "These came from reading the code rather than testing it, so treat them as a starting point "
    "rather than a complete list."
)
bullet([
    ("Unauthenticated function endpoints. ", True),
    (
        "All four edge functions run with verify_jwt = false (supabase/config.toml lines 417, 428, "
        "439 and 450), and notify-verification-result builds its email entirely from the "
        "unauthenticated request body. Anyone who knows the URL can post a crafted payload and make "
        "TryKai email an arbitrary address. Impact is low today only because the sender is a test "
        "domain nobody receives. Once trykai.sg is verified in Resend (P0 item 8) it becomes an open "
        "relay sending attacker-controlled content from a legitimately signed domain: a ready-made "
        "phishing vector that would also damage sending reputation. The fix is a shared-secret header "
        "check on the database webhook, and it must land in the same week as the Resend change, not "
        "after it.",
        False,
    ),
])
bullet([
    ("Webhook forgery, once the webhook exists. ", True),
    (
        "The HitPay webhook built in week 7 must verify its signature. An unauthenticated endpoint "
        "that flips bookings to 'confirmed' means anyone who finds the URL can grant themselves free "
        "sessions. This is the highest-consequence item on the list, and it is part of building the "
        "webhook correctly rather than extra scope.",
        False,
    ),
])
bullet([
    ("Unvalidated input on the booking call. ", True),
    (
        "guests_count arrives from the client and is never checked against max_guests, nor checked "
        "for being a positive number. The spots_remaining < guests_count guard passes trivially for "
        "negative values.",
        False,
    ),
])
bullet([
    ("Permissive cross-origin policy. ", True),
    (
        "Every function returns Access-Control-Allow-Origin: '*'. Narrow this to the production "
        "domain.",
        False,
    ),
])
bullet([
    ("Weak authentication settings. ", True),
    (
        "enable_confirmations is false, so email addresses are never verified and anyone can sign up "
        "using someone else's address; minimum_password_length is 6 with no complexity requirement; "
        "SMS is disabled, so the phone OTP that DECISIONS.md lists as a trust layer does not exist. "
        "Confirm the hosted project's real settings in the Supabase dashboard, since config.toml "
        "governs local development.",
        False,
    ),
])
bullet([
    ("Injection is genuinely low risk, with one exception. ", True),
    (
        "There is no dangerouslySetInnerHTML or innerHTML anywhere in src/, and JSX escapes output by "
        "default, so stored cross-site scripting through listing titles or descriptions is not "
        "currently exploitable in the app. The email templates are the exception: full_name is "
        "interpolated straight into the message HTML.",
        False,
    ),
])
bullet([
    ("No audit trail on money events. ", True),
    (
        "Nothing records booking status transitions. Worth adding an append-only log while the "
        "payment layer is being rebuilt anyway, since it is also what makes disputes answerable.",
        False,
    ),
])

h2("Why a self-audit rather than a paid penetration test")
para(
    "A professional web application penetration test in Singapore runs roughly SGD 3,000 to 8,000. "
    "Against about $191 spent on the business to date and no revenue, that is not a defensible "
    "spend before launch, and much of what it would report is already listed above and fixable for "
    "nothing. The time to buy one is when there is meaningful transaction volume, an external "
    "funding round, or a Pte Ltd conversion, which is why it sits in P2."
)
para(
    "Free tooling covers the automated portion adequately: Supabase's own security advisors flag "
    "tables with row-level security disabled, an OWASP ZAP baseline scan catches missing response "
    "headers and misconfiguration, and npm audit covers dependency vulnerabilities and can run in "
    "the existing CI workflow."
)
para(
    "One sequencing note. Testing the payment layer before it is rewritten in weeks 6 to 9 would be "
    "wasted effort, which is the reason the verification pass sits in week 11 rather than at the "
    "start."
)

h2("Personal data: the higher-probability exposure")
para(
    "Worth naming alongside the technical items. TryKai stores NRIC or passport photographs and "
    "selfies. Singapore's Personal Data Protection Act restricts NRIC collection fairly tightly: "
    "organisations generally should not collect NRIC numbers or copies except where required by law "
    "or genuinely necessary to verify identity to a high degree of fidelity. A marketplace where "
    "strangers meet in person is a plausible justification, but it is an argument better documented "
    "in advance than assembled during a complaint. Because TryKai is a sole proprietorship there is "
    "no liability separation, so an incident involving identity documents is personal exposure for "
    "the owner."
)
para(
    "Three cheap mitigations, none of which needs engineering beyond what is already planned: delete "
    "verification documents once a host is approved rather than retaining them indefinitely, write "
    "down a retention period and stick to it, and confirm the verification-docs bucket is private "
    "with signed-URL access only. On probability rather than severity, this is a more likely source "
    "of real trouble than most of the OWASP list."
)

# ---------------------------------------------------------------- assumptions
h1("Assumptions this plan rests on")

bullet([("HitPay is the sole payment provider. ", True), ("Stripe is removed rather than kept as a fallback, so no provider abstraction layer is built.", False)])
bullet([("Staging is a full second Supabase project, ", True), ("not previews pointed at production data.", False)])
bullet([("Eight hours per week, twelve weeks, starting 3 August 2026.", True), ("", False)])
bullet([("Security work is done in-house, ", True), ("using the checklist in this document and free tooling, with a paid penetration test deferred to P2.", False)])
bullet([("Soft launch means warm contacts and 15 to 20 listings, ", True), ("not a marketing launch. Success at that stage is proving the mechanism end to end: a stranger pays, attends, and leaves a review.", False)])
bullet([("Search visibility work is explicitly deferred ", True), ("to P2, accepting that listing pages will not rank or preview well at launch.", False)])

closing = doc.add_paragraph()
run = closing.add_run(
    "Estimates are working figures for a solo developer on an unfamiliar codebase, not "
    "commitments. Revisit them after week 5, once the first real block of payment work has given "
    "a sense of actual pace."
)
run.italic = True
run.font.size = Pt(9)
run.font.color.rgb = GREY

doc.save(OUT)
print("Saved:", OUT)
