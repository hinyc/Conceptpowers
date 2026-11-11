---
name: scan
description: Use when the user wants to find what is NOT yet covered by concepts in a governance-active project ("상태 탐색", "개념 전수 점검", "audit", "감사", "개념 없는 코드 찾기", "구멍 찾기", "기능 명세", "feature spec", "매핑 갱신", "태그 달기") and after modifying, moving, or deleting code to resync @concept tags — concept-less code, broken @concept links, features missing a spec, unapproved red / lingering pending concepts — and to wire @concept tags and the mapping cache. Finds gaps; it does not judge code against rules (that is review), nor critique finished work (that is redteam).
---

# Conceptpowers: Scan (find what no concept covers)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Talk to the user in the project's output language (`locale` in `init.json`; missing → `ko`); quoted prompts below are templates to
render in that language.

Find **what no concept covers** in the project, list it, and work through it with the user. This skill does not judge
whether code follows its concepts — that is `conceptpowers:review`. It does not author concepts either — when one is
needed, hand off to `conceptpowers:update-concepts`.

> **Concepts ONLY**: never read the content of `reference/` here. The only thing allowed is checking whether it is
> empty (folder listing + whether `paths.md` has entries).

> **When only refreshing the mapping after a code change** (tags/cache for a few files, after moving or deleting
> files): skip the Steps below and run only "Tag rules and mapping refresh". Run the full check when the user asks
> to "scan / find gaps / check everything".

## Steps

1. **Integrity + gaps (deterministic)**: run the CLI audit **with no file arguments** — that is full-scan mode. It
   walks `git ls-files` (applying `ignoreGlobs`) and outputs `{...report, conceptless: [...]}`. If there are
   `unknownTags`, `duplicateSlugs` or `conceptless`, it exits 1 — that is diagnostic data, not a failure.
   `node "<cli>" audit --root .`
   `brokenCodeLinks` in the full-scan result are code locations named by concepts' sources and code links that do not
   exist now (missing file, vanished symbol, line range past the file length). Concept documents are the baseline, so
   do not fix them — report the list so the user corrects the sources through `update-concepts` (trigger C, sources
   only — outside the contract fingerprint, so it re-settles without a new consistency check). `brokenCodeLinks` also
   cause exit 1, and that too is diagnostic data.
   - `unknownTags`: tags pointing at a concept that does not exist.
   - `duplicateSlugs`: two or more concept files with the same slug (the files are in `rels`). They are the baseline,
     so do not delete them directly — report them, and under the user's confirmation clean them up through
     `update-concepts` so only one remains.
   - `conceptless`: files with no `@concept` marker at all — the deterministic starting point for the gap judgment in
     step 2.
   - `unapproved`: every 🔴 red concept; `unapprovedRefs`: red concepts referenced by scanned files.
   - `pending`: every 🟡 pending concept; `pendingRefs`: pending concepts referenced by scanned files — the source
     of the list in step 4.
   - `unlinkedConcepts`: 🟢 green concepts with no linked code at all, neither by marker nor by feature spec. For such
     a concept the commit gate never asks for following code even when only its document changes, so recommend
     tagging the code that keeps the promise or linking a feature spec. If the concept truly needs no code (a term,
     an operating principle), leave it — this alone does not cause exit 1.
   - (With file arguments it checks tag consistency only and skips gap detection — run without arguments for a full
     check.)
2. **Gap handling (semantic judgment)**: for each file in the `conceptless` list, decide what it needs. Look for
   features, behaviors, roles, permissions or terms that need a concept but carry no tag.
   - **A concept already exists** → propose a tag (tag rules below).
   - **No concept exists** → hand off to `conceptpowers:update-concepts` (trigger B: defining a new concept). Before
     handing off, check whether reference is empty (existence check only); if it is, say "reference/ is empty —
     defining a concept now means writing it with no source material", then ask: ① proceed as is ② add files
     ③ register an external path (`update-concepts` trigger E).
   - **Code unrelated to any concept** (utils/types/config/scripts, shared UI used by many features — buttons,
     modals, layouts, design system) → an explicit **`@concept:none`** (not silence). Do not attach concepts to
     shared UI and tie down the screen's freedom. If such files gather in one folder, instead of marking each file
     `none`, propose a **no-concept area** to the user (`noConceptGlobs` in `init.json`, e.g.
     `src/components/ui/**`) — the user edits the config file. Files inside the area that carry a marker follow their
     marker, so do not declare a folder as an area if it mixes in files that keep some promise.
   - **A screen or modal for one specific feature** (e.g. an admin delete-confirmation dialog) → tag it with that
     feature's concept. Do not carve one modal out as a separate concept (part of one concept's behavior is not a
     separate concept).
   - **Only when the behavior of shared UI is itself a promise to the user** (e.g. unsaved input is never discarded
     without confirmation) hand that promise off as a concept candidate — appearance, layout and wording belong to
     the top-level baseline documents, not to concepts.
   - The commit gate also catches code with no marker (`[WARNING] Code without a concept`, shown in the project's `locale`). `@concept:none` counts as
     a marker. Only regenerated or external code matching `ignoreGlobs` in `init.json` (`dist/**`,
     `**/*.generated.*` …) is exempt, and unmarked files inside `noConceptGlobs` count as `none`. At no enforcement
     level does this warning alone block a commit.
3. **Feature coverage (knowledge graph)**: for every entry point through which the user uses a feature (form submit,
   menu, route, command, etc. — per feature), check that `features/` has a feature spec with `concepts`
   (feature → concept) and `codePaths` (feature → code) filled in. If missing or empty, create it with the
   **Recording a feature spec** procedure below. This keeps `#/graph` connected. Do not create a spec for each shared
   UI element such as a button or modal — specs are per feature.
4. **red / pending (status)**:
   - 🔴 red (auto-inferred, unapproved) → show the list, and if the user wants to review and approve, go to
     `conceptpowers:update-concepts` (trigger D). **scan never approves on its own.**
   - 🟡 pending (user-authored draft, not yet settled) → show the list and recommend `update-concepts` (trigger G,
     consistency re-check and settling). Do not call pending "unapproved" — it is a draft, not an inference.
5. **Green quality floor**: `node "<cli>" quality --root .` (no slug — every concept). If there are deficiencies,
   report them and recommend filling them in with the user (no automatic filling; demotion is also the human's call).
6. **Tagging + mapping refresh** (rules below), then `node "<cli>" render --root .`.
7. **Report**: gaps / broken tags / missing feature specs / red / pending / quality deficiencies + the recommended
   action for each. The baseline is read-only, so concepts are created or edited only in `update-concepts` after the
   user confirms. Whether code follows its concepts was not judged here — for a full judgment continue with
   `conceptpowers:review` in whole-project mode.

## Tag rules and mapping refresh

1. **Every governed code file carries an explicit `@concept` marker at the top** — no silent gaps.
   - If a concept applies, put `@concept:<slug>` **inside the top comment block, before the first line of code**.
     The engine scans only that block — if `'use client';`, a docstring or `<template>` comes first, the marker is
     not seen. The slug must match the concept slug exactly. If a file spans several concepts, add several tags
     (after the split review of concept `concept-code-binding`).
   - If no concept applies, put **`@concept:none`** in the same place. It is a reserved word: it passes the gate but
     is not treated as a concept.
   - `ignoreGlobs` auto-excludes only regenerated and external code. Hand-written code needs a marker — inside a
     no-concept area the user declared with `noConceptGlobs`, it counts as `none` without a marker.
     Add a path to `ignoreGlobs` only when it is truly generated — never widen it to dodge the audit.
2. Refresh the mapping cache:
   `node "<cli>" map --root . <changed files...>`
   - Incremental by default: only entries for the given files change; the rest are kept. **Deleted files must also be
     passed as arguments** for their stale entries to be removed.
   - To rebuild from scratch (recovering a corrupted cache) use `--full`:
     `node "<cli>" map --full --root . <all source files...>`.
   - Then `node "<cli>" render --root .`.
3. If a tag points at a concept that does not exist (`unknownTags`), define the concept (`update-concepts` trigger B)
   or fix the tag.
4. When moving or deleting files, move the tags and refresh the mapping in the **same commit**.
5. `mapping.json` is a **cache**, not the baseline. The truth is the `@concept` tags in the code.

## Recording a feature spec (feature → concept, feature → code)

> Does not read reference — a feature spec is graph wiring, not contract authoring. Feature specs are the **only
> source** of feature→concept and feature→code links (the engine only validates and records). Write the content in
> the `locale` of `init.json` (missing → `ko`).

1. **Identify the feature** — one concrete user surface: a button, form submit, menu action, route, command. A short
   `title` and a one-line `description`.
2. **Feature → code** (`codePaths`): the list of implementing files.
3. **Feature → concept** (`concepts`): the concept slugs this feature realizes. If none exists, define it first with
   `update-concepts` (trigger B) and come back.
4. Decide the slug (kebab-case, unique) and `group` (optional).
5. Validate and record through the engine (schema check, duplicate slugs rejected):
   `node "<cli>" feature --root . --file <feature.json>`
   JSON: `{ slug, group?, title, description?, concepts[], codePaths[] }` → `docs/conceptpowers/features/[group/]<slug>.json`.
6. Check that the same files carry `@concept:<slug>` tags and refresh with `map` — concept and feature meet at the
   same file node.
7. `render`. Slugs in `concepts` must be exact — edges to a concept that does not exist are silently dropped.

## Backfill modes

- incremental: report gaps only and recommend gradual backfill — including missing feature specs and links.
- strict: push to resolve every gap immediately (init strict or at the user's request).

## Viewer handoff (last step — never skip)

After `render`, end by handing over a clickable viewer link built from the viewer path and serve command that render
printed (reuse the running server's URL if one is up). The deep-link format and fallback launch method are defined in
the "Viewer handoff" section of `conceptpowers:update-concepts`.
