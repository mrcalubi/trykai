# TryKai (Kai) — Design & Visual Identity

Companion document to DECISIONS.md (product/technical/legal) and STRATEGY.md (business model, positioning, team). This document covers visual identity: palette, typography, logo direction, messaging, and photography policy.

---

## 1. Brand vibe (what we're going for)

The brand has to thread a specific needle: casual and approachable enough that a $15 latte-art session doesn't feel over-produced, but credible enough that a stranger trusts handing over money and meeting another stranger in person. Concretely, this means:

- **Not** boutique/elegant (script wordmark, serif) — signals price and formality Kai doesn't have
- **Not** comic/bubble — undermines trust in a platform handling real money and real-world meetups
- **Not** editorial/fashion-magazine (big cutout display serif) — sets a curated, expensive expectation the actual $10–40 experience won't match
- **Not** cold/minimal/fintech (mirrored sans wordmark) — no warmth, doesn't signal what the platform is for
- **Is** warm, local, friendly-but-credible — closer to how Carousell or Grab feel than to Airbnb Experiences or a tutoring platform

---

## 2. Color (decided)

- **Core palette: navy + cream**, shared across both lanes as the brand anchor
- Cream (~#F4F1EA) as the primary background; deep navy (~#16264B) as primary text/UI color
- A warm accent (coral/terracotta) used **sparingly and functionally**, not decoratively — e.g. tied to the PayNow-savings badge at checkout, not splashed across the hero or used as a generic highlight
- **Lane 2 ("Build a Skill") gets a quieter, muted variant of the same palette** — same navy anchor, but the coral accent is dialled down or dropped almost entirely, leaning on navy + gray. Not a separate color system.

**Rationale:** navy/cream reads warm-but-credible rather than premium or childish — it's the register that survived rejecting the script, comic, and editorial directions. Sharing the palette across lanes (rather than giving Lane 2 its own colors) keeps Kai feeling like one platform with a quieter section, not two unrelated products glued together.

---

## 3. Typography (decided)

One type system, shared across both lanes:

- **Display** (headlines, hero, listing titles): Bricolage Grotesque — real character without tipping into playful/childish; legible at hero size and small in-app sizes alike
- **Body / UI** (buttons, filters, dashboard, nav): Manrope — soft terminals keep it warm, stays out of the way; the workhorse face
- **Utility** (numbers, prices, tags): a monospace (e.g. Space Mono / JetBrains Mono) — gives prices and location tags a "price tag / receipt" feel. This is the one deliberate signature detail in the system, rather than relying on decoration elsewhere.
- The monospace utility face is **reused for Lane 2's "Skill-verified" badges and credential details** — same typographic device, different job (price tag → credential tag). A deliberate thread connecting the two lanes.

**Fonts do not change between Lane 1 and Lane 2.** Swapping fonts between lanes was considered and rejected — it reads as inconsistency, not intentional tiering. Lane 2's "more serious" feeling comes from everything except the typeface: smaller/more restrained headline scale, reduced or absent accent color, tighter spacing and higher information density, and an outcome-oriented copy register. Reference point: Fiverr Pro doesn't run a different font from the main Fiverr site — the restraint is in spacing and tone, not typeface.

**Reserved, not decided:** a distinct small wordmark/sub-mark for Lane 2 (e.g. the editorial cutout-serif direction rejected for Lane 1) remains a possible exception, since it would appear in only one or two spots (a section header, not body or UI text). Not needed now — revisit once Lane 2 is closer to launching.

---

## 4. Logo / wordmark

### Decided
- Direction: legible, warm, friendly-but-credible — not script, not comic-bubble, not editorial-cutout, not cold-minimal
- Locality/"neighbour" language is a strong tagline candidate from early exploration — not finalized as the permanent tagline, but the leading reference point
- "Skip the course. Just learn the basics." is a strong line, **banked for Lane 2 only** — it's a direct jab at tutoring/Skillshare-style incumbents, which are explicitly Lane 2's competitive set per STRATEGY.md, not Lane 1's

### Open
Final wordmark execution not yet locked — direction is set; the specific lettering/logo treatment itself still needs to be designed (separately from the Bricolage Grotesque system, though likely related to it).

---

## 5. Lane 1 messaging (hero)

### Decided
- **Headline direction: boredom-as-local-condition.** Reference line: *"Singapore's not boring. You just haven't found your thing yet."*
- **Subhead carries the "together" angle** the headline alone doesn't cover (solo browsing vs. friends with no plans vs. a couple deciding a date idea). Reference line: *"Solo, with friends, or on a date — something better than scrolling for the tenth time."*
- **Single primary CTA: "Browse skills."** No secondary "Become a host" CTA on the public hero.

**Rationale:** the shared thread across Kai's actual target users (bored individuals, friend groups with no plans, couples wanting date ideas) isn't "I want to learn a skill" — it's decision fatigue, the "I don't know, what do you want to do" loop. That's sharper and more ownable than generic "try something new" copy, and it isn't claimed by any named competitor (Meetup, ActiveSG, Airbnb Experiences are all positioned around the activity itself, not the pre-decision moment). The headline carries that insight; the subhead covers all three use cases without turning the headline into a list.

### Host CTA — deferred, not deleted
"Become a host" moves from the public hero to a **post-session email nudge** (KIV — build later), sent to guests after completing a session as a student. Matches the progressive-disclosure logic already used for signup in DECISIONS.md — ask for the thing when it's actually relevant, not upfront to a cold visitor.

---

## 6. Photography policy (decided)

- **Real, but as good as the host can make it** — not Airbnb-style professional staging, but genuinely well-taken phone photos: natural light, no clutter, accurately representing the actual experience
- **Build active guidance into the listing-creation flow**, not just an unstated norm — a host-facing nudge along the lines of *"Good listings get 3x more bookings — here's how to take a great phone photo."* This formalizes DECISIONS.md's existing listing-performance-nudges idea into a photography-specific prompt at creation time, not just a post-launch dashboard stat.

**Rationale:** "nicer listing wins" is real and worth using — it's literally how Airbnb's own marketplace behaves — but Airbnb's unguided version of that incentive is also what gradually pushed hosts toward professional photography and staging, which is the exact curated, polished feel TryKai's positioning explicitly differentiates against (see DECISIONS.md's competitor table). A five-minute, no-equipment way to take a noticeably better photo gets the quality lift without quietly recreating Airbnb's curation creep, which would erode the "anyone can teach, low barrier to list" promise over time.

---

## 7. Open items / to revisit

- Final wordmark/logo execution (direction set, specific design not yet built)
- Lane 2's own small wordmark or section-header treatment, if any (optional, deferred)
- Mobile hero treatment — not yet mocked up
- Icon system formalization — early mockup used Tabler-style outline icons; not yet confirmed as the permanent system
- Exact tagline under the logo (locality/"neighbour" language is the leading candidate, not finalized)
- Lane 2's exact spacing/density/accent-reduction specifics — direction agreed ("quieter, same system"), precise values not yet defined
