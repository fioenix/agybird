# Live Antigravity Verification — macOS — 2026-08-02

> **Snapshot, not current behaviour.** This records what was observed on 2026-08-02,
> before the permission and session work. It reports a denial as `blocked`; the
> runner now reports `needs_permission` whenever an allow-rule would authorize the
> action. The observations are left as written rather than rewritten to match
> today's code. The automated suite is the current contract.

## Environment and policy

- Official binary: `agy` resolved from the user's local executable path.
- Antigravity CLI: `1.1.9`.
- Authentication: existing cached authentication used by the official CLI; credential storage was not inspected.
- Provider controls: existing model, agent, sandbox, permission rules, and `useG1Credits` were preserved.
- Permission bypass: never used.

## Acceptance results

| Gate | Result | Evidence |
| --- | --- | --- |
| General structured output | Pass | `general/read` returned `status: success`; response matched the required object shape with string `summary` and array `risks`; no tool calls or workspace changes |
| Code edit | Pass with environment constraint | In a disposable Git repo under an existing Antigravity-authorized scratch location, `code/write` changed exactly two requested files and returned `status: success` |
| Independent code verification | Pass | `git status` showed only the two expected modifications; diff preserved the existing function/test and added one function/test; caller-run Node test suite passed 2 of 2 |
| New image generation | Pass | Completed `generate_image` event; 301,912-byte JPEG resolved under the matching conversation artifact directory; visual inspection confirmed one golden bird, mint background, dark-green perch, and no text |
| Reference image edit | Pass | Completed `generate_image` event with the reference path; 545,474-byte JPEG resolved under the matching conversation artifact directory; visual inspection confirmed the original blue-bird composition plus one coral circle and no text |
| Claude Code install layout | Pass | Skills CLI copied the skill into the isolated `.claude/skills/agybird` destination |
| Codex install layout | Pass | Skills CLI copied the skill into the isolated `.agents/skills/agybird` destination |
| Installed content integrity | Pass | Source, Claude Code, and Codex `SKILL.md` copies had the same SHA-1 digest |

## Live findings incorporated

1. `agy 1.1.9` wraps records as `{ "event": ..., "result"|"step_update": ... }`; the parser now supports this nested envelope in addition to the documented conceptual event types.
2. JSON-schema mode exposes the canonical value in `result.structured_output`; the runner now prefers it over free-form response text.
3. Headless permission denial can arrive with provider exit code zero and `step_update.tool_info.error`; the runner now reports `blocked`.
4. The installed `agy 1.1.9` binary does not accept the documentation example's `--cwd` flag. Agybird therefore sets the child process working directory and states the authorized absolute workspace in the delegated prompt.
5. Agybird maps `read` to official execution mode `plan` and `write` to `accept-edits`; it still honors the user's tool permission rules.
6. Native image artifacts are stored under Antigravity's `brain/<conversation_id>` directory, and their path may appear only in terminal response text. Artifact verification now accepts only the exact matching conversation directory or the requested workspace.

## Permission-boundary evidence

A code write against a regular project and an OS temporary directory was denied by the existing Antigravity permission policy. Agybird reported `blocked`, made no target-repository changes, and did not retry with broader permissions. The successful code gate used an already-authorized scratch directory and was moved to Trash after diff and test verification.

Two earlier image/code attempts created temporary scratch files while diagnosing workspace behavior. All unintended scratch files and the disposable successful code repository were moved to Trash, not permanently deleted. Native generated image artifacts remain attached to their Antigravity conversations.

## Credit scope

The diagnostic and acceptance work used 14 live headless Antigravity conversations. Four of those invoked `generate_image` for generation or reference editing. No credit preference was changed. Prompts, raw provider streams, credentials, and conversation IDs are intentionally excluded from this report.
