---
name: version-sync
description: Use after updating the plugin (version sync — NOT concept↔code sync; that is update-mapping), or whenever the viewer/concepts:view script looks stale. Refreshes plugin-generated artifacts (viewer assets, manifest, concepts:view script) to the installed version. Never touches the baseline.
---

# Conceptpowers: Version Sync (플러그인 버전 동기화)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Patch the **plugin-generated** artifacts of an already-initialized project up to the installed
plugin version. Most generated files are produced at `init` time, so after a plugin update an
existing project can be left on old viewer assets or an outdated `concepts:view` script. This
skill brings them current.

## When to use

- Right after `/plugin marketplace update conceptpowers-dev` (the SessionStart notice suggests it).
- When the viewer looks outdated, opens as source in the IDE, or `concepts:view` fails.
- Any time — it is safe to re-run: when the stamped artifacts already match the installed plugin,
  the command **does nothing** and reports `{"skipped": true, "reason": "up-to-date"}`.

> **Same version → no-op (concept `plugin-version-sync`).** Re-generating at an equal version is a
> `restrict`. It matters in projects whose generation _source_ is ahead of the installed release —
> notably the Conceptpowers repository itself, where a same-version re-render silently reverts local
> `assets/` edits. Pass `--force` only when you deliberately want to overwrite the artifacts from
> the installed release.

> **Auto-sync usually beats you to it:** when the installed plugin is newer than the stamped
> artifacts, the same patch runs automatically at session start **and before any Conceptpowers CLI
> command** (every skill goes through the CLI), then the command proceeds — you'll see a one-line
> `[conceptpowers] auto version-sync: …` notice on stderr. This skill remains for running it
> explicitly or when diagnosing a stale viewer.

## What it does (and does NOT)

Refreshes only what the plugin generates:

- Re-renders the viewer: `index.html`, `assets/viewer.js`, `serve.mjs`, `assets/concept.css`, `manifest.json`.
- Removes orphaned old-format files (per-concept `*.html`, `graph.html`).
- Upserts `concepts:view` in `package.json` to the current command (`node …/serve.mjs`).
  A genuinely custom (user-authored) value is preserved; only plugin-generated values are replaced.
- Backfills **settings added by newer plugin versions** into `init.json` at their defaults, so the
  user can see and toggle them. Values already written stay exactly as they are — including fields
  the tool does not recognize — and the file is not rewritten at all when nothing is missing.

**Never** modifies the baseline — concepts, features, `architecture.md`, and `infra.md` are left
untouched, and no existing setting value is ever changed or removed. Running `conceptpowers init`
again does the same patch (init is idempotent).

## Steps

1. Confirm the project is initialized (the `CONCEPTPOWERS-ACTIVE` context is present, or
   `docs/conceptpowers/init.json` exists). If not, use `conceptpowers:init` instead.
2. Run the deterministic CLI (path is in the session context or the plugin dist):
   `node "<cli>" version-sync --root .`
   - If it returns `skipped: true`, artifacts are already current — report that and stop; do NOT
     re-run with `--force` on your own judgment.
3. Report the JSON result to the user: `scriptStatus` (no-package | unchanged | set | kept),
   `orphansRemoved` (count of old `*.html` files cleaned), and `configFieldsAdded` (settings
   backfilled into `init.json` at their defaults — name them so the user knows what is now
   adjustable, and point them at the README settings table).
4. Remind the user they can open the refreshed viewer with `npm run concepts:view`.

## Notes

- Equivalent to re-running `conceptpowers init` on an initialized project — both call the same
  shared patch routine.
- `scriptStatus: kept` means the user has a custom `concepts:view`; tell them it was preserved and
  the canonical command is `node docs/conceptpowers/concepts/viewer/serve.mjs` if they want it.
