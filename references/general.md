# General work

Use `--category general` for tasks that are neither repository engineering nor image creation: summarization, local research, comparison, planning, structured extraction, and requested non-code deliverables.

Default to `--mode read`. Use `--mode write` only when the requested outcome is a file or another explicit workspace change.

## Structured output with schemas

For structured output, enforce format constraints using `--json-schema`:
- **JSON Schema object**: An inline schema string, e.g. `'{"type":"object","properties":{"summary":{"type":"string"}},"required":["summary"]}'`
- **File path**: Path to a `.json` schema definition file.
- **Primitive type**: A primitive type name (`string`, `number`, `integer`, `boolean`).

The parsed payload will appear directly in `structured_output` within the result envelope. Keep the task bounded to the absolute working directory and name any required source files.

## Session continuity & verification

For a follow-up that genuinely depends on Antigravity's prior context, reuse the returned `conversation_id` with `--conversation` (or rely on the workspace default session). Start a fresh conversation with `--new-session` when the tasks are independent to avoid stale context.

Verify factual claims against local source material or primary external sources appropriate to the task. Verify created deliverables by opening or parsing them with a tool independent of `agy`.

See the official [headless-mode guide](https://antigravity.google/docs/cli/headless) for structured output and conversation controls.
