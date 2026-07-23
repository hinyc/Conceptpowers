---
name: check-concept
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a governance-active project. Finds the related concept(s) and judges whether the change violates their allow/restrict/immutable rules.
---

# Conceptpowers: Check Concept (code ↔ concept)

> **Precondition — init required:** if `docs/conceptpowers/init.json` does not exist, **STOP here**.
> Tell the user this project is not initialized and that governance commands are disabled until
> `/conceptpowers:init` is run (the engine CLI refuses too). Offer to run init now; do not execute
> any step below without the marker.

Judge whether a new feature or behavior change (tests included) violates the related concept (rules 3/8, D5/D14).

## Scope

- **In scope**: adding a feature, changing existing behavior, writing related tests.
- **Out of scope**: plain refactoring, typos, formatting (D5).

## Judgment basis: concepts ONLY (do not read reference/)

**Defined concepts are the facts.** Code judgment uses only the concept's recorded rules —
never read `docs/conceptpowers/reference/` here. Reference is raw source material consumed
**once**, at concept authoring time (define-concept / check-consistency); re-reading it at every
code check wastes tokens and lets unwritten rules influence verdicts untraceably. If a concept
is too vague to decide with, that is a **concept defect** — surface it (verdict ③ below), don't
paper over it with reference lookups.

## Steps

1. Check the `@concept:<slug>` tag in the target files (or the `git diff` target).
   If there is no tag, search `concepts/data/` semantically for the related concept.
2. If **no related concept exists** → define it first with `conceptpowers:define-concept` (rule 2).
3. Read the related concept's **actions.allow / actions.restrict / principle.immutableRules**.
4. Judge whether the planned change violates those rules — the verdict is one of **three**:
   - ① **No violation** → proceed. When changing code, update the `@concept` tag/mapping too (update-mapping).
   - ② **Violation** → **do not modify the code.** Report to the user and let them choose one:
     (a) explicitly update the concept (update-baseline), or (b) split it into a new feature/concept.
   - ③ **Undecidable (concept too vague)** — the concept's rules genuinely cannot answer
     "does this change violate it?" → do NOT guess and do NOT fall back to reference/. Tell the
     user: "개념 `<slug>`의 규칙만으로는 이 변경의 위반 여부를 판단할 수 없습니다" — name the
     specific ambiguity (which rule, what interpretation gap), and recommend upgrading the
     concept via `conceptpowers:define-concept` (redefine flow; reference is read **there**, and
     the change is recorded via `note-change`). The user decides whether to upgrade now or
     proceed on their own judgment.
5. If a test conflicts with a concept, do not pass it silently; tell the user (test bug vs. concept needs updating).

## Prohibited

- The agent must not modify a concept (baseline) on its own to justify a change (rule 4).
