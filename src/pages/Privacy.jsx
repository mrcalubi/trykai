export default function Privacy() {
  return (
    <div className="page page--narrow policy-page">
      <h1>Privacy Policy</h1>
      <p className="policy-page__updated">Last updated: 7 October 2026</p>

      <p>
        This policy explains how TryKai collects, uses, shares and protects your
        personal data, in line with Singapore&apos;s Personal Data Protection
        Act 2012 (PDPA).
      </p>

      <h2>1. Who we are</h2>
      <p>
        TryKai (UEN 53526159D) is a sole proprietorship registered in Singapore,
        operating trykai.sg.
      </p>
      <p>
        <strong>Data Protection Officer:</strong> Caleb Ong,{' '}
        <a href="mailto:privacy@trykai.sg">privacy@trykai.sg</a>
      </p>
      <p>
        Contact our Data Protection Officer for any question about your data or
        to exercise your rights below.
      </p>

      <h2>2. What we collect</h2>
      <div className="policy-page__table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>When</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Name, display name, email, password</td>
              <td>Signup</td>
              <td>To create and run your account</td>
            </tr>
            <tr>
              <td>Profile photo</td>
              <td>If you add one</td>
              <td>Shown on your profile, listings and reviews</td>
            </tr>
            <tr>
              <td>Listing details, photos, general area, full address</td>
              <td>When you create a listing</td>
              <td>
                To show your listing. Your full address is only shared with
                guests who have a confirmed booking
              </td>
            </tr>
            <tr>
              <td>Booking and payment records</td>
              <td>When you book or are booked</td>
              <td>To process bookings, refunds and payouts</td>
            </tr>
            <tr>
              <td>Reviews</td>
              <td>When you leave one</td>
              <td>Shown publicly on the Host&apos;s listing and profile</td>
            </tr>
            <tr>
              <td>Identity verification result</td>
              <td>Before you host</td>
              <td>To confirm Hosts are real, identifiable people</td>
            </tr>
            <tr>
              <td>ID document and selfie (manual review only)</td>
              <td>
                Only if you use manual verification instead of Stripe Identity
              </td>
              <td>Same as above</td>
            </tr>
            <tr>
              <td>Basic usage data (pages viewed, device type)</td>
              <td>Automatically</td>
              <td>To keep the site working and improve it</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>We do not collect your full card details. Stripe handles them.</p>

      <h2>3. What is public</h2>
      <p>
        Your display name, profile photo, ID verified badge, listings and the
        reviews you receive as a Host are visible to anyone. Your full name,
        email, phone number and bookings are not public. A Host&apos;s full
        address is shown only to guests with a confirmed booking for that
        listing.
      </p>

      <h2>4. Identity verification</h2>
      <p>
        Most Hosts verify through <strong>Stripe Identity</strong>. Stripe
        checks your ID document and a live selfie and tells us only whether
        verification passed. TryKai does not receive or store those images.
      </p>
      <p>
        If you use <strong>manual verification</strong> instead, your ID and
        selfie are stored in private, access-restricted storage and reviewed
        only by TryKai. We use them only to confirm your identity.
      </p>
      <ul>
        <li>Images from a rejected attempt are deleted after 30 days.</li>
        <li>
          Images for an approved Host are kept while the account is active.
        </li>
      </ul>

      <h2>5. Who we share data with</h2>
      <p>We share personal data only with the service providers we need to run TryKai:</p>
      <ul>
        <li>
          <strong>Stripe:</strong> payments, Host payouts and identity
          verification
        </li>
        <li>
          <strong>Supabase:</strong> our database, file storage and logins
        </li>
        <li>
          <strong>Resend:</strong> sending our emails
        </li>
        <li>
          <strong>Vercel:</strong> hosting the website
        </li>
      </ul>
      <p>
        Some of these providers store data outside Singapore. We use providers
        who protect personal data to a standard comparable to the PDPA.
      </p>
      <p>
        We may also disclose personal data when required by law or a court
        order, or to protect someone&apos;s safety.
      </p>
      <p>
        <strong>We do not sell personal data.</strong>
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>
          <strong>While your account is active:</strong> we keep your data as
          long as we need it to run your account.
        </li>
        <li>
          <strong>After you close your account:</strong> your profile data is
          deleted within 6 months.
        </li>
        <li>
          <strong>Booking and payment records</strong> are kept for 5 years
          after the transaction, for tax, accounting and dispute purposes.
        </li>
        <li>
          <strong>Verification images:</strong> see section 4.
        </li>
      </ul>

      <h2>7. Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>show you the personal data we hold about you</li>
        <li>correct anything inaccurate</li>
        <li>
          withdraw consent for a particular use (this may stop you using parts
          of TryKai)
        </li>
        <li>close your account</li>
      </ul>
      <p>
        Email <a href="mailto:privacy@trykai.sg">privacy@trykai.sg</a>. We aim
        to respond within 30 days.
      </p>

      <h2>8. Security</h2>
      <p>
        We use access-restricted databases, encrypted connections and private
        storage to protect your data. No system is completely secure, so we
        cannot guarantee absolute security.
      </p>

      <h2>9. Data breaches</h2>
      <p>
        If a breach is likely to cause significant harm, we will notify the
        Personal Data Protection Commission and affected users as the PDPA
        requires.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update this policy. We will tell you about material changes by
        email or on the site.
      </p>
    </div>
  )
}
