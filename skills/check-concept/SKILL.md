---
name: conceptpowers-check-concept
description: Use BEFORE writing/modifying code (including tests) that adds a feature or changes behavior in a Conceptpowers-active project. Finds the related concept(s) and judges whether the change violates their allow/restrict/immutable rules.
---

# Conceptpowers: Check Concept (code ↔ concept)

Judge whether a new feature or behavior change (tests included) violates the related concept (rules 3/8, D5/D14).

## Scope

- **In scope**: adding a feature, changing existing behavior, writing related tests.
- **Out of scope**: plain refactoring, typos, formatting (D5).

## Steps

1. Check the `@concept:<slug>` tag in the target files (or the `git diff` target).
   If there is no tag, search `concepts/data/` semantically for the related concept.
2. If **no related concept exists** → define it first with `conceptpowers-define-concept` (rule 2).
3. Read the related concept's **actions.allow / actions.restrict / principle.immutableRules**.
4. Judge whether the planned change violates those rules:
   - **No violation** → proceed. When changing code, update the `@concept` tag/mapping too (update-mapping).
   - **Violation** → **do not modify the code.** Report to the user and let them choose one:
     (a) explicitly update the concept (update-baseline), or (b) split it into a new feature/concept.
5. If a test conflicts with a concept, do not pass it silently; tell the user (test bug vs. concept needs updating).

## Prohibited

- The agent must not modify a concept (baseline) on its own to justify a change (rule 4).
