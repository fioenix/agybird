# Agybird

Agybird is an MIT-licensed Agent Skill that lets Claude Code and Codex delegate work to the official Google Antigravity CLI (`agy`). It uses the user's existing Antigravity authentication and Gemini subscription instead of extracting credentials or calling private APIs.

Agybird is unofficial and is not affiliated with Google.

## What it covers

- **Code:** read-only review or scoped implementation, followed by independent diff and test verification.
- **Image:** new image generation and reference-image editing through Antigravity's built-in `generate_image` tool, followed by artifact and visual verification.
- **General:** read-only analysis by default, structured JSON output, or explicit deliverable creation.

This is an Agent Skill plus a small local runner, not an MCP server. Claude Code or Codex remains the orchestrator; `agy` remains the authenticated provider process.

## Requirements

- Node.js 20 or newer.
- The [official Antigravity CLI](https://antigravity.google/docs/cli/install), installed and authenticated by running `agy` interactively.
- A Google account and Antigravity plan that is eligible for the requested capability.

Google continues to enforce subscription eligibility, quota and credit availability, permissions, sandbox configuration, and generated-content policy. Agybird does not bypass any of them.

## Install

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

The skill chooses a category and invokes `scripts/agybird.mjs` with the prompt on stdin. The runner emits one JSON envelope whose status is `success`, `partial`, `blocked`, or `error`.

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

## License

[MIT](LICENSE). Use of Google Antigravity remains subject to [Google's Antigravity terms](https://antigravity.google/terms).
