---
name: conceptpowers-check-consistency
description: Use when defining or modifying a concept in a Conceptpowers-active project, and as the commit gate. Compares the new/changed concept against all existing concepts to detect conflicts or violations; only passes when zero conflicts.
---

# Conceptpowers: Check Consistency (concept ↔ concept)

When adding or modifying a concept, verify there is no conflict or violation against all existing concepts (rule 7, D11/D17).

## Steps

1. Load all concepts in `concepts/data/` (or obtain the list as the step before `node "<cli>" render`).
2. Compare the target (new/modified) concept against existing concepts and check for:
   - **Permission/role conflict**: does one concept allow a capability that another restricts?
   - **Term conflict**: is the same term defined differently?
   - **Immutable-rule violation**: does the target concept break another concept's immutableRules?
   - **Interaction contradiction**: do behavior descriptions disagree between concepts linked via relations?
3. If there is **any** conflict → **stop** the create/modify and ask the user to resolve it, with the conflict list.
4. Proceed with save/commit only when there are zero conflicts.

## Commit gate (D17)

- On `git commit`, if the staged set (`git diff --cached --name-only`) includes concept-data changes, run this check.
- check-concept covers code changes and this skill covers concept changes, so the commit is verified **with no gaps**.
