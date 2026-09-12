# TryKai: Host Onboarding

Two parts. **Part A** is the internal process, for Caleb and Aakash. **Part B** is host facing and can be sent directly or adapted into the listing creation flow.

---

# Part A: Internal process

## Before you start

Budget **45 to 60 minutes per host** for their first listing. They will have questions about pricing, uncertainty about photos, and problems uploading things. Every plan that has assumed less than this has been wrong.

Do this in person or on a call. Do not send a link and hope. **First listings set the quality standard for everything after them**, and a host who has a good first experience recruits the next one.

Every host has a relationship owner. Aakash owns his contacts, Caleb owns his. The owner is who chases, not the group chat.

## The recruitment conversation

Lead with the thing that is actually true and interesting: someone will pay to learn the thing they already do. Not "join our platform."

Cover four things:

**What they would actually earn.** Use the real table. A full session at S$25 with four guests is about S$34 an hour after materials. Two guests is S$17. Do not oversell; a host who expects S$34 and gets S$17 feels misled.

**How much work it is.** One session, 90 minutes, plus setup. Not a commitment to anything recurring.

**That they are a founding host.** Eleven people, no host fee ever, permanently. This is genuinely scarce and worth saying plainly.

**What TryKai does for them.** Payment, identity verified guests, cancellation protection, and the people who would never have found them.

## Steps

**1. Confirm one to one.** Verbal or written commitment from the individual. Group chat enthusiasm is not commitment, and repeatedly has not been.

**2. Account and identity verification.** They sign up, then run the Stripe Identity check from `/verify-identity`: NRIC or passport, plus a live selfie taken on the spot. It usually clears in under a minute with no action from us, so do this while you are still on the call. If it fails, or if they would rather not do a face scan, use the "Having trouble? Upload your documents instead" link and approve them yourself at `/admin/verifications`. Target same day for founding hosts either way.

**3. Stripe Connect onboarding.** *Expect friction.* This is a separate step from the identity check in step 2, and it will feel like repetition to them: Connect is about where the money lands, so Stripe collects bank details and its own identity information for payout compliance. For someone offering a S$20 session it is a second round of paperwork. Warn them it is coming, explain that it is how they get paid, and stay on the call while they do it.

**4. Build the listing together.** Do not let them do this alone the first time. Walk through the guidelines in Part B, particularly pricing and photos.

**5. Review before it goes live.** Photos, description clarity, price sanity, correct category. Reject and give specific feedback rather than approving to be polite. A bad listing on a browse page of fifteen damages everything around it.

**6. Add their first session.** A host with no session dates is invisible. Do this in the same sitting.

**7. Brief them on what happens next.** Someone may book. Accept all bookings. Message Caleb immediately if anything breaks. Feedback on what was confusing is wanted.

## Quality bar

Reject and send back for:
- Photos that are dark, blurry, cluttered, or clearly not of the actual session
- Descriptions that do not say what the guest will actually do or leave with
- Prices well outside the S$10 to S$40 band without a reason
- Wrong category
- Anything that reads as advice rather than experience sharing in a regulated area

## Ongoing

Check in after each host's first completed session. Ask what was confusing, how the booking process felt, and what they would change. This is the only user research available before launch, and it stops being available once volume grows.

Track everything in the **host management Google Sheet**, not here.

---

# Part B: Host guidelines

*Send this to hosts, or adapt it into the listing creation flow.*

## What you are signing up for

You teach something you already know, to a small group, for 60 to 120 minutes. You set your own price, your own dates, and your own capacity. You are not an employee and there is no commitment beyond the sessions you choose to list.

Guests pay through TryKai when they book. **Your share is transferred to you 24 hours after your session has taken place.** The delay is deliberate: it is what lets us guarantee guests a refund if something goes wrong, which is what makes strangers comfortable booking you.

## Pricing

Most sessions sit between **S$15 and S$30 per person**. Below S$15 rarely covers materials. Above S$40 and you are competing with professional studios, which is a different market.

**Aim for S$25 rather than S$20.** It earns you 25 per cent more for the same work, and S$20 happens to be an awkward price point on our fee structure.

Your earnings depend far more on how full your session is than on your price:

| Guests | You earn (S$25 session, ~S$8 materials each) | Per hour |
|---|---|---|
| 4 | S$68 | S$34 |
| 3 | S$51 | S$25 |
| 2 | S$34 | S$17 |
| 1 | S$17 | S$8 |

**This is why group bookings matter so much.** Consider setting a lower per person price for groups of three or four. Losing 10 per cent per head while doubling your group nearly doubles your hourly rate, and groups book more readily when the price drops as they add friends.

## Photos

You do not need a professional. You need a phone, daylight, and five minutes.

- **Natural light.** Near a window, during the day. Never use flash.
- **Clear the background.** The most common problem is clutter, not camera quality.
- **Show what the guest actually gets.** The finished latte, the ring, the drink. Not just your workspace.
- **Show the real thing.** A photo that oversells produces a disappointed guest and a bad review.
- Up to five photos. Three good ones beat five mediocre ones.

Listings with good photos get noticeably more bookings. This is the single highest return five minutes you will spend.

## Your description

Answer three questions plainly:

1. **What will we actually do?** "We'll make three classic cocktails and you'll take the recipes home", not "learn the art of mixology".
2. **What do I need to bring or know?** Especially if the answer is nothing.
3. **What do I leave with?** A drink, a ring, a skill, a photo.

Write like you are texting a friend who asked what happens. Say if it suits complete beginners, because most guests are.

**Flag anything unpredictable in the description**, for example if the session depends on outdoor conditions. Guests who know in advance do not complain later, and it protects you if you have to cancel.

## Location

Guests see only your general area, for example Tiong Bahru, until they have a confirmed booking. Your full address is revealed only after someone has actually paid.

If you are hosting at home, think about whether you are comfortable with that. A public or bookable venue is fine, and often easier.

## Cancellations, and what happens if things go wrong

**If a guest cancels:** they get a refund on a sliding scale depending on how much notice they give. You keep a share if they cancel late. Full detail is in the cancellation policy.

**If you cancel:** the guest gets a full refund and you receive a strike. Three strikes deactivates your listings. If the cancellation was genuinely outside your control, you can appeal within seven days and the strike can be removed.

**If you do not show up:** this is treated much more seriously than cancelling. Two strikes immediately and your account is reviewed. A guest who travelled across the island to meet nobody is the worst thing that can happen on the platform.

If something goes wrong on the day, tell us as early as you can. Early is always better.

## Reviews

Both sides review each other after a session. Your reviews are how the next guest decides whether to book you, and they exist only on TryKai. This is your reputation, and it is worth more than any individual booking.

## Money

You set the session price. Guests pay a booking fee on top of that, which is TryKai's revenue and does not come out of your share.

**As a founding host, you pay no host fee, permanently.** Hosts who join later will. That is not a promotional period; it is a permanent term of joining first.

You receive your share 24 hours after your session takes place, transferred to the bank account you set up during onboarding.

**Tax:** income you earn through TryKai may be taxable. We are not able to advise on this; IRAS guidelines are the right reference.

## On the day

- Confirm with your guest the day before
- Have everything ready before they arrive
- Start on time. Being very late is grounds for a guest complaint.
- If a guest does not show, tell us

## Questions

hello@trykai.sg
