import { reportMailto } from '../lib/reportMailto'

export default function ReportLink({ subject, itemId }) {
  const url = typeof window === 'undefined' ? '' : window.location.href
  return (
    <a className="report-link" href={reportMailto({ subject, url, id: itemId })}>
      Report
    </a>
  )
}
