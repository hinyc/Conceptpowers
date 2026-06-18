---
name: conceptpowers-init
description: Use when the user wants to enable Conceptpowers governance on a project ("conceptpowers init", "개념 거버넌스 켜기", "concept 강제 활성화"). Scaffolds docs/conceptpowers and the activation marker.
---

# Conceptpowers: Init

Enable concept-driven governance on this project (opt-in, D3/D15).

## Steps

1. Confirm the backfill mode with the user (default: incremental):
   - **incremental** (default): scaffold + marker only. Backfill missing concepts gradually via audit.
   - **strict (full scan)**: enforce a full backfill immediately by scanning the whole project.
     > ⚠️ **Full scan is time- and token-intensive.** It walks every UI button/action and on-screen
     > content to enumerate features, then infers a concept for each feature that has none. On a
     > mid-life or large project this can take a long time and consume many tokens. Recommend
     > incremental unless the user explicitly wants a one-shot full backfill. Always state this cost
     > before running strict.
2. Confirm the output language with the user and pass it as `--lang` (`ko` or `en`, default `ko`).
   This sets `locale` in `init.json`; the agent then produces concept content, architecture/infra
   docs, and user-facing messages in that language.
3. Confirm the approval mode and pass it as `--approval` (`manual` or `cli`, default `manual`):
   - **manual** (default): the agent must NOT flip a concept's `status`. The user approves by editing
     `status` to `green` in the concept JSON. Auto-approval is blocked.
   - **cli**: the `conceptpowers-approve` skill / `node "<cli>" approve <slug>` may flip `status` to
     green after a consistency check. Changeable later via `approvalMode` in `init.json`.
4. Scaffold via the CLI (the CLI path is in the `CONCEPTPOWERS-ACTIVE` session context or the plugin dist):
   `node "<cli>" init --root . --mode <incremental|strict> --lang <ko|en> --approval <manual|cli>`
5. Report the result to the user: the 5 elements under `docs/conceptpowers/` (init/features/concepts/architecture/infra).
6. **Guide the user to fill in architecture.md / infra.md** (the high-level basis for concepts).
7. If strict (full scan): run the **full-scan procedure** below, then continue with `conceptpowers-audit`.

## Full-scan procedure (strict)

Run only after warning the user about time/token cost. Goal: enumerate features, then infer concepts.

1. **Enumerate features by behavior**: scan the codebase for every actionable surface first — buttons,
   form submits, menu actions, route handlers, commands — and describe the simple function of each.
2. **Enumerate features by screen**: analyze what each screen/view renders and list the features it
   exposes to the user. Merge with step 1 into a deduplicated feature list under `features/`.
3. **Infer concepts**: for each feature with no covering concept, infer a concept (define-concept).
   Auto-inferred concepts are saved with `status: red` (unapproved) — they are proposals for the user.
4. Report the feature list + inferred (red) concepts and tell the user to review and approve them.

## Notes

- `docs/conceptpowers/` is a **read-only baseline** afterward. Modify it only via update-baseline.
- The language can be changed later by editing `locale` in `init.json`; approval mode via `approvalMode`.
- If `init.json` already exists, it is not overwritten (user settings are preserved).
- Concept `status`: `green` = user-approved, `red` = unapproved (auto-inferred default). See the
  `conceptpowers-approve` skill.
