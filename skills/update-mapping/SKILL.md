---
name: update-mapping
description: Use after modifying code to sync @concept tags and the mapping cache, or run manually to refresh concept↔code links in a governance-active project.
---

# Conceptpowers: Update Mapping

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
   - Or pass the whole source as arguments if a full refresh is needed.
3. If a tag points to an undefined concept (audit unknownTags), define the concept (define-concept) or fix the tag.

## Note

- `mapping.json` is a **cache**, not the baseline. The source of truth is the `@concept` tags in the code.
