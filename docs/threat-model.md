# Agybird Threat Model

## Scope and assets

Agybird protects the user's local workspace, prompt content, Antigravity authentication boundary, provider configuration, subscription credits, and the integrity of generated artifacts. It trusts the user-selected workspace, the locally installed Node.js runtime, the resolved official `agy` binary, and Google Antigravity only within their documented roles.

It does not attempt to secure a compromised operating system or a malicious official provider service.

## Data flow

The orchestrating agent sends a prompt over stdin to the Node.js runner. The runner constructs an argument array and spawns `agy` with `shell: false`. Antigravity reads the selected workspace, requests permissions under its own configuration, and emits NDJSON on stdout. Agybird normalizes those events and verifies image artifacts inside the workspace.

## Threats and controls

| Threat | Consequence | Control | Residual risk |
| --- | --- | --- | --- |
| Executable substitution on PATH | A malicious binary impersonates `agy` | Resolve and report the concrete executable path and version; document that users should install only from the official [install guide](https://antigravity.google/docs/cli/install) | A compromised account or PATH can still replace an executable |
| Malicious prompt | The delegated worker is instructed to widen scope or disclose data | Require explicit category and workspace, default to read mode, preserve Antigravity permissions, and independently inspect outcomes | Provider reasoning can still make mistakes within allowed access |
| Malicious repository instructions | Repository content attempts prompt injection or unrelated file access | Treat repository text as untrusted when it conflicts with the user task; bound verification to requested files | Read access can expose sensitive files already inside the workspace |
| Oversized output | Memory exhaustion or terminal flooding | Limit provider output to 16 MiB and prompt input to 1 MiB; terminate the child on overflow | Limits are per invocation, not an operating-system resource sandbox |
| Artifact path spoofing | A provider claims an unrelated local file as generated output | Resolve canonical paths; require containment in the working directory or the exact `brain/<conversation_id>` provider artifact directory; require a supported raster extension, nonzero size, and a completed image tool event | File content can still be visually wrong or maliciously crafted |
| Permission soft-denial with exit zero | A blocked write is falsely reported as success | Inspect stderr and tool statuses for soft-denial evidence and normalize the result to `blocked` | New provider wording may require parser updates |
| Supply-chain compromise | Dependencies or CI actions execute attacker code | Keep zero runtime dependencies, commit the lockfile, pin GitHub Actions by full SHA, and use least-privilege workflow permissions | Node.js, `agy`, Git, and the Skills CLI remain external dependencies |
| Local data disclosure | Prompts, credentials, or unrelated files reach logs or outputs | Accept prompts on stdin, avoid credential stores, redact raw provider diagnostics, and avoid persisting live prompt bodies | The official provider receives task context needed to perform the work |

## Policy and authorization boundary

Agybird never reads Antigravity's credential cache, changes `useG1Credits`, calls private endpoints, or passes `--dangerously-skip-permissions`. It does not bypass subscription eligibility, quota, sandbox, permissions, or content policy. Use remains subject to the [Antigravity terms](https://antigravity.google/terms).

Review this model when the official [headless event format](https://antigravity.google/docs/cli/headless), artifact behavior, or security boundary changes.
