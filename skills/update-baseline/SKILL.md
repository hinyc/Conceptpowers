---
name: update-baseline
description: Use ONLY when the user explicitly asks to modify the baseline (a concept, feature spec, architecture, or infra) in a governance-active project. The agent never modifies baseline on its own.
---

# Conceptpowers: Update Baseline (user-only)

> **Precondition — init required:** if `docs/conceptpowers/init.json` does not exist, **STOP here**.
> Tell the user this project is not initialized and that governance commands are disabled until
> `/conceptpowers:init` is run (the engine CLI refuses too). Offer to run init now; do not execute
> any step below without the marker.

Modify the baseline (all of `docs/conceptpowers/`) (rule 4).

## Precondition

- Run only when the **user explicitly requests** the change. No arbitrary edits during coding work.

## Steps

1. Confirm which baseline is changing: concept / feature spec / architecture / infra.
2. **When modifying a concept**:
   - Before applying the change, run `conceptpowers:check-consistency` to check for conflicts/violations
     against other concepts.
   - Save only when there are zero conflicts, then regenerate the viewer: `node "<cli>" render --root .`
   - If the concept change affects existing code (@concept links), report the impact scope to the user.
   - Record **why** the concept changed so drift detection can surface the reason:
     `node "<cli>" note-change <slug> --reason "<why it changed>" --root .`
3. **When modifying architecture/infra/feature spec**: review with the user whether the change should also
   change a concept (the high-level basis constrains lower-level concepts, D9).
4. Report a summary of the changes to the user.

## Viewer handoff (마지막 단계 — 생략 금지)

When this skill finishes with any concept/feature/baseline data changed and the viewer re-rendered
(`render`), end by giving the user a **clickable link** to see the result:

1. If a viewer server is already running in this session, print its URL again — deep-link what
   changed: `http://localhost:<port>/concepts/viewer/index.html#/concept/<slug>` (feature:
   `#/feature/<slug>`, 문서: `#/architecture`).
2. Otherwise, offer to start it now: run the project's `concepts:view` script in the **background**
   (`npm run concepts:view` — pnpm/yarn equivalent도 동일) and print the URL line it outputs so the
   user can click straight through. No script in package.json → run
   `node docs/conceptpowers/concepts/viewer/serve.mjs` in the background instead.

Ending a concept update without this link forces the user to hunt for the viewer — always close
the loop with the URL.
