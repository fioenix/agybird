# Changelog

All notable changes to Agybird are documented in this file.

## Unreleased

## 0.3.0 - 2026-08-03

Closes the two concurrency risks the earlier permission work left documented as
residual. Both came from state being shared where it should have been per-run.

### Breaking

- The session store is one file per workspace under `~/.agybird/sessions/` instead of a shared `sessions.json`. A session recorded by 0.2.x is not carried over, so the first run after upgrading starts a new conversation.
- A run is refused when another run in the same workspace holds a one-time allow-rule for a *different* conversation. It returns `error` and says so; retry once the other finishes. A run resuming the same conversation is unaffected.

### Fixes

- Stop a concurrent run from inheriting a live `once` grant. A grant is written to an Antigravity project file that applies to every conversation under that project, so a second objective in the same repository silently gained a rule approved for the first. The grant is now held under a per-workspace lock, released with the grant and ignored when its process is gone. Isolating grants by giving each objective its own project was tested and rejected: it works, but leaves a project file per objective in the user's Antigravity configuration that cannot be deleted afterwards, because a conversation stays bound to its project.
- Stop two runs finishing at the same moment from losing a session record. Reading, merging and rewriting one shared map meant the later write dropped the earlier entry, and a single unreadable file cost every workspace its session. One file per workspace removes both: a run only ever writes its own record. The `sessions.json.corrupt` salvage is gone with the shared file that needed it.

## 0.2.1 - 2026-08-03

- Run when invoked through a symlinked path. `import.meta.url` resolves to the real path while `argv[1]` keeps the path as typed, so the entry-point guard never matched and the runner exited 0 without producing an envelope or a single line of output. Skills are installed as a symlink, so every release so far has been silently inert on its own installed path; only invocations against the repository checkout worked.

## 0.2.0 - 2026-08-03

Denied actions are now explained and recoverable, and one objective stays in one
Antigravity conversation instead of restarting on every invocation.

### Breaking

- A run resumes the workspace's recorded conversation by default rather than starting a new one. Pass `--new-session` to begin a new objective deliberately.
- The result envelope gained `permission_requests[]`, `evidence.session_resumed`, and `target_truncated` on each permission request. A caller that validates the envelope shape has to accept them.
- `needs_permission` joins `success`, `partial`, `blocked`, and `error` as a status. A caller that treats every non-`success` status as fatal will stop on a denial it could have resolved.
- The runner now writes outside the workspace: a conversation record in `~/.agybird/sessions.json`, and an Antigravity project file under `~/.gemini/config/projects/` for repositories Antigravity has not seen. Neither touches the working tree.

### Permissions

- Report a denied action as `needs_permission` with a `permission_requests[]` entry naming the tool, target, and the allow-rule that would authorize it, instead of an unexplained `blocked`. `blocked` is kept for denials no allow-rule can address.
- Take the requested rule from the `ask_permission` payload when agy asks for a grant itself, so the user approves the scope actually being requested rather than an inferred one.
- Add `--grant` and `--grant-scope` to resume a blocked session with a user-approved rule, written as a repository-scoped Antigravity project grant. `once` reverts it when the run ends; `remember` keeps it.
- Document the verified allow-rule syntax and the two locations agy reads rules from.

### Session continuity

- Record the workspace's conversation and resume it automatically, reported through `evidence.session_resumed`. `--grant` no longer needs a hand-threaded `--conversation`, and is refused when there is no session to unblock.
- Resolve an Antigravity project for the workspace on every run, because a conversation is bound to its project when it is created and a later grant otherwise never reaches the resumed session.

### Fixes

- Build `suggested_rule` from the target exactly as reported. It was built from the flattened, truncated display string, so a rule for a multi-line command could never match the call it came from — the user approved it and the same action was denied again. The rendered `target` stays bounded, and `target_truncated` says when the rule covers more than was shown; no rule is suggested for a target too long to review ([#3](https://github.com/fioenix/agybird/issues/3)).
- Require an allow-rule target to be an escaped literal instead of screening four literal spellings. agy matches targets as regular expressions, so `command(.+)` and `read_file(/.*)` were accepted as narrow rules while authorizing everything ([#4](https://github.com/fioenix/agybird/issues/4)).
- Repair a `once` grant left on disk by an interrupted run. `finally` does not run under `SIGKILL`, which silently turned `once` into `remember`. The undo is now journalled before the grant is applied, the next run removes anything abandoned and reports it in `warnings[]`, and `SIGINT`/`SIGTERM` clean up immediately ([#5](https://github.com/fioenix/agybird/issues/5)).
- Key the session store on the canonical workspace path, so a symlinked directory or a differently-cased Windows drive letter no longer loses the conversation.
- Write the session store through a temporary file and rename, and preserve an unreadable store as `sessions.json.corrupt` rather than overwriting every other workspace.

### Documentation

- Record why the Antigravity Python SDK was not adopted as a runner backend in `docs/sdk-evaluation.md`: it cannot use the CLI's OAuth login and requires a separately billed Gemini API key.
- Cover permission grants, session reuse, and session-store durability in `docs/threat-model.md`.

## 0.1.1 - 2026-08-02

- Add a Claude Code plugin manifest and a single-plugin marketplace so Agybird can be installed with `/plugin install agybird@agybird`.

## 0.1.0 - 2026-08-02

- Add an Agent Skill for code, image, and general Antigravity work.
- Add a dependency-free Node.js runner for official `agy` headless mode.
- Add stable result envelopes, artifact verification, and cross-platform tests.
