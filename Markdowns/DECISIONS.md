# TryKai — Decisions & KIV

## What is TryKai
A peer-to-peer skill and experience marketplace for Singapore.
Ethos: "Anyone can teach, everyone can learn."
Target: Local Singaporeans who find Singapore expensive and "boring" — not tourists.

---

## Product decisions (decided)

### Dual supply model
Two types of hosts on the same platform:
- **Peer hosts** — everyday people monetising a hobby or casual skill
- **Small businesses** — operators too small for Klook (pottery studios, dance schools, private cooking classes)

Peer hosts give the platform authenticity and low price points.
Businesses give credibility and volume.
Both coexist on the same browse page.

### Differentiation from competitors
| | TryKai | Airbnb Experiences | Klook |
|---|---|---|---|
| Target user | Local Singaporeans | Tourists | Tourists |
| Host type | Everyday people | Semi-professional | Licensed operators |
| Barrier to list | Low | High (vetted, approved) | High |
| Price point | $10–40 | $50–150+ | $30–100+ |
| Vibe | Casual, peer-to-peer | Curated | Professional |

### Target audience
- **Primary:** 18–28, university students and young working adults
- **Secondary:** 28–35, young professionals with higher disposable income
- **Minimum age:** 18 — enforced in T&C. Minors create legal complications around contracts and meeting strangers.
- **Host demographic:** realistically 20–35

### Unified accounts (decided)
One account type that can be both host and guest — no separate logins.
- is_host flag on users table handles role distinction
- Guest by default; becomes host when first listing is created
- Dashboard shows both listings (host view) and bookings (guest view)
- Hosts get a visible "Host" badge on their profile

### Date Mode (decided — to build)
An optional add-on layer hosts can enable on Lane 1 listings (one-off or short novelty sessions only — not applicable to Lane 2 multi-session courses).

**Host side:**
- Toggle "Date Mode" on a listing from their dashboard
- Specify: what's different (e.g. "Private session for two, I'll set the mood with music and lighting"), what's included (e.g. something to take home, a printed photo), and a price premium they set themselves
- Date Mode is a separate offering from the base listing — not a replacement

**Guest side:**
- Filter on browse page: "Perfect for dates"
- Badge on listing cards for Date Mode-enabled listings
- At checkout: optional checkbox "This is a date / special occasion" + free-text note to host
- Price shown reflects the host's premium transparently

**Why this works:**
- Taps a recurring trigger — dates, anniversaries, Valentine's Day, "we need to do something different" — that refuels itself. Not a one-time purchase.
- Natural upsell for hosts at near-zero extra cost to them
- Permanently differentiates TryKai from any tuition or experience platform
- Applies to Lane 1 only — keep entirely separate from Lane 2's multi-session skill-building identity

**Build priority:** Post-MVP, before Lane 2 launch. Spec properly before building.

---

### Identity & Social Layer (decided direction — to build post-MVP)
The guest profile is not just an account page — it's a public "skills and experiences" artefact that accumulates over time and is worth building, worth showing off, and worth sharing.

**Core mechanic:**
- Every completed session adds to a visible log on the guest's public profile: "Tried latte art · Completed 3 Japanese sessions · Went axe throwing"
- Lane 2 progress shown explicitly: "Japanese — 4 sessions completed" with a subtle progress indicator toward a stated goal
- Profile is public and linkable

**Trophies and tokens:**
- Named, specific achievements — not generic badges. Examples:
  - "First Timer" — completed first booking
  - "Explorer" — tried 5 different categories
  - "Night Owl" — booked an evening session
  - "Date Night Pro" — completed 3 Date Mode sessions
  - "Regulars Club" — booked the same host 3+ times
  - "Polyglot in Progress" — 3+ language sessions completed
  - "Still Going" — active streak of 4+ consecutive weeks
- Trophies are visible to anyone viewing the profile — social, not private

**Streak mechanic:**
- Session streak visible on profile and dashboard
- "You've booked something new 3 months in a row"
- Designed to make stopping feel like breaking something real

**Shareable profile card:**
- One-tap generated card: name, top skills, session count, recent trophy, TryKai branding
- Designed to look good as an Instagram Story or WhatsApp share — not a raw screenshot
- Primary organic acquisition mechanic: every share is a warm referral to the exact target demographic

**Milestone emails:**
- Triggered at 1st, 3rd, 5th completed booking
- Framed as identity reinforcement: "You're someone who tries new things. Most people just talk about it."
- End with curated "what's next?" suggestions — not a generic CTA

**Lane 1 vs Lane 2 social currency — important distinction:**
- Lane 1 achievements signal *taste and lifestyle* ("look at my interesting life") — closer to how people share restaurant or travel experiences. The shareable card and Explorer-type trophies serve this.
- Lane 2 achievements signal *struggle and discipline* ("look at what I built") — this is where the Strava comparison holds properly. Streaks, session counts, stated goals met. Stronger social currency because the audience knows it cost something.
- Do not flatten both lanes into the same achievement framing. Lane 2 profiles with real progress are the platform's most powerful social objects — a profile 8 sessions deep into guitar with a streak and a stated goal is genuinely worth sharing.

**Social comparison — lightweight, no full social graph yet:**
- Show aggregated area/category activity: "12 people in Tampines completed sessions this month"
- Social proof without requiring a following system or moderation overhead
- Full social graph (following, activity feed) is KIV — needs user density to feel alive, and creates moderation surface. Revisit at 500+ active users.

**Sequencing:**
- Profile artefact and shareable card: can launch early, work even with few users
- Trophies and streak: launch with MVP social layer
- Social comparison and leaderboards: only after sufficient user density — empty leaderboards demotivate

### Location handling
- Show only general area publicly (e.g. "Tampines", "Tiong Bahru")
- Full address only revealed after confirmed booking
- Never expose full_address in public browse/search queries
- Rationale: protects host privacy, mirrors Airbnb approach

### Trust layer
Reviews are the core trust mechanism — not vetting.
- Reviews only allowed after confirmed booking
- Both sides review each other (host reviews guest, guest reviews host)
- Profile photo required to host — non-negotiable
- Phone OTP verification on signup
- Trust badges shown on listings: "Phone verified", "ID verified", review count

### Host identity verification (decided)
Manual ID selfie match for MVP:
- Host uploads NRIC/passport photo + live selfie
- Stored in private Supabase storage bucket (not public)
- You manually review and approve in Supabase dashboard
- verification_status: unverified → pending → approved → rejected
- Only approved hosts can create active listings
- Automate with Stripe Identity / Veriff at scale

### Progressive disclosure for signup (decided)
Ask for information at the moment it's relevant — not all upfront.
- **Browsing:** email only
- **Booking:** phone OTP verification required
- **Creating a listing:** ID selfie verification required
- Do NOT ask for date of birth, address, or unnecessary fields at signup
- Rationale: minimises friction while maintaining safety where it matters

### Pricing display
- Prices stored in cents (integers) in database — never floats
- Display in dollars to users
- e.g. $20 = stored as 2000

### Listing media
- Photos: up to 5 per listing (already built)
- Videos: KIV — too complex for MVP
- Interim: hosts can add an Instagram or TikTok link to their profile for social proof
- No engineering effort required for interim solution

### Host booking notifications (decided)
Three layers in order of priority:
1. **Email** — build now. Trigger on booking confirmation via Supabase Edge Function
2. **In-app notification badge** — build post-MVP
3. **WhatsApp/SMS via Twilio** — KIV, add at traction

Email content: host name, guest name, listing title, session date and time.

### Browse optimisation (decided)
Build now:
- Category filter pills: All / Food / Fitness / Arts / Music / Language / Other
- Area filter dropdown
- Sort: Newest / Price low-high / Most reviewed

Build at Stage 2:
- "This weekend" filter — sessions in next 7 days
- Price range slider

Build at Stage 3:
- Personalisation based on booking history

### Listing performance nudges for hosts (KIV)
Show in dashboard once 50+ listings exist:
- View count and conversion rate per listing
- Nudges: "47 views, 0 bookings — consider lowering price or adding photos"
- "Listings with photos get 3x more bookings"
- "Add a new session date to stay visible"
Modelled on Carousell seller advice feature.

---

## Payment model (decided)

### Provider: HitPay (switching from Stripe)
Reason: Stripe fees are too high for low-value local transactions.

Fee comparison on $20 booking:
| Method | Fee | Cost |
|---|---|---|
| Stripe card | 3.4% + $0.50 | $1.18 |
| HitPay card | 2.8% + $0.50 | $1.06 |
| HitPay PayNow | 0.4% + $0.10 | $0.18 |
| HitPay GrabPay | 2.2% | $0.44 |

HitPay is MAS-licensed, no monthly fee, no setup fee, next business day SGD settlement.

### Fee structure
- **Peer hosts:** 10% guest fee + 10% host fee = 20% total platform take
- **Small businesses:** 10% guest fee only = 10% total take
- **PayNow discount:** 2% off guest fee to nudge toward cheaper processing
- **Minimum booking fee:** $2 floor (max of 10% or $2) — protects margins on ultra-cheap listings
- **New peer host incentive:** Host fee waived on first 3 bookings

### PayNow discount mechanic (Shopee-style)
At checkout, guest sees two options:
- Pay by card — e.g. $22.00 (10% booking fee)
- Pay by PayNow — e.g. $21.20 (8% booking fee, save $0.80)

Rationale: Processing cost drops from ~$1.06 to ~$0.18 on PayNow. Pass most of that saving to guest, keep slightly better margin. Nudges volume toward cheapest processing method.

### Payout timing
- Funds held in escrow until 24hrs after session starts_at
- Host receives 90% of listing price (peer) or 100% (business) after release
- Handled via HitPay marketplace split payment API

### Revenue projection reference
At 5,000 bookings/month at avg $25/session:
- Booking fees ~$75,000/month after processing fees
- Pro host subscriptions (Stage 3) ~$5,800 MRR additional
- Total addressable: real business at scale

---

## Monetisation roadmap (staged)

### Stage 1 — Now to 500 bookings
- Guest-facing booking fee only (10%, min $2)
- PayNow discount mechanic
- Host fee waived to recruit supply
- Goal: prove model works, build supply

### Stage 2 — 500 to 2,000 bookings
- Introduce host fee (10% for peer hosts)
- Credit bundles for guests — "5 sessions upfront, save 15%"
- Multi-session courses with per-session escrow release
- Group discounts (2-3 pax: 5% off, 4+ pax: 10% off)
- Targets repeat guests who already trust the platform
- Float on prepaid credits is meaningful at scale

### Stage 3 — 2,000+ bookings
- Freemium host listing tiers
  - Free: 1 listing, standard placement
  - Pro ($29/month): unlimited listings, featured placement, verified badge, profile analytics, priority support
- By this stage best hosts earn $300–800/month on TryKai — $29 is trivial for them
- Most predictable recurring revenue stream

---

## Multi-session courses (KIV — Stage 2)
Listing type: "Course" alongside single sessions.
- Host defines: number of sessions, total price, schedule
- Guest pays full course upfront — held in escrow
- Payout releases per session completed, not all at once
- Host cancels mid-course: remaining sessions refunded pro-rata
- This escrow-per-session mechanic keeps TryKai in the loop and prevents off-platform leakage

Discount structure:
- 3-session course: 5% off
- 5-session course: 10% off
- 10+ session course: 15% off

Do not build for MVP. Add when hosts start requesting it.

---

## Cancellation policy (decided, published, build in progress)

Superseded the original 2-tier structure below with a 4-tier structure once the public Cancellation Policy page was finalized on 29 July 2026. Full published version lives at /cancellation-policy — this section is the internal summary.

| Scenario | Resolution |
|---|---|
| Guest cancels 48hrs+ before | Full refund, including platform fee |
| Guest cancels 24 to 48hrs before | 50% of lesson fee refunded, platform fee forfeited |
| Guest cancels 6 to 24hrs before | 25% of lesson fee refunded, platform fee forfeited |
| Guest cancels under 6hrs before, or no-show | No refund |
| Host cancels any time | Full guest refund including platform fee, host gets 1 strike |
| Host no-show | Full guest refund including platform fee, guest may receive discretionary compensation (case by case, manual, no fixed formula — to avoid incentivising fake host/guest collusion), host gets 2 strikes immediately and account is reviewed/may be suspended |
| 3 host strikes | Listing auto-deactivated |

**Reschedule option:** guest can reschedule to a different session with the same host instead of cancelling, once per booking, same 48hr+ cutoff as a full-refund cancellation. Not yet built.

**Host appeals:** a host can appeal a strike within 7 days of the cancellation if it was caused by something genuinely outside their control. Reviewed manually. If successful, strike is removed. Appeal never affects the guest's refund. Not yet built.

**Payout collision:** if a dispute is confirmed after a host's payout has already released (e.g. a safety report surfacing after the 24hr auto-release window), TryKai absorbs the refund cost temporarily and works to claw it back from the host's future payouts. This depends on `release-payout` actually being wired to HitPay, which is not done yet — flagged as a hard dependency.

**Safety reports:** no time limit, ever. Credible safety reports can trigger immediate account suspension, independent of the 3-strike system, and severe violations can result in permanent removal without needing to accumulate 3 strikes first. Not yet built — no suspension mechanism independent of the strike counter exists in the current codebase.

Must be shown clearly to both sides during booking and listing creation.
Build into the booking flow before real money is involved.

---

## Host T&C (draft before launch)

Key clauses to include:

**Liability**
- Hosts are independent individuals, not TryKai employees
- TryKai is a platform, not a service provider
- Hosts solely responsible for safety of their sessions
- Hosts must ensure space is safe and compliant with regulations

**Conduct**
- No false representation of skills or qualifications
- Sessions must match listing descriptions
- Hosts may not contact guests outside the platform for commercial purposes (anti-leakage)
- No discrimination based on race, religion, gender, nationality

**Payments**
- TryKai's platform fee is non-negotiable and non-refundable
- Payouts subject to 24hr escrow post-session
- TryKai reserves right to withhold payout pending dispute resolution

**Cancellations**
- Cancellation policy as defined above
- Three strikes = listing deactivated
- TryKai reserves right to remove listings or suspend accounts at its discretion

**Content**
- Host responsible for accuracy of listing content
- TryKai reserves right to remove listings that violate guidelines
- Photos and descriptions must represent the actual experience

**Indemnity**
- Host indemnifies TryKai against claims arising from their sessions
- TryKai's liability capped at platform fee collected for that booking

**Tax**
- Income earned through TryKai may be subject to income tax
- Hosts should consult IRAS guidelines

Action: get a law student or LegalWise to review before launch.

---

## Edge cases to build (priority order)

### 1. Cancellation policy — build before launch
See above. Defining it after a dispute is the worst time.

### 2. Minimum $2 booking fee floor
Use max(10%, $2) for all bookings.
Protects margins on ultra-cheap listings without affecting mid/high value ones.

### 3. Auto-deactivate stale listings
- Listings with no new session added in 60 days → auto-deactivate
- Send host email warning 7 days before: "Your listing will be hidden unless you add a new session"
- Keeps catalogue fresh, re-engages dormant hosts
- Implement as a scheduled Supabase Edge Function

### 4. Strike system for hosts
- 3 cancellations → listing auto-deactivated
- Track strikes on users table: host_strikes integer default 0
- Notify host on each strike

### 5. Off-platform leakage defence
Risk: guests and hosts bypass TryKai after first meeting to avoid fees.
Defences:
- Reviews only exist on TryKai (host loses reputation asset off-platform)
- Payment protection only exists on TryKai (guest loses dispute coverage)
- Anti-leakage clause in host T&C
- Eventually: loyalty credits that accumulate on-platform

### 6. Tax disclosure
Add to host onboarding: "Income earned through TryKai may be subject to income tax. Please consult IRAS guidelines."
Not your legal responsibility but protects the platform from association with undeclared income stories.

---

## KIV — revisit at traction

### Search bar
Add when: 100+ active listings
Rationale: unnecessary before that — category filters cover discoverability at small scale

### Credits bundle (Classpass-style)
Add when: 500+ bookings, clear repeat guest behaviour
Structure: 5 sessions upfront at 15% discount
Benefit: rewards loyalty, creates float on prepaid credits

### Multi-session courses
Add when: 500+ bookings, hosts requesting it
See multi-session courses section above

### Group discounts
Add when: Stage 2
Structure: 2-3 pax 5% off, 4+ pax 10% off, calculated automatically at checkout

### "This weekend" filter
Add when: 50+ active listings with upcoming sessions
High value for core "nothing to do" use case

### Host listing performance nudges
Add when: 50+ active listings
Modelled on Carousell seller advice

### In-app notifications
Add when: post-MVP
Simple unread badge on dashboard

### WhatsApp/SMS notifications via Twilio
Add when: traction, hosts missing email notifications
Higher reliability than email for Singapore users

### Listing video previews
Add when: hosts requesting it, post-MVP
Max 30 seconds, autoplay muted on listing card
Interim: Instagram/TikTok profile link

### Host Pro subscription tier
Add when: 2,000+ bookings, hosts clearly earning on platform
Price: $29/month
Includes: unlimited listings, featured placement, verified badge, analytics

### SingPass / MyInfo verification
Add when: ACRA-registered entity, production app with track record
Requires: GovTech application, formal onboarding process
Not viable as a university student pre-incorporation

### Automated ID verification
Services: Stripe Identity, Jumio, Veriff
Cost: ~$1–2 USD per verification
Add when: manual review becomes operationally painful (50+ new hosts/month)

### Data monetisation
You will accumulate valuable data — skills demand, price points, areas, times.
Potential buyers: corporates (employee engagement), CCCs, government agencies, investors.
Action now: store everything. Don't just store what you need — store what might be valuable later.

### Regional expansion
HitPay supports Singapore, Malaysia, Philippines.
Stripe better for broader multi-country expansion.
Revisit payment provider choice if expanding beyond SG.

### Native iOS/Android app
Build when: clear retention data showing users return regularly and push notifications would meaningfully improve that.
Not before: web app with good mobile UX is sufficient for MVP and early growth.

---

## Tech stack (decided)

| Layer | Choice | Reason |
|---|---|---|
| Frontend | React + Vite | Familiar, fast, well supported by Cursor |
| Database + Auth | Supabase | Handles backend, auth, storage, RLS out of the box |
| Payments | HitPay | Singapore-optimised, low PayNow fees, MAS-licensed |
| Hosting | Vercel | Free tier, auto-deploys on push, instant |
| AI coding | Cursor | Implementation; Claude handles architecture |

---

## Build approach

- Claude = architect (schema, decisions, corrections, strategy)
- Cursor = builder (implementation, code)
- You = product owner (testing, feedback, direction)

Always start Cursor prompts with: "Read CONTEXT.md and DECISIONS.md first, then..."

---

## What done looks like (MVP)

1. ✅ User can sign up and log in
2. ✅ Host can create a listing with photos
3. ✅ Host can add sessions with dates and spots
4. ✅ Guest can browse and view listing detail
5. ✅ Guest can book and pay for a session
6. ✅ Both sides can leave a review after session
7. ✅ Host can edit their listing
8. ✅ Host identity verification (ID + selfie), with email notifications for submission, approval, rejection
9. ✅ Category + area filters on Home page
10. ✅ Host booking email notifications (via Resend)
11. 🔄 Cancellation policy — in progress (schema + UI being built, refund API deferred to HitPay integration)
12. 🔄 HitPay integration — blocked on Corppass sync (business registered, awaiting UEN sync)
13. ⬜ Host T&C drafted and reviewed
14. ⬜ Deploy to Vercel + point trykai.sg at it

Everything else is v2.

---

## Business & legal entity (decided)

### TryKai registered as Sole Proprietorship
- Entity name: TRYKAI
- Type: Sole Proprietorship / Partnership (Individual)
- UEN obtained via BizFile+ (ACRA)
- SSIC code: 63209 — "Online marketplaces operating on a fee or commission basis for other services provided by third-party"
- Registration period: 1 year ($100)
- Registered address: home address (Home Office Scheme)
- Owner: Ong Kai Le Caleb (sole proprietor)

### Domain
- trykai.sg registered for 2 years via Vodien (~$75.98)
- SGNIC identity verification completed
- Not yet pointed at Vercel deployment — pending deploy step

### Costs incurred so far
| Item | Cost |
|---|---|
| Domain (trykai.sg, 2 years) | $75.98 |
| Business name reservation | $15 |
| Business registration (1 year) | $100 |
| **Total** | **~$190.98** |

### Why we registered now
HitPay's marketplace/split payment verification requires Corppass, which requires a UEN. SingPass/MyInfo personal verification also requires a registered business entity to access via Corppass. Sole proprietorship was the fastest unblock ($100, ~15 min) vs Pte Ltd ($300+, more compliance overhead).

---

## KIV — Legal structure & liability (flagged, to discuss later)

**Important: revisit before scaling.** As a sole proprietorship, there is NO legal separation between Caleb and the business — all liabilities are personal. Given TryKai involves real money, real strangers meeting in person, and potential disputes, this is a meaningful exposure.

Things to think through when revisiting:
- At what point/traction level does converting to a Pte Ltd make sense?
- How to structure the conversion to minimise personal liability exposure retroactively (i.e. for activity that happened under the sole prop)
- Pte Ltd is also required if/when issuing equity to co-founders (Aakash, Airica) — sole proprietorship cannot issue shares
- Get proper legal advice before this conversion — don't DIY it like the sole prop registration
- **Public liability insurance — researched 29 July 2026, still undecided.** Not legally required in Singapore for a business like TryKai (unlike Work Injury Compensation, which only applies if you have employees). Typical cost for a small, low-physical-footprint business: roughly S$300 to S$500+/year for baseline coverage, scaling with claims history and coverage limits. Given TryKai's real-world, in-person, sometimes physical-activity sessions, and the founders' explicit concern about a safety incident damaging trust in the platform, worth getting an actual quote soon, not treating as a someday-KIV. A quote costs nothing and turns this from a vague worry into a known, budgetable number. Note: this protects against TryKai being sued despite the "marketplace not provider" T&C framing, which doesn't reliably stop a lawsuit from being filed even if it eventually succeeds on that defence.

This connects directly to the equity conversations — the structure decision and the cap table decision should probably happen together.

---

## Legal documents drafted

### Terms of Service & Privacy Policy — full draft created
Combined document covering: Platform Terms of Use, Host Terms, Guest Booking Terms, Privacy Policy.
File: TryKai_Terms_Privacy_DRAFT.docx — DRAFT status, requires lawyer review before going live.

### Acceptance flow (decided)
Layered acceptance, not a single blanket checkbox:
- **Signup** — Platform Terms of Use + Privacy Policy (general conduct, age 18+ gate)
- **Create Listing** — Host Terms specifically (liability, fees, payouts, indemnity)
- **Checkout/booking** — Guest Booking Terms acknowledgment (cancellation policy, conduct)
- **Verification flow** — Privacy Policy linked specifically re: NRIC/selfie handling
Rationale: each acknowledgment ties to the specific risky action being taken, which is both better UX (no wall-of-text at signup) and more legally defensible than one upfront blanket agreement.

### Key legal risks identified and addressed in the draft
1. **Age verification gap** — T&C states 18+ requirement, but TryKai has no independent verification (e.g. SingPass MyInfo DOB check), only self-declaration. Flagged as known residual risk, not fully solved. Revisit if this becomes a real incident, or before any major scale-up.
2. **PDPA — Data Protection Officer requirement** — appointing a DPO is mandatory under PDPA, but registering the appointment with PDPC is NOT a hard legal requirement (only "strongly encouraged" for orgs below $10M turnover, which TryKai is). What IS a hard requirement under Section 11(5): the DPO's contact details must be made publicly available (in the Privacy Policy / on the site). Decided: Caleb is DPO, using personal email (calebong2002@gmail.com) for now. Non-compliance penalty for actual breaches (separate from DPO appointment itself): fines up to $1M or 10% of annual turnover.

**Note (29 July 2026):** decided against a domain-hosted Google Workspace setup (`@trykai.sg` mailboxes) for cost reasons pre-revenue — see "Email & contact infrastructure" below. The general business contact is now `trykaisg@gmail.com`, a single shared Gmail account. Whether the DPO contact should also move to this shared address, versus staying on Caleb's personal email, is still an open decision — flagged, not yet resolved.
3. **NRIC/selfie data handling** — already stored in private Supabase bucket (good practice). Retention periods now decided (see below).
4. **Liability cap clause** — drafted as cap-to-platform-fee (standard marketplace approach), but flagged for extra lawyer scrutiny because TryKai's sessions are physical/in-person (cooking, fitness, sharp tools) which carries materially higher injury risk than a typical digital marketplace. Could be challenged under Unfair Contract Terms Act if found unreasonable, especially re: personal injury.
5. **Off-platform leakage clause** — included as deterrent/basis for account suspension, acknowledged as difficult to enforce in practice (consistent with earlier off-platform leakage defence discussion).

### Data retention periods (decided)
- **Rejected/unused verification documents** (NRIC photo + selfie) — deleted after 30 days. Long enough to handle appeals/resubmission confusion, short enough to limit exposure.
- **Approved hosts' verification documents** — retained for as long as the account is active (needed for re-verification, disputes).
- **Closed/deleted accounts** — core records (not NRIC/selfie images) retained 6 months post-closure for dispute/fraud purposes, then purged.
- Action: implement actual deletion (e.g. scheduled Supabase Edge Function checking verification_status = 'rejected' and created_at > 30 days) — not yet built, add to MVP checklist.

### DPO and entity details (for Privacy Policy)
- DPO: Ong Kai Le Caleb
- DPO contact: calebong2002@gmail.com (personal email, for now)
- UEN: 53526159D

### Benchmarking against SmileTutor (Singapore tutor-matching platform)
Researched how an existing Singapore middleman platform handles similar real-world-meetup liability:
- SmileTutor's T&C uses the same "we are not liable for disputes between tutor and client" framing — confirms TryKai's "marketplace not provider" approach is industry-standard, not unusually weak.
- SmileTutor explicitly disclaims guaranteeing tutor qualifications since they rely on user-submitted info — TryKai's ID verification is actually STRONGER vetting than SmileTutor's, a genuine differentiator worth keeping.
- SmileTutor controls first contact: communication between tutor/tutee before confirmation happens via SmileTutor's own conference call, not direct contact — personal details only shared after confirmed booking. TryKai already does something similar (full address hidden until confirmed booking) — validates this design decision.
- Takeaway: there is no cleverer legal trick being used by comparable platforms — the standard disclaimer + indemnity + delayed-contact-info approach IS the market standard. TryKai's draft is already in line with or stronger than precedent.

### Action items before T&C goes live
1. Lawyer review of full document (engage law student contact or LegalWise as previously planned)
2. ~~Insert UEN throughout document~~ — done (53526159D)
3. ~~Define specific data retention periods~~ — done, see above
4. Build actual deletion mechanism for rejected verification docs (30-day scheduled cleanup) — not yet built
5. Decide whether higher-risk listing categories (physical activity, sharp tools, food prep) need additional risk acknowledgment or proof-of-licence beyond standard ID verification
6. Build layered acceptance UI in the app (checkboxes at signup, create-listing, checkout)
7. Publish DPO contact details visibly (Privacy Policy + site footer)

---

## Email & contact infrastructure (decided 29 July 2026)

Originally planned as Google Workspace (~S$33.60/month for 3 seats). Decided against this pre-revenue, in favour of a single shared Gmail account:

- **trykaisg@gmail.com** — the one shared business address. Caleb, Aakash, and Ruiheng all have the login (password shared via the team's iCloud Keychain group). This is the general contact address used across all public-facing policy pages.
- Considered domain-forwarding via ForwardEmail.net (~$3/month) to get `hello@trykai.sg` and `privacy@trykai.sg` routing into the shared Gmail, but decided against it for now too — added complexity and cost for a credibility benefit that matters more post-launch (emailing strangers) than during warm-contact beta (emailing friends/family who already know what TryKai is).
- Revisit real `@trykai.sg` addresses once past beta, when the domain-vs-Gmail credibility gap actually starts to matter to guests who don't already know TryKai.

## Infrastructure built (operational systems)

### Email notifications (via Resend)
Three notification flows live:
1. **New booking → host** — triggered from create-payment-intent Edge Function, includes guest name, listing title, session date/time, guest count
2. **New verification submission → Caleb** — Database Webhook on `users` table (Update event) → `notify-verification-pending` Edge Function, fires when `verification_status` changes to `pending`
3. **Verification result → host** — Database Webhook on `users` table (Update event) → `notify-verification-result` Edge Function, fires on approval ("You're verified!") or rejection (resubmit prompt)

All using Resend's test domain (`onboarding@resend.dev`) for now — fine for current volume, revisit if it becomes a deliverability issue.

### Manual host verification review process
- Hosts submit ID photo + selfie → stored in private `verification-docs` bucket
- Caleb gets emailed when a submission is pending
- Manually compare photos in Supabase Storage, update `verification_status` to `approved`/`rejected` in Table Editor
- Host gets emailed automatically on status change

### Browse filtering (live)
- Category pills (All / Food / Fitness / Arts / Music / Language / Other) — client-side filtering
- Area dropdown — dynamically populated from distinct areas in fetched listings
- Both filters combine (e.g. Food + Punggol)

---

## UI/Design decisions

### Dark/light mode — decided against (for now)
Light-only theme. Reasoning: adds real implementation complexity (every component needs both themes, doubled testing surface) for a feature that doesn't move core metrics. Target users (18-28, mobile-first) won't choose TryKai over a competitor based on this. Revisit only if real user feedback specifically requests it.

### SEO considerations (flagged for later)
- "TryKai"/"TryKai" is a common-ish term — won't rank well for brand searches alone
- Strategy: rank for long-tail searches instead ("learn pottery Singapore", "things to do Singapore this weekend") via listing pages
- To implement when building out more: clean URL slugs for listings (not raw UUIDs), unique meta title/description per listing page generated from listing content
- Not yet built — KIV until closer to public launch
