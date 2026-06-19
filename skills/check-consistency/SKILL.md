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
3. Apply the **status-aware resolution rule** when a conflict is found:
   - **green is the source of truth.** When a newly approved (green) concept conflicts with a `red`
     (unapproved) concept, the red one yields: revise it to remove the contradiction, or re-flag it
     `red` for the user. The green concept is not weakened to accommodate a red one.
   - **green ↔ green conflict → stop and ask the user.** Two user-approved concepts contradicting each
     other is a real contradiction the agent must not auto-resolve. Present both and the conflict.
   - **red ↔ red conflict** → report both as unresolved proposals; resolve when the user approves one.
   - Pending(🟡) concepts are user-authored drafts under check. On a clean result, the caller
     promotes them to green; on a conflict, they stay pending and the reason is recorded via
     `note-conflict`. Settled green/red concepts are never auto-changed by this check.
4. Proceed with save/commit only when there are zero unresolved conflicts.

## Commit gate (D17)

- On `git commit`, if the staged set (`git diff --cached --name-only`) includes concept-data changes, run this check.
- check-concept covers code changes and this skill covers concept changes, so the commit is verified **with no gaps**.
- **Unapproved (red) concepts do not hard-block a commit**, but the commit gate surfaces them with an
  emphasized warning (`⚠️ UNAPPROVED CONCEPTS`). When you see it, show the warning prominently and ask
  the user "commit anyway?" — proceed only on explicit confirmation. Approving the concepts first
  (manual edit, or `conceptpowers-approve` on explicit user request) is preferred.
