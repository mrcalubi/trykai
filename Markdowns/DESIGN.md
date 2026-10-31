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

- **Allowed:** the dot in the wordmark, section eyebrows, step numbers, checkmarks in lists, the active underline in the category bar, "New" and "spots left" labels (as `--coral-ink` on `--coral-soft`). Savings are green, not coral: the PayNow badge and the "PayNow saving" row use `--success`.
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
- **Trust line under the hero:** three chips: *ID-verified hosts* (hosts must pass verification before they can list), *Exact address after booking* (the address is revealed only to confirmed guests), *Most sessions under S$30* (typical guest-facing band, not a filter or CHECK). Do not add a claim here unless the code enforces it, except this typical-price line.
- **No "Become a host" in the hero** (unchanged). Supply is recruited lower down: a quiet "Teach what you love" band at the end of Home and a footer link, both pointing at the host entry (`hostEntry()`), plus the post-session email nudge (still KIV).
- "Skip the course. Just learn the basics." stays banked for Lane 2.

---

## 7. Photography

- **Real, but as good as the host can make it:** natural light, no clutter, accurate to the session. No professional staging.
- **Guidance at creation time:** create and edit show a panel titled "Five shots we'd start with", written as a friendly recommendation with no em dashes: what guests make, you teaching, your space, guests having a go (ask them first), a close-up of the little details, then a one-line daylight tip (`src/lib/photoTips.js`). Up to 8 photos (`MAX_PHOTOS`); View in each tile's menu and tapping the preview cover open the lightbox. Continue with 0 photos asks before skipping. Cover crop matches the browse card (4/3). No invented conversion stats.
- **No photo:** category tint tile with the category's line icon (section 2).

---

## 8. Components

All in plain CSS in `src/index.css` (no Tailwind), previewable at `/style-guide`.

- **Buttons.** One visual system. `.ui-button` and the older `.btn` classes now share the same look: 12px radius, 44px minimum (48px for `--lg`/booking CTAs), 600 weight. Primary is navy on cream text; secondary is outlined with `--border-strong`; destructive is error-tinted. Press state scales to 0.98. A `loading` prop stacks a CSS spinner and `loadingLabel` over the idle label so the width does not jump, sets `disabled` and `aria-busy`, and stays still under `prefers-reduced-motion`.
- **Page loader.** Full-page waits use a centred spinner that appears only after 400ms, so a fast load does not flash. `role="status"` and visually hidden "Loading…" stay in the tree from the first paint.
- **Waiting state.** Long waits (checkout, payouts, Singpass, create-listing publish) are a full card: title, an illustration slot (default three navy/coral dots in `LoadingMascot`, later the mascot), and copy that steps on with time — the first line at once, "Still working…" at 4s, then "This is taking longer than usual. Please keep this page open." at 12s. The official Singpass button artwork is never restyled; that wait sits below the button.
- **Skeletons.** Home browse loading still uses shimmering placeholder cards in the real layout, with the old status text kept for screen readers.
- **Chips.** 36px pill, outlined; active is navy filled. Used for quick filters and session tags.
- **Category bar.** A horizontal, swipeable row of icon-over-label tabs (Airbnb pattern), not a wrap of pills. Active tab: navy label plus a 2px navy underline. Icons are inline line SVGs in `src/components/CategoryIcon.jsx` so every category, including Language and Other, has one. The illustrated category PNGs are kept for marketing and the style guide; they do not fit a 24px tab.
- **Browse card.** Square photo, 16px radius, slight zoom on hover. Overlaid on the photo: the category tag (top left, mono on cream) and the host's avatar or initials (bottom left, ringed in cream). Below: title (2 lines), a meta line of *area* and *next date*, then the all-in price (mono) and, only if reviews exist, `★ 4.8 (12)`. A listing with no reviews shows a coral-ink "New" label instead of an empty star.
- **Empty states.** An icon, a one-line title, a sentence and an action, centred in a dashed `--border-strong` panel.
- **Section header.** Optional coral eyebrow, display title, optional muted description, optional "See all" link at the right.
- **Top nav.** Mark and wordmark on the left; on the right, "Log in" as an outlined pill (or the avatar, linking to your profile) followed by a round menu button. Translucent cream background with backdrop blur, aligned to the page width, shrinking on scroll as before. Top nav, not bottom nav, until TryKai is a native app.
- **Main menu (changed 18 October 2026).** A white card that drops down under the menu button, right-aligned to it (Airbnb pattern), replacing the full-height panel that slid in from the left. Rows have a line icon and are grouped by dividers; the host entry ("Become a host" or "Host a session") is a two-line row with the mascot; Log out sits last. Outside click, Escape, or choosing a row closes it. On phones a light scrim sits behind the card. Items are unchanged.
- **Footer.** A deep-navy band: mark and tagline, three link columns (Explore, Hosting, Policies), then UEN and the DPO email. Cream text, coral dot in the wordmark.

---

## 9. Pages

### Home
1. **Hero**, left-aligned on every width. Eyebrow, headline, subhead and the three-item trust line. No button: on a phone the grid starts just below, and a "Browse sessions" jump added height without doing anything scrolling does not (removed 20 October; that slot is kept for a future "For you" feed). From 1024px the mascot sits on the right in a cream-on-sand panel, centred vertically between the nav and the category divider and horizontally in its column; from 1280px the art is about 320px. The four category badges have a thin white rim and wobble when poked.
2. **Category bar** straight under the hero and directly above the grid, swipeable sideways, scrolls away with the page. No visible section heading (the "Coming up / Find something to try" pair was removed 21 October; the hero already says what the page is). The h2 stays for screen readers, and "3 of 12 listings" shows under the filters only while one is on.
3. **Filter row:** quick chips that are computed from real data ("This weekend", "Under $30") plus the region select and a searchable area combobox (neighbourhood aliases resolve to a planning area). Chips only appear when at least one listing would match. Every `<select>` uses the shared chevron in `index.css` (`appearance: none`, SVG 16px from the right).
4. **Grid** of browse cards, 2 / 3 / 4 columns at phone / 768px / 1024px. Sort is unchanged (soonest upcoming session day, then more sessions).
5. **How TryKai works:** a deep-navy band with three numbered steps (pick, book a verified host, show up).
6. **Teach what you love:** a quiet bordered band pointing to the host entry.

No photo banner and no persistent search bar for launch (unchanged): with tens of listings, the category bar and chips find things faster than a search box.

### Listing detail (built from the canvas "Listing · phone" mockup, 18 October 2026)
- **Phones and tablets:** the gallery runs edge to edge with the back and share buttons floating on the photo as small 32px cream circles (each keeps a 44px tap area), position dots and a "1 / 5" counter on the photo. From 1024px the mosaic is unchanged (capped at `clamp(320px, 34vw, 440px)`), with the buttons above it. There is no ⋮ menu on the photo: reporting lives only in the row at the end of the page.
- Category chip, title, then a facts row with icons: session length, "Up to N guests", area, and the listing's rating when it has reviews.
- **Host card** high on the page at every width: avatar, "Your host", name, "ID verified" (from `users.is_id_verified`), host rating, bio preview, "View <name>'s profile".
- About this experience, then What's provided as a checklist with coral checks.
- **Pick a date:** on phones the booking card sits here in the page flow, without card chrome: section title, the month calendar in its own card, the chosen day, and each time as a card with spots left (coral when two or fewer) and Book. From 1024px the same content is the sticky booking card on the right, with the all-in price on top.
- **Where you'll be:** one row instead of a map, since a map of a general area tells a guest nothing. Title is the area ("Bedok, Singapore"); the subline is "Exact address sent once your booking is confirmed."; one location icon. A confirmed guest instead sees the real address with an "Open in Google Maps" link, matching booking detail.
- Reviews last, with a dashed empty state; then "Report this listing". The 48-hour refund line lives on the booking card and in the footer, not as a second policy row here.
- **Phone bottom bar:** all-in price per person, the PayNow price in coral-ink, and "Choose a date". It slides away while the booking card is on screen and during checkout.

### Checkout ("Confirm and pay", from the canvas "Checkout · phone" mockup)
- **Phones and tablets:** a full-screen sheet with a back arrow (cancels and returns to the dates). **From 1024px:** the same content inside the booking card, which stops being sticky so the whole checkout scrolls with the page.
- Session summary card (photo, title, host and area, date and time in mono, "Change"), guests row with spots left and round 44px steppers plus the group-pricing line, "Pay with" PayNow and Card as radio cards (PayNow shows the sliding 5–2% saving and the struck-through card price), "Make it extra" add-ons when the listing has them, a price breakdown (guests all in, one row per add-on, PayNow saving in green, total, "Booking fee included"), three short promises we can stand behind (host ID check, address after booking, 48-hour full refund), and the agreement line.
- Choosing a method still creates the payment straight away (unchanged flow, so the server's price check runs before the guest pays). Stripe's payment form then appears with "Pay $X", pinned to the bottom of the screen on phones.

### Hosting, bookings, profile, settings, auth
Same tokens and components: raised white cards with `--shadow-sm`, display titles, tabs with a navy underline, consistent banners. Inline `style={{…}}` in pages is not allowed; add a class instead.

### Hosting dashboard (built from the canvas "Hosting dashboard · phone" mockup, 18 October 2026)
- Lives in the profile's Hosting tab (`/hosting` still redirects there). A "Hosting" title with a navy "New listing" button on top.
- **Get ready for guests:** a checklist card with "N of 4" in mono and a progress bar: ID verified, first listing created (names it), payouts set up (Set up / Continue opens Stripe), first session added (Add opens the session form on the first listing with no dates). Done steps get a green check; open steps get one outlined action. The card disappears once all four are done.
- **This month:** three stat tiles (Sessions, Guests booked, Earned) in mono, counted over the Singapore calendar month. Sessions counts every date still to come plus past dates that had guests (a past date nobody booked never ran and is left out), with a small note under it, "2 held · 5 to come", so the total ties to the dates the page lists. Earned is what the host takes home from paid bookings.
- **Upcoming bookings:** booked sessions with Cancel session, shown only when there are any.
- **Your listings:** a card per listing with thumbnail, a status badge ("Hidden: no sessions" in coral, or "Live" in green), title, "S$23 · 90 min · up to 4" in mono, and a ⋯ menu (View, Edit, Delete). Open dates are the rows under the card; booked dates live under Upcoming bookings. The footer counts both rather than naming a date that could sit in either place: "No dates yet" in coral-ink with a primary Add sessions, or "2 open dates · 1 booked" / "1 booked · no open dates" with a secondary Add sessions. A draft saved in the wizard on this device shows as a Draft card with "Step N of 5: <step>" and Continue, which reopens the wizard at that step with the draft restored; its menu discards it.
- **No photo tips here:** they live beside the photo upload on create and edit listing.
- **Phones:** everything stacks in the mockup's order. **From 1024px:** the checklist on the left with This month in a 400px column beside it, then the listings full width, one card per row so the session list under each has room. Without the checklist the page is one column and the stat tiles cap at 720px.

### Create listing (built from the canvas "New listing, step 3 · phone" mockup, 18 October 2026)
- **Five steps:** *The basics* (title, category as six icon tiles, description), *Add photos* (tips panel, a dashed upload tile, 4:3 previews with Cover top-left and × top-right; drag to reorder; tap a tile for Crop on every photo, Make cover and Remove, plus Undo crop on any cropped photo that still has its original), *Price and group size*, *Where it happens* (area and full address), *Final touches* (what's provided including custom chips; None clears and disables the rest; a preview of the browse card, cancellation policy, Host terms, Create listing). Every photo crops to the 4:3 card (`--listing-cover-aspect`). The dialog title is "Crop the cover" for photo 1 and "Crop this photo" otherwise.
- **Chrome:** close (to Hosting), "New listing" and "Save draft" on top; "Step N of 5" in mono with "Next: <step>" and five progress segments; Back and Continue (Create listing on the last step) at the bottom. Continue checks only the current step and shows a warm coral-ink hint under the missing field, never a red error box; Create listing re-checks every step.
- **Price step:** a large S$ price field, then a sand panel with two large figures side by side ("Guests pay $X per person", "You get $Y per person"), a divider, "Full session of N: $X" (N × lesson, no discount, before host fee — never a range), and one muted footnote (`10% host fee from your 4th booking.` or `Founding host: no host fee, ever.`). An ⓘ opens a small popover with the group discount tiers, what one group of N pays together, and the after-fee amount for non-founding hosts. Under "Offer group discounts", one live muted line: "Group discounts come off your price, e.g. a group of N together pays you $Y instead of $X." Hidden when the checkbox is off. When founding-host status cannot be read, "You get" and the footnote hide; the full-session line still shows. Same `ListingPricePanel` on Edit listing. Must fit at phone width. Group size is a round stepper (1 to 50, default 4), session length is four chips (1 hr, 1.5 hr, 2 hr, Other with a minutes field), and group discounts are a checkbox card. **Add-ons · optional** (canvas "Add-ons, host setup") sits under that: a "N of 3" counter, a pitch card with the mascot, idea chips (including occasion chips that default to per booking), up to three cards (88px photo tile, name, You get, Charged, short description, live "You get S$15 · guests pay S$17" pill, optional session limit, Remove), a green earnings line from the first add-on, and "Group discounts come off your session price only, never add-ons." Hidden when `listing_addons` is not in the schema yet. Same editor on Edit listing.
- **Drafts:** "Save draft" keeps the text answers in this browser (not photos); next time the first step offers Restore draft or Discard. Publishing clears it.
- **Phones and tablets:** a full-screen flow over the site nav, with Back and Continue pinned to the bottom. **From 1024px:** the steps sit in a white card (max 640px) with a sticky "How guests will see it" preview of the browse card beside it, updating as the host types.

### Edit listing
Still one form, grouped into titled sections — *The basics*, *Price and time*, *Location*, *Photos*, *What's provided* — with the photo tip panel in the Photos section. Hosts editing want every field at once. Add-ons sit in Price and time, same `ListingAddonsEditor` as the create-listing price step.
- **Save errors** (edit and create): never show database wording. A price the database refuses puts the price hint back under the field with "Check the price above." by the button (create returns to the price step); anything else from the database reads "We couldn't save your listing. Check the details and try again."

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
- Compressing the illustrated category PNGs (about 50 KB each) if they move onto a page guests load.
- Test listings and screenshot-photo listings must be deactivated on production; they undo everything above.
