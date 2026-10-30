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
8. As a support agent, I want link requests and link sign-ins in the audit log, so that I can investigate sign-in complaints.
9. As an operator, I want link requests rate limited per email and per IP, so that the feature cannot be used to flood inboxes.

## Implementation Decisions

- The auth module gains a `magic-link` purpose for Login tokens: 256-bit, stored hashed, valid 15 minutes, single use. Issuing one marks every outstanding magic-link token of the same User as superseded.
- Two new auth endpoints: request a link (email in, always answers 202) and consume a link (token in, Session out). Consuming reuses the Session creation of password sign-in.
- Rate limits through the existing rate limiter: 3 requests per email every 15 minutes, 20 per IP every hour.
- Unknown emails get the same 202 answer and no email.
- Consuming a link for an `unverified` User sets them `active` and records the verification time.
- Notifications gains a `magic-link` email template, same layout as the password reset email.
- The sign-in screen gains a secondary "Email me a sign-in link" action under the password form, leading to an email-only form and then a "check your inbox" confirmation.

## Testing Decisions

- Seam: the auth module's HTTP API, through the existing API test harness with the fake email transport. Prior art: the password reset tests.
- Covered at that seam: request → captured email → consume → authenticated request succeeds; expired, used and superseded links; unknown email; both rate limits; unverified User becomes active; audit log entries.
- The existing end-to-end sign-in smoke test is extended with the link flow, to cover the new screens.

## Acceptance Criteria

- [ ] Requesting a link for a registered email sends one email whose link signs the user in on the device that opens it.
- [ ] A link works once and only within 15 minutes; requesting a new link invalidates earlier ones.
- [ ] Expired, used and superseded links open an explanatory page with a "Send a new link" action.
- [ ] The request endpoint answers 202 for every well-formed email, registered or not.
- [ ] Rate limits of 3 per email per 15 minutes and 20 per IP per hour apply.
- [ ] Signing in through a link activates an unverified account.
- [ ] Link sign-ins appear in the active sessions list and end with "sign out everywhere".
- [ ] Link requests and link sign-ins are written to the audit log.

## Out of Scope

- Passwordless accounts: every account keeps its password.
- Deep links into the native mobile apps; the link opens in the browser.

## Further Notes

The email and expired-link page copy is reviewed by the product team before release.
```
