# Example task

`docs/tasks/2026-03-14-magic-link-sign-in.md` for a team collaboration app.

```md
---
status: to-do
depends_on: [2026-03-13-bootstrap-app.md]
---

# Magic-link sign-in

## Specs

- [Authentication](../specs/authentication.md)
- [Notifications](../specs/notifications.md)

## Problem Statement

Users who sign in rarely forget their password and go through password recovery almost every time: recovery is the most common reason for sign-in support tickets. On mobile, typing a long password is where most abandoned sign-ins stop.

A new way to sign in must not be an easier way into someone else's account than the password: it must not reveal which emails have an account, and it must not get around two-factor authentication.

## Solution

On the sign-in screen, a user can ask for a sign-in link by email. Opening the link signs them in on the device where they open it, with no password. Password sign-in keeps working as it does today.

## User Stories

1. As a returning user, I want to request a sign-in link by entering only my email, so that I can sign in without remembering my password.
2. As a mobile user, I want opening the link to sign me in directly, so that I avoid typing a password on a small keyboard.
3. As a user who requests the link on my laptop but reads email on my phone, I want the link to sign in the device where I open it, so that I can carry on from there.
4. As a user who requested several links, I want only the latest one to work, so that an old email lying around cannot be used to sign in.
5. As a user opening an expired, used or superseded link, I want a page explaining what happened with a button to send a new link, so that I can recover without contacting support.
6. As a user who never verified my email, I want signing in through a link to verify it, so that I skip a separate verification step.
7. As a security-conscious user, I want magic-link sign-ins listed in my active sessions like any other, so that I can spot and end sessions I don't recognise.
8. As a support agent, I want link requests and link sign-ins in the audit log with their outcome, so that I can tell why a user could not sign in.
9. As an operator, I want link requests rate limited per email and per IP, so that the feature cannot be used to flood inboxes.
10. As a user, I want requesting a link for an unknown or suspended email to answer the same as for a known one, so that attackers cannot discover which accounts exist or what state they are in.
11. As a user, I want the link to be single-use and expire after 15 minutes, so that it cannot be used by anyone else if my email is compromised.
12. As a user with two-factor authentication, I want the link to still ask for my second factor, so that signing in by link is not a way around it.
13. As a user whose email client pre-fetches links, I want the link to sign me in only after I confirm on a page, so that a scanner does not use up my link.
14. As a user who has not received the email or mistyped it, I want to send it again or change the email from the confirmation screen, so that I can recover without starting over.

## Implementation Decisions

Tokens and consumption (auth module):

- Login tokens gain a `magic-link` purpose: 256 bits from a cryptographically secure source, URL-safe encoding, stored only as a hash, valid 15 minutes from creation, single use. They are stored with the existing Login tokens, which gain a superseded time; existing tokens are untouched.
- Issuing a magic-link token marks every outstanding (unused, unexpired, not superseded) magic-link token of the same User as superseded, in the same transaction. The plain token is returned to the caller once and goes nowhere but the email.
- Consuming a token has five outcomes: valid, `expired`, `used`, `superseded`, `unknown`. Malformed tokens and tokens of suspended or deleted Users are `unknown`, and are not marked used.
- Marking a token used is a conditional update ("only if not yet used"): of two simultaneous consumptions, the first wins and the other gets `used`.
- Consuming a link for an `unverified` User sets them `active` and records the verification time, in the same transaction that marks the token used.
- Consuming a link for a User with two-factor authentication returns the same second-factor challenge as password sign-in, not a Session. The token is still marked used.
- A Session created from a link goes through the same function as password sign-in (same lifetime, cookie flags and device recording) and records the sign-in method `magic-link`.

Endpoints:

- Request a link: email in. Every well-formed email gets 202 with an empty body, whether the email is unknown, suspended, deleted or rate limited; a malformed email gets 422. Email lookup is case-insensitive and ignores surrounding whitespace. Only `active` and `unverified` Users get a token and an email.
- Rate limits through the existing rate limiter: 3 requests per normalised email every 15 minutes, 20 per IP every hour. A limited request sends nothing.
- Consume a link: a POST with the token. It answers a Session (as password sign-in does), a second-factor challenge, or an error with a reason: `expired`, `used`, `superseded` or `invalid` (`unknown` is reported as `invalid`). For the first three reasons the error includes the email the link was issued for, so the screen can pre-fill a new request. A GET never consumes a token.
- Audit log entries: link requested (outcome `sent`, `rate_limited` or `no_account`), link consumed, link rejected (with the reason). Each carries the User when known, the IP and the user agent. Tokens, plain or hashed, are never written to the audit log or to any other log.

Email and screens:

- Notifications gains a `magic-link` email template in the layout of the password reset email: one button with the link, the link as plain text underneath, the request time, "valid for 15 minutes, works once" and "if this wasn't you, ignore this email". The link is on the app's own domain, with no click-tracking redirect.
- The sign-in screen gains a secondary "Email me a sign-in link" action under the password form. It opens an email-only form, pre-filled with the email already typed in the password form, and then a "Check your inbox" confirmation showing the email, with "Use a different email", "Send again", and a line asking the user to wait a few minutes before asking again (no countdown).
- The link opens a confirm page of the app with a single "Sign in" button; only the button consumes the token. On a Session the app stores it as password sign-in does and redirects to the default page; on a second-factor challenge it opens the existing second-factor screen; on an error it opens the expired-link page.
- The expired-link page explains each reason in plain language and offers "Send a new link", which calls the request endpoint with the email from the error when present, and otherwise opens the email form.
- The active sessions list shows the sign-in method ("Email link" or "Password") on every row.
- The email and the new screens use the app's existing translation mechanism and components.

## Plan

Each step leaves the app working and can be committed on its own. Tests are written in the same step as the behaviour they cover, at the seams in Testing Decisions. Steps apply the decisions above and do not restate their values.

### Backend: tokens

1. **Token storage.**
   - Add the superseded time to Login tokens, a unique index on the hash, and an index on User plus purpose to find outstanding tokens quickly.
   - Verification: the migration applies and rolls back on a database that already holds Users and Login tokens, and the existing password reset tests still pass.
2. **Issue and supersede.**
   - Add the `magic-link` purpose and the operation that issues a token and supersedes the outstanding ones, as decided.
   - Verification: issuing twice leaves exactly one valid token; the first one is reported as superseded; the stored value is not the plain token.
3. **Consume: outcomes.**
   - Add the operation that hashes a plain token, looks it up and returns one of the five outcomes.
   - Verification: one test per outcome, including a malformed token and a token at exactly its expiry time.
4. **Consume: single use.**
   - Mark the token used with the conditional update.
   - Verification: two consumptions started at the same time produce exactly one valid result.
5. **Consume: account rules.**
   - Apply the rules for `unverified` Users, Users with two-factor authentication, and suspended or deleted Users.
   - Verification: one test per rule, and a test that a failure of the verification update leaves the token unused.
6. **Consume: Session.**
   - On a valid outcome, create the Session through password sign-in's function with the `magic-link` method.
   - Verification: a Session created through a link is accepted by an authenticated endpoint and has the same lifetime as a password Session.

### Backend: endpoints

7. **Request endpoint.**
   - Add the endpoint: look the email up, issue a token and ask Notifications to send the email for `active` and `unverified` Users, do nothing else for the others.
   - Verification: status, headers and body are identical for a registered, an unregistered and a suspended email; a malformed email gets 422.
8. **Rate limits.**
   - Put the request endpoint behind the two rate limiter keys.
   - Verification: the request over the email limit and the request over the IP limit both answer 202 and send nothing.
9. **Consume endpoint.**
   - Add the POST endpoint mapping each consume outcome to its answer, including the email for `expired`, `used` and `superseded`.
   - Verification: HTTP tests for each answer; a GET to the same path does not change the token.
10. **Audit log.**
    - Write the three audit entries from the request and consume endpoints; `invalid` rejections have no User.
    - Verification: tests read the audit log after each scenario; a test searches the whole log output of a full flow for the token and its hash and finds nothing.

### Notifications

11. **Email template.**
    - Add the `magic-link` template with the decided content, through the translation mechanism.
    - Verification: the fake email transport captures the rendered email; a test checks the link domain and that no tracking wrapper is present.

### Web app

12. **Sign-in screen: request and confirmation.**
    - Add the action, the email form and the "Check your inbox" confirmation. "Use a different email" goes back to the form with the email selected. A network error shows an error with a retry and keeps the typed email.
    - Verification: component tests for pre-fill, going back, send again and the network error.
13. **Confirm page.**
    - Add the page that reads the token from the link and posts it on "Sign in", then routes on the answer.
    - Verification: loading the page alone makes no consume call; the button makes exactly one; each answer leads to its screen.
14. **Expired-link page.**
    - Add the page with a message per reason and the "Send a new link" action.
    - Verification: a test per reason for message and action, with and without the email in the error.
15. **Active sessions.**
    - Show the sign-in method on every row. "Sign out everywhere" already ends all Sessions; check it ends link Sessions too.
    - Verification: a test signs in by link, lists the Session with its method, signs out everywhere, and sees the Session rejected.

### Wrap-up

16. **End-to-end.**
    - Extend the sign-in smoke test: request a link, read the captured email, open the link, confirm, land on the default page, see the Session in the list. Add the expired-link path.
    - Verification: the smoke test passes locally and in CI.

## Testing Decisions

- Seam: the auth module's HTTP API, through the existing API test harness with the fake email transport. Prior art: the password reset tests.
- Covered at that seam: request → captured email → consume → authenticated request succeeds; expired, used and superseded links; unknown and suspended emails answering identically; both rate limits; unverified User becomes active; User with two-factor authentication gets the challenge; concurrent consumption yields one Session; a GET never consumes a token; audit log entries and absence of the token from logs.
- The auth module takes its clock as a dependency, so expiry tests move the clock instead of sleeping.
- The web screens (request form and confirmation, confirm page, expired-link page) are covered by component tests; prior art: the password reset screens' tests.
- The existing end-to-end sign-in smoke test is extended with the link flow, to cover the new screens and the full path through the real browser.

## Acceptance Criteria

- [ ] Requesting a link for a registered email sends one email whose link signs the user in on the device that opens it.
- [ ] A link works once and only within 15 minutes; requesting a new link invalidates earlier ones.
- [ ] Expired, used and superseded links open an explanatory page with a "Send a new link" action.
- [ ] The request endpoint answers 202 for every well-formed email, registered or not, suspended or not, rate limited or not.
- [ ] Rate limits of 3 per email per 15 minutes and 20 per IP per hour apply.
- [ ] Signing in through a link activates an unverified account.
- [ ] Link sign-ins appear in the active sessions list with their method and end with "sign out everywhere".
- [ ] Link requests and link sign-ins are written to the audit log with their outcome, and never contain the token.
- [ ] Opening the link shows a confirmation page and does not consume the token until the user confirms.
- [ ] A user with two-factor authentication is still asked for the second factor after opening a link.
- [ ] Two simultaneous attempts to consume the same link result in exactly one Session.
- [ ] The confirmation screen offers "Use a different email" and "Send again".
- [ ] Link tokens are stored hashed and the plain token is never logged or returned by any endpoint; it only travels in the email.
- [ ] The existing password sign-in and password reset tests pass unchanged.
- [ ] The Authentication and Notifications specs describe the shipped behaviour.

## Out of Scope

- Passwordless accounts: every account keeps its password.
- Deep links into the native mobile apps; the link opens in the browser.
- Returning to the page the user was trying to open: users land on the default page after signing in. Add later if users ask for it.
- A countdown on "Send again" and the approximate location in the email: the rate limit and the plain message are enough for a first version.
- A feature flag, metrics and a staged rollout: the feature is small and password sign-in stays available if it misbehaves.
- Making response times identical for known and unknown emails: the identical answer is enough for now.

## Further Notes

The email and expired-link page copy is reviewed by the product team before release.
```
