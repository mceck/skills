---
name: security-check
description: "Find and fix security vulnerabilities in the application's code: a review of the attack surface section by section, each vulnerability verified with a failing regression test and then fixed, and a report in docs/reports. Use when the user asks for a security check, a security audit or a vulnerability assessment of their code."
disable-model-invocation: true
---

Find the security vulnerabilities in the application's code and fix them, keeping track of the work in a report in `docs/reports/`. The goal is a safer codebase: verify each vulnerability with a test, then fix it.

Dependencies and their CVEs are out of scope: this skill reviews the code written in this repository.

## Before starting

Read the specs in `docs/specs/`: they describe who may do what, which is what authorization bugs break. Read `docs/CONTEXT.md` (if it exists) for the domain language.

Look for previous reports in `docs/reports/security-check-*.md`. If one has unticked sections, resume it. Otherwise start a new one at `docs/reports/security-check-YYYY-MM-DD.md` (today's date; add `-2`, `-3` if one already exists for today), and skip what the previous reports already fixed, unless the code changed since.

Work only on this codebase and on local or test environments. Never send requests to production or to systems the user doesn't own.

## Sections

Split the attack surface into sections: public API, authentication and sessions, authorization per resource, file handling and uploads, external integrations and webhooks, background jobs, configuration. Keep the ones this codebase has, and order them by risk.

Review up to 3 sections in parallel with sub-agents, as `find-bugs` does: they only search and return findings, with where (`path/to/file:line`), the input that triggers the vulnerability and the seam where a test can reproduce it. You verify and fix, one section at a time.

What to look for is in [checklist.md](checklist.md): the vulnerabilities by severity, with the patterns to find, a grep for the candidates and the harmless test that verifies each one. Point every sub-agent to it, by its full path. A grep hit is a candidate: follow the data from the untrusted input to the sink before calling it a finding.

## Each section

1. **Verify every finding with a test.** Call the Skill tool with "tdd" and write a regression test at the highest seam that fails while the vulnerability is there. Use harmless inputs that show the behaviour, such as a `../` path that must be rejected, a quote that must not break the query, or another user's id that must get a 403, and assert on the application's response. No payloads beyond what proves the point. If the test passes, there is no vulnerability: drop the finding. If it can't be reproduced with a test (no harness for that area, a deployment setting), record it as to confirm. Secrets in the code are the exception: finding the value in the code is the verification.
2. **Fix the cause, not the symptom**, until the test passes: parameterized queries rather than escaping, an allowlist rather than a blocklist, the authorization check in the shared layer rather than in one handler.
   - **Fixes must not change behaviour the specs describe.** If the spec itself is insecure, stop and ask the user.
   - **When the fix is a design decision** (a new auth layer, a different session model) or its risk is unclear, don't touch it: record it as to confirm.
   - **Secrets in the code**: move them into the configuration the project already uses. Removing a secret from the code doesn't revoke it: tell the user which secrets to rotate, and ask before rewriting git history.
3. **Typecheck and run the test files you touched.**
4. **Update the report**: tick the section and fill its findings.
5. **Commit** the tests, the fixes and the report together, with a message naming the section and the vulnerabilities fixed.

## Report

```markdown
# Security check YYYY-MM-DD

## Sections

- [ ] <section 1>
- [ ] <section 2>

## Findings

### <section 1>

#### <short title>

- Severity: Critical / High / Medium / Low
- Where: `path/to/file:line`
- CWE: CWE-XXX
- Problem: what an attacker can do, and from where.
- Test: `path/to/test`, "<test name>"
- Fix: what changed.

#### <short title> (to confirm)

- Severity, Where, Problem: as above.
- Why it isn't fixed: the decision the user has to make.
```

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | Remote code execution, full compromise, authentication bypass | Command injection, SQL injection on an admin query |
| **High** | Significant data exposure, privilege escalation | Path traversal to sensitive files, IDOR |
| **Medium** | Limited exposure, denial of service | Error message leakage, unbounded uploads |
| **Low** | Minor information disclosure, hardening | Version disclosure, missing headers |

When a section has no findings, write "No vulnerabilities found." under its heading. Never write secret values in the report: name the file and the kind of secret.

## At the end

Run the full test suite and fix whatever broke. Then give the user a short summary: what was fixed by severity, the secrets to rotate, and the findings to confirm, which need their decision.
