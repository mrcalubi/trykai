# TryKai (Kai) — Design & Visual Identity

Companion document to DECISIONS.md (product/technical/legal) and BUSINESS.md (business model, positioning, team). This document is the single source of truth for how TryKai looks and behaves: brand, tokens, components and the layout of each page. When the code and this document disagree, fix one of them in the same change.

**Revision, 18 October 2026 (UI overhaul).** The first identity (sections 1 to 6 of the August version) chose the right ingredients, but the built site read as flat and unfinished next to Airbnb, Carousell and Klook: a centred block of text, a wrap of grey pills, cards with no dates or faces, and a footer of bare links. This revision keeps the palette, fonts and voice and changes how they are used: more contrast and rhythm between sections, people and dates on every card, real depth on surfaces, and finished loading, empty and error states. The redesign mockups live in the "TryKai Redesign" canvas (Claude artifact `XgCC4Xm7DiRhYC2ktAWY9D`).

---

## 1. Brand vibe

Casual enough that a $15 latte-art session doesn't feel over-produced, credible enough that a stranger hands over money and meets another stranger in person. Concretely:

- **Not** boutique/elegant (script wordmark, serif), comic/bubble, editorial/fashion-magazine, or cold fintech minimal.
- **Is** warm, local, friendly-but-credible: closer to Carousell or Grab than to Airbnb Experiences or a tutoring platform.
- **And finished.** Polish is a trust signal on a marketplace. Every state a guest can see (loading, empty, error, no photo, no reviews) is designed, not left as a line of grey text.

### The bar we measure against
Airbnb (photo-first cards, faces of hosts, sticky booking), Carousell (dense, scannable browse, local language), Klook (clear price and date on every card). We borrow their *structure*, never their look.

### Five principles
1. **Photo first.** The listing photo is the biggest thing on every card. A listing without one gets a designed category tile, not an empty box.
2. **People first.** Guests are buying time with a person. The host's face (or initials) appears on the browse card, high on the listing page, and at checkout.
3. **Honest signals only.** Real "spots left", real PayNow savings, real next date, real reviews. No fake urgency, no "people viewing now", no invented stats.
4. **Rhythm and contrast.** Cream pages are broken up by deep-navy bands (How it works, footer) and white raised surfaces, so long pages never read as one flat sheet.
5. **Restrained motion.** Short, purposeful transitions (150 to 250 ms). Everything respects `prefers-reduced-motion`.

---

## 2. Color

Navy and cream remain the anchor, shared across both lanes. Values are tokens in `src/index.css`; use the token, never the hex.

| Token | Value | Use |
|---|---|---|
| `--cream` | `#F4F1EA` | Page background |
| `--surface` | `#FBFAF6` | Cards, inputs, raised panels |
| `--sand` | `#EBE5D8` | Quiet fills: chips, skeletons, placeholders |
| `--navy` | `#16264B` | Text, primary buttons, active states |
| `--navy-deep` | `#0F1B38` | Contrast bands and the footer |
| `--muted` | `#4E586C` | Secondary text (6.3:1 on cream, passes AA) |
| `--subtle` | `#7A8296` | Decorative text only (placeholders, disabled) — never body copy |
| `--border` | `#E4DED2` | Dividers and outlines |
| `--border-strong` | `#C9C1B2` | Outlined controls (secondary buttons, chips) |
| `--coral` | `#D97756` | Brand accent fills and icons |
| `--coral-ink` | `#A24E2E` | Coral *text* on light backgrounds (5:1, passes AA) |
| `--coral-soft` | `#F6E3D9` | Coral tint behind coral-ink text |
| `--success` / `--error` | `#2F7A55` / `#C7382C` | Status text and icons, with `-bg` tints |

**Changed from August:** secondary text darkened from `#6F778B` (about 4:1 on cream, failed AA) to `#4E586C`. Borders warmed to sit with the cream rather than read grey.

### Coral: wider, still disciplined
August restricted coral to the PayNow badge. In practice that left the site monochrome. Coral is now the **brand accent**, allowed in small doses:

- **Allowed:** the dot in the wordmark, section eyebrows, step numbers, checkmarks in lists, the active underline in the category bar, the PayNow saving, "New" and "spots left" labels (as `--coral-ink` on `--coral-soft`).
- **Never:** primary buttons (white on coral is 3.1:1, fails AA), large background fills, body text, or decoration with no meaning.
- **Lane 2** still turns coral down to near zero and leans on navy and grey.

### Category tints
When a listing has no photo, its tile uses the category's tint with a line icon, so a photo-less grid still looks intentional:

Food `#E6D8C4` · Fitness `#D5DAE3` · Arts `#E7CDBD` · Music `#D9D3E3` · Language `#D3E0D6` · Other `#E4DED2`. Icon ink is the same hue at roughly 45% lightness.

---

## 3. Typography

One type system across both lanes (unchanged):

- **Display:** Bricolage Grotesque, 600/700, tight tracking (`-0.02em`). Headlines, listing titles, section titles.
- **Body / UI:** Manrope, 400 to 700. Everything else.
- **Utility:** Space Mono, 700. **Decision (closes the August open item): keep it**, but only for prices, dates and times on chips, step numbers and small uppercase eyebrows/category tags. Never for sentences.

### Scale
| Role | Size | Notes |
|---|---|---|
| Hero | `clamp(36px, 6vw, 60px)`, 700, line-height 1.04 | Left-aligned |
| Page title | `clamp(28px, 4vw, 40px)`, 700 | Listing title, dashboard titles |
| Section title | `clamp(20px, 2.4vw, 26px)`, 700 | With optional eyebrow above |
| Card title | 15 to 16px, 600, 2-line clamp | |
| Body | 16px / 1.6 | 15px inside dense cards |
| Small | 14px | Meta lines |
| Caption | 12 to 13px | Never below 12px |
| Eyebrow | 11px mono, 700, uppercase, `0.08em`, coral-ink | |

Fonts load from Google Fonts via `<link>` with `preconnect` in `index.html`, not a CSS `@import`, so text paints sooner.

---

## 4. Space, shape and depth

- **Spacing:** 4px base. Use 4, 8, 12, 16, 20, 24, 32, 48, 64, 96.
- **Page width:** `--page-max: 1240px`. Gutters 16px on phones, 24px from 768px, 32px from 1024px. Prose (listing description, policies) caps at about 680px.
- **Section rhythm:** 40px between home sections on phones, 64px on desktop.
- **Radii:** `--radius-sm` 8px (chips inside cards), `--radius` 12px (buttons, inputs), `--radius-lg` 16px (cards, photos), `--radius-xl` 24px (bands, hero art), pills 999px.
- **Elevation:** three shadows, all navy-tinted, never grey-black. `--shadow-sm` for resting cards, `--shadow-md` for the booking card and menus, `--shadow-lg` for the sticky mobile bar and dialogs.
- **Touch targets:** 44px minimum, 48px for primary actions.

---

## 5. Logo and wordmark

- **Mark:** the two high-fiving characters (`/trykai.png`), navy and coral. It carries the "neighbour" warmth on its own and now appears large in the desktop hero as well as in the nav.
- **Wordmark:** "TryKai" in Bricolage Grotesque 700 beside the mark. On scroll the wordmark hides and the bar shrinks (unchanged).
- **Open:** a vector version of the mark and a final lettered wordmark. The PNG is fine until then.

---

## 6. Messaging

- **Hero headline (decided):** *"Singapore's not boring. You just haven't found your thing yet."*
- **Subhead (decided):** *"Solo, with friends, or on a date — something better than scrolling for the tenth time."*
- **Trust line under the hero:** three facts that are true in the product today: *ID-verified hosts* (hosts must pass verification before they can list), *Exact address after booking* (the address is revealed only to confirmed guests), *Pay by PayNow or card*. Do not add a claim here unless the code enforces it.
- **No "Become a host" in the hero** (unchanged). Supply is recruited lower down: a quiet "Teach what you love" band at the end of Home and a footer link, both pointing at the host entry (`hostEntry()`), plus the post-session email nudge (still KIV).
- "Skip the course. Just learn the basics." stays banked for Lane 2.

---

## 7. Photography

- **Real, but as good as the host can make it:** natural light, no clutter, accurate to the session. No professional staging.
- **Guidance at creation time:** the create and edit listing forms show a short photo tip panel beside the upload ("shoot by a window, show hands mid-activity, lead with the finished thing"). No invented conversion stats in the copy.
- **No photo:** category tint tile with the category's line icon (section 2).

---

## 8. Components

All in plain CSS in `src/index.css` (no Tailwind), previewable at `/style-guide`.

- **Buttons.** One visual system. `.ui-button` and the older `.btn` classes now share the same look: 12px radius, 44px minimum (48px for `--lg`/booking CTAs), 600 weight. Primary is navy on cream text; secondary is outlined with `--border-strong`; destructive is error-tinted. Press state scales to 0.98.
- **Chips.** 36px pill, outlined; active is navy filled. Used for quick filters and session tags.
- **Category bar.** A horizontal, swipeable row of icon-over-label tabs (Airbnb pattern), not a wrap of pills. Active tab: navy label plus a 2px navy underline. Icons are inline line SVGs in `src/components/CategoryIcon.jsx` so every category, including Language and Other, has one. The illustrated category PNGs are kept for marketing and the style guide; they do not fit a 24px tab.
- **Browse card.** Square photo, 16px radius, slight zoom on hover. Overlaid on the photo: the category tag (top left, mono on cream) and the host's avatar or initials (bottom left, ringed in cream). Below: title (2 lines), a meta line of *area* and *next date*, then the all-in price (mono) and, only if reviews exist, `★ 4.8 (12)`. A listing with no reviews shows a coral-ink "New" label instead of an empty star.
- **Skeletons.** Loading states use shimmering placeholder cards in the real layout, with the old status text kept for screen readers.
- **Empty states.** An icon, a one-line title, a sentence and an action, centred in a dashed `--border-strong` panel.
- **Section header.** Optional coral eyebrow, display title, optional muted description, optional "See all" link at the right.
- **Top nav.** Unchanged pattern (hamburger left, centred mark and wordmark, Log in or avatar right, shrinks on scroll), now with a translucent cream background and backdrop blur, and "Log in" rendered as an outlined pill. Top nav, not bottom nav, until TryKai is a native app.
- **Hamburger menu.** Unchanged items and stagger; rows gain 52px height and a hover tint.
- **Footer.** A deep-navy band: mark and tagline, three link columns (Explore, Hosting, Policies), then UEN and the DPO email. Cream text, coral dot in the wordmark.

---

## 9. Pages

### Home
1. **Hero**, left-aligned on every width. Headline, subhead, the three-item trust line, and a "Browse sessions" button that jumps to the grid. From 1024px the mascot sits on the right in a cream-on-sand panel.
2. **Category bar** directly above the grid, swipeable sideways, scrolls away with the page.
3. **Filter row:** quick chips that are computed from real data ("This weekend", "Under $30") plus the region select. Chips only appear when at least one listing would match.
4. **Grid** of browse cards, 2 / 3 / 4 columns at phone / 768px / 1024px. Sort is unchanged (soonest upcoming session day, then more sessions).
5. **How TryKai works:** a deep-navy band with three numbered steps (pick, book a verified host, show up).
6. **Teach what you love:** a quiet bordered band pointing to the host entry.

No photo banner and no persistent search bar for launch (unchanged): with tens of listings, the category bar and chips find things faster than a search box.

### Listing detail
- Gallery unchanged (swipe with dots on phones, mosaic capped at `clamp(320px, 34vw, 440px)` from 1024px).
- Under the title: area and rating as a meta row with icons.
- **Host card** high on the page at every width: avatar, "Hosted by", rating, an "ID verified" badge, bio preview.
- **What's provided** as a checklist with coral checks.
- **Where you'll be:** the area and the line "The exact address is shared after you book" (or the real address once booked).
- Reviews last.
- From 1024px the booking card is sticky on the right. **On phones a bottom bar** pins the all-in price and the PayNow saving next to a "Choose a date" button that scrolls to the calendar. It hides while checkout is open.
- Calendar unchanged (month grid, counts per day, times for the chosen day).

### Checkout (inside the booking card)
Session summary at the top, then guests (44px round stepper buttons), then PayNow and Card as radio-style cards with the saving shown, then the Stripe element. The agreement line sits directly above the pay button.

### Hosting, bookings, profile, settings, auth
Same tokens and components: raised white cards with `--shadow-sm`, display titles, tabs with a navy underline, consistent banners. Inline `style={{…}}` in pages is not allowed; add a class instead.

### Create and edit listing
One form (not split into steps for now), grouped into titled sections — *The basics*, *Price and time*, *Location*, *Photos*, *What's provided* — with the photo tip panel in the Photos section.

---

## 10. Motion

- Hover: cards lift the photo by scaling it to 1.03 over 250 ms; buttons darken over 150 ms.
- Press: buttons scale to 0.98.
- Menus and the hamburger slide and fade over 280 to 320 ms (unchanged).
- Skeleton shimmer 1.4 s linear.
- Under `prefers-reduced-motion: reduce` all of the above are off.

---

## 11. Accessibility

- Text meets WCAG AA: 4.5:1 for body, 3:1 for 24px and larger. Coral text always uses `--coral-ink`.
- Every interactive element is a real `<button>`, `<a>` or form control, with a visible `:focus-visible` ring (2px navy, 2px offset).
- Icon-only buttons carry `aria-label`; decorative SVGs carry `aria-hidden="true"`.
- Status that changes without navigation (loading, errors, guest count) is announced.

---

## 12. Open items

- Vector logo mark and final lettered wordmark.
- Lane 2's own small wordmark or section-header treatment (optional, deferred), and its exact spacing and density values.
- A "Good for two" listing attribute, so Home can show a real "Date ideas" row (the canvas design depends on data we do not store yet).
- A real map tile on listing detail once there is a privacy-safe approximate location.
- Compressing the illustrated category PNGs (about 50 KB each) if they move onto a page guests load.
- Test listings and screenshot-photo listings must be deactivated on production; they undo everything above.
