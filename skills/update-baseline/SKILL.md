---
name: update-baseline
description: Use ONLY when the user explicitly asks to modify the baseline (a concept, feature spec, architecture, or infra) in a governance-active project. The agent never modifies baseline on its own.
---

# Conceptpowers: Update Baseline (user-only)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Modify the baseline (all of `docs/conceptpowers/`) (rule 4).

## Precondition — 사용자 승인 필수 (human-owns-contract)

- Run only when the **user explicitly requests and approves** the change. No arbitrary edits during
  coding work. The agent **may** edit a concept directly, but **only after the user has approved the
  exact change** — never on the agent's own judgment to make code pass a check.
- **The edit does NOT activate the concept.** Editing a `green` concept drops it to `pending`; the
  concept is not used for verification again until the **user manually approves** it back to `green`
  (`conceptpowers:approve`). State this to the user every time you edit a green concept.

## Steps

1. Confirm which baseline is changing: concept / feature spec / architecture / infra.
2. **When modifying a concept** — get the user's approval of the specific change first, then:
   - Write the changed fields to a small patch JSON (only the fields you are changing — e.g.
     `{ "actions": { "allow": [...], "restrict": [...] } }`; top-level fields are replaced whole,
     not deep-merged, so include the entire section you touch).
   - Apply it through the engine so the demotion is guaranteed and recorded:
     `node "<cli>" edit-concept <slug> --file <patch.json> --reason "<why it changed>" --root .`
     This forces `green → pending`, records the reason for drift, and re-renders the viewer. The
     JSON output includes `"downgradedToPending": true` when a green concept was demoted.
   - **Do not hand-edit the concept JSON to keep it green.** The pending demotion is the whole point —
     a human must re-approve (`conceptpowers:approve <slug>`) after re-running check-consistency.
   - Run `conceptpowers:check-consistency` against the edited concept before the user re-approves, so
     the green promotion has a fresh passing attestation (the engine refuses green otherwise).
   - If the concept change affects existing code (@concept links), report the impact scope to the user.
3. **When modifying architecture/infra/feature spec**: review with the user whether the change should also
   change a concept (the high-level basis constrains lower-level concepts, D9).
4. Report a summary to the user, and **remind them the concept is now `pending`** and must be manually
   approved (`conceptpowers:approve <slug>`) before it governs code again.

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/feature/<slug>` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
