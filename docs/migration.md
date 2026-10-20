# Migrating the Codex marketplace to Finolabs

Agybird 0.3.0 renamed the Codex marketplace in `.agents/plugins/marketplace.json` from `agybird` to `Finolabs`. The source repository is still `fioenix/agybird`; only the marketplace identity changed. The Claude Code marketplace is unaffected and stays `agybird@agybird`.

| Before 0.3.0 | From 0.3.0 |
| --- | --- |
| `agybird@agybird` | `agybird@Finolabs` |
| `vietnamizer@agybird`, or standalone `vietnamizer@vietnamizer` | `vietnamizer@Finolabs` |
| `markmap-skills@agybird`, or standalone `markmap-skills@fioenix-plugins` | `markmap-skills@Finolabs` |

## Why a plain upgrade fails

- `codex plugin marketplace upgrade agybird` is rejected, because the fetched catalog's `name` changed from `agybird` to `Finolabs`.
- Running `codex plugin marketplace add fioenix/agybird` again while the old Git source is still registered can reuse the existing `agybird` registration instead of creating `Finolabs` next to it.

Do not try to rename the old marketplace with `upgrade`. Register `Finolabs` side by side, verify it, then remove the old entries.

## Migrate

1. Back up the Codex plugin and marketplace entries you are about to change. Leave unrelated configuration, MCP servers, and plugins untouched.
2. Register a separate checkout of this repository as a local marketplace, so Codex creates `Finolabs` next to the Git-registered `agybird` marketplace:

   ```bash
   git clone https://github.com/fioenix/agybird.git /path/to/finolabs-catalog
   codex plugin marketplace add /path/to/finolabs-catalog
   ```

   An existing local checkout works too, as long as its `.agents/plugins/marketplace.json` declares `"name": "Finolabs"`.
3. Install the replacements and confirm that each one loads in a new Codex session:

   ```bash
   codex plugin add agybird@Finolabs
   codex plugin add vietnamizer@Finolabs
   codex plugin add markmap-skills@Finolabs
   ```

4. Only after all three load, remove or disable the old selectors (`@agybird`, `vietnamizer@vietnamizer`, `markmap-skills@fioenix-plugins`) and the old marketplaces (`agybird`, `vietnamizer`, `fioenix-plugins`) with the supported Codex CLI commands, so the same skill does not load twice. The local `Finolabs` registration is enough to keep receiving the catalog.

## Roll back

The unpinned `fioenix/agybird` source now resolves to the `Finolabs` catalog, so a rollback must pin the old one:

1. Register the pre-0.3.0 catalog with `codex plugin marketplace add fioenix/agybird --ref v0.2.1`, or a local snapshot of the old `agybird` catalog. Alternatively, re-add the standalone marketplaces `fioenix/vietnamizer` and `fioenix/markmap-skills`.
2. Reinstall the old selectors you want (`agybird@agybird`, `vietnamizer@agybird`, `markmap-skills@agybird`, or the standalone `vietnamizer@vietnamizer` and `markmap-skills@fioenix-plugins`) and verify that they load.
3. Then remove the `Finolabs` marketplace and its `@Finolabs` entries.

Never restore `~/.codex/` wholesale over newer, unrelated configuration changes.
