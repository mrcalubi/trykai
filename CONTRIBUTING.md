# Contributing

## Branches

Two long-lived branches:

- **`staging`** — integration branch. Everything new lands here first.
- **`main`** — production, customer facing. Only ever updated by a pull request from `staging`.

Day to day:

```bash
git switch staging
git pull
git switch -c feat/session-reminders   # your work happens here

# ...commit as you go...

git push -u origin feat/session-reminders
gh pr create --base staging
```

Once the change has been exercised on staging, promote it:

```bash
gh pr create --base main --head staging --title "Release: session reminders"
```

Nothing is pushed directly to `main` or `staging`. Both are protected, and both
require CI to pass.

### Creating `staging`

One-time setup, branching from the current production code:

```bash
git switch main
git pull
git switch -c staging
git push -u origin staging
```

## CI

`.github/workflows/ci.yml` runs on every pull request into `staging` or `main`,
and again on every push to those branches after a merge. Five jobs run in
parallel:

| Job | What it checks |
| --- | --- |
| Lint | ESLint across the whole repo |
| Unit and component tests | The Vitest suite with coverage thresholds enforced |
| Production build | `vite build` succeeds |
| End-to-end tests | Playwright against a production build, desktop and phone viewports |
| Edge function checks | Deno type-check of `_shared/{booking,http,connect,email,payouts,verification}.ts`. Handler type-check is advisory (`continue-on-error`). |

A sixth job, **CI passed**, waits on the other five and fails if any of them did.
That is the single check to require in branch protection, so adding or renaming a
job later does not mean editing the protection rules.

Run the same checks locally before opening a PR:

```bash
npm run verify   # lint + tests with coverage + build
npm run test:e2e
```

See [TESTING.md](./TESTING.md) for how the suite is organised and how to add to it.

## Branch protection

Protect both branches so a PR cannot merge until **CI passed** is green. In the
GitHub UI: **Settings → Branches → Add branch ruleset**, targeting `main` and
`staging`, with:

- Require a pull request before merging
- Require status checks to pass → **CI passed**
- Require branches to be up to date before merging
- Block force pushes

Or from the CLI, per branch:

```bash
for BRANCH in main staging; do
  gh api --method PUT "repos/mrcalubi/trykai/branches/$BRANCH/protection" \
    --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["CI passed"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
done
```

Set `"required_pull_request_reviews"` once there is more than one person on the
repo; requiring your own approval on a solo project only blocks you.

> The **CI passed** check will not appear in GitHub's status check picker until
> the workflow has run at least once. Open a throwaway PR into `staging` first,
> then add the rule.

## Environments

`.env.example` lists the variables the app reads. Copy it to `.env` for local
work. Vercel holds its own copies:

- Production deployments build from `main`.
- Preview deployments build from every other branch, including `staging`.

Point the two at different Supabase projects so staging traffic never touches
customer data.
