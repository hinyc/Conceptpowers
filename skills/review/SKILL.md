---
name: review
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a governance-active project, and whenever the user asks to check that code follows its concepts ("검토", "이 개념대로 구현됐나", "전체 검토"). Judges code against the allow/restrict/immutable rules of the concepts mapped to it — one procedure with three entry modes (pre-change check, one concept, whole project). For an adversarial multi-angle critique of finished work (레드팀) use redteam instead. Never reads reference.
---

# Conceptpowers: Review (code ↔ concepts)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Talk to the user in the project's output language (`locale` in `init.json`; missing → `ko`); quoted prompts, labels and report
formats below are templates to render in that language.

Judges whether mapped code is implemented according to the concept's rules (`actions.allow` / `actions.restrict` /
`principle.immutableRules`). **There is one judgment procedure** with three entry doors.

| Mode                   | Starting point                                       | Who calls it                                            |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| ① **Pre-change check** | The file(s) about to change                          | The Edit/Write hook prompts it; the agent before coding |
| ② **One concept**      | One concept slug → every file mapped to that concept | The user                                                |
| ③ **Whole project**    | Every green concept → ② for each                     | The user, `auto`                                        |

If the agent called this on its own before code work (or because the Edit/Write hook prompted it), it is **①** — do
not ask. Only when the user calls it without naming a mode, **ask whether they want ② or ③**.

## Scope (①)

- **In scope**: adding a feature, changing existing behavior, writing related tests.
- **Out of scope**: pure refactoring, typos, formatting.

## Judgment basis: concepts ONLY (do not read reference/)

**The only basis for judgment is the defined concepts** — never read `docs/conceptpowers/reference/` here. If a
concept is too vague to judge by, that is a **defect in the concept** → verdict ③ below.

**A rule is a requirement, not a present fact.** A green concept says "this is how it must be"; it does not mean the
code is that way now. When telling the user how the system behaves, confirm it in the code; if code and concept differ,
do not relay the rule as fact — report it as a violation candidate (verdict ②).

**Decide whether to start from the concept or from the code.** Intent, rules scattered across several places, and
"is this allowed / why is it like this" start from the concepts. A single value, the implementation detail of one file,
screen details, and "where is this implemented" go straight to the code — concepts do not say where or how something
is implemented, and for areas no concept covers, the code is the answer.

**Read narrow, not wide.** ① runs on almost every code change, so its cost must stay constant regardless of project
size: tag → index → 1–3 concept files. Never read `concepts/data/` wholesale.

## Locating concepts and files

### ① File → concept

1. **Tag (free)** — read `@concept:<slug>` in the target file's top comment block (before the first code line). If
   `'use client';`, a docstring, or `<template>` comes first, the engine cannot see the tag. If there is a tag, that
   is the answer.
2. **Index (one small file)** — if there is no tag, read `docs/conceptpowers/concepts/viewer/manifest.json` **once**.
   Use `slug / title / group / codeLinks` in `concepts[]` to find the concept that governs this file in reverse, and
   narrow by title/category. If the manifest is missing or stale, use `docs/conceptpowers/.cache/mapping.json`
   (slug → files).
3. **Read the targets** — open only the 1–3 candidate concept files the index produced
   (`concepts/data/<group>/<slug>.json`).
4. **Last resort** — only when there are no candidates, grep `concepts/data/` by keyword. If still nothing,
   "no related concept" → define one first with `conceptpowers:update-concepts` (trigger B: defining a new concept).
   After judging, if a concept fit a file that had no tag, add the `@concept` tag and refresh the mapping with `map`
   (next time step 1 is enough).

### ② Concept → files · ③ Whole project

How to collect the target files and the report format are in `references/whole.md` — read it only when you came in
through ② or ③.

## Judgment (common to all modes)

Read the concept's **actions.allow / actions.restrict / principle.immutableRules** and give each file (or planned
change) one of three verdicts:

- **① No violation** → proceed. When changing code, update the `@concept` tags and mapping too (`map`).
- **② Violation** → **do not fix the code on your own.** Report it to the user and let them choose:
  (a) **Edit the concept** — only when the user approves the exact change, via `conceptpowers:update-concepts` (flow C,
  `edit-concept`). Green drops to pending and governs code again only after a consistency check and the user's
  confirmation.
  (b) **Split the feature/concept** — split into a new feature spec (the "Recording a feature spec" procedure of
  `conceptpowers:scan`) or concept (`update-concepts` trigger B, or trigger C when narrowing an existing concept). Never
  quietly edit a concept to let the code pass.
- **③ Undecidable (vague concept)** — the rules alone cannot answer "does this code break it?" → do not guess and do
  not read reference either. Say "The rules of concept `<slug>` alone are not enough to decide", naming which rule and
  which difference in interpretation, and recommend `conceptpowers:update-concepts` **trigger F (upgrading a concept)**
  — reference is read **there**, and the change is recorded with `edit-concept --reason`. Whether to do it now is the
  user's call.

If a test conflicts with a concept, do not let it pass quietly — ask the user whether the test is wrong or the
concept is stale.

## Test scenarios from concepts (conceptDrivenTests)

When the purpose of the change is writing or modifying **tests** and `conceptDrivenTests` in `init.json` is on
(absent means on; only `false` turns it off):

- Do not stop at a violation verdict — turn the rules of the concept you found into a list of scenarios: at least one
  scenario per item in `actions.allow` / `actions.restrict` / `principle.immutableRules` where possible, each scenario
  stating which rule it checks.
- Finding the concept follows the ① procedure above exactly — no extra scanning.
- **Every test file points to a concept.** `@concept:<slug>` in its top comment block. The reserved `@concept:none` is
  allowed for ordinary code but **not** for tests (commit gate `concept-test-scope`).
- **Stay inside the concept.** Every scenario must trace back to one rule in `allow / restrict / immutableRules`.
  Asserting behavior the concept does not state creates a second, ownerless contract. If a needed check is outside
  the concept, stop and tell the user the concept must be widened first (`update-concepts`) — do not widen the test.
  Conversely, never weaken or delete a test to let the code pass.
- If `conceptDrivenTests` is explicitly `false`, skip this section.

### When the concept itself changed (test-follow duty)

The duty to review tests derived from a concept in the same commit when that concept is edited (commit gate
`concept-test-follow`) is set by the concept-editing procedure (trigger C) of `conceptpowers:update-concepts` —
because concepts are edited only in that skill.

## Prohibited

- Editing a concept **on your own judgment** to justify a change. A concept is edited only when the user approves the
  exact change, and the result is `pending` (it settles again after a consistency-check attestation and the user's
  confirmation) — there is no quiet green edit.
- Reading reference to judge.
