/**
 * Prints the coverage totals as Markdown so CI can append them to the job
 * summary. Exits quietly if no coverage report exists, so it never masks the
 * real reason a test job failed.
 */
import { readFileSync } from 'node:fs'

const REPORT = 'coverage/coverage-summary.json'
const METRICS = ['statements', 'branches', 'functions', 'lines']

let total
try {
  total = JSON.parse(readFileSync(REPORT, 'utf8')).total
} catch {
  console.log(`No coverage report found at \`${REPORT}\`.`)
  process.exit(0)
}

const lines = [
  '## Coverage',
  '',
  '| Metric | Percent | Covered |',
  '| --- | --- | --- |',
  ...METRICS.map((metric) => {
    const { pct, covered, total: count } = total[metric]
    return `| ${metric} | ${pct}% | ${covered}/${count} |`
  }),
]

console.log(lines.join('\n'))
