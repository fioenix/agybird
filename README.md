# Agybird

![Agybird — Delegate work to the Antigravity CLI you already use.](assets/wordmark.svg#gh-light-mode-only)
![Agybird — Delegate work to the Antigravity CLI you already use.](assets/wordmark-dark.svg#gh-dark-mode-only)

[![release](https://img.shields.io/github/v/release/fioenix/agybird)](https://github.com/fioenix/agybird/releases/latest)
[![CI](https://github.com/fioenix/agybird/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fioenix/agybird/actions/workflows/ci.yml)

Agybird is an MIT-licensed Agent Skill that lets Claude Code and Codex delegate work to the official Google Antigravity CLI (`agy`). It uses the user's existing Antigravity authentication and Gemini subscription instead of extracting credentials or calling private APIs.

Agybird is unofficial and is not affiliated with Google.

## What it covers

- **Code:** read-only review or scoped implementation, followed by independent diff and test verification.
- **Image:** new image generation and reference-image editing through Antigravity's built-in `image-generator` subagent and its `generate_image` tool, followed by artifact and visual verification.
- **General:** read-only analysis by default, structured JSON output, or explicit deliverable creation.

This is an Agent Skill plus a small local runner, not an MCP server. Claude Code or Codex remains the orchestrator; `agy` remains the authenticated provider process.

## Requirements

- Node.js 20 or newer.
- The [official Antigravity CLI](https://antigravity.google/docs/cli/install), installed and authenticated by running `agy` interactively.
- A Google account and Antigravity plan that is eligible for the requested capability.
- Tested with `agy` 1.4.2 on macOS. CI runs the suite on Linux, macOS, and Windows against a simulated `agy`, so a newer CLI that changes its JSON stream can break the runner until a release catches up.

Google continues to enforce subscription eligibility, quota and credit availability, permissions, sandbox configuration, and generated-content policy. Agybird does not bypass any of them.

## Install

Every install path ships the same skill from the same files. Pick the plugin path for your agent to get versioned updates, or the Skills CLI for a plain skill install.

### As a Claude Code plugin

Add the marketplace, then install the plugin:

```text
/plugin marketplace add fioenix/agybird
/plugin install agybird@agybird
```

Claude Code pins the installed plugin to the version in `.claude-plugin/plugin.json`, so updates arrive only when that version changes. This path requires Claude Code v2.1.142 or newer.

### As a Codex plugin

**Already installed 0.2.x from Codex?** Do not run the commands below: the Codex marketplace was named `agybird` before 0.3.0, and `codex plugin marketplace upgrade agybird` fails because the name changed. Follow the [migration guide](docs/migration.md) to move to `@Finolabs` side by side and to roll back if needed.

This repository hosts the **Finolabs** Codex marketplace, which lists Agybird next to two plugins by the same author, [Vietnamizer](https://github.com/fioenix/vietnamizer) and [Markmap Skills](https://github.com/fioenix/markmap-skills). For a new install, add the marketplace, then install only the plugins you want:

```bash
codex plugin marketplace add fioenix/agybird
codex plugin add agybird@Finolabs
codex plugin add vietnamizer@Finolabs
codex plugin add markmap-skills@Finolabs
```

You can also open `/plugins` inside Codex and install from the **Finolabs** marketplace. Start a new session afterwards so the skills load. To try a local clone, pass its path instead: `codex plugin marketplace add /path/to/agybird`.

Codex caches each plugin by the version in `.codex-plugin/plugin.json`. To pick up a new release, run `codex plugin marketplace upgrade Finolabs`, then `codex plugin add <plugin>@Finolabs` again.

### As an Agent Skill

Use the interactive installer and select Claude Code, Codex, or both:

```bash
npx skills add fioenix/agybird
```

For an explicit global install into both agents:

```bash
npx skills add fioenix/agybird --global --agent claude-code codex
```

The command uses the open-source [Skills CLI](https://github.com/vercel-labs/skills). Review its prompt before confirming destinations.

## Use

Agybird triggers only when the request explicitly mentions Agybird, `agy`, Antigravity CLI, or using the Gemini subscription through Antigravity. Examples:

```text
Use agy to review this repository read-only and cite the lines behind each finding.
```

```text
Use my Gemini subscription through Antigravity CLI to generate a minimal blue-bird image, then inspect the artifact visually.
```

```text
Ask agy to summarize docs/ as JSON with summary and risks. Do not write files.
```

The skill chooses a category and invokes `scripts/agybird.mjs` with the prompt on stdin. The runner emits one JSON envelope whose status is `success`, `partial`, `needs_permission`, `blocked`, or `error`.

One objective stays in one Antigravity conversation. The runner records the workspace's conversation and resumes it on the next invocation, so a follow-up continues where the last one stopped instead of paying to rediscover it; `evidence.session_resumed` reports whether that happened, and `--new-session` starts a new objective deliberately.

When headless `agy` denies an action it cannot prompt for, `needs_permission` carries a `permission_requests[]` entry naming the tool, the exact target, and the allow-rule that would authorize it, so the caller can ask the user instead of guessing at configuration. After the user approves, `--grant <rule>` applies it to the session being resumed; `--grant-scope once` (the default) removes it again when the run ends, and a rule left behind by an interrupted run is removed by the next one.

Because Antigravity applies a granted rule to every conversation in that project, a run on a *different* conversation in the same workspace returns `error` while a grant is live, rather than quietly inheriting it. Retry once the other run finishes.

## Data and network

Agybird has no server, analytics, or telemetry. The runner starts one local `agy` process per invocation and talks to nothing else: it sends the task on standard input, reads `agy`'s JSON stream, and prints one envelope. Everything `agy` does with the task, including reading workspace files, fetching URLs, and generating images, happens in Google's CLI under the user's own Google account and Antigravity settings. Outside the workspace the runner writes only `~/.agybird/sessions/` (workspace path and conversation id, never prompts or results) and a lock under `~/.agybird/grant-locks/` while an approved grant is applied. See [PRIVACY.md](PRIVACY.md).

## Safety defaults

- Read-only unless the user requests a file-changing outcome.
- No token, keychain, browser-session, or private-endpoint access.
- No shell execution inside the runner and zero runtime dependencies.
- No `--dangerously-skip-permissions`.
- No automatic change to `useG1Credits`, model, effort, agent, or sandbox.
- Image success requires a completed tool event and a real nonempty artifact in the working directory or the matching Antigravity conversation artifact directory.

See the [threat model](docs/threat-model.md), [security policy](SECURITY.md), and [official Antigravity overview](https://antigravity.google/docs/cli/overview).

## Develop

```bash
npm ci
npm run check
```

Tests use a fake provider process and require no Google credentials. Live tests are manual and must never run in public CI.

The optional live wrapper refuses to spend credits unless `AGYBIRD_LIVE_CONFIRM=1` is set for that invocation. It still preserves the current Antigravity model, sandbox, permissions, and `useG1Credits` setting.

The automated suite is the current contract. Two earlier reports are kept as dated snapshots: [deterministic verification](docs/verification/2026-08-02-simulated.md) and [live macOS verification with `agy` 1.1.9](docs/verification/2026-08-02-live-macos.md). Both predate the permission and session work, so they record a denial as `blocked` where the runner now reports `needs_permission`. They are history, not a description of current behaviour.

## License

[MIT](LICENSE). Use of Google Antigravity remains subject to [Google's Antigravity terms](https://antigravity.google/terms). See [PRIVACY.md](PRIVACY.md) for where delegated data goes and [TERMS.md](TERMS.md) for the terms of use.
