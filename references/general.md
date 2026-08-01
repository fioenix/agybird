# General work

Use `--category general` for tasks that are neither repository engineering nor image creation: summarization, local research, comparison, planning, structured extraction, and requested non-code deliverables.

Default to `--mode read`. Use `--mode write` only when the requested outcome is a file or another explicit workspace change.

For structured output, pass an inline JSON Schema with `--json-schema`. Validate the returned `response` against the same schema rather than trusting appearance alone. Keep the task bounded to the absolute working directory and name any required source files.

For a follow-up that genuinely depends on Antigravity's prior context, reuse the returned `conversation_id` with `--conversation`. Start a fresh conversation when the tasks are independent to avoid stale context.

Verify factual claims against local source material or primary external sources appropriate to the task. Verify created deliverables by opening or parsing them with a tool independent of `agy`.

See the official [headless-mode guide](https://antigravity.google/docs/cli/headless) for structured output and conversation controls.
