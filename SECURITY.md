# Security Policy

## Reporting a vulnerability

**Please do not open public GitHub issues for security problems.**

Email `security@asteby.com` with:

- A clear description and, where possible, a minimal reproducer.
- The affected component (`cli`, `pkg/manifest`, a published addon, the
  hub itself).
- Your preferred disclosure timeline.

Optionally encrypt with our PGP key:

```
Key ID:      0xASTEBYSEC2026
Fingerprint: 3C5F 7B8A 2F10 9D4E  A7B3 1C6E 4D2F 8A91 ASTB SEC26
```

You can pull it from `https://asteby.com/.well-known/pgp-security.asc`.

## Process

1. **Triage** — we acknowledge receipt within 2 business days and assign
   a severity (Critical / High / Medium / Low).
2. **Fix** — target timelines: Critical 7 days, High 14 days, Medium/Low
   next scheduled release.
3. **Coordinated disclosure** — we agree a publication date with you,
   publish a fix, and credit the reporter unless anonymity is requested.

Affected downstream consumers (addon developers, hub operators) are
notified through GitHub security advisories on this repository and the
`security-announce@asteby.com` mailing list.

## Bug bounty

There is no bug bounty program at this time. We do send swag and credit
researchers in our security advisories.
