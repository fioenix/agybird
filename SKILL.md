---
name: agybird
description: Delegate code work, image generation or editing, and general tasks to the official Google Antigravity CLI through an existing Gemini subscription. Use this skill only when the user explicitly mentions Agybird, `agy`, Antigravity CLI, or asks to use their Gemini subscription through Antigravity. Do not use or trigger it for generic coding, image, or research requests.
compatibility: Requires Node.js 20+ and the official `agy` CLI authenticated by the user.
---

# Agybird

Use the official Antigravity CLI as a delegated worker while keeping its authentication, permissions, sandbox, model access, and credits under the user's existing configuration.

## Route the request

1. Read [references/common.md](references/common.md) for every invocation.
2. Select exactly one category:
   - Read [references/code.md](references/code.md) for repository inspection, implementation, debugging, refactoring, or tests.
   - Read [references/image.md](references/image.md) for generating a new image or editing reference images.
   - Read [references/general.md](references/general.md) for analysis, research over local context, structured output, or non-code deliverables.
3. Read [references/security.md](references/security.md) before any write-mode or sensitive-repository task.
4. Read [references/troubleshooting.md](references/troubleshooting.md) only when `agy` is missing, authentication fails, permissions block work, quota is exhausted, or output cannot be parsed.

## Core workflow

1. Resolve this skill's absolute directory and verify Node.js 20 or newer.
2. Check `agy --version`. If `agy` is missing, pause and ask for confirmation before using an official installer.
3. Infer `read` or `write` from the user's requested outcome. Default to `read` when inspection can satisfy the request.
4. Invoke `scripts/agybird.mjs` with an absolute `--cwd` and send the task through standard input.
5. Inspect the normalized result envelope. Treat `partial`, `blocked`, and `error` as distinct outcomes; do not describe them as success.
6. Independently verify the result according to the selected category.

Do not change model, effort, agent, sandbox, or credit settings unless the user explicitly asks for that exact change. Never bypass Antigravity permissions.
