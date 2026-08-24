---
name: check-concept
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a governance-active project. Finds the related concept(s) and judges whether the change violates their allow/restrict/immutable rules.
---

# Conceptpowers: Check Concept (code ↔ concept)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Judge whether a new feature or behavior change (tests included) violates the related concept (rules 3/8, D5/D14).

## Scope

- **In scope**: adding a feature, changing existing behavior, writing related tests.
- **Out of scope**: plain refactoring, typos, formatting (D5).

## Judgment basis: concepts ONLY (do not read reference/)

**Defined concepts are the facts** — never read `docs/conceptpowers/reference/` here (session
doctrine). A concept too vague to decide with is a **concept defect** → verdict ③ below.

**Read narrow, not wide.** This skill runs on nearly every code change, so its cost has to stay
flat as the project grows: tag → index → 1–3 concept files (step 1). A tagged file costs one
small read; scanning `concepts/data/` in a 100-concept project costs a hundred times that and
buys nothing the index does not already give you.

## Steps

1. **Locate the related concept(s) — cheapest path first. Never read `concepts/data/` wholesale.**
   - **a. Tag (free)** — read the `@concept:<slug>` marker(s) in the target files' leading comment
     block (before any code line — a `'use client';` directive, a docstring, or a `<template>` block
     placed first pushes the marker out of scope and the engine won't see it), or the `git diff`
     target. If present, that IS the answer → go to step 3.
   - **b. Index (one small file)** — no tag: read
     `docs/conceptpowers/concepts/viewer/manifest.json` **once**. Its `concepts[]` entries carry
     `slug / title / group / category / codeLinks` at roughly 200 bytes each — the whole index for
     100 concepts is smaller than three concept files. Match the target path against `codeLinks`
     (reverse index: which concepts already govern this file), then narrow by `title` / `category`.
     If the manifest is missing or stale, fall back to `docs/conceptpowers/.cache/mapping.json`
     (slug → files).
   - **c. Targeted read** — open only the 1–3 candidate concept files the index surfaced
     (`concepts/data/<group>/<slug>.json`).
   - **d. Last resort** — only if the index yields no candidate, grep `concepts/data/` by keyword.
     Reading every concept file is never the right move; if keyword grep also fails, treat it as
     "no related concept" (step 2).
   - After the judgment, if the file had no tag but a concept matched, add the `@concept` tag
     (update-mapping) — that turns every future check on this file back into path (a).
2. If **no related concept exists** → define it first with `conceptpowers:define-concept` (rule 2).
3. Read the related concept's **actions.allow / actions.restrict / principle.immutableRules**.
4. Judge whether the planned change violates those rules — the verdict is one of **three**:
   - ① **No violation** → proceed. When changing code, update the `@concept` tag/mapping too (update-mapping).
   - ② **Violation** → **do not modify the code on your own.** Report to the user and let them choose one:
     (a) **update the concept** — allowed, but only with the user's explicit approval of the exact
     change, via `conceptpowers:update-baseline` (`edit-concept`); this drops a green concept to
     `pending`, so it no longer governs code until a fresh consistency check passes and the user
     confirms settling it back to green (the approve flow is red-only), or (b) split it into a new
     feature/concept. Never edit the concept silently to make the code pass.
   - ③ **Undecidable (concept too vague)** — the concept's rules genuinely cannot answer
     "does this change violate it?" → do NOT guess and do NOT fall back to reference/. Tell the
     user: "개념 `<slug>`의 규칙만으로는 이 변경의 위반 여부를 판단할 수 없습니다" — name the
     specific ambiguity (which rule, what interpretation gap), and recommend upgrading the
     concept via `conceptpowers:define-concept` (redefine flow; reference is read **there**, and
     the change is recorded via `note-change`). The user decides whether to upgrade now or
     proceed on their own judgment.
5. If a test conflicts with a concept, do not pass it silently; tell the user (test bug vs. concept needs updating).

## Test scenarios from concepts (conceptDrivenTests)

When the purpose of the change is writing or modifying **tests** and `init.json` has
`conceptDrivenTests` enabled (missing field = enabled; only an explicit `false` disables it):

- Do not stop at the violation verdict — turn the located concept's rules into a scenario
  checklist: each entry in `actions.allow` / `actions.restrict` / `principle.immutableRules`
  maps to at least one test scenario where feasible, and each scenario names the rule it
  verifies.
- Concept lookup reuses step 1 as-is (tag → index → targeted read) — no extra scanning.
- **Every test file names its concept.** Add `@concept:<slug>` to the leading comment block. The
  reserved `@concept:none` marker is valid for ordinary code but NOT for tests — a test that names
  no concept has no stated basis for what it asserts (commit gate: `concept-test-scope`).
- **Stay inside the concept.** Each scenario must trace to a rule in `actions.allow` /
  `actions.restrict` / `principle.immutableRules`. Asserting behavior the concept does not state
  is the same class of error as violating it: the test silently becomes a second, un-owned
  contract. If the check you need lies outside the concept, STOP and tell the user the concept
  must be extended first (`conceptpowers:update-baseline`) — never widen the test instead.
  The reverse is equally prohibited: never weaken or delete a test to make code pass.
- If `conceptDrivenTests` is explicitly `false`, skip this section entirely.

### When the concept itself changed (test-follow duty)

A concept edit puts every test derived from it in question — this is the point of deriving
scenarios from rules. In the SAME commit as the concept change:

1. Locate the tests for that concept (mapping cache / `@concept` tag → test files).
2. Re-derive the scenario checklist from the NEW rules and compare it against what the tests
   currently assert. Rules that changed, disappeared, or arrived each map to a test to update,
   remove, or add.
3. Stage the updated tests together with the concept change.
4. If the tests genuinely need no change (wording-only edit), or the concept has no tests yet,
   confirm that with the user and record the reason — the judgment must not vanish:
   `node "<cli>" attest-test-review <slug> --result updated|no-impact|no-tests --tests <paths> --note "<why>" --root .`
   The record is bound to the concept's contract hash, so editing the concept again invalidates it.

The commit gate `concept-test-follow` enforces exactly this: a drifted concept with no staged
test and no fresh record is blocked under `strict`, asked under `standard`, warned under `light`.

## Prohibited

- The agent must not modify a concept on its **own judgment** to justify a change (rule 4).
  Editing a concept is allowed only with the user's explicit approval of the exact change, and the
  result is `pending` (manual re-approval required) — never a silent green edit.
