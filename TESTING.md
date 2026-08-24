# Testing

The suite is designed to run anywhere with no backend: `git clone`, `npm ci`, `npm test`.
No Supabase project, no Stripe account, no seed data, no cleanup.

## Commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs the unit, component and page suites once |
| `npm run test:watch` | Same suite in watch mode while you work |
| `npm run test:coverage` | Adds coverage and enforces the thresholds CI enforces |
| `npm run test:e2e` | Runs the browser suite against a production build |
| `npm run test:e2e:ui` | Opens the Playwright UI for debugging a browser test |
| `npm run verify` | `lint` + `test:coverage` + `build` — what to run before opening a PR |

The browser suite needs Chromium once: `npx playwright install chromium`.

## Layers

**Unit** — `src/lib/*.test.js`, `supabase/functions/_shared/*.test.ts`

Pure functions, no DOM, no mocks. This is where the money rules live: refund
tiers, the platform fee, and guest-count validation. These are the tests to reach
for first when changing anything that decides an amount.

**Component** — `src/components/*.test.jsx`

Each component rendered through React Testing Library and driven the way a user
would drive it. Assertions go through accessible roles and labels rather than CSS
classes, so they survive restyling but catch a broken label or a lost button.

**Page** — `src/pages/*.test.jsx`, `src/App.test.jsx`

Whole pages against a mocked Supabase client, covering the flows that matter:
signup writing a profile row, the host verification gate, booking, cancellation
refunds, host strikes, and the review rules. `App.test.jsx` drives the real
router so a mis-wired route fails here rather than in production.

**End-to-end** — `e2e/*.spec.js`

The real production bundle in a real browser, with every outbound request stubbed
inside the page. Covers browsing, filtering, opening a listing, the signed-out
booking redirect, deep-linking to a policy page, and a console-error check on the
home page. Runs at a desktop and a phone viewport.

## Writing a page test

Tests reach the Supabase client through a manual mock at
`src/lib/__mocks__/supabase.js`, so a test only declares what the database should
return and then asserts on what was written.

```jsx
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase')

beforeEach(() => {
  supabase.__reset()
})

it('cancels the booking', async () => {
  supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null })
  supabase.__on('bookings', 'select', { data: [booking], error: null })

  // ...drive the UI...

  expect(supabase.__lastCall('bookings', 'update').payload).toMatchObject({
    status: 'cancelled',
  })
})
```

The helpers on the mock:

| Helper | Purpose |
| --- | --- |
| `__on(table, operation, result)` | Answer every matching query with `result`, which can be an object or a function of the call |
| `__once(table, operation, result)` | Answer the next matching query only, for sequences |
| `__calls(table, operation)` | Every matching query, each with its `payload` and `filters` |
| `__lastCall(table, operation)` | The most recent matching query |
| `__bucket(name)` | The storage bucket mock, for asserting on uploads |
| `__reset()` | Clears handlers, recorded calls and auth stubs |

A handler receives the call, so one table queried two ways can branch on it —
useful because several pages read a table as a list and as a single row:

```js
supabase.__on('sessions', 'select', (call) =>
  call.single ? { data: { spots_remaining: 2 } } : { data: sessions }
)
```

Fixtures live in `src/test/fixtures.js` and take overrides, so a test states only
the fields it cares about. `renderWithRouter` in `src/test/render.jsx` mounts a
page inside a router and returns `currentPath()`, `currentSearch()` and
`currentState()` for asserting on navigation.

### Form validation

Several forms guard in JavaScript behind fields the browser also validates. Where
a test needs to reach the JavaScript guard it submits the form directly with
`fireEvent.submit(form)`, which is what a crafted request would do anyway.

## Coverage

Thresholds are enforced in `vitest.config.js` and CI fails below them.

| Scope | Lines | Branches |
| --- | --- | --- |
| Whole project | 92% | 87% |
| `src/lib/cancellationPolicy.js` | 100% | 100% |
| `supabase/functions/_shared/booking.ts` | 100% | 100% |

The two per-file rules are the point of the exercise: the code that decides how
much money moves stays fully covered. Raise the global numbers as coverage
improves; do not lower them to make a PR pass.

## The refund tiers

`GUEST_REFUND_TIERS` in `src/lib/cancellationPolicy.js` is the published
Cancellation Policy expressed in code, ordered widest window first:

| Cancelled | Refund |
| --- | --- |
| 48h or more before | Everything, platform fee included |
| 24–48h before | 50% of the lesson fee |
| 6–24h before | 25% of the lesson fee |
| Under 6h before, or a no-show | Nothing |

A guest pays `total_amount` and the platform fee is carved out of it rather than
added on top, so the *lesson fee* is `total_amount - platform_fee`. Changing what a
guest is refunded means changing three things together: this table, the prose on
`src/pages/CancellationPolicy.jsx`, and the tests. `cancellationPolicy.test.js`
asserts that the tier table, the summary rows rendered in the UI, and the
arithmetic all agree, so moving one without the others fails CI.

## Known gaps

Things the suite deliberately does not cover yet, so they are visible rather than
assumed:

- **No payment webhook exists.** Nothing moves a booking from `pending` to
  `confirmed` on payment success except `release-payout` running 24 hours later,
  so there is no webhook handler to test.
- **`spots_remaining` is never decremented when a booking is made.** Cancellation
  adds spots back, which means a cancelled booking can inflate a session beyond
  `spots_total`. Tests cover the code as written.
- **No refund is actually issued.** Cancelling records a `refund_amount` but calls
  no payment provider.
- **`full_address` is never revealed to a confirmed guest**, despite the form
  telling hosts it will be.
- **No signed-in end-to-end journey.** The browser suite covers signed-out
  journeys only; authenticated flows are covered at the page level instead.
- **Edge function handlers are not executed in tests.** Their business rules were
  extracted to `supabase/functions/_shared/booking.ts` and are fully covered
  there; the request plumbing around them is only type-checked.

## Adding another browser

Both Playwright projects run on Chromium so CI downloads one browser. To add
WebKit or Firefox, add a project in `playwright.config.js` and add the browser to
the install step in `.github/workflows/ci.yml`:

```js
{ name: 'webkit', use: { ...devices['Desktop Safari'] } }
```

```yaml
run: npx playwright install --with-deps chromium webkit
```
