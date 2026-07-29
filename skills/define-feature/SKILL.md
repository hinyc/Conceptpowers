---
name: define-feature
description: Use when you identify a feature surface (button/action/route/command) that should appear in the knowledge graph, in a governance-active project. Records a feature spec and wires it to its concept(s) and implementing code so the concept·feature·code graph stays connected.
---

# Conceptpowers: Define Feature

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

A **feature** is a first-class entity in the knowledge graph. It is the single source of the
_feature → concept_ link (which concept the feature realizes) and the _feature → code_ link
(which files implement it). Without a feature spec, the graph cannot show "this feature relates
to that concept and is built by that code" — so define a feature whenever you surface a new one.

Write the feature content in the project's output language (the `locale` from `init.json`).

## Steps

> **No reference reads here** — a feature spec is graph wiring, not contract authoring (session doctrine).

1. **Identify the feature** — a concrete user-facing surface: a button, form submit, menu action,
   route handler, or command. Give it a short `title` and one-line `description`.
2. **Wire feature → code** (`codePaths`): list the files that implement this feature.
3. **Wire feature → concept** (`concepts`): list the concept slug(s) this feature realizes.
   - If no concept covers it yet, define it first with `conceptpowers:define-concept`, then come back.
4. **Decide the slug** (kebab-case, globally unique) and `group` (domain folder, optional).
5. **Validate and record** via the engine (it checks the schema and rejects duplicate slugs):
   `node "<cli>" feature --root . --file <feature.json>`
   - The JSON must match the feature schema: `{ slug, group?, title, description?, concepts[], codePaths[] }`.
   - Written to `docs/conceptpowers/features/[group/]<slug>.json`.
6. **Wire concept → code** for the same files: ensure each implementing file carries a
   `@concept:<slug>` tag and refresh the cache with `conceptpowers:update-mapping`
   (`node "<cli>" map --root . <files...>`). This makes concept and feature converge on the same file node.
7. **Regenerate the graph**: `node "<cli>" render --root .`

## Outputs

- `docs/conceptpowers/features/[group/]<slug>.json` (schema-compliant; `concepts` + `codePaths` populated)
- Updated viewer / knowledge graph (`#/graph`): feature node + `feature→concept`, `feature→file`, `concept→file` edges.

## Note

- The feature spec is the source of truth for the feature→concept and feature→code links; the
  engine only validates and writes it. Keep `concepts` slugs exact (they must match existing concepts;
  the graph silently drops edges to nonexistent concepts).

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/feature/<slug>` / `#/architecture` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
