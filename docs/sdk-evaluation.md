# Antigravity Python SDK — runner backend evaluation

Date: 2026-08-03 · SDK version probed: `google-antigravity` 0.1.9 · CLI: `agy` 1.1.10

Evaluated in response to the architecture objection that one objective should occupy
one long-lived session, rather than spawning a fresh `agy -p` process per action.

## What the SDK genuinely fixes

Verified by reading the installed package, not from documentation.

**One process per objective.** `async with Agent(config)` holds a session open;
`await agent.chat(...)` can be called repeatedly against it. `agent.conversation_id`
is exposed and accepted back through `LocalAgentConfig(conversation_id=...)`.

**In-process permission decisions.** `google.antigravity.hooks.policy` exposes
`ask_user(tool, handler=...)`, where the handler receives a typed `ToolCall`
(`name`, `args`, `id`, `canonical_path`, `server_name`) and returns a boolean. It may
be async, so it can block on a human decision without terminating the run.

This deletes the machinery added in `719e848` and `a25a57f`: no `--grant`, no
writing allow-rules into `~/.gemini/config/projects/<id>.json`, no revert-on-exit,
no restart to apply a grant. Requirement R1 also becomes trivial — the request
arrives already structured, so nothing has to be recovered from a denial string.

**Workspace scoping for free.** `LocalAgentConfig(workspaces=[...])` automatically
prepends `policy.workspace_only()`, denying file tools outside those directories
with symlink resolution and case-fold handling. The CLI runner has no equivalent.

**Refuses unsafe defaults.** `Agent.__aenter__` raises if write tools or MCP servers
are enabled with no policy at all.

## The blocker

The SDK cannot use the Antigravity CLI's login. It offers exactly two endpoints:

| Endpoint | Requirement |
| --- | --- |
| `GeminiAPIEndpoint` | `GEMINI_API_KEY`, or `LocalAgentConfig(api_key=...)` |
| `VertexEndpoint` | `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION` |

Confirmed empirically. Starting an `Agent` on this machine, where `agy` itself works,
fails before any model call:

```
google.antigravity.types.AntigravityValidationError: A Gemini API key is required.
Set it via GEMINI_API_KEY environment variable or via LocalAgentConfig(api_key=...).
```

`agy` authenticates through `~/.gemini/oauth_creds.json`. No `GEMINI_API_KEY` is set
anywhere in this environment. The two paths are separately metered: the CLI draws on
the Antigravity subscription, the SDK bills per token to an AI Studio or GCP account.

This contradicts the project's stated premise. `SKILL.md` opens with "keeping its
authentication, permissions, sandbox, model access, and credits under the user's
existing configuration", and `README.md` is tested for the phrase "subscription
eligibility". Moving the runner to the SDK does not merely change a dependency —
it changes who pays for every token and how.

No credential bridge is proposed here. `GeminiAPIEndpoint.base_url` skips key
validation, but pointing it at a shim that replays subscription OAuth credentials
against a metered API is a billing circumvention, not an engineering solution.

## Secondary costs

**Runtime.** `pip install google-antigravity` pulled 43 transitive packages, including
`cryptography`, `protobuf`, `pydantic`, `uvicorn`, `starlette`, and `mcp`, plus a
compiled `bin/localharness` binary. Agybird is currently Node with zero runtime
dependencies, a property asserted by `tests/unit/docs-contract.test.mjs` against
`CONTRIBUTING.md`. Adding a Python runtime also widens the supply-chain surface that
`docs/threat-model.md` currently bounds to one known binary.

**Test and CI surface.** The suite is `node --test` across ubuntu/macos/windows on
Node 20 and 22. An SDK runner needs a parallel Python toolchain in CI.

## Decision

Rejected. The runner stays on the `agy` CLI.

The subscription is the reason this project exists; an SDK backend that bills per
token to a separate account would not be the same tool. The architectural complaint
that prompted the evaluation — one objective spread across many independent
processes — is answered instead by guaranteeing conversation continuity in the CLI
runner: it records the workspace's conversation, resumes it by default, and requires
`--new-session` to start over. Spawning a process per turn is acceptable; losing the
session is not.

The in-process `ask_user` hook remains the one thing the CLI cannot match. Permission
resolution therefore keeps costing a process restart and a disk-scoped grant.

## Still open

Three review findings from PR #1 remain, all real and all narrower than the above.
Staying on the CLI keeps all three:

- The overly-broad-target blacklist (`*`, `/`, `~`, `.*`) does not catch `.+` or `/.*`.
- `finally` does not run under `SIGKILL`, so a `once` grant can persist on disk.
- While a `once` grant is live, a concurrent process in the same repo inherits it.
