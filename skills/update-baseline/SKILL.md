---
name: conceptpowers-update-baseline
description: Use ONLY when the user explicitly asks to modify the baseline (a concept, feature spec, architecture, or infra) in a Conceptpowers-active project. The agent never modifies baseline on its own.
---

# Conceptpowers: Update Baseline (user-only)

Modify the baseline (all of `docs/conceptpowers/`) (rule 4).

## Precondition

- Run only when the **user explicitly requests** the change. No arbitrary edits during coding work.

## Steps

1. Confirm which baseline is changing: concept / feature spec / architecture / infra.
2. **When modifying a concept**:
   - Before applying the change, run `conceptpowers-check-consistency` to check for conflicts/violations
     against other concepts.
   - Save only when there are zero conflicts, then regenerate the viewer: `node "<cli>" render --root .`
   - If the concept change affects existing code (@concept links), report the impact scope to the user.
   - Record **why** the concept changed so drift detection can surface the reason:
     `node "<cli>" note-change <slug> --reason "<why it changed>" --root .`
3. **When modifying architecture/infra/feature spec**: review with the user whether the change should also
   change a concept (the high-level basis constrains lower-level concepts, D9).
4. Report a summary of the changes to the user.
