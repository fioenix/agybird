# Simulated Verification — 2026-08-02

This report covers deterministic checks that do not use Google credentials or Antigravity subscription credits.

## Environment

- Platform: macOS
- Node.js: `v26.5.0`
- npm: `11.17.0`
- Git: `2.50.1 (Apple Git-155)`
- Provider: cross-platform fake `agy` fixture

## Gates

| Gate | Command | Result |
| --- | --- | --- |
| Lockfile install | `npm ci` | Pass, zero dependencies and zero reported vulnerabilities |
| Full deterministic suite | `npm run check` | Pass, 56 tests |
| Clean clone | clone to a fresh temporary directory, then `npm ci && npm run check` | Pass; repeated after live-driven fixes during release audit |
| Install layout | `node --test tests/integration/install-layout.test.mjs` | Pass |
| Diff hygiene | `git diff --check` | Pass |
| Documentation links | HTTP status check over unique tracked documentation links | Pass, 13 of 13 returned HTTP 200 |
| Workflow syntax | Ruby YAML parse of both workflow files | Pass |

## Simulated behaviors covered

- Argument and absolute-path validation.
- Read/write category prompt contracts.
- Safe headless command construction without a shell.
- NDJSON chunking, malformed event recovery, and terminal result parsing.
- Permission soft-denial with provider exit code zero.
- Nonzero provider exit, timeout termination, and output bounds.
- Image tool success, tool failure, missing artifact, and reference validation.
- Native conversation-scoped image artifact validation and cross-conversation spoof rejection.
- Live wrapper refusal when paid-call confirmation is absent.
- One-envelope stdout contract and sanitized stderr diagnostics.
- Standalone Agent Skill install layout.
- Documentation, threat-model, and immutable-workflow contracts.

## Scope boundary

This evidence does not prove compatibility with the live Antigravity event stream or real image artifacts. Those are separate manual gates documented in the live verification report.
