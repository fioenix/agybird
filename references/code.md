# Code work

## Choose the mode

- Use `--category code --mode read` for review, diagnosis, architecture analysis, explanation, or planning that does not require edits.
- Use `--category code --mode write` only when the user asks to implement, fix, refactor, add tests, or otherwise change files.

State the exact requested scope in the prompt. Preserve the repository's own instructions and unrelated user changes.

## Verify independently

For read mode, capture the repository state before and after and confirm there are no new changes caused by the delegation.

For write mode:

1. Inspect `git status --short`, `git diff`, and untracked files after `agy` finishes.
2. Confirm each changed line is in the user's requested scope.
3. Rerun the smallest relevant test, build, lint, or reproduction outside `agy`.
4. Report Antigravity's result separately from your independent verification.

Do not accept a textual claim that tests passed as evidence. Use the real command output. If the workspace is not a Git repository, snapshot the bounded target files or use another non-destructive comparison.

See the official [best-practices guide](https://antigravity.google/docs/cli/best-practices) for workspace context and non-interactive usage.
