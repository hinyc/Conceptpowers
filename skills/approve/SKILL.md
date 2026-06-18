---
name: conceptpowers-approve
description: Use when the user wants to approve a concept ("conceptpowers approve", "개념 승인", "이 개념 확정") — flip its status from red (unapproved) to green (approved) — in a Conceptpowers-active project. Approval is user-gated; the agent never approves on its own.
---

# Conceptpowers: Approve Concept (user-gated)

Flip a concept's `status` from `red` (unapproved) to `green` (approved). `green` is the source of
truth; `red` concepts are proposals (e.g. auto-inferred during a full scan) awaiting user review.

## Precondition (do not skip)

- **The user must explicitly request approval.** Never auto-approve a concept to make your own change
  pass. The whole point of `status` is that the user confirms the final concept set.
- Check `approvalMode` in `init.json`:
  - **manual** (default): the CLI/agent approve path is disabled. Tell the user to either edit the
    concept JSON's `status` to `green` themselves, or switch `approvalMode` to `cli` in `init.json`.
  - **cli**: the steps below are allowed.

## Steps (cli mode)

1. **Consistency check first**: run `conceptpowers-check-consistency` for the target concept against
   all existing concepts.
   - Resolve conflicts using the status-aware rule: green wins over red; a green↔green conflict stops
     and goes back to the user. Do not approve while an unresolved conflict remains.
2. **Approve** via the CLI (also re-renders the viewer badge):
   `node "<cli>" approve --root . <slug>`
   - This refuses with an error if `approvalMode` is not `cli`.
3. Report the result: the concept is now `green`, and any `red` concepts it superseded were revised
   or re-flagged. If a conflict could not be auto-resolved, ask the user to decide.

## Notes

- Manual approval is always available regardless of mode: edit `status` to `green` in the concept's
  JSON, then `node "<cli>" render --root .`.
- Reverting an approval is the same flow with `status: red` (manual edit).
