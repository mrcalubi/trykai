# TryKai: Host Onboarding

*Rewritten 19 October 2026: listing copy template, listing checklist, founder at first session. Payout timing is 72 hours after the session ends (`PAYOUT_HOLD_MS`, DECISIONS.md 18 October).*

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

**2. Account and identity verification.** They sign up, then go to `/verify-identity` and tap **Verify with Singpass** where it is switched on: they confirm the name, date of birth and mobile Singpass shares, and are verified on the spot, with no wait for you. Anyone without Singpass taps the small "Upload your ID instead" link (a passport or NRIC photo, number may be covered, and a selfie); approve those yourself at `/admin/verifications`, while you are still on the call if you can. If Singpass has no mobile number for them, note theirs on the call. Stripe Identity is no longer offered: it is not available to Singapore businesses (DECISIONS.md, 23 October).

**3. Mark them as a founding host.** Set `is_founding_host` on their account so the price panel shows "Founding host: no host fee, ever."

**4. Stripe Connect onboarding.** *Expect friction.* This is a separate step from the identity check in step 2, and it will feel like repetition to them: Connect is about where the money lands, so Stripe collects bank details and its own identity information for payout compliance. For someone offering a S$20 session it is a second round of paperwork. Warn them it is coming, explain that it is how they get paid, and stay on the call while they do it.

**5. Build the listing together, using the listing copy template below.** Do not let them do this alone the first time. Walk through the guidelines in Part B, particularly pricing and photos.

**6. Review before it goes live.** Every new listing is hidden from guests until someone approves it at `/admin/listings`, and you are emailed the moment it is saved. Run the listing checklist below. Use **Ask for a change** with one specific fix rather than approving to be polite; the host is emailed and the listing comes back when they save. A bad listing on a browse page of fifteen damages everything around it. They can add dates (step 7) while it waits.

**7. Add their sessions.** A host with no session dates is invisible. Use quick fill to add the next few weeks in the same sitting (dates up to 80 days ahead).

**8. Brief them on what happens next.** Someone may book. Message Caleb immediately if anything breaks. Feedback on what was confusing is wanted. Give them their listing link and suggest they share it with their own followers.

**9. A founder attends the first session.** Caleb or Aakash attends each new listing's first session. It catches problems before a stranger does and gives honest early feedback. Do not count a founder's review as demand.

## Listing copy template

Fill this in with the host, in their words. Each line should be specific enough that a stranger can picture the session.

**Title:** what you'll do, plainly. *"Latte art for beginners"*, not *"The Art of Coffee"*.

**Description:**

> **What you'll do:** one or two sentences, concrete. *"We'll steam milk together and pour three latte art designs: a heart, a tulip and a rosetta."*
>
> **What you'll take home:** something real. *"You leave with your best cup, a printed cheat sheet, and the confidence to try it at home."*
>
> **Why you know this stuff:** a credential, not a bio. *"Barista for six years at a specialty café in Tiong Bahru."* Link their Instagram if they have one.
>
> **Where it happens:** the space, not the address. *"In my home kitchen, with a proper espresso machine. Small and relaxed."*
>
> **Good to know:** who it suits and anything unpredictable. *"Complete beginners welcome. Nothing to bring."*

**Photos, in this order:** the finished thing (cover), hands in action, the space, the host. Three good ones beat five mediocre ones.

**What's provided:** tick the standard items and add specifics with "+ Add your own" (e.g. *"Oat milk available"*, *"Take-home box"*).

## Listing checklist (before it goes live)

Reject and send back for:
- Photos that are dark, blurry, cluttered, watermarked, stock, or clearly not of the actual session
- No photo of the space
- A description that does not say what the guest will do and take home
- A vague credential line, or none
- Prices well outside the S$10 to S$40 band without a reason
- Wrong category or wrong area
- Anything that reads as advice rather than experience sharing in a regulated area
- **Alcohol served or sold from a home.** This needs a liquor licence. Hold the listing until the host confirms they hold one (see GoBusiness).
- Food sessions that do not state allergens and halal status

## Ongoing

Check in after each host's first completed session. Ask what was confusing, how the booking process felt, and what they would change. This is the only user research available before launch, and it stops being available once volume grows.

Track everything in the **host management Google Sheet**, not here.

---

# Part B: Host guidelines

*Send this to hosts, or adapt it into the listing creation flow.*

## What you are signing up for

You teach something you already know, to a small group, for 60 to 120 minutes. You set your own price, your own dates, and your own capacity. You are not an employee and there is no commitment beyond the sessions you choose to list.

Guests pay through TryKai when they book. **Your share is transferred to you 72 hours after your session ends.** The delay is deliberate: it is what lets us guarantee guests a refund if something goes wrong, which is what makes strangers comfortable booking you.

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

**This is why group bookings matter so much.** You can turn on group discounts (5% off for two guests, up to 20% for five or more). The discount comes off your price, so a group pays you a little less per head, but groups book more readily and fill your session faster.

## Photos

You do not need a professional. You need a phone, daylight, and five minutes.

- **Natural light is your best friend.** A window beats any flash.
- **Lead with the good stuff:** the finished latte, the ring, the drink.
- **Hands in action beat an empty room.**
- **Include one photo of the space,** so guests know what to expect.
- **Show the real thing.** A photo that oversells produces a disappointed guest and a bad review. No stock photos.
- Up to eight photos. Drag to reorder; the first is your cover.

Listings with good photos get noticeably more bookings. This is the single highest return five minutes you will spend.

## Your description

Answer these plainly, like you are texting a friend who asked what happens:

1. **What will we actually do?** "We'll pour three latte art designs together", not "learn the art of coffee".
2. **What do I take home?** A drink, a ring, a skill, a photo.
3. **Why do you know this stuff?** "Barista for six years" beats "passionate about coffee".
4. **Where does it happen?** The kind of space, not the address.
5. **Who is it for, and what do I need to bring?** Especially if the answer is "complete beginners" and "nothing".

**Flag anything unpredictable**, for example if the session depends on outdoor conditions. Guests who know in advance do not complain later, and it protects you if you have to cancel.

**Food and drink sessions:** state allergens and whether the food is halal. If alcohol is served or sold, you need a liquor licence. Talk to us first.

## Location

Guests see only your general area, for example Tiong Bahru, until they have a confirmed booking. Your full address is revealed only after someone has actually paid. You enter it by postal code, so it is always a real, findable address.

If you are hosting at home, think about whether you are comfortable with that. A public or bookable venue is fine, and often easier. Follow your condo, landlord or venue rules, and keep noise and crowding considerate of neighbours.

## Cancellations, and what happens if things go wrong

**If a guest cancels:** they get a refund on a sliding scale depending on how much notice they give. You keep a share if they cancel late. Full detail is in the cancellation policy.

**If you cancel:** the guest gets a full refund and you receive a strike. Three strikes deactivates your listings. If the cancellation was genuinely outside your control, you can appeal within seven days and the strike can be removed.

**If you do not show up:** this is treated much more seriously than cancelling. Two strikes immediately and your account is reviewed. A guest who travelled across the island to meet nobody is the worst thing that can happen on the platform.

If something goes wrong on the day, tell us as early as you can. Early is always better.

## Reviews

Guests review you after each session. Your reviews are how the next guest decides whether to book you, and they exist only on TryKai. This is your reputation, and it is worth more than any individual booking.

## Money

You set the session price. Guests pay a booking fee on top of that, which is TryKai's revenue and does not come out of your share.

**As a founding host, you pay no host fee, permanently.** Hosts who join later will. That is not a promotional period; it is a permanent term of joining first.

You receive your share 72 hours after your session ends, transferred to the bank account you set up during onboarding.

**Tax:** income you earn through TryKai may be taxable. We are not able to advise on this; IRAS guidelines are the right reference.

## On the day

- Confirm with your guest the day before
- Have everything ready before they arrive
- Start on time. Being very late is grounds for a guest complaint.
- If a guest does not show, tell us

## Questions

hello@trykai.sg
