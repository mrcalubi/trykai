# TryKai (Kai) — Business Strategy, Positioning & Team Structure

Companion document to DECISIONS.md. DECISIONS.md covers product/technical/legal build decisions. This document covers business model, competitive positioning, growth philosophy, and team/equity structure.

---

## 1. What Kai actually is (revised positioning)

**Original framing:** A peer-to-peer skill and experience marketplace for Singapore — one-off bookable "experiences," with couples seeking date ideas as a core anticipated use case.

**Revision 1 (recurring activity):** Shifted toward "recurring, casual, low-commitment local activity" to avoid colliding with Airbnb Experiences' 2025 relaunch (which explicitly targets locals, not just tourists) and to avoid the P2P-experience-marketplace failure pattern (Vayable, shut down 2019 after a decade and $2.1M raised) and the aggregator-squeeze pattern (GuavaPass, acquired and shut down in Singapore by ClassPass).

**Revision 2 (the real resolution — two lanes, not one identity):** Optimizing purely for recurring/multi-session revenue quietly pulled the positioning away from the original "Singapore is boring, try something fun" instinct and toward "skill tuition" (language, instrument) — a different business with a different buyer. Rather than picking one identity, Kai is structured as **two distinct lanes within one platform**, because the founder's own use cases (latte art, DJ-ing — novelty, capped at 2-3 sessions; Japanese classes — genuine multi-session progression) don't collapse into a single buyer intent. See Section 1a.

**Why not just pick one:**
- Forcing everything into "recurring/progression" framing fights the platform's founding insight (novelty, discovery, "what's fun to try" — including the couples/date-ideas use case) and pushes toward a crowded, price-sensitive tuition market (language schools, private tutors, Skillshare-style platforms) that isn't where Kai's original differentiation lives.
- Forcing everything into "one-off taster" framing abandons real demand for serious, multi-session skill-building (language fluency, resume-relevant upskilling) and the stronger repeat-revenue economics that come with it.
- The two intents also imply different trust requirements (see Section 1a) — collapsing them into one undifferentiated browse experience risks diluting both: casual guests feel over-formalized, serious guests feel the platform is too lightweight to trust with real skill development or career-relevant claims.

**What stays the same across both lanes:**
- Dual supply model (peer hosts + small businesses)
- Low price point relative to incumbents, low barrier to host
- "Anyone can teach, everyone can learn" ethos
- Trust-first design (verification, reviews, delayed contact info) — though the *bar* for trust differs by lane, see below

---

## 1a. The two-lane structure: "Try Something New" vs "Build a Skill"

### Lane 1 — "Try Something New" (Taster)
The original founding insight: Singapore is perceived as expensive/boring, and there's appetite for affordable, low-commitment local activities to try — including as date ideas, group hangouts, or solo novelty-seeking.

- **Session count:** 1–3 sessions, capped naturally by intent (exposure/experience, not mastery)
- **Buyer mindset:** Impulsive, social, novelty-seeking, low-commitment — "let's just try something different"
- **Example listings:** Latte art, DJ-ing basics, a pottery taster, a one-off cooking class, a casual fitness try
- **Trust bar:** Identity verification (existing ID + selfie process) is sufficient — risk is low (worst case: a mediocre afternoon), so existing trust infrastructure doesn't need to change
- **Monetisation:** Stays close to Stage 1 model — per-booking fee, no real need for credit bundles since sessions are capped low anyway
- **Supply:** Easiest to recruit — most people have *some* casual skill worth sharing once or twice; matches founders' own warm-contact pool (e.g. Caleb's latte art, Aakash's DJ-ing)
- **Launch priority:** First. Matches the founding instinct, lowest trust bar, easiest supply recruitment, fastest path to a populated, "alive-feeling" browse page

### Lane 2 — "Build a Skill" (Progression)
A distinct, more serious lane for genuine skill-building — positioned and trusted differently from Lane 1, not just a filter on the same listings.

- **Session count:** 4–15+ sessions, often via credit bundles or multi-session course structures
- **Buyer mindset:** Outcome-oriented, price-and-results sensitive, explicitly compares Kai against real incumbents (private tutors, language schools, Skillshare-type platforms) — not against "things to do this weekend"
- **Example listings:** Language learning (e.g. Japanese), instrument lessons, fitness/sport coaching (technique-focused, not partner-finding), resume-relevant upskilling (software tools, design, public speaking, certifications)
- **The resume/upskilling angle specifically:** This is a stronger "needs" signal than general hobby learning — career anxiety and competitive job-market pressure make this motivation durable in a way novelty isn't. Worth deliberately leaning into as a differentiated sub-segment within Build a Skill, competing on price and "real person, real accountability" against anonymous online courses, and on price against $80+/hr private tutors.
- **Trust bar:** Higher, and different in kind. Identity verification alone is insufficient — the guest's real fear isn't "is this person a scammer," it's "is this person actually good enough to teach me something I'm relying on for an outcome (fluency, a resume claim, a skill)." Requires a **separate "Skill-verified" badge** (portfolio, certification, work samples, references) layered on top of existing ID verification, plus outcome-oriented review prompts distinct from Lane 1's generic review flow (e.g. "did this help you reach a real milestone" vs "did you have a good time")
- **Monetisation:** Where credit bundles and multi-session course structures (existing Stage 2 KIV items in DECISIONS.md) actually become essential, not optional — a serious language learner without a bundle option is a meaningfully worse product
- **Supply:** Harder to recruit — needs credentialed peers or small businesses (an actual tutor, a working designer, a language school doing private 1-on-1s), not just "anyone with a casual skill." Fits the existing dual-supply model without requiring a new supply category.
- **Launch priority:** Second, deliberately slower. Soft-launch or "coming soon" initially; grow carefully starting with maybe one strong category (e.g. Language) once 2-3 genuinely credible, verifiable hosts are found. Rushing this lane with under-qualified hosts directly damages the higher trust bar it depends on.

### Why one platform, two lanes — not two separate products
Both lanes share the same backend, account system, and core trust infrastructure (ID verification, reviews, payments), so there's no duplicated engineering effort. What differs is presentation and trust requirements: visibly separate sections (browse-and-discover casual UI for Lane 1; outcome-oriented, more serious UI for "Build a Skill") so guests self-select into the right expectations before browsing, rather than discovering the mismatch mid-scroll. Whether "Build a Skill" needs its own sub-brand treatment (in the way Fiverr Pro is distinctly presented within Fiverr) versus just being a clearly labelled tab/section is an open product/design decision, not yet resolved — flagged in Section 8.

---

## 2. Competitive landscape

### Direct precedents in the broader P2P experience space (cautionary)
| Company | Model | Outcome | Lesson |
|---|---|---|---|
| Vayable | Global P2P local experience marketplace | Shut down 2019 after ~10 years, $2.1M raised | P2P experience marketplaces struggle to scale supply quality/quantity; pivoted to curated concierge before closing |
| GuavaPass | SG-based fitness class aggregator | Acquired and shut down in SG by ClassPass (2019) | Aggregator models get squeezed out once a bigger, better-funded competitor enters the same market |
| Zowedo | SG home services/local experiences marketplace | Closed (raised $330k seed) | Local services marketplaces in SG have a real failure base rate, even with funding |
| Airbnb Experiences | Global curated experiences | Paused 2 years (2022–2024) for "losing its way" on quality/differentiation; relaunched 2025 targeting locals too | Even a giant with huge capital struggled to make this category work; now directly entering Kai's original "local-to-local" lane |

### Direct competitors relevant to "Build a Skill" (Lane 2 — recurring skill-building)
| Company | What it does | Pricing | Threat level |
|---|---|---|---|
| Meetup | Organizes recurring interest-based meetups (badminton, tennis, cycling groups) in SG | Free | High — already has community density Kai would need to build from scratch |
| RacketPal | Find racket-sport partners, organize matches, find coaches | Free | Medium — narrow to racket sports, but free and established |
| SG Badminton App | SG-specific badminton group organizing and matchmaking | Free | Medium — narrow but well-targeted |
| ShuttleMatch | SG-built badminton matchmaking by skill/location | Free | Medium — same niche, SG-native |
| ActiveSG | Government-backed facility booking + community sports programmes | Subsidised/low cost | High — government-backed, trusted, cheap, broad reach |
| Private tutors / language schools | 1-on-1 or small-group instruction (language, instrument) | $40–100+/hr typical | High — established price expectation, trusted by serious learners |
| Skillshare / Coursera-style platforms | Resume-relevant skill courses, self-paced or cohort | $10–50/month or per-course | Medium — content quality bar is high, but impersonal; Build a Skill's "real person, real accountability" angle differentiates |

**Key insight:** The "find a partner for an activity you already know" niche (Meetup, RacketPal, SG Badminton, ShuttleMatch, ActiveSG) is crowded and free — Build a Skill should not compete here directly. The open lane is **teacher-led recurring sessions with a consistent host** — not matchmaking for a sport you already play, but learning/practicing something with the same person/small group over time, at a price point and personal-accountability level the free tools and faceless course platforms don't offer. This is a Lane 2 concern specifically — Lane 1 (Try Something New) isn't trying to compete in this space at all, since its sessions are capped low by intent.

---

## 3. Designing around lower propensity for stranger-contact (Singapore context)

Working assumption: Singaporean users skew toward lower natural inclination to seek out novel social/stranger contact compared to markets where "meet new people" apps thrive. Structural responses:

- **Lead with the activity/skill, not the social angle.** The pitch is "learn pottery" or "improve your serve," not "meet new people." Social contact is a byproduct, not the primary ask.
- **Recurring-host model pays the stranger-discomfort cost once, not repeatedly.** A one-off experience marketplace demands a new "meet a stranger" decision every booking. A recurring model with the same host means the hardest part (first meeting) only happens once per relationship.
- **Default to small group/1-on-1 formats** over large mixers, reducing social pressure relative to bigger meetup-style formats.
- **Trust signals carry more weight here than in more extroverted markets.** Existing investment in ID verification, reviews, and delayed contact-info disclosure should be leaned into harder as a selling point ("verified, real people"), not treated as a baseline compliance feature only.

---

## 4. Growth philosophy

**Core constraint:** Customer acquisition must trend toward *easier and cheaper* over time, not harder and more expensive. This rules out paid acquisition as a primary growth channel — Singapore digital CAC for consumer apps ($5–20+) likely exceeds platform margin on a single $10–40 booking, meaning paid growth doesn't pencil out until repeat-usage economics are proven.

**Primary growth mechanisms (compounding, not depleting):**
1. **Referral loops** — credit/incentive for both parties when a referred user completes their first booking
2. **Review/trust compounding** — every completed, reviewed booking reduces friction for the next guest considering that host
3. **Host-driven promotion** — as hosts earn real income, they have direct incentive to promote their own listings via their own channels, effectively scaling supply-side marketing without platform spend
4. **Category/community density** — concentrated, deep coverage in 2–3 categories at launch (not broad, thin coverage) creates a genuine "this is alive" feeling and enables word-of-mouth within specific communities

**Aakash's role accordingly shifts** from "run paid ad campaigns" to "build organic, community, and referral-driven growth" — better matched to actual unit economics and a more honest fit given no proven paid-ads track record.

### Evidence-gated spending (revised — moderate risk tolerance)
Both founders are willing to spend hundreds of dollars personally if there's reasonable confidence it converts to thousands back — not unlimited risk tolerance, but not zero either. Structure for spending decisions:

1. **Prove unit economics manually first, at zero cost.** Use the organic/warm-network launch phase to learn real numbers: conversion rate from listing view to booking, repeat-booking rate, average revenue per guest.
2. **Only spend once the numbers are known.** A specific test (e.g., $200–500 on one boosted post, one small geo-targeted promotion) should be sized against a calculated expected return from Step 1's data — not optimism.
3. **Spend in small, capped, reversible tranches.** Test, measure, stop or scale based on actual return — never continue a channel that's underperforming out of sunk-cost reasoning.
4. **Once a channel is proven, fund further spend from realized business revenue, not fresh personal savings**, to keep the "don't bleed savings" principle intact while still allowing genuine, evidence-based growth spend.

This gives a concrete answer to "should we spend $300 on X": only if Step 1 data shows expected return exceeds the spend — not gut feel.

### What "enough" progress looks like (deliberately underestimated)
- **Month 1–2:** Live, 15–20 real listings across 2–3 categories, single-digit completed bookings. Success = proving the mechanism works (stranger pays, shows up, leaves a review) — not volume.
- **Month 3–4:** Low double-digit bookings/month; at least 1–2 organic repeat-booking or referral instances without founder prompting. First real signal the compounding loop might exist.
- **Month 5–6:** Bookings trending up month-over-month without proportionally more founder effort. This is the actual checkpoint for "is this getting easier" — the core thesis of the growth philosophy.
- **Failure signal to watch for:** not slow absolute numbers, but flat/declining month-over-month trend, or growth that only happens when founders push harder each time.

---

## 5. Launch strategy

- **Lane-sequenced, not simultaneous.** Launch "Try Something New" (Lane 1) first — matches the founding instinct, lowest trust bar, easiest supply recruitment via warm contacts. "Build a Skill" (Lane 2) launches second and slower, soft-launched or flagged "coming soon" initially, starting with one strong category (likely Language) once 2-3 genuinely credible, skill-verifiable hosts are found. See Section 1a.
- **Within Lane 1, category-concentrated, not broad.** Launch deep in 2–3 Taster-friendly categories (e.g. Food, casual Fitness/novelty skills, Arts) rather than thin across all 6. Sparse coverage everywhere reads as "empty"; deep coverage in a few categories reads as "alive."
- **Geography is a secondary concern in Singapore.** Given compact size and transit quality, scattered-but-relevant listings across the island are acceptable — category depth matters more than hyperlocal geographic clustering.
- **Mixed sourcing for Lane 1:**
  - Warm contacts (Caleb + Aakash's networks) — to be tested for real feasibility, not assumed. Founders' own novelty skills (Caleb: latte art; Aakash: DJ-ing) are themselves examples of the kind of supply this lane needs.
  - Small business outreach (free-to-join pitch) — likely more scalable than warm contacts; framed to businesses as "bookings you wouldn't otherwise get, free to find out if it works," not just "it's free"
  - Risk to monitor: if business supply dominates by default (easier to recruit at volume) while peer supply lags, Kai drifts toward a Klook-style aggregator identity rather than its differentiated peer-to-peer one. This should be a deliberate choice if it happens, not an accident of which channel was easier.
- **Lane 2 sourcing is deliberately different:** needs credentialed peers or small businesses (an actual tutor, a working designer), not casual warm contacts. Quality bar matters more than speed here — rushing Lane 2 supply undermines the trust tier it depends on.

---

## 6. Business model (staged, unchanged from DECISIONS.md, reaffirmed here)

- **Stage 1 (now–500 bookings):** Guest-facing booking fee only (10%, $2 floor), PayNow discount mechanic, host fee waived to build supply. Applies primarily to Lane 1 (Try Something New) at launch.
- **Stage 2 (500–2,000 bookings):** Host fee introduced, credit bundles, multi-session courses, group discounts. Credit bundles and multi-session courses become essential — not optional — for Lane 2 (Build a Skill), so this stage's tooling should be prioritized whenever Lane 2 actually launches, even if that's earlier than 500 total bookings.
- **Stage 3 (2,000+ bookings):** Host subscription tiers ("Pro," $29/month) — primary long-term margin driver, since recurring subscription revenue has near-zero marginal cost versus per-transaction fees, which have a low ceiling on $10–40 bookings.

**Naming note:** DECISIONS.md's Stage 3 host subscription tier is internally called "Pro" ($29/month, for hosts). This is a different concept from "Build a Skill" (the guest-facing Lane 2) — one is a host subscription product, the other is a guest-facing skill-building lane — and the two names no longer collide now that the lane is named "Build a Skill" rather than "TryKai Pro."

**Wants vs. needs:** Pure needs-based categories (tutoring, fitness, certifications) are already dominated by entrenched, capitalized incumbents in Singapore — not a viable pivot target for an entire platform. Instead, target the overlap zone within Lane 2 specifically: activities that feel like wants but function like needs — resume/upskilling-relevant learning being the clearest example (career anxiety and competitive job-market pressure make this motivation durable), alongside social connection/routine-building for those post-NS or newly independent. This preserves Lane 1's low-barrier, novelty identity while letting Lane 2 tap stickier demand than pure discretionary spend.

**Margin improvement** should come primarily from the Stage 3 subscription/credit layer plus Lane 2's naturally higher session count, not from squeezing per-booking fees on Lane 1 — the latter has a low ceiling at $10–40 price points regardless of how it's optimized.

---

## 7. Team structure & equity

### Ownership
- **Caleb: 80%**
- **Aakash: 20%**
- Vesting: 4 years, 1-year cliff, for both founders (Caleb included — vesting own equity signals good faith and protects the company if either founder departs)
- **Airica:** No current allocation. Role and contribution undefined; explicitly deferred, to be revisited once a concrete, proven contribution exists. Not a reflection of relationship status — same standard applied to any contributor.
- Reserve pool: not formally carved out at this 80/20 split — revisit if future contributors are added, to avoid further dilution being entirely founder-funded without planning.

### What equity represents (vs. profit share — see below)
Equity is a claim on the **company as an asset itself**: its value if sold, its value if outside investment is raised, ongoing voting/control rights over major decisions, and (separately, if granted) a share of distributed profit. It is not the same as receiving cash now — its value is realized at specific events (acquisition, investment round) or via whatever profit-distribution policy is separately agreed. Note: equity cannot actually be formally issued under the current sole proprietorship structure — this section represents agreed *intent and framework*, to be formalized once/if TryKai converts to a Pte Ltd (see DECISIONS.md, Legal structure KIV).

### Compensation (separate from equity)
- No formal pay during pre-launch phase (informal, low-effort contributions from either side are not compensated)
- Once real revenue exists: commission/revenue-share on attributable bookings (e.g., bookings driven by Aakash's referral codes, content, or outreach) — paid from revenue, not equity, scaling naturally with zero fixed cost if there's no revenue yet
- Ad/management fees (if/when a real ad budget exists) layered in separately, following the evidence-gated spending framework in Section 4

### Profit sharing
- **Profit share: 50/50 (Caleb/Aakash)** — deliberately set independent of the 80/20 equity split, as a way of compensating Aakash's active, ongoing operational contribution in cash terms more richly than his ownership stake alone would imply. This is an intentional design choice, not a default — flagged so both founders are aligned that profit share and equity are tracking different things on purpose.
- Applies to whatever portion of profit is distributed in a given period (not total revenue, not the reinvested portion).

### Reinvestment ratio (staged by proof milestone, not calendar time)
| Phase | Trigger | Reinvested | Distributed |
|---|---|---|---|
| Phase 1 — Pre-proof | Now until consistent month-over-month bookings + validated unit economics (~first 6–12 months) | 100% | 0% |
| Phase 2 — Proven model, early growth | Stage 2 of business model live (host fees, credit bundles), positive growth trend | 70–80% | 20–30% |
| Phase 3 — Mature, self-sustaining growth | Stage 3 live (subscriptions), growth loops compounding without proportional fresh spend | ~50% (or less) | ~50% (or more) |

Rationale: tying the ratio to proof milestones rather than fixed dates avoids both (a) distributing money before the model is actually validated, undermining the "don't bleed savings" principle, and (b) over-hoarding reinvestment long after the business has demonstrated it doesn't need it, which would undercut the "spend hundreds, see thousands back" reassurance both founders want.

---

## 8. Open items / to revisit

- **Decide "Build a Skill"'s visual/brand treatment** — distinct sub-brand (Fiverr Pro–style) vs. a clearly labelled tab/section within the same app (Section 1a)
- **Define the Skill-verified badge process for Lane 2** — what counts as proof (portfolio, certification, references), who reviews it, how it differs operationally from the existing manual ID-verification flow
- **Decide Lane 2's exact launch trigger** — e.g. "launch Build a Skill once 2-3 credible Language hosts are confirmed," rather than a fixed date
- Airica's role and any associated equity/compensation — once a concrete contribution is defined
- Formal founders' agreement document (even simple, signed) reflecting Section 7 once roles are concretely tested
- Pte Ltd conversion timing — required before equity can be formally issued; should be planned alongside finalizing the cap table, not after
- Reserve/contributor pool — not currently carved out; revisit if hiring or further dilution becomes likely
- Founder's own check-in: defining personal markers of "enough progress" (Section 4) before motivation dips trigger premature strategy changes (e.g., reaching for paid ads too early)
