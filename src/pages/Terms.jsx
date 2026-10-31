import { Link } from 'react-router-dom'
import HostTermsContent from '../components/HostTermsContent'

export default function Terms() {
  return (
    <div className="page page--narrow policy-page">
      <h1>Terms of Service</h1>
      <p className="policy-page__updated">Last updated: 31 October 2026</p>

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

      <HostTermsContent />

      <h2 id="part-3-booking">Part 3: Booking</h2>
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
        Refunds depend on how early you cancel. The booking fee (TryKai&apos;s
        platform fee, already included in the all-in price) is not refunded when
        you cancel. It covers payment processing and running TryKai. See our{' '}
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
