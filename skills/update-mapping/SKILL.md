---
name: conceptpowers-update-mapping
description: Use after modifying code to sync @concept tags and the mapping cache, or run manually to refresh concept↔code links in a Conceptpowers-active project.
---

# Conceptpowers: Update Mapping

Sync the `@concept` tags (the source-of-truth on the code side) with the `mapping.json` cache (rule 5, D6).

## Steps

1. If you changed code, confirm the changed files have the right `@concept:<slug>` tag, and add one if missing.
   - The tag must exactly match the related concept's slug (globally unique).
   - A file may relate to several concepts — add one `@concept:<slug>` tag per related concept.
   - Concept-agnostic code (type-only/utils/helpers/config/build/generated) needs no tag; the commit
     gate skips files matching `init.json` `ignoreGlobs`. Add a path there to silence a false warning.
2. Regenerate the mapping cache:
   `node "<cli>" map --root . <changed files...>`
   - Or pass the whole source as arguments if a full refresh is needed.
3. If a tag points to an undefined concept (audit unknownTags), define the concept (define-concept) or fix the tag.

## Note

- `mapping.json` is a **cache**, not the baseline. The source of truth is the `@concept` tags in the code.
