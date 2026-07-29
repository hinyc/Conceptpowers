---
name: approve
description: Use when the user wants to approve a concept ("개념 승인", "이 개념 확정") — flip its status from red (unapproved) to green (approved). Approval is user-gated; the agent never approves on its own.
---

# Conceptpowers: Approve Concept (user-gated)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Flip a concept's `status` from `red` (unapproved) to `green` (approved). `green` is the source of
truth; `red` concepts are proposals (e.g. auto-inferred during a full scan) awaiting user review.

## Precondition (do not skip)

- **The user must explicitly request approval.** Never approve to make your own change pass.
- This skill promotes an **auto-inferred `red`** concept to `green`. User-authored concepts go
  through `define-concept` (pending → green on a passing consistency check) and do not need this.

## Steps

1. **Consistency check first**: run `conceptpowers:check-consistency` for the target concept against
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
