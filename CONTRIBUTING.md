# Contributing

Contributions that improve Agybird's safety, compatibility, documentation, or verified Antigravity behavior are welcome.

## Before opening a change

1. Open an issue for a material behavior or architecture change.
2. Keep changes scoped and preserve zero runtime dependencies.
3. Add a failing test before changing runner behavior.
4. Never add credentials, captured prompts, private endpoints, or live Antigravity output containing user data.
5. Run `npm ci` and `npm run check` on Node.js 20 or newer.

Use concise imperative commit messages. Explain any platform-specific behavior and include sanitized evidence for changes based on real `agy` output.

Live provider tests are maintainer-operated because they use a personal Antigravity subscription. Public pull requests and CI must use the fake provider fixture.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and license your contribution under the repository's MIT license.
