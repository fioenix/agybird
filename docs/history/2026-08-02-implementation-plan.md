# Agybird Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Agybird v0.1.0 as an MIT-licensed Agent Skill that lets Claude Code and Codex safely delegate code work, image generation/editing, and general work to the authenticated Google Antigravity CLI.

**Architecture:** A single portable `SKILL.md` teaches agents when and how to use Agybird. A dependency-free Node.js runner owns argument validation, prompt construction, process spawning, NDJSON parsing, status normalization, and artifact verification while leaving authentication, permissions, model access, credits, and sandbox policy entirely with the official `agy` binary.

**Tech Stack:** Node.js 20+, ECMAScript modules, built-in `node:test`, official Google Antigravity CLI, GitHub Actions.

## Global Constraints

- Use only the public `agy` CLI surface; never read tokens, keychains, browser sessions, or private Google endpoints.
- Invoke `agy` with `spawn` and an argument array, never through a shell.
- Never pass `--dangerously-skip-permissions`, modify `useG1Credits`, or override the user's sandbox configuration unless `--sandbox` is explicitly requested.
- Preserve prompt text in memory only. Do not persist prompts or credentials in reports, fixtures, or logs.
- Keep runtime dependencies at zero and support macOS, Linux, and Windows.
- Use test-first changes: add a failing test, confirm the expected failure, implement the minimum behavior, then rerun the targeted suite.
- Commit each task atomically with a concise imperative commit message.

---

## Task 1: Establish the Open-Source Package Baseline

**Files:**

- Create: `package.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `CHANGELOG.md`

- [ ] Add `package.json` with `type: module`, `private: true`, Node.js `>=20`, and scripts for `test`, `test:unit`, `test:integration`, and `check`.
- [ ] Add `.gitignore` entries for dependencies, coverage, temporary output, live-test artifacts, and platform/editor files without ignoring source fixtures.
- [ ] Add the exact MIT license text with copyright `2026 Fioenix`.
- [ ] Add an initial `CHANGELOG.md` entry for unreleased v0.1.0 scope.
- [ ] Run `npm install --package-lock-only --ignore-scripts` and verify the lockfile contains no packages.
- [ ] Run `npm pkg get private type engines scripts` and verify the package is private, ESM, and Node 20+.
- [ ] Commit with `Add open-source package baseline`.

## Task 2: Build Argument Parsing and Request Validation

**Files:**

- Create: `scripts/agybird.mjs`
- Create: `tests/unit/arguments.test.mjs`

- [ ] Write failing tests for required `--category` and `--cwd`, valid categories (`code`, `image`, `general`), valid modes (`read`, `write`), repeated absolute `--reference`, positive `--timeout`, and optional `--json-schema`, `--conversation`, `--model`, `--effort`, `--agent`, and `--sandbox`.
- [ ] Write failing tests that reject unknown flags, missing values, relative working directories, relative references, unsupported effort values, and image references that are absent or not regular files.
- [ ] Run `node --test tests/unit/arguments.test.mjs` and confirm failure because the parser does not exist.
- [ ] Export `parseArgs(argv)` and `validateRequest(options, fsApi)` from `scripts/agybird.mjs`; keep `main()` behind a direct-execution guard.
- [ ] Make `read` the default mode and set a bounded default timeout without supplying model, effort, agent, or sandbox flags implicitly.
- [ ] Run the targeted test and confirm it passes on the local platform.
- [ ] Commit with `Add runner argument validation`.

## Task 3: Construct Category-Specific Delegation Prompts

**Files:**

- Modify: `scripts/agybird.mjs`
- Create: `tests/unit/prompts.test.mjs`

- [ ] Write failing tests for a shared safety preamble and category-specific prompt contracts.
- [ ] Verify code/read forbids writes, code/write limits changes to the requested scope and asks for tests, image generation requires the built-in `generate_image` tool, image editing maps absolute reference paths into `ImagePaths`, and general/read forbids writes.
- [ ] Verify caller prompt text is preserved verbatim as a delimited task body and no unrequested model, effort, agent, sandbox, or credit policy is injected.
- [ ] Run `node --test tests/unit/prompts.test.mjs` and confirm the expected missing-export failure.
- [ ] Export `buildDelegationPrompt(options, userPrompt)` with compact deterministic templates for `code`, `image`, and `general`.
- [ ] Run the targeted tests and confirm they pass.
- [ ] Commit with `Add category delegation prompts`.

## Task 4: Translate Runner Options into a Safe `agy` Invocation

**Files:**

- Modify: `scripts/agybird.mjs`
- Create: `tests/unit/command.test.mjs`

- [ ] Write failing tests for the exact base arguments: `-p`, delegated prompt, `--output-format stream-json`, and `--print-timeout`.
- [ ] Verify optional arguments map exactly to `--json-schema`, `--conversation`, `--model`, `--effort`, `--agent`, and `--sandbox` only when supplied.
- [ ] Verify the generated argument array never includes `--dangerously-skip-permissions` or any credit-setting mutation.
- [ ] Run `node --test tests/unit/command.test.mjs` and confirm failure because command construction is absent.
- [ ] Export `buildAgyArgs(options, delegatedPrompt)` and keep binary resolution separate from the argument array.
- [ ] Run the targeted tests and confirm they pass.
- [ ] Commit with `Add safe agy command construction`.

## Task 5: Parse Antigravity Streams and Normalize Outcomes

**Files:**

- Modify: `scripts/agybird.mjs`
- Create: `tests/fixtures/streams/success.ndjson`
- Create: `tests/fixtures/streams/permission-denied.ndjson`
- Create: `tests/fixtures/streams/tool-error.ndjson`
- Create: `tests/fixtures/streams/malformed.ndjson`
- Create: `tests/unit/stream-parser.test.mjs`

- [ ] Write failing parser tests for `init`, `step_update`, tool-call progress, terminal `result`, usage data, conversation IDs, malformed lines, missing terminal results, and explicit tool errors.
- [ ] Add cases where process exit code is zero but stderr or events report permission denial; expect `blocked`, not `success`.
- [ ] Run `node --test tests/unit/stream-parser.test.mjs` and confirm the expected missing-parser failure.
- [ ] Export `createStreamParser()`, `classifyOutcome(...)`, and `makeEnvelope(...)`.
- [ ] Emit a stable JSON envelope with `schema_version`, `status`, `category`, `conversation_id`, `response`, `tool_calls`, `artifacts`, `warnings`, `usage`, and `evidence`.
- [ ] Ensure malformed provider events become warnings or errors without leaking raw prompts.
- [ ] Run the targeted tests and confirm they pass.
- [ ] Commit with `Add Antigravity stream normalization`.

## Task 6: Execute `agy` with Timeouts and Artifact Verification

**Files:**

- Modify: `scripts/agybird.mjs`
- Create: `tests/fixtures/fake-agy.mjs`
- Create: `tests/integration/runner.test.mjs`

- [ ] Build a cross-platform fake `agy` fixture whose behavior is selected by a harmless marker in the test prompt and which can emit success, permission denial, malformed output, nonzero exit, delayed output, image creation, and image-tool failure.
- [ ] Write failing integration tests that spawn the runner as a real child process and provide the user prompt through stdin.
- [ ] Verify stdout contains exactly one JSON envelope while diagnostics remain on stderr.
- [ ] Verify timeouts terminate the child and report `error`; nonzero exit reports `error`; zero-exit permission denial reports `blocked`; partial tool completion reports `partial`.
- [ ] Verify image success requires at least one existing, nonempty file with a supported raster extension and a completed `generate_image` tool event.
- [ ] Run `node --test tests/integration/runner.test.mjs` and confirm expected failures.
- [ ] Implement `runAgy(...)`, timeout handling, graceful process termination, PATH-based binary lookup, version preflight, stream consumption, and artifact validation.
- [ ] Put a cross-platform fake `agy` executable first on a temporary test PATH; production and tests must use the same PATH resolution code.
- [ ] Run unit and integration tests and confirm they pass.
- [ ] Commit with `Add secure agy process execution`.

## Task 7: Author the Agent Skill and Operational References

**Files:**

- Create: `SKILL.md`
- Create: `references/common.md`
- Create: `references/code.md`
- Create: `references/image.md`
- Create: `references/general.md`
- Create: `references/security.md`
- Create: `references/troubleshooting.md`
- Create: `tests/unit/skill-contract.test.mjs`

- [ ] Write failing contract tests for valid skill frontmatter, explicit triggers, three work categories, prompt-via-stdin invocation, missing-CLI confirmation flow, cached-auth guidance, credit-preservation rule, code diff/test verification, image artifact/visual verification, and official documentation links.
- [ ] Run `node --test tests/unit/skill-contract.test.mjs` and confirm failure because the skill files are absent.
- [ ] Write a concise `SKILL.md` router and move detailed instructions into the seven reference files.
- [ ] Document the confirmed official install commands per supported OS, but require user confirmation before running them.
- [ ] State that Agybird is unofficial, is not affiliated with Google, does not bypass Antigravity policy, and gives no legal safe harbor.
- [ ] Ensure examples use quoted absolute paths, stdin, and the Node runner without shell interpolation.
- [ ] Run the skill contract test and a placeholder scan: `rg -n 'TODO|TBD|FIXME|YOUR_|<[^>]+>' SKILL.md references README.md docs package.json .github || true`.
- [ ] Commit with `Add Agybird Agent Skill`.

## Task 8: Document Security, Usage, and Contribution Boundaries

**Files:**

- Create: `README.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `docs/threat-model.md`
- Create: `tests/unit/docs-contract.test.mjs`

- [ ] Write failing documentation tests for install command `npx skills add fioenix/agybird`, prerequisites, Claude Code and Codex usage, three categories, authorization boundary, security reporting, supported Node versions, and current official Antigravity docs links.
- [ ] Run `node --test tests/unit/docs-contract.test.mjs` and confirm failure because documentation is absent.
- [ ] Author concise usage examples and explain that subscription eligibility, quotas, permissions, and generated-content policy remain enforced by Google Antigravity.
- [ ] Add a threat model covering executable substitution on PATH, malicious prompts/repositories, oversized output, artifact path spoofing, permission soft-denials, supply-chain risk, and local data disclosure.
- [ ] Document responsible disclosure without inventing a security email; use private GitHub security advisories.
- [ ] Run docs contract tests and verify every external link with an HTTP status check that does not send credentials.
- [ ] Commit with `Document Agybird security and usage`.

## Task 9: Add Cross-Platform CI and Release Gates

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `tests/unit/workflow-contract.test.mjs`

- [ ] Resolve immutable full commit SHAs for the required official GitHub Actions and record the corresponding release tags in comments.
- [ ] Write failing tests that require full-SHA pinning, least-privilege permissions, Node 20 and 22, Ubuntu/macOS/Windows coverage, no live credentials, and no `pull_request_target`.
- [ ] Run `node --test tests/unit/workflow-contract.test.mjs` and confirm failure because workflows are absent.
- [ ] Add CI jobs for `npm ci` and `npm run check` across all supported operating systems.
- [ ] Add a release workflow that validates a pushed `v*` tag and publishes GitHub release notes with read-only contents until the release job needs `contents: write`.
- [ ] Run the workflow contract tests and parse YAML structurally where available; otherwise validate exact contract text.
- [ ] Commit with `Add cross-platform release gates`.

## Task 10: Perform Local Static and Simulated Integration Verification

**Files:**

- Create: `scripts/check.mjs`
- Create: `tests/integration/install-layout.test.mjs`
- Create: `docs/verification/2026-08-02-simulated.md`
- Modify: `package.json`

- [ ] Write a check script that runs all Node tests, imports the runner, validates zero runtime dependencies, scans forbidden flags and placeholders, and checks executable documentation paths.
- [ ] Write an install-layout test that copies only distributable files into a temporary skill directory and verifies every referenced path resolves.
- [ ] Run `npm run check` and fix only failures traceable to the approved design.
- [ ] Test from a clean temporary clone with `npm ci && npm run check`.
- [ ] Record tool versions, commands, exit codes, and summarized results in the simulated verification report without prompts, credentials, or home-directory internals.
- [ ] Review `git diff --check`, `git status --short`, and the distributable file list.
- [ ] Commit with `Add reproducible verification checks`.

## Task 11: Install Locally and Run Real Antigravity Acceptance Tests

**Files:**

- Create: `scripts/live-test.mjs`
- Create: `docs/verification/2026-08-02-live-macos.md`
- Modify: `.gitignore`

- [ ] Confirm the resolved official binary path and record only its path and `agy --version`; do not inspect auth storage.
- [ ] Install the skill from the private repository into isolated temporary Claude Code and Codex skill homes, then verify both discover `SKILL.md` and all references.
- [ ] Run a real general/read request with a strict JSON schema and verify the stable envelope plus schema-conforming response.
- [ ] Create a disposable Git repository, run a real code/write request to implement a tiny tested change, inspect the diff/untracked files, and independently rerun the targeted test.
- [ ] Run a real image generation request, validate the `generate_image` tool completion and nonempty raster artifact, and inspect the image visually.
- [ ] Run a real reference-image edit using the generated image, validate the new artifact independently, and inspect it visually.
- [ ] If authentication is missing, stop and instruct `agy` interactive login. If quota is blocked, request confirmation before any change to `useG1Credits`.
- [ ] Save only sanitized commands, versions, envelope fields, artifact metadata, test results, and gate statuses in the live report; exclude prompt bodies and credentials.
- [ ] Run `npm run check` after live-test-driven fixes.
- [ ] Commit with `Verify Agybird against live Antigravity`.

## Task 12: Audit, Publish, and Release v0.1.0

**Files:**

- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/verification/2026-08-02-live-macos.md`

- [ ] Review the complete diff against `docs/superpowers/specs/2026-08-02-agybird-design.md` and this plan; account for every acceptance criterion.
- [ ] Run `npm ci`, `npm run check`, `git diff --check`, the placeholder scan, and a secret-pattern scan limited to tracked repository content.
- [ ] Inspect `npm pack --dry-run --json` only as a distributable-content audit; confirm `private: true` still prevents npm publication.
- [ ] Push `main` while the repository remains private and wait for all GitHub Actions checks to pass.
- [ ] Update the changelog date, verification links, and badges using actual results only; commit with `Prepare Agybird v0.1.0` and rerun all gates.
- [ ] Change `fioenix/agybird` visibility from private to public only after local and GitHub gates are green.
- [ ] Create and push annotated tag `v0.1.0`, wait for the release workflow, and verify the public release page and installation command.
- [ ] Perform a final clean install with `npx skills add fioenix/agybird`, then verify the installed skill contents and run one non-destructive general/read smoke test.
- [ ] Report the repository URL, release URL, commit SHA, exact test evidence, live-credit usage scope, and any residual limitations for the user's single final review.

## Definition of Done

- [ ] The skill works in both Claude Code and Codex from the documented GitHub install path.
- [ ] The runner supports code, image generation/editing, and general work through official `agy` headless mode.
- [ ] Unit, simulated integration, clean-clone, install-layout, live Antigravity, and GitHub CI gates pass.
- [ ] No secret, token extraction, private endpoint, shell invocation, dangerous permission bypass, automatic credit mutation, unpinned action, runtime dependency, placeholder, or unverified success claim remains.
- [ ] `fioenix/agybird` is public under MIT and GitHub release `v0.1.0` is installable.
