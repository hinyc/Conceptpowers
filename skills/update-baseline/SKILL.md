---
name: update-baseline
description: Use ONLY on the user's explicit request to change the baseline in a governance-active project — editing a concept/feature/architecture/infra ("baseline 수정"), or approving a red concept to green ("개념 승인", "이 개념 확정"). The agent never edits or approves on its own.
---

# Conceptpowers: Update Baseline (user-only — edit & approve)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

The two user-gated status transitions on the baseline (`docs/conceptpowers/`) live here:

- **Edit flow** — modify a concept/feature/architecture/infra. Editing a `green` concept demotes it
  to `pending` until the user re-approves it (rule 4, human-owns-contract).
- **Approve flow** — flip a concept `red` (auto-inferred proposal) → `green` (source of truth).
  Approval is user-gated; never approve to make your own change pass.

Both flows run **only on the user's explicit request** — no arbitrary edits during coding work.

## Approve flow (red → green)

User-authored concepts do NOT come here — they go pending → green via `conceptpowers:define-concept`
(passing consistency check). This flow is for auto-inferred `red` concepts the user reviewed.

1. **Consistency check first**: run `conceptpowers:check-consistency` for the target concept.
   Status-aware rule: green wins over red; a green↔green conflict stops and goes back to the user.
   Do not approve while an unresolved conflict remains.
2. **Approve** via the CLI (also re-renders the viewer badge):
   `node "<cli>" approve --root . <slug>`
3. Report: the concept is now `green`; any red concepts it superseded were revised or re-flagged.
   - Manual alternative: edit `status` to `green` in the JSON, then `node "<cli>" render --root .`
     and `node "<cli>" resolve-conflict <slug> --root .`. Reverting is the same flow with `status: red`.

## Edit flow (concept / feature / architecture / infra)

1. Confirm which baseline is changing: concept / feature spec / architecture / infra.
2. **When modifying a concept** — get the user's approval of the specific change first, then:
   - Write the changed fields to a small patch JSON (top-level fields are replaced whole, not
     deep-merged — include the entire section you touch).
   - Apply through the engine so the demotion is guaranteed and recorded:
     `node "<cli>" edit-concept <slug> --file <patch.json> --reason "<why it changed>" --root .`
     This forces `green → pending`, records the drift reason, and re-renders the viewer
     (`"downgradedToPending": true` in the JSON output).
   - **Do not hand-edit the concept JSON to keep it green.** The pending demotion is the point —
     run `conceptpowers:check-consistency` and record the passing attestation; then, with the
     user's confirmation, settle it back to `green` (set `status: green` in the JSON + `render`,
     or the viewer's status control). The approve flow above is red-only — it does not apply to pending.
   - If the change affects existing code (@concept links), report the impact scope to the user.
   - **Review the tests for that concept in the same commit** (conceptDrivenTests). Re-derive the
     scenario checklist from the new rules, update the tests that verified the old ones, and stage
     them alongside. When they genuinely need no change — or the concept has no tests yet — get the
     user's confirmation and record the reason instead:
     `node "<cli>" attest-test-review <slug> --result updated|no-impact|no-tests --tests <paths> --note "<why>" --root .`
     The record is hash-bound and dies with the next concept edit. Keep every test inside the
     concept's rules: if the concept now needs a check it does not state, that is another concept
     edit for the user to approve — not a wider test.
3. **When modifying architecture/infra/feature spec**: review with the user whether the change should
   also change a concept (the high-level basis constrains lower-level concepts, D9).
4. Report a summary, and **remind the user an edited concept is now `pending`** until it settles
   back to green via a passing consistency check (user-confirmed).

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/group/__features/<slug>` / `#/architecture` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
