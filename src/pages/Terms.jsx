import { Link } from 'react-router-dom'

export default function Terms() {
  return (
    <div className="page page--narrow policy-page">
      <h1>Terms of Service</h1>
      <p className="policy-page__updated">Last updated: 7 October 2026</p>

      <p>
        These terms apply to everyone who uses TryKai. Part 1 applies to all
        users. Part 2 applies when you host. Part 3 applies when you book.
      </p>

      <h2>Part 1: Using TryKai</h2>

      <h3>1. Who we are</h3>
      <p>
        TryKai (UEN 53526159D) is a sole proprietorship registered in Singapore.
        We run trykai.sg, a marketplace that connects people who want to share a
        skill or experience (&quot;Hosts&quot;) with people who want to try it
        (&quot;Guests&quot;). You can reach us at{' '}
        <a href="mailto:hello@trykai.sg">hello@trykai.sg</a>.
      </p>

      <h3>2. What TryKai is, and what it is not</h3>
      <p>
        TryKai is a platform. We provide the technology that lets Hosts list
        sessions and Guests find, book and pay for them.
      </p>
      <ul>
        <li>We are not a party to the arrangement between a Host and a Guest.</li>
        <li>We do not employ, supervise or control any Host.</li>
        <li>
          We verify a Host&apos;s identity before they can list. We do not
          verify their skill, qualifications or competence.
        </li>
        <li>We do not inspect venues, equipment or materials.</li>
        <li>
          Each Host is responsible for the quality, safety and legality of their
          own session.
        </li>
      </ul>

      <h3>3. Age</h3>
      <p>
        You must be 18 or older to create an account, host or book. By creating
        an account you confirm that you are 18 or older. We may close any
        account we reasonably believe belongs to someone under 18.
      </p>

      <h3>4. Your account</h3>
      <ul>
        <li>Give accurate information and keep it up to date.</li>
        <li>
          Keep your login details private. You are responsible for activity on
          your account.
        </li>
        <li>One person, one account.</li>
        <li>
          Your display name, profile photo, verification badge, listings and the
          reviews you receive as a Host are public. Your full name, email and
          phone number are not.
        </li>
      </ul>

      <h3>5. Acceptable use</h3>
      <p>You agree not to:</p>
      <ul>
        <li>use TryKai for anything unlawful</li>
        <li>harass, threaten, defraud or discriminate against anyone</li>
        <li>impersonate anyone or try to get around identity verification</li>
        <li>
          arrange payment outside TryKai for a session you found on TryKai
        </li>
        <li>scrape, copy, reverse engineer or interfere with the platform</li>
        <li>
          post content that is unlawful, defamatory, obscene or infringes
          someone else&apos;s rights
        </li>
      </ul>

      <h3>6. Your content</h3>
      <p>
        You keep ownership of what you upload, such as photos and listing
        descriptions. You give TryKai a non-exclusive, royalty-free licence to
        display and share that content to run and promote the platform. We may
        remove content that breaks these terms or that we reasonably believe is
        harmful, misleading or unlawful.
      </p>

      <h3>7. Reviews</h3>
      <ul>
        <li>
          Only a Guest with a confirmed booking can review, and only after the
          session has ended.
        </li>
        <li>One review per booking.</li>
        <li>Reviews must be honest and based on your own experience.</li>
        <li>Do not offer or accept anything in exchange for a review.</li>
        <li>
          We do not pre-screen reviews, but we may remove reviews that are
          abusive, defamatory or fraudulent.
        </li>
      </ul>

      <h3>8. Suspension and closure</h3>
      <p>
        We may suspend or close an account for breaking these terms, fraud,
        repeated cancellations, or behaviour that puts other users at risk.
        Where practical, we will tell you why.
      </p>
      <p>
        To close your account, email{' '}
        <a href="mailto:hello@trykai.sg">hello@trykai.sg</a>. See our{' '}
        <Link to="/privacy">Privacy Policy</Link> for what we keep after closure
        and why.
      </p>

      <h3>9. Limitation of liability</h3>
      <p>To the maximum extent the law allows:</p>
      <ul>
        <li>
          TryKai&apos;s total liability to you for any claim is limited to the
          booking fee TryKai received for the booking the claim relates to.
        </li>
        <li>
          TryKai is not liable for indirect or consequential loss, or for
          injury, damage or loss arising from a session, a meeting between
          users, or content posted by another user.
        </li>
      </ul>
      <p>
        Nothing in these terms excludes or limits liability that cannot be
        excluded or limited under Singapore law.
      </p>

      <h3>10. Indemnity</h3>
      <p>
        You agree to compensate TryKai for any claim, loss or expense (including
        reasonable legal fees) that arises from your breach of these terms, your
        conduct during a session, or your breach of any law or anyone else&apos;s
        rights.
      </p>

      <h3>11. Disputes</h3>
      <p>
        A dispute about a session is between the Host and the Guest. We may help
        resolve it under our <Link to="/dispute-policy">Dispute Policy</Link>,
        but we are not obliged to decide it.
      </p>
      <p>
        If you have a dispute with TryKai, contact{' '}
        <a href="mailto:hello@trykai.sg">hello@trykai.sg</a> first. If we cannot
        resolve it, both sides agree to try mediation before going to court.
      </p>
      <p>
        These terms are governed by Singapore law, and Singapore courts have
        exclusive jurisdiction.
      </p>

      <h3>12. Changes</h3>
      <p>
        We may update these terms. We will tell you about material changes by
        email or on the site. Using TryKai after that means you accept the
        updated terms.
      </p>

      <h2>Part 2: Hosting</h2>
      <p>By creating a listing, you also accept this Part.</p>

      <h3>1. Your status</h3>
      <p>
        You are independent. You are not an employee, agent or contractor of
        TryKai. You decide how to run your session and you are responsible for
        its safety, legality and quality, including the venue, equipment and
        materials.
      </p>

      <h3>2. What you promise</h3>
      <p>By listing a session, you confirm that:</p>
      <ul>
        <li>
          your listing, including your skills and what guests will do, is
          accurate and not misleading
        </li>
        <li>your photos show the real experience</li>
        <li>
          you hold any licence, permit or insurance the law requires for your
          activity
        </li>
        <li>your venue is safe, lawful and suitable for the activity</li>
        <li>you will not discriminate against any Guest</li>
      </ul>

      <h3>3. Identity verification</h3>
      <p>
        You must verify your identity before you can list. Verification
        normally runs through Stripe Identity, which checks an ID document and a
        live selfie and tells us only the result. If that is not possible, you
        can submit documents for manual review instead. Verification confirms
        who you are. It does not certify your skill or character.
      </p>

      <h3>4. Fees</h3>
      <p>
        TryKai charges Hosts a fee of 10% of the lesson price on each confirmed
        booking, starting from your fourth confirmed booking. Your first three
        are free. Founding Hosts we have told in writing are exempt. We will
        give you reasonable notice before changing this.
      </p>

      <h3>5. Payouts</h3>
      <ul>
        <li>
          Payments are processed by Stripe. You must complete Stripe&apos;s
          payout setup before guests can book you.
        </li>
        <li>
          Your share (the lesson price, less any Host fee) is transferred to
          your Stripe account about 24 hours after your session&apos;s start
          time.
        </li>
        <li>
          We may hold a payout while we look into a dispute, a fraud concern or
          a breach of these terms.
        </li>
      </ul>

      <h3>6. Cancellations and strikes</h3>
      <p>
        If you cancel a session with bookings, every guest gets a full refund
        and you receive a strike. Three strikes deactivates your listings. Not
        showing up is treated more seriously. Full details are in our{' '}
        <Link to="/cancellation-policy">Cancellation Policy</Link>.
      </p>

      <h3>7. No payments outside TryKai</h3>
      <p>
        Do not ask for or accept payment outside TryKai from a Guest you met
        through TryKai for the same or a related session. This does not stop you
        and a Guest having a relationship unrelated to a TryKai booking.
      </p>

      <h3>8. Tax</h3>
      <p>
        Income you earn through TryKai may be taxable. You are responsible for
        your own tax, including declaring income to IRAS. We do not give tax
        advice.
      </p>

      <h3>9. Host indemnity</h3>
      <p>
        In addition to Part 1, you agree to compensate TryKai for any claim
        arising from injury, loss or damage suffered by a Guest or anyone else
        during or in connection with your session.
      </p>

      <h2>Part 3: Booking</h2>
      <p>You accept this Part when you book.</p>

      <h3>1. Booking and payment</h3>
      <ul>
        <li>A booking is confirmed once payment succeeds.</li>
        <li>
          The price you see includes TryKai&apos;s booking fee. It does not go
          up between browsing and paying. Paying by PayNow is cheaper than card.
        </li>
        <li>
          Some sessions offer a lower price per person for groups. The price for
          your group is shown before you pay.
        </li>
        <li>
          Payments are processed by Stripe. TryKai never sees or stores your
          full card details.
        </li>
      </ul>

      <h3>2. Cancellations and refunds</h3>
      <p>
        Refunds depend on how early you cancel. See our{' '}
        <Link to="/cancellation-policy">Cancellation Policy</Link> and{' '}
        <Link to="/refund-policy">Refund Policy</Link> before you book.
      </p>

      <h3>3. At the session</h3>
      <ul>
        <li>Turn up on time and treat the Host and other guests with respect.</li>
        <li>
          Sessions are run by independent Hosts, not by TryKai. We have
          verified the Host&apos;s identity, not their skill.
        </li>
        <li>
          You take part at your own risk. Use the same judgement you would when
          meeting anyone new or trying any new activity.
        </li>
      </ul>

      <h3>4. If something goes wrong</h3>
      <p>
        If a Host does not show up, misrepresents the session or behaves
        inappropriately, tell us at{' '}
        <a href="mailto:hello@trykai.sg">hello@trykai.sg</a> as soon as you can.
        We will review it and may issue refunds, strikes or suspensions.
      </p>
    </div>
  )
}
