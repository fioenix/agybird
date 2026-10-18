# Changelog

All notable changes to Agybird are documented in this file.

## Unreleased

Verified against `agy` 1.4.2 with live headless runs on macOS: a read-only task, a denied command, an expired print timeout, and image generation.

- An expired `--timeout` is reported as `partial`. Since `agy` 1.1.28 the CLI answers it with exit 0 and a `SUCCESS` result, which the runner used to report as `success` with an empty or cut-off response. The runner now waits a short grace period past `--print-timeout` before killing `agy`, so that partial answer arrives.
- Image work through the `image-generator` subagent is recognised. Since `agy` 1.2.16 the main agent no longer calls `generate_image` itself, so every image run ended in `error`. The runner now accepts a completed `image-generator` subagent and finds its output among the images saved during the run in the brain directory of the run's conversation or its image subagent. The delegated prompt no longer asks for `generate_image` by name, and tells Antigravity not to copy or convert images with shell commands, which a headless run cannot approve.
- `denied_actions` on the terminal result now counts as a permission outcome. Each action reported only there appears in `permission_requests[]` without a target or a suggested rule, and the run is `blocked` instead of `success`.
- Exit code 3 is explained as an agent or model API failure mid-turn. The `AGY_ERROR` line stays out of the envelope with the rest of stderr.
- `--effort` accepts `xhigh` and `max`.
- `unsandboxed(...)` is no longer accepted by `--grant`; `agy` 1.2.2 deprecated it in favour of `command(...)`. When agy still asks for an `unsandboxed` grant, the runner suggests the matching `command(...)` rule.
- A conversation id from the stream is used as a brain directory only when it is a plain directory name.
- References updated for the `--json-schema` object-root requirement, the ask-first default for URL reads, plan-mode approval requests, and the retired default search tools.

## 0.1.1 - 2026-08-23

- Verified full compatibility with official Antigravity CLI `agy` v1.1.19.
- Added background subagent hierarchy tracking: captures `subagent_info` from stream events and reports `subagents[]` (`type_name`, `role`, `conversation_id`, `log_uri`, `workspace_uris`) in the result envelope.
- Enhanced token and thinking observability: `usage` metrics now expose `thinking_tokens` (for reasoning models) and `cache_read_tokens` (for prompt caching) alongside standard token counts.
- Unified structured output extraction: `structured_output` is exposed at top-level envelope when `--json-schema` is enforced.
- Expanded native tool allow-rule mappings for `grep_search`, `find_by_name`, `read_url_content`, and `call_mcp_tool`.
- Added curated documentation hierarchy index in `references/docs.md` mapping core Antigravity architecture, headless IPC, permissions, sandbox, artifacts, and commands.
- Enhanced prompt orchestration guidelines in `references/code.md`, `references/general.md`, `references/image.md`, and `references/common.md`.

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
