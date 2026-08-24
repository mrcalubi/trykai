# TryKai: Decisions

Two parts. **Part A** is the current state of every decided thing, organised by theme, which is what you read when you need to know how something works today. **Part B** is the append only log, which is what you write to when something changes.

**Rule: append to Part B, then update the relevant section of Part A if the new decision changes it.** Never delete a log entry. When a decision is superseded, say so in the new entry.

---

# Part A: Current state

## Product

### Dual supply model
Two host types on the same browse page. **Peer hosts**, everyday people monetising a hobby, give the platform authenticity and low prices. **Small businesses**, operators too small for Klook, give credibility and volume.

### Unified accounts
One account type, both host and guest. Guest by default, becomes a host on first listing. `is_host` flag handles the distinction. Hosts get a visible badge.

### Progressive disclosure at signup
Ask for information when it becomes relevant, not upfront.
- Browsing: email only
- Booking: phone OTP
- Creating a listing: ID and selfie verification
- Do not ask for date of birth or address at signup

### Location handling
Public listings show general area only, e.g. "Tampines". Full address is revealed only after a confirmed booking, and never appears in a browse or search query. Mirrors Airbnb, protects host privacy.

### Trust layer
Reviews are the core trust mechanism, not vetting.
- Reviews only after a confirmed booking, both directions
- Profile photo required to host, non negotiable
- Phone OTP on signup
- Trust badges on listings: phone verified, ID verified, review count

### Host identity verification
Manual for MVP. Host uploads NRIC or passport plus a live selfie to a private Supabase bucket. Caleb reviews and approves in the dashboard. Status flow: unverified → pending → approved → rejected. Only approved hosts can hold active listings. Automate with Stripe Identity or Veriff once manual review becomes painful, roughly 50+ new hosts a month.

### Browse
Live now: category pills (All, Food, Fitness, Arts, Music, Language, Other), area dropdown, both combinable. Sort by newest, price, most reviewed.
Stage 2: "This weekend" filter, price range slider.
Stage 3: personalisation from booking history.

### Listing media
Up to 5 photos per listing. Video is KIV, too complex for MVP. Interim: hosts can add an Instagram or TikTok link for social proof, requiring no engineering.

### Host notifications
1. Email, built, triggered on booking confirmation
2. In app notification badge, post MVP
3. WhatsApp or SMS via Twilio, at traction

### Date Mode
*Decided, to build post MVP, before Lane 2. **Pricing revised 16 August 2026, see "Date Mode, revised" below.***

An optional layer hosts enable on Lane 1 listings only. Host specifies what is different, what is included, and a price premium they set. Guest side: a "Perfect for dates" browse filter, a badge on listing cards, and an optional occasion checkbox with a note to the host at checkout.

**Why:** it taps a trigger that refuels itself. Dates, anniversaries, "we need to do something different". Not a one time purchase. It is a natural upsell at near zero extra cost to the host, and it permanently differentiates TryKai from any tuition platform.

### Identity and social layer
*Decided direction, to build post MVP.*

The guest profile is a public artefact that accumulates, not just an account page. Every completed session adds to a visible log. Lane 2 progress shown explicitly with a progress indicator toward a stated goal.

**Trophies**, named and specific rather than generic: First Timer, Explorer (5 categories), Night Owl, Date Night Pro, Regulars Club (same host 3+ times), Polyglot in Progress, Still Going (4 week streak). Visible to anyone viewing the profile.

**Streaks**, visible on profile and dashboard, designed so stopping feels like breaking something real.

**Shareable profile card**, one tap, designed to look good as an Instagram Story rather than a raw screenshot. This is the primary organic acquisition mechanic: every share is a warm referral to exactly the target demographic.

**Milestone emails** at 1st, 3rd, 5th booking, framed as identity reinforcement rather than transactional confirmation.

**Lane 1 and Lane 2 signal different things.** Lane 1 signals taste and lifestyle. Lane 2 signals struggle and discipline, which carries more social weight because the audience knows it cost something. Do not flatten them into the same framing. A profile eight sessions into guitar with a streak and a stated goal is the platform's most powerful social object.

**Social comparison** stays lightweight for now: aggregated area activity, "12 people in Tampines completed sessions this month". A full social graph needs user density and creates moderation surface. Revisit at 500+ active users.


### Host fees and the founding cohort
*Decided 16 August 2026.*

**The founding hosts are grandfathered permanently. No host fee, ever.**

The eleven warm contacts are doing TryKai a favour at a point when the platform has nothing to offer them. Introducing a charge at booking 500, after they helped reach it, is the shape of a bait and switch and they would be right to feel it.

Cost: if eleven hosts each complete 50 bookings a year at S$25, the forgone host fee is about S$1,375 a year. Against year three revenue of roughly S$27,000 that is affordable. What it buys is eleven people who feel like founders rather than suppliers, a genuinely scarce "founding host" status, and eleven advocates during the period when there is no other marketing.

**Every host recruited after the founding cohort is told about the host fee before they list.** A fee disclosed upfront is a term of the deal. The same fee introduced later is a betrayal. Identical money, completely different relationship.

### Group bookings
*Decided 16 August 2026.*

**Host funded, host opt-in, TryKai suggests the tiers.** Hosts set a reduced per person price for larger groups.

The economics justify it from both sides. A host at S$25 per person with S$8 of materials over a two hour commitment earns S$17 an hour with two guests and S$29 an hour with four guests at a 10 per cent group discount. Fill rate is worth roughly four times what any fee costs them.

For TryKai a discounted four person booking nets about S$5.70 against S$5.90 for four separate full price bookings. **The discount costs about twenty cents and brings three new users.** Against Singapore consumer CAC of S$5 to S$20 that is the cheapest acquisition channel available. On card it costs nothing at all, because one larger transaction amortises Stripe's fixed S$0.50.

**Group discounts are an acquisition mechanic that looks like a discount.** Present the per head price falling live as guests are added at checkout. The message is not "save 10 per cent", it is "the more of you, the cheaper it gets", which is how a group already thinks about a night out.

### Date Mode, revised
*Revised 16 August 2026. Supersedes the single paid add-on in the original spec.*

The original spec conflated two different things. They are now separated.

**The label is free.** A badge indicating a session works well for two is metadata, costs the host nothing, and should apply broadly. The "Perfect for dates" filter needs density to be worth having; a filter returning four results is not a filter.

**The upgrade is paid.** A genuinely private session, mood set, something to take home, is real extra work and the host should charge for it.

**Pricing guideline: keep the total for two under S$60.** A cheap date is literally true below that. Above it TryKai competes with dinner and a bar rather than with the cinema, and the positioning collapses.

| Base price | Sensible maximum premium |
|---|---|
| S$15 | up to S$15 each |
| S$20 | up to S$10 each |
| S$25 | up to S$5 each |
| S$30+ | a paid Date Mode upgrade stops making sense |

### Small businesses on the platform
*Decided 16 August 2026.*

**Ask for a different format, never a lower price.** Requesting a discount for visibility creates a price parity problem: customers who found the business independently route through TryKai, and the business loses margin on demand it already had. They will resent it and eventually withdraw or quietly raise their TryKai price.

Ask instead for one of two things:
- **A taster version.** Their three hour class at S$80 becomes a 60 minute taster at S$25 that exists only on TryKai. No price conflict because it is not the same product, it fits the format, and it funnels into their full class.
- **Dead inventory.** A slot that never fills. They lose nothing, TryKai gains availability.

**Precedent:** this is what Klook actually does. Their merchant agreements secure *price parity* across channels, not lower prices. What they build instead is exclusive inventory, by 2026 around 220 Klook-only time slots and 1,350 bundled packages, which they describe as hard to replicate competitive inventory. When something looks like a great deal on Klook it is usually a different format, not a cheaper unit price.

**Presentation: a filter at launch, a tab later.** A "Studios and professionals" filter chip alongside the category filters gives guests self selection without splitting a browse page of fifteen to twenty listings into sections that each look empty. **Promote it to a full tab when businesses reach roughly 15 to 20 listings**, enough that the section stands up on its own.

**Mix rules:** businesses fill gaps rather than grow volume. They should cover a category peer supply cannot reach, or provide availability when peer hosts go quiet. No single category should be majority business. Overall, keep businesses under about 30 per cent of listings.

---

## Payments

### Status: moving to Stripe Connect
**Decided 16 August 2026.** After HitPay disabled payment capability on 13 August, and after their Platform account route was found to be the same split model already ruled out, TryKai is moving to **Stripe Connect using separate charges and transfers**.

Why: it is the only option that does what TryKai needs *without requiring anyone's approval*. Publicly documented, supported in Singapore, transfers delayable up to 90 days, and the codebase is already on Stripe. HitPay said no twice, the second time overturning their own CEO's explicit approval two days earlier.

**Correcting an earlier assumption:** moving to Stripe does not mean losing PayNow. Stripe supports PayNow in Singapore at 1.3 per cent and it works with Connect. The real cost difference is about 15 cents a booking, roughly S$75 across year one. Materially smaller than previously assumed.

The HitPay thread stays open. If they return with something workable it can be compared properly, but nothing is planned around it.

### The requirement that constrains everything
The host's share must be held until **24 hours after the session takes place**, not 24 hours after the guest pays. Guests book days or weeks ahead. Every published guest protection depends on this hold:

- A guest cancelling 5 days out is owed a full refund. If the host was paid 4 days ago, TryKai refunds out of pocket and chases the host.
- Clawback assumes the host has future bookings to deduct from. At 11 hosts and single digit monthly bookings, often they will not.

**Any payment architecture that pays hosts before the session has happened requires rewriting the cancellation policy to something substantially weaker.** That is a product decision, not a technical one, and it cuts against the trust first positioning that differentiates TryKai.

### Provider history
HitPay was chosen over Stripe because PayNow processing is dramatically cheaper for low value local transactions.

| Method | Fee on a $20 booking |
|---|---|
| Stripe card | 3.4% + $0.50 = $1.18 |
| HitPay card | 2.8% + $0.50 = $1.06 |
| HitPay PayNow | 0.4% + $0.10 = $0.18 |
| HitPay GrabPay | 2.2% = $0.44 |

Card settlement moved to T+1 in August 2026. A separate S$0.50 in person terminal fee from 15 August does not apply to TryKai, since all bookings are paid online.

### Stripe configuration
- **Charge type: separate charges and transfers.** Not direct charges (money goes to the host first, no hold) and not destination charges (transfer fires at charge time). Separate charges puts funds in TryKai's account and lets the transfer be created on TryKai's schedule.
- **Account type: Express.** Stripe handles host onboarding and KYC.
- **Known friction:** every host completes Stripe's own onboarding on top of TryKai's NRIC and selfie check. For a S$20 session host that is a second round of paperwork and will cost some hosts at the margin. Manageable with eleven warm contacts, a real consideration for cold small business outreach.
- **Unverified:** Stripe Connect charges a per active connected account fee. The Singapore rate has not been confirmed.

### Options previously on the table
1. **HitPay Platform account.** What compliance has directed. Sub merchants hold their own accounts and are paid on the standard schedule with commission deducted. **No escrow, no hold.** Does not meet the requirement above.
2. **Stripe Connect, separate charges and transfers.** Supported in Singapore, platform is merchant of record, transfers delayable up to 90 days. Meets the requirement. Costs the PayNow rate advantage, which weakens the PayNow discount mechanic and the margin story.
3. **HitPay standard merchant account with manual PayNow disbursement.** What Aditya approved on 11 August and compliance then blocked on 13 August. Awaiting resolution.
4. **Fully manual.** PayNow QR direct to the business account, manual confirmation and manual payout. No processor can switch it off. Costs automated payment confirmation, which means guests wait for a human before their booking is confirmed, and reconciliation is fiddly without per booking references.

### PayNow discount mechanic
At checkout the guest sees two prices, e.g. card $22.00 versus PayNow $21.20, save $0.80. Processing drops from about $1.06 to $0.18 on PayNow, so most of the saving is passed to the guest and TryKai still keeps slightly more. Nudges volume toward the cheapest rail.

---

## Cancellation, refunds, disputes

Published at /cancellation-policy, /refund-policy, /dispute-policy. Finalised 29 July 2026, superseding an earlier two tier structure.

| Scenario | Outcome |
|---|---|
| Guest cancels 48hrs+ before | Full refund, including platform fee |
| Guest cancels 24 to 48hrs before | 50% of lesson fee, platform fee forfeited |
| Guest cancels 6 to 24hrs before | 25% of lesson fee, platform fee forfeited |
| Guest cancels under 6hrs, or no show | No refund |
| Host cancels, any time | Full guest refund including platform fee, 1 strike |
| Host no show | Full guest refund including platform fee, discretionary compensation, 2 strikes immediately, account reviewed |
| 3 strikes | Listings auto deactivated |

**Reschedule:** once per booking, same 48 hour cutoff. Not built.

**Host appeals:** within 7 days, reviewed manually, strike removed if successful. Never affects the guest's refund either way. Not built.

**Host no show compensation is deliberately discretionary** rather than a fixed formula, to avoid creating an incentive for collusion between a fake host and a fake guest.

**Safety reports have no time limit, ever.** Credible reports can trigger immediate suspension independent of the strike counter, and severe violations can mean permanent removal without accumulating three strikes. Not built; no suspension mechanism independent of the counter exists today.

**Quality complaints:** 7 day window, 2 business day response target.

**Payout collision:** if a dispute is confirmed after a payout has released, TryKai refunds the guest first, absorbs the cost, and recovers from the host including from future payouts. Depends on payout infrastructure that does not exist yet.

---

## Legal and compliance

### Entity
Sole proprietorship, TRYKAI, UEN 53526159D, SSIC 63209. Registered address is home under the Home Office Scheme. Registered because HitPay's verification required Corppass, which required a UEN; a sole prop was the fastest unblock at $100 versus $300+ and more overhead for a Pte Ltd.

**No legal separation between Caleb and the business.** All liabilities are personal. Given real money, strangers meeting in person, and physical activity, this is a meaningful exposure. Full detail in BUSINESS.md section 11.

### Terms of Service and Privacy Policy
Full draft exists as `TryKai_Terms_Privacy_DRAFT.docx`, covering platform terms, host terms, guest booking terms, and privacy policy. **Not lawyer reviewed. Not published.**

**Layered acceptance**, not one blanket checkbox:
- Signup: platform terms and privacy policy, age 18+ gate
- Create listing: host terms, liability, fees, payouts, indemnity
- Checkout: guest booking terms and cancellation policy
- Verification: privacy policy linked specifically re NRIC and selfie handling

Each acknowledgment ties to the specific risky action, which is better UX than a wall of text at signup and more defensible than a single upfront agreement.

### Host T&C, key clauses
Hosts are independent individuals, not employees. TryKai is a platform, not a service provider. Hosts are solely responsible for the safety of their sessions. No false representation of skills. Sessions must match listings. No contacting guests off platform for commercial purposes. Platform fee is non negotiable and non refundable. Payouts subject to the post session hold. TryKai may withhold payout pending dispute resolution. Host indemnifies TryKai. Liability capped at the platform fee for that booking. Income may be taxable; hosts should consult IRAS.

### Known legal risks
1. **Age verification gap.** 18+ is stated but only self declared. No independent check. Known residual risk, not solved.
2. **Liability cap.** Drafted as capped to the platform fee, standard for marketplaces, but flagged for extra scrutiny because sessions are physical and in person, which carries materially higher injury risk than a digital marketplace. Could be challenged under the Unfair Contract Terms Act, especially regarding personal injury.
3. **Off platform leakage clause.** Included as a deterrent and a basis for suspension, acknowledged as hard to enforce.

### PDPA
DPO is Caleb. Contact is **privacy@trykai.sg**, an alias on his individual mailbox rather than a group, which correctly keeps the role accountable to one named person. Appointing a DPO is mandatory; registering with PDPC is not, but publishing the contact details is, under Section 11(5). Breach penalties reach $1M or 10% of turnover.

### Data retention
- **Rejected verification documents:** deleted after 30 days. Long enough for resubmission confusion, short enough to limit exposure. Deletion mechanism not built.
- **Approved host verification documents:** retained while the account is active.
- **Closed accounts:** core records, not ID images, retained 6 months, then purged.

**Open gap:** five year transaction record retention is the normal expectation for anything payments adjacent, and TryKai does not currently meet it. Aspire was told this honestly during onboarding. Needs a decision.

### Benchmarking against SmileTutor
An existing Singapore middleman platform with comparable real world meetup liability. Their T&C uses the same "not liable for disputes between the parties" framing, confirming ours is industry standard rather than unusually weak. They explicitly disclaim guaranteeing tutor qualifications since they rely on user submitted information, which makes **TryKai's ID verification stronger vetting than theirs**. They also control first contact, sharing personal details only after confirmation, which validates our delayed address disclosure. Takeaway: there is no cleverer legal trick being used by comparable platforms.

### Insurance
Public liability cover is **not legally required** in Singapore for a business like TryKai. Work Injury Compensation applies only with employees. Typical cost for a small, low physical footprint business is roughly **S$300 to S$500+ a year**. Given in person, sometimes physical sessions and the founders' explicit concern about a safety incident, worth an actual quote rather than treating as a someday item. A quote costs nothing and turns a vague worry into a budgetable number. Note it protects against being sued despite the marketplace framing, which does not reliably prevent a suit being filed.

**Status: not yet quoted.**

---

## Infrastructure

### Email
Three iterations before landing on the current setup.
1. Google Workspace, ~S$33.60/month for 3 seats, rejected pre revenue on cost
2. Shared Gmail, `trykaisg@gmail.com`, **disabled by Google** for one account being used by multiple people from different locations. Not bad luck; a predictable fraud detection pattern. Worth remembering before reaching for another shared login workaround.
3. **Zoho Mail Lite**, individual mailboxes at ~S$1.66/user/month on the 10GB tier, about S$59.85 a year including GST for three users, full IMAP and POP so each person uses their normal mail app.

Live: `caleb@`, `aakash@`, `ruiheng@trykai.sg` as individual mailboxes. `hello@trykai.sg` and `privacy@trykai.sg` as aliases on Caleb's mailbox, for public contact and DPO respectively.

DNS verified via TXT, MX, SPF, and DKIM in Vodien. A legacy MX record pointing at `mail.trykai.sg` at priority 0 had to be deleted first; it would have intercepted mail before it reached Zoho.

Deliberately not set up: a `hello@` group inbox routing to all three. Not needed at current volume.

### Banking
**Aspire business account, approved 13 August 2026.** Chosen for zero monthly fee, zero minimum balance, fully digital onboarding, and PayNow support. Held in Caleb's name alone, because a sole proprietorship cannot hold a joint account.

Onboarding required a business plan with three year projections, since there is no revenue history. ACRA BizFile alone was not accepted as proof of business. Compliance also queried why sanctions screening is not implemented; the answer given was that exposure is structurally limited by being Singapore only, in person, and manually onboarded, and that automated verification and screening will be adopted as the platform grows.

**Access control:** do not share the login. If Aakash needs spending ability, issue an Aspire card with a set limit instead.

### Transactional email
Three flows live via Resend: new booking to host, new verification submission to Caleb, verification result to host. **All send from Resend's shared test domain and deliver only to Caleb's address.** Non functional for real users until trykai.sg is verified in Resend.

### Domain
trykai.sg via Vodien, two years, ~$75.98. SGNIC identity verification completed.

---

## UI and design

**Light theme only.** Dark mode adds real implementation complexity, every component needing both themes and doubled testing surface, for something that does not move core metrics and will not win a user against a competitor. Revisit only on specific user feedback.

**SEO**, flagged for later. "TryKai" is common enough that brand search will not rank well. Strategy is long tail instead: "learn pottery Singapore", "things to do Singapore this weekend", via listing pages. Needs clean URL slugs rather than raw UUIDs, and unique meta title and description per listing. Not built.

Full visual identity is in DESIGN.md.

---

## KIV: revisit at traction

| Item | Add when |
|---|---|
| Search bar | 100+ active listings. Category filters cover discoverability below that. |
| Credit bundles, ClassPass style | 500+ bookings, clear repeat behaviour. 5 sessions at 15% off. Creates float on prepaid credits. |
| Multi session courses | 500+ bookings, or whenever Lane 2 launches. Full payment upfront, released per session completed, pro rata refund if the host cancels mid course. This per session release is what keeps TryKai in the loop and prevents leakage. |
| Group discounts | Stage 2. 2 to 3 pax 5% off, 4+ pax 10% off. |
| "This weekend" filter | 50+ active listings with upcoming sessions. High value for the core "nothing to do" use case. |
| Host listing performance nudges | 50+ listings. View count and conversion per listing, with prompts like "47 views, 0 bookings, consider lowering price or adding photos". Modelled on Carousell seller advice. |
| In app notifications | Post MVP. Simple unread badge. |
| WhatsApp or SMS via Twilio | At traction, if hosts miss email notifications. Higher reliability for Singapore users. |
| Listing video previews | Post MVP, if hosts request it. Max 30 seconds, autoplay muted. |
| Host Pro subscription | 2,000+ bookings. ~S$29/month for unlimited listings, featured placement, analytics. By then good hosts earn S$300 to S$800 a month, so the price is trivial to them. |
| SingPass / MyInfo verification | Requires ACRA entity and production track record, plus a GovTech application. Not viable pre incorporation. |
| Automated ID verification | 50+ new hosts a month. Stripe Identity, Jumio, or Veriff, around $1 to $2 USD per check. |
| Data monetisation | Store everything now. Skills demand, price points, areas, times will be valuable to corporates, community bodies, agencies, and investors. Store what might be valuable later, not just what is needed today. |
| Regional expansion | HitPay covers SG, MY, PH. Stripe is better for broader multi country. Revisit provider choice if expanding. |
| Native mobile app | Only with retention data showing users return regularly and push would meaningfully improve it. Good mobile web is sufficient until then. |

---

## Off platform leakage

Guests and hosts bypassing TryKai after a first meeting is a real risk, particularly for Lane 2 repeat sessions. Defences, in order of actual strength:

1. **Reviews only exist here.** The host loses their reputation asset off platform.
2. **The identity artefact.** A guest profile worth building is worth keeping on platform. This is why the social layer is strategic rather than cosmetic.
3. **Payment protection only exists here.** The guest loses dispute coverage.
4. **Per session escrow release** on multi session courses keeps TryKai structurally in the loop.
5. **Anti leakage clause** in the host T&C. A deterrent and a basis for suspension, hard to enforce in practice.
6. Loyalty credits accumulating on platform, eventually.

---

# Part B: Decision log

*Append only. Newest at the bottom. Never delete an entry; supersede it.*

**2026-07 — Registered as a sole proprietorship.** HitPay verification required Corppass, which required a UEN. Sole prop was the fastest unblock, $100 and about 15 minutes, versus $300+ and more compliance overhead for a Pte Ltd. Accepted trade off: no legal separation, all liabilities personal.

**2026-07 — Chose HitPay over Stripe.** PayNow processing is dramatically cheaper for low value local transactions, $0.18 versus $1.18 on a $20 booking.

**2026-07-29 — Cancellation policy moved from two tier to four tier.** The original rule was full refund at 48hrs+, 50% under. Replaced with 100 / 50 / 25 / 0 at 48hr, 24hr, and 6hr boundaries, with the platform fee forfeited on all partial tiers. Host no show separated from host cancellation, carrying 2 strikes rather than 1 plus discretionary compensation. Reschedule, appeals, and safety report handling added. Published at /cancellation-policy.

**2026-07-29 — Public policy pages published.** Cancellation, refund, and dispute, required by HitPay for full payment method approval.

**2026-07-29 — Insurance researched, not decided.** Not legally required. S$300 to S$500+ a year. Moved from a someday item to something worth actually quoting.

**2026-08-02 — MVP status corrected after Ruiheng's code audit.** Several items previously marked done were done only in the sense that the UI existed. Three launch blocking gaps found that were invisible from clicking around: no payment confirmation webhook, `spots_remaining` never decremented, and all transactional email restricted to Caleb's address by the Resend test domain.

**2026-08-02 — Launch moved from August to October.** The original 8 week plan assumed the MVP was closer to done than it was, and assumed more of Ruiheng's time than his real capacity of 8 hours a week. Both corrected.

**2026-08 — Shared Gmail disabled by Google.** `trykaisg@gmail.com` was flagged for multi person shared login use. Superseded by Zoho Mail Lite with individual mailboxes. Lesson recorded: shared single logins trip fraud detection predictably, this was not bad luck.

**2026-08 — Email infrastructure finalised on Zoho Mail Lite.** Individual mailboxes for all three founders, `hello@` and `privacy@` as aliases on Caleb's. Supersedes both the Google Workspace consideration and the shared Gmail attempt.

**2026-08 — DPO contact moved to privacy@trykai.sg**, superseding the personal Gmail placeholder.

**2026-08 — HitPay card and GrabPay approved.** Previously blocked on Corppass and UEN sync.

**2026-08-11 — HitPay marketplace split API ruled out.** Aditya Haripurkar, CEO, confirmed it has no escrow or hold until session functionality; the sub merchant is paid on the standard schedule with commission auto deducted. Incompatible with TryKai's cancellation protections.

**2026-08-11 — Merchant of record model refused.** HitPay declined to approve it at TryKai's stage, citing effectively zero transaction volume. Revisit once volume is meaningful.

**2026-08-11 — Manual disbursement model approved by HitPay CEO.** Collect guest payments into TryKai's own merchant account, disburse each host's share manually by PayNow after the session. Described as a standard use of a merchant account and manageable at our volume. Flow of funds document requested for compliance review. **Superseded 2026-08-13.**

**2026-08-13 — Aspire business account approved.** Required a business plan with three year projections; ACRA BizFile alone was not accepted as proof of business.

**2026-08-13 — HitPay compliance disabled payment capability.** Reason given: holding and releasing funds on behalf of sub merchants on a scheduled basis constitutes a fund holding model, which falls outside a standard merchant account and requires a Platform account. This supersedes the CEO's approval two days earlier. Note the circularity: a Platform account is the split model that was already established as unworkable. Raised with Aditya, with compliance copied. **Unresolved.**

**2026-08-16 — Profit sharing changed to three ways equal.** Previously Caleb and Aakash 50/50 with Ruiheng excluded on the basis that equity was his sole economic upside. Changed because Ruiheng is the sole engineer carrying the critical path. Equity remains 70/20/10; the divergence is deliberate, equity tracks ownership and legal risk, profit share tracks current work.

**2026-08-16 — Reinvestment simplified to a flat 50 per cent.** Replaces the phased schedule of 100 per cent pre proof, 70 to 80 per cent, then 50 per cent. Simplicity chosen over precision deliberately. Distribution floor set at S$500 a month averaged over three consecutive months, with the founder loan repaid first.

**2026-08-16 — Airica removed from all documentation.** No longer involved in any capacity. Supersedes the deferred allocation noted in earlier strategy documents.

**2026-08-16 — Launch target set to end of October 2026**, week of 20 October. Supersedes both the 12 October and 19 October figures which appeared in different documents.

**2026-08-16 — Documentation consolidated.** Eight internal documents reduced to five plus a founders' agreement, after an audit found the equity split recorded three different ways, the launch date three different ways, and the superseded cancellation rule still live in the engineering onboarding document. Root cause was the same fact being written in multiple places. New rule: one fact, one home.

**2026-08-16 — Moving to Stripe Connect, separate charges and transfers.** Chosen because it requires nobody's approval, is documented and supported in Singapore, allows transfers delayed up to 90 days, and the codebase is already on Stripe. Supersedes all HitPay integration planning. Also corrects a repeated earlier assumption: Stripe supports PayNow in Singapore at 1.3 per cent and it works with Connect, so the real cost difference is about 15 cents a booking rather than the loss of PayNow entirely.

**2026-08-16 — Founding hosts grandfathered permanently, no host fee ever.** Costs roughly S$1,375 a year at 50 bookings each. Buys eleven advocates during the period with no other marketing, and avoids the bait and switch of charging people who helped build the thing.

**2026-08-16 — Host fee disclosed upfront to every host after the founding cohort.** Same money, different relationship.

**2026-08-16 — Group discounts are host funded and opt-in.** Reframed as an acquisition mechanic rather than a margin concession: a discounted four person booking costs TryKai about twenty cents against four separate bookings, and brings three new users. Cheapest acquisition channel available.

**2026-08-16 — Date Mode split into a free label and a paid upgrade.** Supersedes the single paid add-on in the original spec. Guideline: keep the total for two under S$60, since above that TryKai competes with dinner rather than with the cinema.

**2026-08-16 — Small business pitch is a different format, never a lower price.** Taster versions or dead inventory rather than a discount, avoiding the price parity trap. Confirmed as the same strategy Klook uses; their merchant agreements secure parity, and their moat is exclusive time slots and bundles.

**2026-08-16 — Businesses presented as a filter at launch, promoted to a tab at 15 to 20 business listings.** Middle ground between visibility for businesses and browse density at launch volume.

---

# Analysed but not decided

Live questions with work already done. Each needs a call.

**Fee restructure.** Modelling on Stripe's Singapore rates found that S$20 is the worst possible price point on card, netting S$0.75 against S$1.09 at S$10, because the S$2 floor stops binding before the percentage starts working. A proposed structure of card at 12 per cent with a S$2.50 floor and PayNow at 8 per cent with a S$2.00 floor removes the trough, doubles the visible PayNow saving at S$25, and adds roughly S$70 across year one. Analysed 16 August, not decided.

**Host fee trigger.** Currently set at 500 cumulative bookings. On the modelling, a 10 per cent host fee multiplies net per booking by about 2.17x, worth roughly S$1,200 in year one, which is more than every other pricing lever combined. Waiving it for each host's first three bookings would retain most of the recruitment benefit at a fraction of the cost. Not decided.

**Price ceiling for businesses.** If businesses are positioned as the more professional option, does the S$10 to S$40 band still apply to them? If yes they cannot really be premium. If no, the band that defines TryKai's identity has a hole in it. Not decided.

**Which axis drives top level navigation.** Casual versus professional is orthogonal to one-off versus progression. The documents currently assume Lane 1 and Lane 2 drive the top level. A business tab would quietly introduce a second axis and a two by two. Needs a deliberate decision before either is built.

**Five year transaction retention.** Standard expectation for anything payments adjacent. TryKai does not currently meet it and Aspire was told so honestly. Not decided.
