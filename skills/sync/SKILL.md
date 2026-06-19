---
name: conceptpowers-sync
description: Use after updating the Conceptpowers plugin, or whenever the viewer/concepts:view script looks stale, in a Conceptpowers-active project. Refreshes plugin-generated artifacts (viewer assets, manifest, concepts:view script) to the installed version. Never touches the baseline.
---

# Conceptpowers: Sync

Patch the **plugin-generated** artifacts of an already-initialized project up to the installed
plugin version. Most generated files are produced at `init` time, so after a plugin update an
existing project can be left on old viewer assets or an outdated `concepts:view` script. This
skill brings them current.

## When to use

- Right after `/plugin marketplace update conceptpowers-dev` (the SessionStart notice suggests it).
- When the viewer looks outdated, opens as source in the IDE, or `concepts:view` fails.
- Any time — it is idempotent and safe to re-run.

## What it does (and does NOT)

Refreshes only what the plugin generates:

- Re-renders the viewer: `index.html`, `assets/viewer.js`, `serve.mjs`, `assets/concept.css`, `manifest.json`.
- Removes orphaned old-format files (per-concept `*.html`, `graph.html`).
- Upserts `concepts:view` in `package.json` to the current command (`node …/serve.mjs`).
  A genuinely custom (user-authored) value is preserved; only plugin-generated values are replaced.

**Never** modifies the baseline — concepts, features, `architecture.md`, `infra.md`, or `init.json`
settings are left untouched. Running `conceptpowers init` again does the same patch (init is idempotent).

## Steps

1. Confirm the project is initialized (the `CONCEPTPOWERS-ACTIVE` context is present, or
   `docs/conceptpowers/init.json` exists). If not, use `conceptpowers-init` instead.
2. Run the deterministic CLI (path is in the session context or the plugin dist):
   `node "<cli>" sync --root .`
3. Report the JSON result to the user: `scriptStatus` (no-package | unchanged | set | kept) and
   `orphansRemoved` (count of old `*.html` files cleaned).
4. Remind the user they can open the refreshed viewer with `npm run concepts:view`.

## Notes

- Equivalent to re-running `conceptpowers init` on an initialized project — both call the same
  shared patch routine.
- `scriptStatus: kept` means the user has a custom `concepts:view`; tell them it was preserved and
  the canonical command is `node docs/conceptpowers/concepts/viewer/serve.mjs` if they want it.
