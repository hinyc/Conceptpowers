---
name: conceptpowers-approve
description: Use when the user wants to approve a concept ("conceptpowers approve", "개념 승인", "이 개념 확정") — flip its status from red (unapproved) to green (approved) — in a Conceptpowers-active project. Approval is user-gated; the agent never approves on its own.
---

# Conceptpowers: Approve Concept (user-gated)

Flip a concept's `status` from `red` (unapproved) to `green` (approved). `green` is the source of
truth; `red` concepts are proposals (e.g. auto-inferred during a full scan) awaiting user review.

## Precondition (do not skip)

- **The user must explicitly request approval.** Never approve to make your own change pass.
- This skill promotes an **auto-inferred `red`** concept to `green`. User-authored concepts go
  through `define-concept` (pending → green on a passing consistency check) and do not need this.

## Steps

1. **Consistency check first**: run `conceptpowers-check-consistency` for the target concept against
   all existing concepts.
   - Resolve conflicts using the status-aware rule: green wins over red; a green↔green conflict stops
     and goes back to the user. Do not approve while an unresolved conflict remains.
2. **Approve** via the CLI (also re-renders the viewer badge):
   `node "<cli>" approve --root . <slug>`
3. Report the result: the concept is now `green`, and any `red` concepts it superseded were revised
   or re-flagged. If a conflict could not be auto-resolved, ask the user to decide.

## Notes

- You can also approve by editing `status` to `green` in the concept JSON, then `node "<cli>" render --root .`.
  When approving this way, also run `node "<cli>" resolve-conflict <slug> --root .` to clear any recorded conflict.
- Reverting an approval is the same flow with `status: red` (manual edit).
