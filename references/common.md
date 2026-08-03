# Common workflow

## Prerequisites

Require Node.js 20 or newer and the official `agy` executable. Run `agy --version` as a read-only preflight. Agybird uses Antigravity's cached authentication; it does not read or copy tokens.

## Invoke the runner

Pass the user's task through standard input (`stdin`) so it is not placed in the process argument list. Launch the runner from the skill's absolute path:

```text
node /absolute/path/to/agybird/scripts/agybird.mjs --category CATEGORY --cwd /absolute/workspace --mode MODE
```

Use the execution tool's stdin channel when it has one. Otherwise use a single-quoted here-document delimiter that does not occur in the prompt; this prevents shell interpolation:

```bash
node "/absolute/path/to/agybird/scripts/agybird.mjs" \
  --category general \
  --cwd "/absolute/workspace" \
  --mode read <<'AGYBIRD_PROMPT_7F3A'
Summarize the local documentation and cite concrete evidence.
AGYBIRD_PROMPT_7F3A
```

Optional runner flags are `--reference`, `--json-schema`, `--new-session`, `--conversation`, `--grant`, `--grant-scope`, `--model`, `--effort`, `--agent`, `--sandbox`, and `--timeout`. Pass `--grant` only with a rule the user has explicitly approved; see [troubleshooting.md](troubleshooting.md). Supply `--model`, `--effort`, `--agent`, or `--sandbox` only when the user explicitly requests the corresponding override. Do not change or modify `useG1Credits`; if quota blocks the task, ask the user before changing any credit policy.

The runner maps Agybird `read` to Antigravity's official `plan` execution mode and `write` to `accept-edits`. These modes express intent but do not override tool permission rules; a headless action that still needs confirmation is auto-denied.

Never pass `--dangerously-skip-permissions`. The runner itself never constructs a shell command.

## Interpret the result

The runner prints one JSON envelope to stdout:

- `success`: the Antigravity result and required verification passed.
- `partial`: Antigravity returned a terminal result, but at least one tool action failed.
- `needs_permission`: an action was denied and an allow-rule would authorize it. Every denied action is described in `permission_requests[]`. Ask the user to decide; see [troubleshooting.md](troubleshooting.md).
- `blocked`: an action was denied and no allow-rule applies.
- `error`: process, stream, timeout, or artifact validation failed.

Keep stderr as diagnostics; never parse it as the primary result.

## Stay in one session

One objective is one Antigravity conversation. Every follow-up run — answering a question, applying a granted permission, correcting a mistake, continuing after `partial` — belongs to the conversation already working on that objective. Starting over discards everything the session has read and reasoned about, and pays for it again.

The runner enforces this rather than trusting the caller to remember. It records the conversation per workspace and resumes it automatically, so a plain follow-up invocation continues where the last one stopped. Check `evidence.session_resumed` to confirm continuity actually happened.

Pass `--new-session` only when starting a genuinely new objective, and say so to the user when the previous one is unfinished. Pass `--conversation` only to resume a specific conversation that is not the recorded one.

Official references: [overview](https://antigravity.google/docs/cli/overview), [headless mode](https://antigravity.google/docs/cli/headless), and [best practices](https://antigravity.google/docs/cli/best-practices).
