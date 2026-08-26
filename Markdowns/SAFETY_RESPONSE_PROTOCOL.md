# TryKai: Safety Response Protocol

*Internal process. Not public. Written 23 August 2026. Owner: Caleb.*

This is the process behind the public commitment in the Dispute Policy: that a credible safety report can trigger immediate suspension, independent of the strike system. That promise is published. This document is how it is actually kept. Until the admin suspension tool exists, suspension is done by hand in the Supabase Table Editor, and this protocol assumes that.

The guiding principle is simple. When a report involves someone's physical safety, act first and investigate second. A wrongly suspended host is an inconvenience that can be reversed. A guest harmed after a warning sign was ignored is not.

---

## What counts as a safety report

A safety report is any report alleging harm or risk of harm to a person, as distinct from a complaint about the quality of a session. Treat as a safety report anything involving: physical harm or the threat of it, sexual misconduct or harassment, being made to feel unsafe during or after a session, a session held somewhere that felt unsafe, or behaviour that suggests a person could be harmed at a future session.

If you are unsure whether something is a safety report or a quality complaint, treat it as a safety report. The cost of over classifying is a few hours of review. The cost of under classifying is the thing this protocol exists to prevent.

There is no time limit on a safety report. One can arrive weeks after a session and is handled the same way.

---

## The immediate response, within a few hours of receiving it

Do these in order, the moment a credible safety report comes in. Credible means specific and plausible, not proven. You are not judging guilt at this stage, you are removing risk while you look.

1. **Suspend the reported account.** In the Supabase Table Editor, on the users table, set `is_suspended` to true, `suspended_at` to the current time, and `suspension_reason` to a short note. This deactivates their listings and blocks new bookings. Do this before replying to anyone.

2. **Cancel that account's upcoming sessions and refund every affected guest in full.** No guest should attend a session with a host under active safety review. Each affected guest gets a full refund including the platform fee, regardless of timing, the same as a host cancellation.

3. **Acknowledge the reporter.** A short reply: you have received it, you are taking it seriously, you have already acted. If they are describing immediate danger, tell them to contact the police first, and that you can follow up once they are safe. Do not promise a specific outcome against the other person.

4. **Preserve everything.** Save the report, any messages, booking records, and the reported account's details before anything is edited or deleted. If this ever involves the police, this is the record.

---

## The review, within a few days

Once the immediate risk is contained, review properly.

- Read the report against the account's history: past reviews, prior reports, anything flagged before.
- Contact the reported person for their account, unless doing so could put the reporter at further risk. If it could, do not, and weight the review toward the reporter's safety.
- Decide on the balance of what is credible, not on proof beyond doubt. This is a safety decision, not a criminal trial.

Three outcomes:

- **Upheld or serious.** The account is permanently removed. This can happen without three strikes ever accumulating. Severe safety violations mean permanent removal, full stop.
- **Unclear but concerning.** Keep the suspension in place while you gather more, or lift the suspension but record the report so a second one is read in context. Use judgement, and lean toward caution.
- **Not supported.** Lift the suspension, restore the account, and tell the person plainly. An honest, quick reinstatement is the cost of acting fast, and it is a cost worth paying.

---

## When to involve the police

TryKai is not an investigator and cannot resolve a crime. Where a report describes a possible crime, a serious injury, or an ongoing threat, encourage the reporter to contact the police directly, and cooperate with any police request. Where a threat looks serious and ongoing, TryKai may report it proactively even without being asked. This is stated in the public Dispute Policy and this protocol keeps it real.

---

## Records and follow through

- Every safety report and its outcome is logged, kept for at least five years given it is safety and payments adjacent.
- A suspension is always reversible and always timestamped, so an account wrongly suspended can be cleanly restored.
- If the same reviewer keeps seeing reports cluster around one category of session, that is a supply quality signal worth acting on before the next report arrives.

---

## What this depends on, and the current gap

This protocol assumes suspension is done by hand in the Table Editor, which works today. Two things make it more reliable and are on the build list, not blockers to running the protocol now:

- The suspension fields (`is_suspended`, `suspended_at`, `suspension_reason`) exist on the users table as of 22 August, but nothing in the app yet enforces them, meaning a suspended account's listings need to be confirmed as actually hidden. Until the app enforces suspension, verify by hand that the suspended account's listings no longer appear and cannot be booked.
- An admin suspension button, so this is one click rather than a manual table edit, is the P0.4 build item that makes this protocol safe to run under pressure.

Until those land, this protocol still works, it just takes more manual care. That is acceptable at launch volume. It is not acceptable to have the public promise without this process, which is why this document exists now rather than later.
