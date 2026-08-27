import { Link } from 'react-router-dom'

export default function RefundPolicy() {
  return (
    <div className="page page--narrow policy-page">
      <h1>Refund Policy</h1>
      <p className="policy-page__updated">Last updated: 27 August 2026</p>

      <h2>How refunds work</h2>
      <p>
        Refund eligibility is set by our{' '}
        <Link to="/cancellation-policy">Cancellation Policy</Link>. This page
        covers how and when you actually get your money back once a refund has
        been approved.
      </p>
      <p>
        Refunds are issued to your original payment method through Stripe, our
        payment processor. You never need to do anything to receive a refund
        once a cancellation is confirmed, it happens automatically and the
        amount is shown to you immediately in your cancellation confirmation
        email.
      </p>

      <h2>Processing time</h2>
      <p>Processing time depends on how you originally paid:</p>
      <ul>
        <li>
          <strong>Card:</strong> 3 to 5 business days
        </li>
        <li>
          <strong>PayNow:</strong> usually reflects within a few hours, and no
          more than 1 business day
        </li>
      </ul>
      <p>
        Business days refer to Singapore business days, and exclude weekends and
        Singapore public holidays.
      </p>

      <h2>No extra fees</h2>
      <p>
        You are never charged any additional fee to receive a refund. The amount
        you get back matches exactly what our Cancellation Policy specifies for
        your situation.
      </p>

      <h2>Failed or declined payments</h2>
      <p>
        If a payment fails or is declined at checkout, no booking is confirmed
        and no charge is kept. There is nothing to refund because the
        transaction never completed.
      </p>

      <h2>If you have a complaint about the session itself</h2>
      <p>
        This policy covers refunds tied to cancellations. If your concern is
        about the quality of a session you actually attended (for example, the
        host was very late, or the session did not match the listing), that is
        handled as a dispute rather than a cancellation refund. You can raise
        this within 7 days of your session through our{' '}
        <Link to="/dispute-policy">Dispute Policy</Link>.
      </p>
      <p>
        If your concern involves your safety or someone else&apos;s safety,
        there is no time limit on raising it, and you should contact us
        immediately. If you are in immediate danger, please contact the police
        first, then let us know.
      </p>

      <h2>Questions</h2>
      <p>
        If a refund has not arrived within the window above, or looks incorrect,
        contact us at{' '}
        <a href="mailto:hello@trykai.sg">hello@trykai.sg</a> with your
        booking reference.
      </p>
    </div>
  )
}
