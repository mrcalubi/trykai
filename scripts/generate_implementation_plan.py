"""Generate the TryKai 12-week step-by-step implementation playbook as a Word document.

Usage:
    python scripts/generate_implementation_plan.py

Set TRYKAI_STEPS_OUT to write elsewhere (useful when the published copy is open
in Word and therefore locked).

Formatting helpers are intentionally duplicated from generate_launch_plan.py:
these are standalone one-off generators, and coupling them would risk breaking a
working artefact for no functional gain.
"""

import os
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Inches

NAVY = RGBColor(0x16, 0x26, 0x4B)
CORAL = RGBColor(0xC1, 0x5F, 0x3C)
GREY = RGBColor(0x5A, 0x60, 0x70)

OUT = Path(
    os.environ.get(
        "TRYKAI_STEPS_OUT",
        Path(__file__).resolve().parent.parent / "TryKai-Implementation-Steps.docx",
    )
)

doc = Document()

# ---------------------------------------------------------------- base styles
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(10.5)
normal.paragraph_format.space_after = Pt(7)
normal.paragraph_format.line_spacing = 1.12

for name, size in (("Heading 1", 15), ("Heading 2", 11.5), ("Heading 3", 10.5)):
    style = doc.styles[name]
    style.font.name = "Calibri"
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = NAVY
    style.paragraph_format.space_before = Pt(14)
    style.paragraph_format.space_after = Pt(5)

for section in doc.sections:
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)
    section.top_margin = Inches(0.85)
    section.bottom_margin = Inches(0.85)


# ---------------------------------------------------------------- helpers
def h1(text):
    doc.add_heading(text, level=1)


def h2(text):
    doc.add_heading(text, level=2)


def para(text, italic=False, color=None, size=None):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.italic = italic
    if color is not None:
        run.font.color.rgb = color
    if size is not None:
        run.font.size = Pt(size)
    return p


def rich(segments, style=None, indent=None, space_after=None):
    """segments: list of (text, bold) tuples."""
    p = doc.add_paragraph(style=style)
    for text, bold in segments:
        run = p.add_run(text)
        run.bold = bold
    if indent is not None:
        p.paragraph_format.left_indent = Inches(indent)
    if space_after is not None:
        p.paragraph_format.space_after = Pt(space_after)
    return p


def bullet(segments):
    return rich(segments, style="List Bullet")


def code(lines):
    """Shaded monospace block. lines: list of strings, or a single string."""
    if isinstance(lines, str):
        lines = [lines]
    p = doc.add_paragraph()
    fmt = p.paragraph_format
    fmt.left_indent = Inches(0.3)
    fmt.space_before = Pt(4)
    fmt.space_after = Pt(8)
    fmt.line_spacing = 1.0

    shading = OxmlElement("w:shd")
    shading.set(qn("w:val"), "clear")
    shading.set(qn("w:fill"), "F2F1ED")
    p._p.get_or_add_pPr().append(shading)

    for i, line in enumerate(lines):
        run = p.add_run(line)
        run.font.name = "Consolas"
        run.font.size = Pt(8.5)
        if i < len(lines) - 1:
            run.add_break()
    return p


def step(number, text, code_lines=None, notes=None):
    rich(
        [(f"{number}.  ", True), (text, False)],
        indent=0.15,
        space_after=(3 if (code_lines or notes) else 7),
    )
    if code_lines:
        code(code_lines)
    for note in notes or []:
        p = rich([(note, False)], indent=0.42, space_after=4)
        p.runs[0].font.size = Pt(9.5)
        p.runs[0].font.color.rgb = GREY


def checklist(items):
    for item in items:
        p = rich([("[  ]   ", True), (item, False)], indent=0.15, space_after=3)
        p.runs[0].font.name = "Consolas"


def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Light Grid Accent 1"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER

    hdr = t.rows[0].cells
    for i, head in enumerate(headers):
        hdr[i].text = ""
        run = hdr[i].paragraphs[0].add_run(head)
        run.bold = True
        run.font.size = Pt(9)

    for row in rows:
        cells = t.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = ""
            run = cells[i].paragraphs[0].add_run(str(value))
            run.font.size = Pt(9)

    if widths:
        for row in t.rows:
            for i, width in enumerate(widths):
                row.cells[i].width = Inches(width)

    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def week_header(number, dates, title, goal):
    if number > 0:
        doc.add_page_break()
    h1(f"Week {number} — {title}")
    p = rich([(f"{dates}  |  8 hours", False)])
    p.runs[0].font.size = Pt(9)
    p.runs[0].font.color.rgb = CORAL
    p.paragraph_format.space_after = Pt(8)
    rich([("Goal.  ", True), (goal, False)])


# ---------------------------------------------------------------- title block
title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.LEFT
run = title.add_run("TryKai")
run.font.size = Pt(26)
run.font.bold = True
run.font.color.rgb = NAVY
title.paragraph_format.space_after = Pt(0)

sub = doc.add_paragraph()
run = sub.add_run("12-Week Implementation Playbook")
run.font.size = Pt(14)
run.font.color.rgb = CORAL
sub.paragraph_format.space_after = Pt(4)

meta = doc.add_paragraph()
run = meta.add_run(
    "Step-by-step companion to the Launch Implementation Plan   |   "
    "Weeks of 3 August to 25 October 2026   |   8 hours per week"
)
run.font.size = Pt(9)
run.font.color.rgb = GREY

# ---------------------------------------------------------------- how to use
h1("How to use this document")

para(
    "The Launch Implementation Plan says what needs to happen and why. This document says how, "
    "week by week, in the order the work has to be done. Each week has a goal, the steps to take, "
    "a list of things that must be true before you call it finished, and the traps specific to "
    "that week."
)
para(
    "Treat the eight hours as one block, not five evenings. Weeks 6 to 9 rebuild the payment "
    "layer and genuinely do not survive being done in 45-minute slices. Weeks 1 to 4 and 10 to 11 "
    "break up comfortably, so if a week has to be fragmented, fragment those."
)

h2("What counts as finished, for any change in this document")
bullet([("It is committed on a branch, opened as a pull request, and the CI lint and build pass.", False)])
bullet([("Anything touching the database is a migration file in supabase/migrations/, never a click in the Supabase dashboard. A dashboard change is invisible to staging, to the next developer, and to you in three months.", False)])
bullet([("Anything touching money has a test or a documented manual verification with the numbers you observed.", False)])
bullet([("The preview deployment was actually opened and clicked, not just built successfully.", False)])

h2("If a week overruns")
para(
    "There are 11 hours of slack across the twelve weeks and they are deliberately placed at the "
    "end. Overrun in weeks 1 to 5 should be absorbed by cutting scope inside the same week rather "
    "than pushing into the next one, because weeks 6 to 9 depend on everything before them being "
    "finished. If the HitPay approval has not arrived by week 6, do not idle: pull forward the "
    "P1 items (host-to-guest reviews, the smoke test, the shared-constants refactor) and keep the "
    "payment block queued behind the approval."
)

h2("Notation")
para(
    "Shaded blocks are commands or code to run or write. Commands assume PowerShell from the "
    "repository root. Where a command uses npx supabase, a globally installed supabase CLI works "
    "identically."
)

# ---------------------------------------------------------------- week 0
doc.add_page_break()
h1("Before week 1 — access you need in hand")

para(
    "None of the twelve weeks can start without these. Chase them all in one message to Caleb "
    "rather than discovering them one at a time."
)

table(
    ["What", "Why you need it", "Blocks"],
    [
        ["Supabase project access (owner or admin invite)", "Schema export, RLS policies, function secrets, storage buckets", "Weeks 2, 3, 4"],
        ["The three VITE_ environment values", "Running the app locally at all", "Week 1"],
        ["HitPay dashboard login", "Business verification status, marketplace access request, API keys", "Weeks 1, 6"],
        ["Resend account access", "Domain verification and sender change", "Week 10"],
        ["Vercel account access", "Environment separation and deployment", "Week 4"],
        ["Vodien (domain registrar) login", "DNS records for Resend, and the final trykai.sg cutover", "Weeks 10, 12"],
        ["Confirmation of who reviews host verifications", "The manual approval step is a person, and that person needs to know", "Week 12"],
    ],
    widths=[1.9, 3.3, 1.4],
)

para(
    "Ask for read access to the HitPay support thread as well, if one exists. The Corppass and UEN "
    "approval is the single dependency that can push the launch date, and you want to see its "
    "status directly rather than relayed."
)

# ================================================================ WEEK 1
week_header(
    1,
    "3–9 August",
    "Take over safely",
    "Make the project runnable by someone who is not Caleb, stop committing things that should not "
    "be in git, and start the HitPay approval clock so it runs in the background for five weeks.",
)

h2("Steps")

step(
    1,
    "Get the app running locally. Create a .env in the repository root (it is gitignored) and "
    "confirm the home page loads real listings.",
    [
        "VITE_SUPABASE_URL=https://<project-ref>.supabase.co",
        "VITE_SUPABASE_ANON_KEY=<anon key from Supabase: Settings > API>",
        "",
        "npm install",
        "npm run dev",
    ],
    [
        "If the page is blank, open the browser console: a missing or wrong Supabase URL fails at "
        "the first query rather than at startup.",
    ],
)

step(
    2,
    "Commit a .env.example documenting every variable the project uses, frontend and functions. "
    "This is the artefact that makes handover possible.",
    [
        "# Frontend (Vite, inlined at build time)",
        "VITE_SUPABASE_URL=",
        "VITE_SUPABASE_ANON_KEY=",
        "VITE_SENTRY_DSN=            # added week 11, production only",
        "",
        "# Edge function secrets (set with: npx supabase secrets set KEY=value)",
        "SUPABASE_URL=",
        "SUPABASE_ANON_KEY=",
        "SUPABASE_SERVICE_ROLE_KEY=",
        "RESEND_API_KEY=",
        "HITPAY_API_KEY=             # added week 6",
        "HITPAY_WEBHOOK_SALT=        # added week 7",
        "WEBHOOK_SHARED_SECRET=      # added week 10",
    ],
)

step(
    3,
    "Untrack supabase/.temp/. It is committed today and contains a pooler connection string for "
    "the production database.",
    [
        "git rm -r --cached supabase/.temp",
        '# then add to .gitignore:',
        "supabase/.temp/",
    ],
)

step(
    4,
    "Audit git history for the .env that was removed in commits 0fd8e01 and decb4c3. Removing a "
    "file from tracking does not remove it from history.",
    [
        "git log --all --oneline --diff-filter=A -- .env",
        "git log --all --oneline -- .env",
        "git show <commit>:.env      # for each commit listed",
    ],
    [
        "If real secrets are in there: the anon key needs no rotation (it is public by design), but "
        "rotate the service role key and the Resend API key, and revoke any payment-provider secret "
        "key you find.",
        "Rotating Supabase keys signs every user out. Harmless now with no real users; do it this "
        "week rather than after launch.",
    ],
)

step(
    5,
    "Delete the dead payment code. The repository still carries a full client-side card checkout "
    "that will never be used, and leaving it means five weeks of confusion about which path is "
    "live.",
    [
        "npm uninstall @stripe/stripe-js @stripe/react-stripe-js",
        "",
        "# src/pages/ListingDetail.jsx",
        "#   delete loadStripe, Elements, PaymentElement, useStripe, useElements,",
        "#   the CheckoutForm component, and the clientSecret state",
        "#   leave handleBook in place; week 6 points it at HitPay",
        "",
        "# delete the whole folder; week 6 creates create-payment-request instead",
        "Remove-Item -Recurse supabase/functions/create-payment-intent",
        "",
        "# .github/workflows/ci.yml: drop the VITE_STRIPE_PUBLISHABLE_KEY env line",
        "# also remove the STRIPE_SECRET_KEY function secret",
    ],
    [
        "There is no working payment path between now and week 6. That is not a regression: nothing "
        "confirms payments today either, so no booking has ever been trustworthy.",
        "Leave the stripe_payment_id and stripe_account_id columns for now. They are dropped in the "
        "week 6 migration, once migrations exist.",
    ],
)

step(
    6,
    "Write a real root README.md. The current one is the unmodified Vite template and was moved "
    "into Markdowns/. Cover: prerequisites, the env vars, npm install / dev / build / lint, where "
    "the four planning documents live, how to deploy edge functions, and the fact that the "
    "database schema is not yet in the repo (which week 2 fixes).",
)

step(
    7,
    "Start the HitPay clock. Log in, confirm the state of business verification, and explicitly "
    "request two things: marketplace or split-payment access, and sandbox credentials including "
    "the webhook salt. Record the request date and reference in DECISIONS.md.",
    notes=[
        "You cannot build week 6 or 7 without the sandbox key and the salt. Ask for both now, not "
        "when you reach them.",
    ],
)

h2("Done when")
checklist([
    "A fresh clone plus .env.example plus values from Caleb gets someone to a working local app.",
    "git ls-files supabase/.temp returns nothing.",
    "No payment provider other than HitPay is referenced in package.json, src/ or supabase/.",
    "npm run build and npm run lint both pass after the deletion.",
    "Root README.md describes real setup, and no longer mentions the Vite template.",
    "History audit is done, and any exposed secrets are rotated.",
    "HitPay request is submitted, with the date written into DECISIONS.md.",
])

h2("Watch out for")
bullet([("Committing .env. It is in .gitignore twice, but check git status before every commit this week.", False)])
bullet([("Assuming the anon key being public is a bug. It ships in the JavaScript bundle by design. The protection is row-level security, which is week 2 and 3.", False)])

# ================================================================ WEEK 2
week_header(
    2,
    "10–16 August",
    "Database into version control",
    "Get the schema and every row-level security policy out of the live project and into the "
    "repository, and write down the access-control abuse cases you will test next week.",
)

h2("Before you start")
bullet([("Supabase project access, and the project ref from the dashboard URL.", False)])

h2("Steps")

step(
    1,
    "Link the CLI to the production project.",
    [
        "npx supabase --version",
        "npx supabase login",
        "npx supabase link --project-ref <prod-project-ref>",
    ],
)

step(
    2,
    "Pull the schema. This writes a migration file describing the live database as it exists "
    "today.",
    [
        "npx supabase db pull",
        "# creates supabase/migrations/<timestamp>_remote_schema.sql",
    ],
)

step(
    3,
    "Read the generated file and confirm it contains what you expect. Specifically check that all "
    "five tables are present and that row-level security is actually enabled on each.",
    [
        'Select-String -Path supabase/migrations/*_remote_schema.sql -Pattern "create table"',
        'Select-String -Path supabase/migrations/*_remote_schema.sql -Pattern "enable row level security"',
        'Select-String -Path supabase/migrations/*_remote_schema.sql -Pattern "create policy"',
    ],
    [
        "If any of users, listings, sessions, bookings or reviews lacks RLS, stop and treat it as an "
        "incident: that table is readable and possibly writable by anyone holding the anon key, "
        "which is everyone.",
        "Count the policies. A table with RLS enabled and no policies is inaccessible; a table with "
        "one broad policy is usually the problem you are looking for.",
    ],
)

step(
    4,
    "Capture what db pull does not. Storage bucket definitions and their policies live outside the "
    "public schema, so write them by hand into a second migration: listing-photos (public) and "
    "verification-docs (private), plus the policies controlling who can upload and read.",
    [
        "npx supabase db pull --schema storage",
        "# review, then hand-write supabase/migrations/<ts>_storage_buckets.sql",
    ],
)

step(
    5,
    "Create supabase/seed.sql, even if empty for now. supabase/config.toml already points at it "
    "(sql_paths = [\"./seed.sql\"]), so db reset fails without it. Week 4 fills it in.",
)

step(
    6,
    "Write docs/rls-checklist.md with the abuse cases below, each as an unchecked item with space "
    "for the result. You will run them next week and again in week 11.",
    notes=[
        "Can a user set their own users.verification_status to 'approved' and bypass ID verification?",
        "Can a user reset their own host_strikes to zero and escape the three-strike rule?",
        "Can any authenticated user read another user's id_photo_url or selfie_url?",
        "Are verification-docs objects genuinely private, or merely unlinked?",
        "Can a guest read listings.full_address without a confirmed booking?",
        "Can user A read user B's bookings, or change total_amount or refund_amount on their own?",
        "Can a review be inserted with no corresponding booking?",
        "Can a non-host update or deactivate someone else's listing?",
    ],
)

h2("Done when")
checklist([
    "supabase/migrations/ contains the full schema, committed.",
    "RLS is confirmed enabled on all five tables, with the policy list reviewed line by line.",
    "Storage buckets and their policies exist as a migration, not just in the dashboard.",
    "supabase/seed.sql exists.",
    "docs/rls-checklist.md is committed with eight unchecked abuse cases.",
])

h2("Watch out for")
bullet([("Editing the pulled migration to make it prettier. Leave it as generated; it is a factual snapshot. Put corrections in new migrations so the history stays honest.", False)])
bullet([("Assuming db pull captured everything. Function secrets, storage bucket rows, database webhook configuration and cron jobs all live outside it and will need recreating by hand in staging next week.", False)])

# ================================================================ WEEK 3
week_header(
    3,
    "17–23 August",
    "Build staging, then attack it",
    "Stand up a second Supabase project from the migrations, then run the abuse cases against it. "
    "Staging comes first so you are attacking a copy rather than production.",
)

h2("Steps")

step(
    1,
    "Create a second Supabase project named trykai-staging in the Singapore region "
    "(ap-southeast-1). Note its ref, URL and anon key.",
)

step(
    2,
    "Apply your migrations to it. This is the first real test of whether week 2 actually captured "
    "the schema.",
    [
        "npx supabase link --project-ref <staging-ref>",
        "npx supabase db push",
    ],
    [
        "If push fails or the resulting schema differs from production, fix the migrations rather "
        "than patching staging by hand. A staging database that was hand-corrected is worthless.",
    ],
)

step(
    3,
    "Recreate what migrations could not carry: storage buckets, function secrets, and the "
    "functions themselves.",
    [
        "npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<staging service role>",
        "npx supabase secrets set RESEND_API_KEY=<key>",
        "npx supabase functions deploy",
    ],
)

step(
    4,
    "Create two test accounts through the normal signup flow, and note their user ids and access "
    "tokens. You need two so you can test whether A can reach B's data.",
)

step(
    5,
    "Run every abuse case from docs/rls-checklist.md against staging using the anon key directly, "
    "not through the app. The app is not the attacker; curl is. Example, testing self-approval:",
    [
        "curl -X PATCH \"$STAGING_URL/rest/v1/users?id=eq.$USER_A_ID\" `",
        "  -H \"apikey: $ANON_KEY\" `",
        "  -H \"Authorization: Bearer $USER_A_TOKEN\" `",
        "  -H \"Content-Type: application/json\" `",
        "  -d '{\"verification_status\":\"approved\"}'",
        "",
        "# Expected: rejected, or the column silently unchanged.",
        "# If it succeeds, identity verification is bypassable.",
    ],
)

step(
    6,
    "Record every result in docs/rls-checklist.md, then fix the failures as migrations. Note that "
    "row-level security cannot restrict which columns an update touches, so protecting "
    "verification_status and host_strikes needs a trigger that rejects changes to those columns "
    "unless the caller is the service role.",
    [
        "create or replace function public.guard_protected_user_columns()",
        "returns trigger language plpgsql as $$",
        "begin",
        "  if auth.role() <> 'service_role' then",
        "    if new.verification_status is distinct from old.verification_status",
        "       or new.host_strikes is distinct from old.host_strikes then",
        "      raise exception 'protected column';",
        "    end if;",
        "  end if;",
        "  return new;",
        "end $$;",
    ],
)

h2("Done when")
checklist([
    "Staging is reachable and its schema was created purely by db push.",
    "Two test accounts exist on staging.",
    "All eight abuse cases have a recorded pass or fail with the command used.",
    "Every failure has a migration fixing it, and the case has been re-run and now passes.",
    "The same fixes are pushed to production.",
])

h2("Watch out for")
bullet([("Testing destructive cases against production. Run them on staging only.", False)])
bullet([("Fixing a hole in the dashboard because it is faster. It will not exist in staging, or on the next developer's machine, and you will not remember in October.", False)])

# ================================================================ WEEK 4
week_header(
    4,
    "24–30 August",
    "Environments and seed data",
    "Separate production from preview in Vercel so every pull request gets a safe, clickable "
    "environment, and give staging enough data to actually exercise the booking flow.",
)

h2("Steps")

step(
    1,
    "Import the repository into Vercel. Framework preset Vite, build command npm run build, "
    "output directory dist. vercel.json already carries the single-page-app rewrite.",
)

step(
    2,
    "Set environment variables per environment, not globally. This is the whole point of the week.",
)

table(
    ["Variable", "Production", "Preview and Development"],
    [
        ["VITE_SUPABASE_URL", "production project URL", "staging project URL"],
        ["VITE_SUPABASE_ANON_KEY", "production anon key", "staging anon key"],
        ["VITE_SENTRY_DSN", "set in week 11", "leave unset"],
    ],
    widths=[1.8, 2.3, 2.3],
)

step(
    3,
    "Verify the rewrite on a real preview URL by navigating directly to a deep link rather than "
    "clicking through from the home page.",
    [
        "# open https://<preview-url>/dashboard directly in a new tab",
        "# it must render the app, not a 404 from the host",
    ],
)

step(
    4,
    "Write the seed. Auth users cannot be inserted with plain SQL because of password hashing, so "
    "seed them with a small script using the service role key, then let supabase/seed.sql insert "
    "the listings, sessions and reviews that reference those ids.",
    [
        "// scripts/seed-staging.mjs",
        "import { createClient } from '@supabase/supabase-js'",
        "const admin = createClient(process.env.SUPABASE_URL,",
        "                           process.env.SUPABASE_SERVICE_ROLE_KEY)",
        "await admin.auth.admin.createUser({",
        "  email: 'host@example.test', password: 'test-password-123',",
        "  email_confirm: true,",
        "})",
    ],
    [
        "Seed at least: two hosts (one approved, one pending), one guest, six listings across three "
        "categories, and sessions both in the future and in the past. Past sessions are what let you "
        "test reviews and payouts.",
    ],
)

step(
    5,
    "Run the seed against staging and confirm the home page shows listings with photos, that "
    "filters return sensible results, and that a listing detail page renders sessions.",
)

step(
    6,
    "Leave CI as it is. It builds with placeholder environment values, which is correct: CI should "
    "not hold real credentials just to prove the bundle compiles.",
)

h2("Done when")
checklist([
    "Opening a pull request produces a preview URL that reads from staging.",
    "The production deployment reads from production.",
    "A deep link works on the preview URL.",
    "Staging shows seeded listings, and at least one past session exists for review testing.",
    "No production credential exists in the Preview or Development scope.",
])

h2("Watch out for")
bullet([("Vite inlines environment variables at build time. Changing a value in Vercel does nothing until you redeploy.", False)])
bullet([("Pointing preview at production data to save an hour. That single shortcut turns every future test booking into a real row in your real database.", False)])

# ================================================================ WEEK 5
week_header(
    5,
    "31 August – 6 September",
    "The fee module",
    "One tested source of truth for money arithmetic, importable by both the edge functions and "
    "the frontend, replacing the hardcoded flat 15 per cent.",
)

h2("Steps")

step(
    1,
    "Add a test runner. The project currently has none, so this is also the first test suite.",
    [
        "npm i -D vitest",
        '# package.json scripts:  "test": "vitest run",  "test:watch": "vitest"',
        "# then add a `- run: npm test` step to .github/workflows/ci.yml",
    ],
)

step(
    2,
    "Put the module where both runtimes can import it. Deno reads a plain TypeScript file directly, "
    "and Vite compiles TypeScript, so a single file under supabase/functions/_shared/ serves both "
    "and cannot drift.",
    [
        "supabase/functions/_shared/fees.ts        <- single source of truth",
        "supabase/functions/_shared/fees.test.js   <- vitest",
        "",
        "// frontend imports it as:",
        "import { calculateFees } from '../../supabase/functions/_shared/fees.ts'",
    ],
)

step(
    3,
    "Implement the structure from DECISIONS.md. Everything is integer cents in and integer cents "
    "out, and rounding happens once per fee rather than at the end of a chain.",
    [
        "export function calculateFees({",
        "  subtotalCents,            // price_per_person * guests_count",
        "  paymentMethod = 'card',   // 'card' | 'paynow'",
        "  hostType = 'peer',        // 'peer' | 'business'",
        "  hostCompletedBookings = 0,",
        "}) {",
        "  const guestRate = paymentMethod === 'paynow' ? 8 : 10",
        "  const guestFee = Math.max(Math.round(subtotalCents * guestRate / 100), 200)",
        "",
        "  const waived = hostType === 'peer' && hostCompletedBookings < 3",
        "  const hostRate = hostType === 'business' || waived ? 0 : 10",
        "  const hostFee = Math.round(subtotalCents * hostRate / 100)",
        "",
        "  return {",
        "    subtotalCents,",
        "    guestFeeCents: guestFee,",
        "    hostFeeCents: hostFee,",
        "    guestTotalCents: subtotalCents + guestFee,",
        "    hostPayoutCents: subtotalCents - hostFee,",
        "    platformFeeCents: guestFee + hostFee,",
        "  }",
        "}",
    ],
)

step(
    4,
    "Write the tests before wiring anything. These cases are the ones that actually catch "
    "regressions:",
    notes=[
        "$20 card booking: guest fee 200 cents, guest total 2200.",
        "$20 PayNow: guest fee 160, and the saving versus card is exactly 40 cents.",
        "$10 booking: the $2 floor binds, so the fee is 200 rather than 100.",
        "Business host: host fee is zero, payout equals subtotal.",
        "Peer host with 0, 1 and 2 completed bookings: host fee waived. With 3: charged.",
        "Every returned value is an integer (assert Number.isInteger on all of them).",
        "Multi-guest: subtotal scales, and the floor is applied to the booking, not per guest.",
    ],
)

step(
    5,
    "Show the guest the same numbers the server will charge. Wire the checkout summary in "
    "ListingDetail.jsx to calculateFees, including the PayNow-versus-card comparison that "
    "DECISIONS.md specifies (card $22.00 against PayNow $21.20, with the saving stated).",
)

step(
    6,
    "Confirm the old constant is gone.",
    [
        'Select-String -Path supabase/functions/**/*.ts -Pattern "0\\.15"',
        "# must return nothing by end of week 6",
    ],
)

h2("Done when")
checklist([
    "npm test passes locally and in CI.",
    "All seven test cases above exist and pass.",
    "The frontend checkout shows card and PayNow totals from the shared module.",
    "No literal 0.15 remains in the payment path.",
])

h2("Watch out for")
bullet([("Floating-point money. Never store or return dollars; convert only at the display layer and at the HitPay boundary.", False)])
bullet([("Applying the $2 floor to the total rather than to the guest fee. It is max(10% of subtotal, $2) on the fee itself.", False)])
bullet([("Deciding the fee split late. Write into DECISIONS.md whether the displayed price includes the guest fee, and keep the UI consistent with it.", False)])

# ================================================================ WEEK 6
week_header(
    6,
    "7–13 September",
    "HitPay checkout",
    "Build the payment request so a guest can reach a live HitPay sandbox payment page from a "
    "listing, and get a booking row on the back of it.",
)

h2("Before you start")
bullet([("HitPay sandbox API key in hand. If it has not arrived, do not start this week: switch to P1 work and keep chasing.", False)])

h2("Steps")

step(
    1,
    "Migration for the payment reference, dropping the legacy provider columns in the same change. "
    "There are no real payments to preserve, so leaving them would only invite confusion later.",
    [
        "alter table bookings add column hitpay_reference text;",
        "alter table bookings add column hitpay_payment_id text;",
        "create unique index bookings_hitpay_reference_key",
        "  on bookings (hitpay_reference);",
        "",
        "alter table bookings drop column stripe_payment_id;",
        "alter table users    drop column stripe_account_id;",
    ],
    [
        "The unique index is what makes the webhook idempotent in week 7. Add it now.",
    ],
)

step(
    2,
    "Write the create-payment-request function, in place of the one deleted in week 1. Validate "
    "input properly this time: the old version accepted any guests_count, including negative "
    "numbers, because the only check was spots_remaining < guests_count.",
    [
        "if (!Number.isInteger(guests_count) || guests_count < 1) return 400",
        "if (guests_count > session.listings.max_guests)            return 400",
        "if (guests_count > session.spots_remaining)                return 400",
    ],
)

step(
    3,
    "Compute the amount with the fee module, insert the booking as pending with a generated "
    "reference, then create the HitPay payment request. Note the units: HitPay takes decimal "
    "dollars while your database holds integer cents.",
    [
        "const fees = calculateFees({ subtotalCents, paymentMethod, hostType })",
        "",
        "const res = await fetch('https://api.sandbox.hit-pay.com/v1/payment-requests', {",
        "  method: 'POST',",
        "  headers: {",
        "    'X-BUSINESS-API-KEY': Deno.env.get('HITPAY_API_KEY'),",
        "    'Content-Type': 'application/json',",
        "  },",
        "  body: JSON.stringify({",
        "    amount: (fees.guestTotalCents / 100).toFixed(2),   // dollars!",
        "    currency: 'SGD',",
        "    reference_number: reference,",
        "    email: user.email,",
        "    purpose: session.listings.title,",
        "    redirect_url: `${SITE_URL}/booking/return?ref=${reference}`,",
        "    webhook: `${FUNCTIONS_URL}/hitpay-webhook`,",
        "  }),",
        "})",
        "// response contains { id, url }  -> return url to the browser",
    ],
)

step(
    4,
    "Point handleBook in ListingDetail.jsx at the returned URL. The client-side checkout was "
    "deleted in week 1, so this is now a two-line change plus the payment-method choice.",
    [
        "const { data } = await supabase.functions.invoke('create-payment-request', {",
        "  body: { session_id: sessionId, guests_count: 1, payment_method: method },",
        "})",
        "window.location.href = data.url",
    ],
)

step(
    5,
    "Add a /booking/return route that reads the reference and shows an explicitly provisional "
    "state, for example \"Payment received, confirming your booking\", polling the booking status. "
    "The redirect is a user-experience event, not proof of payment.",
)

step(
    6,
    "Test the full path in sandbox: book, land on the HitPay page, pay, return. A pending booking "
    "row with the reference must exist afterwards.",
)

h2("Done when")
checklist([
    "Book redirects to a real HitPay sandbox payment page with the correct amount.",
    "Paying returns to /booking/return, which shows a provisional state.",
    "A bookings row exists with hitpay_reference set and status pending.",
    "Invalid guests_count values are rejected with 400.",
    "The legacy provider columns are gone, and the schema matches on staging and production.",
])

h2("Watch out for")
bullet([("Treating the redirect as confirmation. Until week 7 exists, nothing confirms a payment, and that is expected at this point.", False)])
bullet([("The cents-to-dollars conversion. Getting this wrong by a factor of 100 is the single most common integration bug, and sandbox will happily charge $2,200.", False)])
bullet([("Sandbox versus live base URLs. api.sandbox.hit-pay.com now, api.hit-pay.com at week 12, driven by an environment variable rather than an edit.", False)])

# ================================================================ WEEK 7
week_header(
    7,
    "14–20 September",
    "The webhook",
    "Make payment confirmation real and un-forgeable. This closes the first launch blocker.",
)

h2("Steps")

step(
    1,
    "Create the hitpay-webhook function. It must run with verify_jwt = false, because HitPay "
    "cannot present a Supabase JWT, which means the signature check is the only authentication "
    "this endpoint has.",
    [
        "# supabase/config.toml",
        "[functions.hitpay-webhook]",
        "enabled = true",
        "verify_jwt = false",
    ],
)

step(
    2,
    "Verify the HMAC before parsing anything else. Sort the non-hmac fields, concatenate them as "
    "key=value, sign with the salt, and compare in constant time.",
    [
        "const form = Object.fromEntries(new URLSearchParams(await req.text()))",
        "const { hmac, ...fields } = form",
        "const message = Object.keys(fields).sort()",
        "  .map((k) => `${k}${fields[k]}`).join('')",
        "",
        "const key = await crypto.subtle.importKey('raw',",
        "  new TextEncoder().encode(Deno.env.get('HITPAY_WEBHOOK_SALT')),",
        "  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])",
        "const sig = await crypto.subtle.sign('HMAC', key,",
        "  new TextEncoder().encode(message))",
        "const expected = [...new Uint8Array(sig)]",
        "  .map((b) => b.toString(16).padStart(2, '0')).join('')",
        "",
        "if (expected !== hmac) return new Response('invalid signature', { status: 401 })",
    ],
    [
        "Confirm the exact concatenation format against HitPay's current documentation when you have "
        "the sandbox account; implementations differ on separators between versions.",
    ],
)

step(
    3,
    "On a completed status, update the booking to confirmed and record the payment id, matched on "
    "the reference. Keep the write idempotent: HitPay retries, so a second delivery must not "
    "produce a second confirmation or a second email.",
    [
        "// only act on the transition, not on the current state",
        "const { data, error } = await supabase",
        "  .from('bookings')",
        "  .update({ status: 'confirmed', hitpay_payment_id: paymentId })",
        "  .eq('hitpay_reference', reference)",
        "  .eq('status', 'pending')      // <- the idempotency guard",
        "  .select()",
        "",
        "if (!data?.length) return new Response('already processed', { status: 200 })",
    ],
)

step(
    4,
    "Send both emails on the transition: guest confirmation and host notification. The sender is "
    "still the Resend test domain until week 10, so verify delivery to Caleb's own address for now.",
)

step(
    5,
    "Point HitPay at the endpoint (the webhook field in the payment request from week 6, and the "
    "dashboard default), then test three cases: a real sandbox payment, a replayed identical "
    "webhook, and a tampered payload.",
    notes=[
        "Real payment: booking flips to confirmed within seconds, two emails sent.",
        "Replay: returns 200, no second email, status unchanged.",
        "Tampered field or wrong hmac: 401, nothing written.",
    ],
)

step(
    6,
    "Add a failed-webhook trail. Log the reference, the status and the outcome for every delivery, "
    "so a payment that did not confirm is diagnosable without guessing.",
)

h2("Done when")
checklist([
    "A sandbox payment confirms the booking automatically, with no manual step.",
    "A tampered or unsigned webhook is rejected with 401 and writes nothing.",
    "A replayed webhook returns 200 and causes no duplicate side effects.",
    "Both emails send on confirmation.",
    "Every delivery leaves a log line identifying the booking and outcome.",
])

h2("Watch out for")
bullet([("Returning a non-200 for duplicates. HitPay will keep retrying, and you will send a burst of emails.", False)])
bullet([("Logging the salt or the full signed message while debugging. Log the reference and the result, nothing more.", False)])
bullet([("Parsing before verifying. Verify the signature on the raw body first, then trust the contents.", False)])

# ================================================================ WEEK 8
week_header(
    8,
    "21–27 September",
    "Atomic capacity",
    "Make overbooking structurally impossible, closing the second launch blocker, and take "
    "capacity arithmetic away from the browser entirely.",
)

h2("Steps")

step(
    1,
    "Write confirm_booking as a database function that locks the session row, checks capacity and "
    "writes both changes together. Doing this in the edge function with two queries leaves a race "
    "no amount of care closes.",
    [
        "create or replace function public.confirm_booking(p_reference text)",
        "returns uuid",
        "language plpgsql",
        "security definer",
        "as $$",
        "declare",
        "  v_booking bookings;",
        "  v_session sessions;",
        "begin",
        "  select * into v_booking from bookings",
        "   where hitpay_reference = p_reference and status = 'pending'",
        "   for update;",
        "  if not found then return null; end if;",
        "",
        "  select * into v_session from sessions",
        "   where id = v_booking.session_id",
        "   for update;                       -- serialises concurrent confirmations",
        "",
        "  if v_session.spots_remaining < v_booking.guests_count then",
        "    raise exception 'insufficient spots';",
        "  end if;",
        "",
        "  update sessions",
        "     set spots_remaining = spots_remaining - v_booking.guests_count,",
        "         status = case when spots_remaining - v_booking.guests_count = 0",
        "                       then 'full' else status end",
        "   where id = v_session.id;",
        "",
        "  update bookings set status = 'confirmed' where id = v_booking.id;",
        "  return v_booking.id;",
        "end $$;",
    ],
)

step(
    2,
    "Lock the function down. SECURITY DEFINER bypasses row-level security, so only the service role "
    "should be able to call it.",
    [
        "revoke all on function public.confirm_booking(text) from anon, authenticated;",
        "grant execute on function public.confirm_booking(text) to service_role;",
    ],
)

step(
    3,
    "Add database-level guards so the invariant holds even if application code is wrong.",
    [
        "alter table sessions add constraint spots_remaining_non_negative",
        "  check (spots_remaining >= 0);",
        "alter table sessions add constraint spots_remaining_within_total",
        "  check (spots_remaining <= spots_total);",
    ],
    [
        "The second constraint is what would have caught today's cancellation bug, where each "
        "cancellation pushes capacity above the original total.",
    ],
)

step(
    4,
    "Replace the direct update in the webhook with a call to the function, and handle the "
    "insufficient-spots exception by marking the booking for refund rather than silently failing. "
    "A paid booking that cannot be seated must be refunded, not dropped.",
)

step(
    5,
    "Write the concurrency test. This is the one test that proves the week.",
    [
        "// create a session with spots_total = 3, then fire 10 confirmations at once",
        "const results = await Promise.all(",
        "  Array.from({ length: 10 }, () => confirmBooking(refs.pop()))",
        ")",
        "// expect exactly 3 fulfilled, 7 rejected, spots_remaining = 0",
    ],
)

step(
    6,
    "Add release_booking_spots for the cancellation path and stop the browser writing "
    "spots_remaining. Dashboard.jsx currently reads the value and writes back value + n, which is "
    "both racy and trivially tamperable.",
    [
        'Select-String -Path src/**/*.jsx -Pattern "spots_remaining"',
        "# after this week, only reads for display should remain",
    ],
)

h2("Done when")
checklist([
    "Both check constraints exist in a migration.",
    "confirm_booking is executable only by the service role.",
    "The concurrency test shows exactly spots_total confirmations succeeding.",
    "No client-side code writes spots_remaining.",
    "A payment that arrives for a full session is refunded rather than lost.",
])

h2("Watch out for")
bullet([("Passing amounts into SECURITY DEFINER functions from the caller. Read them from the row inside the function; never trust a parameter for money.", False)])
bullet([("Forgetting that the cancellation path also needs the atomic treatment. Fixing only the booking side leaves the other half of the bug in place.", False)])

# ================================================================ WEEK 9
week_header(
    9,
    "28 September – 4 October",
    "Refunds, payouts, and getting money logic out of the browser",
    "Make cancellations actually move money, and move the entire cancellation decision "
    "server-side, where it can no longer be tampered with.",
)

h2("The problem this week fixes")
para(
    "Cancellation is currently done entirely in the browser. Dashboard.jsx lines 375 to 431 let the "
    "client set status, cancelled_by, cancelled_at and refund_amount on its own booking, and lines "
    "433 to 500 do the same for host cancellations while also incrementing host_strikes. A guest "
    "can therefore choose their own refund amount, and a host can decline to record their own "
    "strike. The refund arithmetic in src/lib/cancellationPolicy.js is correct; the problem is "
    "purely that it runs somewhere the user controls."
)

h2("Steps")

step(
    1,
    "Move the refund calculation into the shared folder so the server and the UI use one "
    "implementation, exactly as with fees.",
    [
        "supabase/functions/_shared/cancellation.ts   <- moved from src/lib/",
        "# src/lib/cancellationPolicy.js re-exports from it, so existing imports keep working",
    ],
)

step(
    2,
    "Create a cancel-booking edge function that owns the whole decision: authenticate the caller, "
    "establish whether they are the guest or the host for that booking, recompute the refund from "
    "the stored total and the session start time, call HitPay, then write the result.",
    notes=[
        "Never accept a refund amount from the request body. Recompute it.",
        "Guest at 48 hours or more: full refund. Under 48 hours: 50 per cent.",
        "Host cancelling: every active booking refunded in full, plus one strike.",
        "At three strikes: deactivate the host's listings in the same transaction.",
    ],
)

step(
    3,
    "Call the HitPay refund endpoint with the stored payment id, then record the outcome. Store "
    "the refund's own identifier so a dispute can be traced later.",
    [
        "await fetch(`${HITPAY_BASE}/v1/refund`, {",
        "  method: 'POST',",
        "  headers: { 'X-BUSINESS-API-KEY': apiKey },",
        "  body: JSON.stringify({",
        "    payment_id: booking.hitpay_payment_id,",
        "    amount: (refundCents / 100).toFixed(2),",
        "  }),",
        "})",
    ],
    [
        "If the refund call fails, do not mark the booking cancelled silently. Record a "
        "needs-attention state and surface it, so nobody is left unrefunded without a trace.",
    ],
)

step(
    4,
    "Rewrite the two Dashboard handlers to call the function and render what it returns. Keep the "
    "existing refund-preview UI: the numbers it shows are right, they just stop being "
    "authoritative.",
)

step(
    5,
    "Fix release-payout. Two changes: it currently flips pending bookings to confirmed, which after "
    "week 7 would confirm unpaid bookings and must be deleted; and with HitPay handling the split, "
    "its remaining job is to record payout_released_at and reconcile against HitPay rather than to "
    "move money itself.",
    [
        "// DELETE this block from supabase/functions/release-payout/index.ts",
        "await supabase.from('bookings')",
        "  .update({ status: 'confirmed' })",
        "  .eq('session_id', session.id).eq('status', 'pending')",
    ],
    [
        "This is a security fix, not a tidy-up. Leaving it in means an unpaid booking becomes "
        "confirmed 24 hours after the session.",
    ],
)

step(
    6,
    "Schedule it. Nothing currently invokes release-payout at all, so add a cron trigger and "
    "confirm it fires.",
    [
        "select cron.schedule('release-payouts', '0 * * * *',",
        "  $$ select net.http_post(url := '<functions-url>/release-payout',",
        "       headers := '{\"Authorization\": \"Bearer <service-role>\"}'::jsonb) $$);",
    ],
)

h2("Done when")
checklist([
    "Guest cancelling 48 hours or more ahead receives a full refund, visible in the HitPay sandbox.",
    "Guest cancelling inside 48 hours receives exactly 50 per cent.",
    "Host cancelling refunds every guest in full and records one strike.",
    "The third strike deactivates that host's listings.",
    "No cancellation write happens from the browser.",
    "The booking-confirmation block is gone from release-payout, and cron invokes it.",
    "A failed refund produces a visible needs-attention state rather than silence.",
])

h2("Watch out for")
bullet([("Trusting any amount from the client, in either direction. Recompute server-side, always.", False)])
bullet([("Partial failure. Refund succeeded but the database write failed, or the reverse, is the worst outcome. Write the refund identifier immediately and reconcile on a retry.", False)])

# ================================================================ WEEK 10
week_header(
    10,
    "5–11 October",
    "Email, terms, and the address reveal",
    "Make email actually reach users, close the open-relay risk that arrives with it, record terms "
    "acceptance, and reveal the full address only to guests who have paid.",
)

h2("Steps")

step(
    1,
    "Start with DNS, because it is the only step with a waiting period. Add trykai.sg in Resend, "
    "then add the records it gives you at Vodien: SPF, DKIM, and a DMARC record while you are "
    "there. Verification can take hours.",
)

step(
    2,
    "Add the shared-secret check to the webhook-triggered functions in the same change as the "
    "sender switch. Verifying the domain without this turns an ignorable endpoint into a relay that "
    "sends attacker-controlled content from your authenticated domain.",
    [
        "const secret = req.headers.get('x-trykai-webhook-secret')",
        "if (secret !== Deno.env.get('WEBHOOK_SHARED_SECRET')) {",
        "  return new Response('unauthorized', { status: 401 })",
        "}",
    ],
    [
        "Add the matching header in the Supabase dashboard under Database Webhooks for both "
        "notify-verification-pending and notify-verification-result.",
    ],
)

step(
    3,
    "Change the sender in all functions, and escape user-supplied values that go into the HTML. "
    "record.full_name and the listing title are currently interpolated raw.",
    [
        "from: 'TryKai <hello@trykai.sg>'",
        "",
        "const esc = (s = '') => String(s).replace(/[&<>\"']/g,",
        "  (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]))",
    ],
)

step(
    4,
    "Record terms acceptance. Migration first, then the two touchpoints: a checkbox at signup, and "
    "a blocking gate before a first listing is created. Link to the policy pages that already exist "
    "in src/pages/.",
    [
        "alter table users add column terms_accepted_at timestamptz;",
        "alter table users add column terms_version text;",
    ],
    [
        "Store the version, not just the timestamp. When the terms change you need to know who "
        "accepted which text.",
    ],
)

step(
    5,
    "Implement the address reveal as a database function rather than a policy, since the condition "
    "depends on another table.",
    [
        "create or replace function public.get_session_address(p_session_id uuid)",
        "returns text language sql security definer as $$",
        "  select l.full_address",
        "    from sessions s",
        "    join listings l on l.id = s.listing_id",
        "   where s.id = p_session_id",
        "     and exists (",
        "       select 1 from bookings b",
        "        where b.session_id = s.id",
        "          and b.guest_id = auth.uid()",
        "          and b.status = 'confirmed')",
        "$$;",
    ],
    [
        "Then surface it in the Dashboard booking card, and explicitly test the negative case: a "
        "pending or cancelled booking must return nothing.",
    ],
)

step(
    6,
    "Narrow CORS from the wildcard to your own origins across all functions.",
    [
        "const allowed = ['https://trykai.sg', 'https://www.trykai.sg']",
        "// plus a regex for Vercel preview URLs during development",
    ],
)

h2("Done when")
checklist([
    "A verification email arrives in an inbox that is not Caleb's, passing SPF and DKIM.",
    "Posting to notify-verification-result without the secret header returns 401.",
    "A name containing < or > renders as text in the email, not as markup.",
    "Signup records terms_accepted_at and terms_version.",
    "A confirmed guest sees the address; a pending or cancelled one does not.",
    "A request from an unlisted origin is rejected.",
])

h2("Watch out for")
bullet([("Doing step 1 last. DNS propagation is the only thing here you cannot hurry, so start it in the first ten minutes of the session.", False)])
bullet([("Shipping the domain verification without the secret check. That specific ordering is the one that creates a live phishing vector.", False)])

# ================================================================ WEEK 11
week_header(
    11,
    "12–18 October",
    "Observability and hardening",
    "Make failures visible, add the cheapest useful safety nets, and re-run the security checklist "
    "now that the payment layer is finished.",
)

h2("Steps")

step(
    1,
    "Add Sentry, production only, so local and preview noise stays out of it.",
    [
        "npm i @sentry/react",
        "",
        "// src/main.jsx",
        "if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {",
        "  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN,",
        "               tracesSampleRate: 0.1 })",
        "}",
    ],
    [
        "Set VITE_SENTRY_DSN in the Vercel Production scope only, then deliberately throw once and "
        "confirm the event arrives.",
    ],
)

step(
    2,
    "Add one Playwright smoke test covering the path that must never break: sign up, browse, open a "
    "listing, begin a booking. Run it against staging.",
    [
        "npm i -D @playwright/test",
        "npx playwright install chromium",
        '# scripts: "test:e2e": "playwright test"',
    ],
    [
        "Add it to CI as non-blocking at first. A flaky test that blocks merges gets disabled and "
        "then ignored.",
    ],
)

step(
    3,
    "Add the two routing gaps: a catch-all 404 (an unknown URL currently renders a blank page under "
    "the navbar) and a ProtectedRoute wrapper replacing the per-page session checks.",
    [
        "<Route path=\"*\" element={<NotFound />} />",
    ],
)

step(
    4,
    "Do the backup restore drill once, and write it down. An untested backup is a belief, not a "
    "capability.",
    notes=[
        "Confirm the backup schedule and retention in the Supabase dashboard.",
        "Restore into a scratch project, then compare row counts per table against production.",
        "Write the exact steps into docs/runbook.md, including how long it took.",
    ],
)

step(
    5,
    "Re-run docs/rls-checklist.md in full against staging. The schema has changed materially since "
    "week 3: new columns, new functions, new policies. Then run the automated checks.",
    [
        "npm audit --omit=dev",
        "docker run -t ghcr.io/zaproxy/zaproxy zap-baseline.py -t https://<staging-url>",
    ],
)

step(
    6,
    "Add security headers in vercel.json, alongside the existing rewrite.",
    [
        '"headers": [{ "source": "/(.*)", "headers": [',
        '  { "key": "X-Content-Type-Options", "value": "nosniff" },',
        '  { "key": "X-Frame-Options", "value": "DENY" },',
        '  { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },',
        '  { "key": "Strict-Transport-Security",',
        '    "value": "max-age=31536000; includeSubDomains" }',
        "]}]",
    ],
    [
        "Add a Content-Security-Policy in report-only mode first. A strict CSP written blind will "
        "break Supabase and Sentry calls, and you will not want to debug that in launch week.",
    ],
)

step(
    7,
    "Implement verification-document retention, which is the PDPA exposure rather than an OWASP "
    "one. Delete NRIC and selfie files once a host is approved, and write the retention period "
    "into DECISIONS.md.",
)

h2("Done when")
checklist([
    "A deliberate error appears in Sentry from production, and not from local.",
    "The smoke test passes against staging and runs in CI.",
    "An unknown URL shows a real 404 page.",
    "The restore drill is done and documented in docs/runbook.md.",
    "Every abuse case passes on the current schema.",
    "npm audit is clean for production dependencies, and the headers are live.",
    "Verification documents are deleted after approval, with the period written down.",
])

h2("Watch out for")
bullet([("Writing a strict CSP first. Start report-only, read the reports, then enforce.", False)])
bullet([("Treating the week 3 checklist results as still valid. Five weeks of schema changes have happened since.", False)])

# ================================================================ WEEK 12
week_header(
    12,
    "19–25 October",
    "QA, cutover, and a deliberately small launch",
    "Walk every user scenario on staging, move production over, prove one real payment end to end, "
    "and only then invite hosts.",
)

h2("Steps")

step(
    1,
    "Walk all of Markdowns/USER_SCENARIOS.md on staging with two real accounts and sandbox "
    "payments. Treat it as the QA script it was written to be. Log every defect; fix only the ones "
    "that block launch, and add the rest to P1.",
)

step(
    2,
    "Run the production cutover in this order. Each item is a place where a mistake is expensive.",
)

table(
    ["Order", "Action", "Verify by"],
    [
        [1, "Apply all migrations to production (npx supabase db push)", "Schema matches staging"],
        [2, "Set production function secrets, including live HitPay key and salt", "npx supabase secrets list"],
        [3, "Deploy all functions to production", "Each returns a healthy response"],
        [4, "Switch the HitPay base URL to api.hit-pay.com and set the live webhook URL", "A test payment reaches the live endpoint"],
        [5, "Point trykai.sg at Vercel, and add the domain in Vercel", "https://trykai.sg serves the app"],
        [6, "Set Supabase Auth site_url and redirect URLs to https://trykai.sg", "Password reset email links land correctly"],
        [7, "Enable email confirmations in production auth settings", "A new signup receives and completes confirmation"],
        [8, "Confirm the Resend domain is verified and the sender is hello@trykai.sg", "Email lands in a third-party inbox"],
        [9, "Set VITE_SENTRY_DSN in Production and redeploy", "A test error appears in Sentry"],
    ],
    widths=[0.55, 3.5, 2.5],
)

step(
    3,
    "Do one real paid booking with your own money, then refund it. This is the only test that "
    "proves the whole chain, because sandbox cannot prove settlement.",
    notes=[
        "Create a cheap real listing and session, book it as a second account, pay by PayNow.",
        "Confirm: webhook fires, booking confirmed, spots decremented, both emails delivered.",
        "Check the HitPay dashboard shows the payment and the correct fee split.",
        "Cancel it and confirm the refund appears, then confirm the bank movement the next day.",
    ],
)

step(
    4,
    "Only now invite hosts. Fifteen to twenty listings across two or three categories, from warm "
    "contacts, per the month-one target in STRATEGY.md. Put each host through the real verification "
    "flow rather than approving them out of band, since that also tests the flow and the emails.",
)

step(
    5,
    "Set up the weekly review that keeps this maintained after launch: thirty minutes covering new "
    "bookings, Sentry errors, failed webhook deliveries, and any needs-attention refunds.",
)

h2("Done when")
checklist([
    "Every USER_SCENARIOS.md scenario has been walked on staging, with defects triaged.",
    "trykai.sg serves production over HTTPS.",
    "One real booking has been paid, confirmed, emailed, refunded, and reconciled against the bank.",
    "Email confirmations are on, and a real signup completed the flow.",
    "Sentry is receiving production events.",
    "First hosts are onboarded through the real verification flow.",
    "The weekly review is in the calendar.",
])

h2("Watch out for")
bullet([("Enabling email confirmations for the first time in production. Test that flow on staging first; it changes the signup path and can lock out new users.", False)])
bullet([("Leaving sandbox keys in production, or live keys in staging. Check both directions explicitly.", False)])
bullet([("Launching wide. The goal for month one is proving that a stranger pays, attends and reviews, which needs a handful of bookings, not traffic.", False)])

# ================================================================ appendices
doc.add_page_break()
h1("Appendix A — Environment variable reference")

table(
    ["Variable", "Where it lives", "Added in", "Purpose"],
    [
        ["VITE_SUPABASE_URL", "Vercel, .env", "exists", "Supabase project endpoint"],
        ["VITE_SUPABASE_ANON_KEY", "Vercel, .env", "exists", "Public client key; safe in the bundle"],
        ["VITE_SENTRY_DSN", "Vercel production only", "week 11", "Error reporting"],
        ["SUPABASE_URL", "Function secrets", "exists", "Server-side client"],
        ["SUPABASE_ANON_KEY", "Function secrets", "exists", "Acting as the calling user"],
        ["SUPABASE_SERVICE_ROLE_KEY", "Function secrets", "exists", "Privileged writes; never in the frontend"],
        ["RESEND_API_KEY", "Function secrets", "exists", "Transactional email"],
        ["HITPAY_API_KEY", "Function secrets", "week 6", "Creating payment requests and refunds"],
        ["HITPAY_WEBHOOK_SALT", "Function secrets", "week 7", "Verifying webhook signatures"],
        ["WEBHOOK_SHARED_SECRET", "Function secrets", "week 10", "Authenticating database webhooks"],
    ],
    widths=[1.85, 1.55, 0.7, 2.6],
)

h1("Appendix B — Command reference")

code([
    "# Local development",
    "npm install                       npm run dev",
    "npm run lint                      npm run build",
    "npm test                          npm run test:e2e",
    "",
    "# Supabase",
    "npx supabase login",
    "npx supabase link --project-ref <ref>",
    "npx supabase db pull                    # remote schema -> migration",
    "npx supabase db push                    # migrations -> remote",
    "npx supabase db reset                   # local rebuild from migrations + seed",
    "npx supabase functions deploy [name]",
    "npx supabase secrets set KEY=value",
    "npx supabase secrets list",
    "",
    "# Documents",
    "python scripts/generate_launch_plan.py",
    "python scripts/generate_implementation_plan.py",
])

h1("Appendix C — The minimum slice, if a week collapses")

para(
    "Some weeks will get four hours instead of eight. These are the parts that cannot be deferred "
    "without breaking the following week."
)

table(
    ["Week", "Cannot be deferred", "Can slip"],
    [
        ["1", "The HitPay request, and .env.example", "README rewrite, history audit, deleting the dead checkout"],
        ["2", "db pull and confirming RLS is enabled", "Storage bucket migration, checklist wording"],
        ["3", "Staging created from migrations", "Some abuse cases, if recorded as outstanding"],
        ["4", "Environment separation in Vercel", "Seed breadth"],
        ["5", "calculateFees plus the floor and PayNow tests", "Checkout UI polish"],
        ["6", "Payment request with correct units", "The /booking/return experience"],
        ["7", "Signature verification and idempotency", "Email wording"],
        ["8", "confirm_booking plus the check constraints", "The concurrency test harness"],
        ["9", "Cancellation moved server-side; the release-payout deletion", "Payout reconciliation"],
        ["10", "DNS, and the shared secret shipped together", "Terms UI polish"],
        ["11", "Sentry, and re-running the checklist", "Playwright, ZAP, CSP"],
        ["12", "Cutover table, and one real paid booking", "Host onboarding pace"],
    ],
    widths=[0.5, 3.3, 2.4],
)

closing = doc.add_paragraph()
run = closing.add_run(
    "Line numbers and file paths reflect the repository as of 7 August 2026 and will drift as the "
    "work proceeds. Where this document and the code disagree, the code is right; update the "
    "generator in scripts/ rather than editing the Word file, so the two do not diverge."
)
run.italic = True
run.font.size = Pt(9)
run.font.color.rgb = GREY

doc.save(OUT)
print("Saved:", OUT)
