# Troubleshooting

## `agy` is missing

Ask the user for confirmation before installing anything. Present numbered choices when a choice is needed. After confirmation, use only the official command for the current operating system:

macOS or Linux:

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://antigravity.google/cli/install.ps1 | iex
```

Windows Command Prompt:

```cmd
curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd
```

Then resolve `agy` from PATH and rerun `agy --version`. See the official [install guide](https://antigravity.google/docs/cli/install).

## Authentication is missing or expired

Agybird relies on cached authentication from the official CLI. Run `agy` interactively and complete Google's normal sign-in flow, then retry the headless request. Do not inspect, copy, export, or transform cached credentials.

## Permission is blocked

Keep the result as `blocked`. Explain which action was denied and let the user decide through Antigravity's permission flow. Do not retry with `--dangerously-skip-permissions`.

## Quota or credits are blocked

Report the quota result. Do not modify `useG1Credits` automatically. Ask for explicit confirmation before changing that preference, because it changes which paid allowance bears the cost. See the official [credits guide](https://antigravity.google/docs/cli/credits).

## Stream or artifact validation fails

Keep the status as `partial` or `error`, preserve the sanitized warning, and check `agy --version` against current official [headless documentation](https://antigravity.google/docs/cli/headless). Do not guess a new event schema from prose output. For images, inspect the `generate_image` tool event and verify the artifact inside the working directory or the exact matching `brain/<conversation_id>` artifact directory.
