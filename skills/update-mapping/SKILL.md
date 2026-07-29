---
name: update-mapping
description: Use after modifying code to sync @concept tags and the mapping cache, or run manually to refresh concept↔code links in a governance-active project.
---

# Conceptpowers: Update Mapping

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Sync the `@concept` tags (the source-of-truth on the code side) with the `mapping.json` cache (rule 5, D6).

## Steps

1. **Every governed code file must carry an explicit `@concept` marker at the top** — no silent gaps.
   - If a concept applies: add `@concept:<slug>` near the top of the file. The tag must exactly match
     the related concept's slug (globally unique). A file may relate to several concepts — add one
     `@concept:<slug>` tag per related concept.
   - If **no concept applies** (type-only/utils/helpers/config/scripts, etc.): mark it explicitly with
     **`@concept:none`** at the top. `none` is a reserved marker — it satisfies the commit gate but is
     never treated as a real concept (excluded from the mapping and graph). Do **not** rely on silently
     skipping these files.
   - `init.json` `ignoreGlobs` now auto-excludes **only regenerated/external code** (`dist/**`, `build/**`,
     `node_modules/**`, `**/*.generated.*`, plugin output). Hand-written code is never exempt — give it a
     marker (a real slug or `@concept:none`). Add a path to `ignoreGlobs` only for a genuine generated artifact.
2. Regenerate the mapping cache:
   `node "<cli>" map --root . <changed files...>`
   - Incremental by default: only the passed files' entries are replaced; the rest of the cache is
     preserved (merge). Include **deleted** files in the argument list so their stale entries drop out.
   - For a from-scratch rebuild (e.g. recovering a corrupted cache), pass the whole source with
     `--full`: `node "<cli>" map --full --root . <all source files...>` — this discards every
     existing entry and rebuilds from only the given files.
   - Then refresh the viewer/graph: `node "<cli>" render --root .` (matches Stage 4 of
     `conceptpowers:auto` — map then render).
3. If a tag points to an undefined concept (audit unknownTags), define the concept (define-concept) or fix the tag.

## Note

- `mapping.json` is a **cache**, not the baseline. The source of truth is the `@concept` tags in the code.

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/feature/<slug>` / `#/architecture` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
