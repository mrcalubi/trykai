import { Link } from 'react-router-dom'

export default function CancellationPolicy() {
  return (
    <div className="page page--narrow policy-page">
      <h1>Cancellation Policy</h1>
      <p className="policy-page__updated">Last updated: 29 July 2026</p>

      <p>
        This policy applies to single session bookings on TryKai. It is shown to
        guests before checkout and to hosts before a listing goes live, so there
        are no surprises on either side.
      </p>

      <h2>If you are a guest</h2>
      <p>
        Refunds are calculated based on how far in advance you cancel, measured
        from the moment you cancel to the session&apos;s start time, in
        Singapore time.
      </p>
      <ul>
        <li>
          <strong>48 hours or more before the session starts:</strong> full
          refund, including the platform fee.
        </li>
        <li>
          <strong>Between 24 and 48 hours before the session starts:</strong>{' '}
          50% of the lesson fee refunded. The platform fee is not refunded in
          this case.
        </li>
        <li>
          <strong>Between 6 and 24 hours before the session starts:</strong> 25%
          of the lesson fee refunded. The platform fee is not refunded in this
          case.
        </li>
        <li>
          <strong>
            Less than 6 hours before the session starts, or a no show:
          </strong>{' '}
          no refund. This applies the same whether you cancel at the last minute
          or simply do not turn up.
        </li>
      </ul>
      <p>
        Cancel anytime from your Dashboard. The refund amount is calculated
        automatically and shown to you before you confirm.
      </p>

      <h3>Rescheduling instead of cancelling</h3>
      <p>
        If your plans change, you can reschedule your booking to a different
        available session with the same host instead of cancelling outright, as
        long as you do this 48 hours or more before your original session
        starts. Each booking can be rescheduled once. If you need to cancel or
        reschedule again after that, the standard cancellation terms above
        apply.
      </p>

      <h2>If you are a host</h2>
      <p>
        You can cancel a confirmed session at any time, but every guest booked
        into that session receives a full refund, including the platform fee,
        regardless of how close to the session it is.
      </p>
      <p>
        Cancelling adds a strike to your host account. After 3 strikes, your
        listings are automatically deactivated.
      </p>

      <h3>If you do not show up</h3>
      <p>
        A host who does not show up for a confirmed session is treated far more
        seriously than a standard cancellation. Guests trust that a real person
        will be there, and a no show breaks that trust directly.
      </p>
      <ul>
        <li>
          The affected guest receives a full refund, including the platform fee.
        </li>
        <li>
          TryKai may also offer the guest fair compensation at our discretion,
          reviewed and handled on a case by case basis.
        </li>
        <li>
          The host receives 2 strikes immediately, and the account is reviewed
          and may be suspended.
        </li>
      </ul>

      <h3>Appealing a strike</h3>
      <p>
        If your cancellation or no show was caused by something genuinely
        outside your control (for example a sudden emergency, illness, or an
        unexpected venue issue), you can submit an appeal within 7 days of the
        cancellation, with a short explanation of what happened. We review
        appeals manually. If an appeal is successful, the strike is removed from
        your account. Appeals only affect whether a host keeps a strike. They do
        not affect the guest&apos;s refund, which is unaffected either way.
      </p>
      <p>
        We recommend flagging any known risk in your listing description ahead
        of time (for example, sessions that depend on outdoor conditions), so
        guests know what to expect before booking.
      </p>

      <h2>Accountability for guests</h2>
      <p>
        TryKai reserves the right to restrict a guest&apos;s ability to book
        future sessions if they have a pattern of repeated late cancellations or
        no shows.
      </p>

      <h2>Exceptions</h2>
      <p>
        TryKai may, at our discretion, make exceptions to this policy for
        genuine emergencies. We look at these on a case by case basis and cannot
        guarantee a specific outcome, but we will always try to be fair.
      </p>

      <h2>If TryKai cancels a booking</h2>
      <p>
        In rare cases, TryKai may cancel a booking directly, for example due to
        a safety concern, a suspected policy violation, or suspected fraud. If
        this happens, the guest receives a full refund, including the platform
        fee, and we will follow up directly by email to explain the situation.
      </p>

      <h2>How refunds are issued</h2>
      <p>
        Once a cancellation is confirmed, the refund is processed back to your
        original payment method. See our{' '}
        <Link to="/refund-policy">Refund Policy</Link> for timing.
      </p>

      <h2>Questions or disputes</h2>
      <p>
        If you believe a cancellation was handled incorrectly, see our{' '}
        <Link to="/dispute-policy">Dispute Policy</Link> or contact us at{' '}
        <a href="mailto:hello@trykai.sg">hello@trykai.sg</a>.
      </p>
    </div>
  )
}
