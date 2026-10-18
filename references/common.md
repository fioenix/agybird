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

Optional runner flags are `--reference`, `--json-schema`, `--new-session`, `--conversation`, `--grant`, `--grant-scope`, `--model`, `--effort`, `--agent`, `--sandbox`, and `--timeout`. Pass `--grant` only with a rule the user has explicitly approved; see [troubleshooting.md](troubleshooting.md). Supply `--model`, `--effort`, `--agent`, or `--sandbox` only when the user explicitly requests the corresponding override. `--effort` accepts `low`, `medium`, `high`, `xhigh`, and `max`; not every model supports every level, and since `agy` 1.3.4 `--model` alone picks the model's default level. `--timeout` is passed to `agy` as `--print-timeout`; the runner kills `agy` only after a short grace period beyond it, so the partial answer agy returns on expiry is kept. Do not change or modify `useG1Credits`; if quota blocks the task, ask the user before changing any credit policy.

The runner maps Agybird `read` to Antigravity's official `plan` execution mode and `write` to `accept-edits`. These modes express intent but do not override tool permission rules; a headless action that still needs confirmation is auto-denied.

Never pass `--dangerously-skip-permissions`. The runner itself never constructs a shell command.

## Interpret the result

The runner prints one JSON envelope to stdout:

- `success`: the Antigravity result and required verification passed.
- `partial`: Antigravity returned a terminal result, but at least one tool action failed, or `--timeout` expired before the turn finished. Since `agy` 1.1.28 an expired timeout still exits 0 with a `SUCCESS` result and whatever partial response exists; the runner reads the timeout notice on stderr and reports `partial` instead.
- `needs_permission`: an action was denied and an allow-rule would authorize it. Every denied action is described in `permission_requests[]`, including actions agy lists only in the result's `denied_actions`. Ask the user to decide; see [troubleshooting.md](troubleshooting.md).
- `blocked`: an action was denied and no allow-rule can be suggested, either because none applies or because agy reported the action without its target.
- `error`: the process, stream, or artifact validation failed, or the runner had to kill `agy`. Exit code 3 means the agent or model API failed mid-turn; any response is partial.

The envelope provides comprehensive execution metrics:
- `structured_output`: Parsed payload when `--json-schema` is enforced.
- `subagents`: List of background subagents spawned by Antigravity during the run (`type_name`, `role`, `conversation_id`, `log_uri`, `workspace_uris`).
- `usage`: Detailed token breakdown including `input_tokens`, `output_tokens`, `thinking_tokens` (reasoning models), `cache_read_tokens` (prompt cache), and `total_tokens`.

Keep stderr as diagnostics; never parse it as the primary result.

## Stay in one session

One objective is one Antigravity conversation. Every follow-up run — answering a question, applying a granted permission, correcting a mistake, continuing after `partial` — belongs to the conversation already working on that objective. Starting over discards everything the session has read and reasoned about, and pays for it again.

The runner enforces this rather than trusting the caller to remember. It records the conversation per workspace and resumes it automatically, so a plain follow-up invocation continues where the last one stopped. Check `evidence.session_resumed` to confirm continuity actually happened.

Pass `--new-session` only when starting a genuinely new objective, and say so to the user when the previous one is unfinished. Pass `--conversation` only to resume a specific conversation that is not the recorded one.

Official references: [overview](https://antigravity.google/docs/cli/overview), [headless mode](https://antigravity.google/docs/cli/headless), and [best practices](https://antigravity.google/docs/cli/best-practices).
