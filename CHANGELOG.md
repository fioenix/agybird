# Changelog

All notable changes to Agybird are documented in this file.

## Unreleased

## 0.1.0 - 2026-08-03

First release.

- An Agent Skill that delegates code, image, and general work to the official `agy` CLI, keeping authentication, permissions, sandbox, model access, and credits under the user's own Antigravity configuration.
- A dependency-free Node.js runner that emits one stable JSON envelope per invocation, with status `success`, `partial`, `needs_permission`, `blocked`, or `error`.
- One objective stays in one Antigravity conversation. The runner records the workspace's conversation and resumes it automatically, reported through `evidence.session_resumed`; `--new-session` begins a new objective deliberately.
- Denied actions are explained rather than reported as an opaque failure. `needs_permission` carries a `permission_requests[]` entry naming the tool, the target, and the allow-rule that would authorize it, taken from the `ask_permission` payload when agy names one itself. `target_truncated` says when the rule covers more than was rendered, and no rule is suggested for a target too long to review.
- `--grant` and `--grant-scope` apply a user-approved allow-rule to the session being resumed, written as a repository-scoped Antigravity project grant. A target must be an escaped literal, so no spelling of a wildcard is accepted. `once` is the default: the undo is journalled before the rule is applied, so a run that is killed is repaired by the next one and the repair is reported in `warnings[]`.
- A grant is held under a per-workspace lock, so a run on a different conversation cannot inherit one that is still live.
- Session state is one file per workspace under `~/.agybird/sessions/`, keyed on the canonical path so a symlinked directory or a differently-cased Windows drive letter does not lose the conversation.
- Image work requires a completed tool event and a real artifact inside the workspace or the matching provider artifact directory before reporting success.
- Never passes `--dangerously-skip-permissions`, never invents an allow-rule, and never runs a shell inside the runner.
- Zero runtime dependencies, tested on Linux, macOS, and Windows against Node.js 20 and 22.
- `docs/threat-model.md` documents the trust boundary and the residual risks; `docs/sdk-evaluation.md` records why the Antigravity Python SDK was not adopted as a runner backend.
