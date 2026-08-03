# Agybird Threat Model

## Scope and assets

Agybird protects the user's local workspace, prompt content, Antigravity authentication boundary, provider configuration, subscription credits, and the integrity of generated artifacts. It trusts the user-selected workspace, the locally installed Node.js runtime, the resolved official `agy` binary, and Google Antigravity only within their documented roles.

It does not attempt to secure a compromised operating system or a malicious official provider service.

## Data flow

The orchestrating agent sends a prompt over stdin to the Node.js runner. The runner constructs an argument array and spawns `agy` with `shell: false`. Antigravity reads the selected workspace, requests permissions under its own configuration, and emits NDJSON on stdout. Agybird normalizes those events and verifies image artifacts inside the workspace.

The runner also resolves an Antigravity project for the workspace and passes `--project`, because a conversation is bound to its project when it is created. With `--grant` it writes user-approved allow-rules into that project file under `~/.gemini/config/projects/`.

To keep one objective inside one conversation, the runner records the workspace's conversation id in `~/.agybird/sessions.json` and resumes it on the next run. These two files are the only things Agybird writes outside the workspace; it never writes inside the repository.

## Threats and controls

| Threat | Consequence | Control | Residual risk |
| --- | --- | --- | --- |
| Executable substitution on PATH | A malicious binary impersonates `agy` | Resolve and report the concrete executable path and version; document that users should install only from the official [install guide](https://antigravity.google/docs/cli/install) | A compromised account or PATH can still replace an executable |
| Malicious prompt | The delegated worker is instructed to widen scope or disclose data | Require explicit category and workspace, default to read mode, preserve Antigravity permissions, and independently inspect outcomes | Provider reasoning can still make mistakes within allowed access |
| Malicious repository instructions | Repository content attempts prompt injection or unrelated file access | Treat repository text as untrusted when it conflicts with the user task; bound verification to requested files | Read access can expose sensitive files already inside the workspace |
| Oversized output | Memory exhaustion or terminal flooding | Limit provider output to 16 MiB and prompt input to 1 MiB; terminate the child on overflow | Limits are per invocation, not an operating-system resource sandbox |
| Artifact path spoofing | A provider claims an unrelated local file as generated output | Resolve canonical paths; require containment in the working directory or the exact `brain/<conversation_id>` provider artifact directory; require a supported raster extension, nonzero size, and a completed image tool event | File content can still be visually wrong or maliciously crafted |
| Permission soft-denial with exit zero | A blocked write is falsely reported as success | Inspect stderr and tool statuses for soft-denial evidence and normalize the result to `needs_permission` or `blocked` | New provider wording may require parser updates |
| Unapproved permission grant | A calling agent passes `--grant` for a rule the user never approved, widening what the next run may do | Refuse `--grant` when the workspace has no recorded session and when it accompanies `--new-session`, restrict rules to the allow-rule kinds `agy` recognizes, reject `*`, `/`, `~`, and `.*` targets, and default `--grant-scope` to `once` so an unapproved rule cannot outlive one run | Each run is a separate process holding no state, so the runner cannot prove a rule came from a request it previously reported; the caller remains responsible for asking the user |
| Overbroad grant request | Antigravity asks for a rule far wider than the denied call, such as `command(git)` for one `git log` | Report the requested rule verbatim in `permission_requests[]` from the `ask_permission` payload so the user approves the real scope, and document preferring the narrowest target | A user who approves a wide rule with `remember` keeps that access for the repository |
| Permission-request prompt injection | Untrusted stream text in a denial reason is rendered to the user or an agent as if it were an instruction to approve | Expose tool, target, and rule as separate structured fields, truncate each to 300 characters, and require callers to render only those fields | A caller that ignores the contract and pastes raw text can still be misled |
| Unintended session reuse | An unrelated objective silently inherits an earlier conversation, so one task's context and instructions carry into another | Scope the recorded conversation to a single workspace, resume only ids Agybird itself recorded, require `--new-session` to start over, and report which happened in `evidence.session_resumed` | A caller that never starts a new session keeps appending unrelated objectives to one conversation |
| Session store corruption or loss | An interrupted or concurrent write leaves the store unreadable, silently dropping every workspace's session | Key entries on the canonical path, write through a temporary file and rename so no partial store is ever visible, and preserve an unreadable store as `sessions.json.corrupt` instead of overwriting it | Two runs finishing at the same moment can still lose one entry, which costs a resumed conversation but nothing in Antigravity |
| Session store disclosure | `~/.agybird/sessions.json` collects the paths of every workspace Agybird has run in, alongside their conversation ids | Record only the workspace path and conversation id, never prompts or results, and keep the file in the user's own home directory | Any process running as the user can read it, though the same process can already read Antigravity's credentials and conversation history |
| Supply-chain compromise | Dependencies or CI actions execute attacker code | Keep zero runtime dependencies, commit the lockfile, pin GitHub Actions by full SHA, and use least-privilege workflow permissions | Node.js, `agy`, Git, and the Skills CLI remain external dependencies |
| Local data disclosure | Prompts, credentials, or unrelated files reach logs or outputs | Accept prompts on stdin, avoid credential stores, redact raw provider diagnostics, and avoid persisting live prompt bodies | The official provider receives task context needed to perform the work |

## Policy and authorization boundary

Agybird never reads Antigravity's credential cache, changes `useG1Credits`, calls private endpoints, or passes `--dangerously-skip-permissions`. It does not bypass subscription eligibility, quota, sandbox, permissions, or content policy. Use remains subject to the [Antigravity terms](https://antigravity.google/terms).

Agybird never invents an allow-rule. A rule reaches `--grant` only after the user approves the request the runner reported, and the runner widens no permission on its own.

Review this model when the official [headless event format](https://antigravity.google/docs/cli/headless), artifact behavior, or security boundary changes.
