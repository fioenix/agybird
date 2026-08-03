# Changelog

All notable changes to Agybird are documented in this file.

## Unreleased

- Require an allow-rule target to be an escaped literal instead of screening four literal spellings, so `command(.+)` and `read_file(/.*)` are no longer accepted as narrow rules ([#4](https://github.com/fioenix/agybird/issues/4)).

- Report denied actions as `needs_permission` with a `permission_requests[]` entry naming the tool, target, and allow-rule, instead of an unexplained `blocked`.
- Keep `blocked` for denials no allow-rule can authorize.
- Document the verified Antigravity allow-rule syntax and the two locations rules are read from.
- Add `--grant` and `--grant-scope` to resume a blocked session with a user-approved allow-rule, written as a repository-scoped Antigravity project grant. `once` reverts the rule when the run ends; `remember` keeps it.
- Resolve an Antigravity project for the workspace on every run so a later grant reaches the resumed conversation.
- Take the requested rule from the `ask_permission` tool payload when agy asks for a grant itself.
- Keep one objective in one Antigravity conversation: the runner records the workspace's conversation and resumes it automatically, reporting the outcome as `evidence.session_resumed`.
- Add `--new-session` to start a fresh conversation deliberately. `--grant` no longer needs a hand-threaded `--conversation`, and is refused when there is no session to unblock.
- Key the session store on the canonical workspace path, so a symlinked directory or a differently-cased Windows drive letter no longer loses the conversation.
- Write the session store through a temporary file and rename, and preserve an unreadable store as `sessions.json.corrupt` rather than overwriting every other workspace.
- Record why the Antigravity Python SDK was not adopted as a runner backend in `docs/sdk-evaluation.md`.

## 0.1.1 - 2026-08-02

- Add a Claude Code plugin manifest and a single-plugin marketplace so Agybird can be installed with `/plugin install agybird@agybird`.

## 0.1.0 - 2026-08-02

- Add an Agent Skill for code, image, and general Antigravity work.
- Add a dependency-free Node.js runner for official `agy` headless mode.
- Add stable result envelopes, artifact verification, and cross-platform tests.
