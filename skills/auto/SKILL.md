---
name: auto
description: Use after init when the user wants guided operation ("auto", "다음 뭐하면 돼?", "알아서 순서대로 진행해줘") in a governance-active project, or when the viewer / concepts:view script looks stale after a plugin update. Diagnoses the current stage and walks baseline → update-concepts (reference changes + definitions) → scan (gaps + mapping) → review (code vs concepts) in the right order, then offers a redteam critique that runs only if the user picks it, asking at every stage boundary.
---

# Conceptpowers: Auto (guided stage orchestrator)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Talk to the user in the project's output language (`locale` in `init.json`; missing → `ko`); quoted prompts below are templates to
render in that language.

Conceptpowers only defines concepts well when it is **used in the right order** — defining concepts without a
top-level baseline document, reviewing code without folding in changed reference material, or reviewing before closing gaps
all produce weak results. This skill remembers that order for you: it diagnoses the current stage, calls the existing
skills in the order **top-level baseline document → update concepts → scan → review**, and asks the user whether to continue at
every stage boundary.

## Role (orchestrator only)

- This skill **only calls and guides**. It never writes the content of top-level baseline documents or concepts itself —
  authoring happens with the user inside the owning skill (`update-concepts`).
- **Ask once at every stage boundary**: explain in one or two sentences what comes next → run it → summarize the
  result → "Continue to the next stage? (continue / skip this stage / stop here)". Never run two stages back to back
  without confirmation.
- Skipping is always allowed (nothing is forced). Skipped stages are listed in the final report.
- **Idempotent**: can be re-run at any time. Stages the diagnosis finds already done are reported as "done" and
  passed over automatically.

## Stage 0 — Diagnose (changes no concept or code; always runs)

Do not change concepts or code; only collect the current state — for the automatic sync of generated artifacts see #1
(the CLI path is in the `CONCEPTPOWERS-ACTIVE` session context or the plugin dist):

1. **Version sync**: it runs automatically before every CLI command, so there is nothing to do — if stderr showed the
   `[conceptpowers] auto version-sync` notice, report it as "done". If a manual run
   (`node "<cli>" version-sync --root .`) returns `skipped: up-to-date`, leave it — regenerate with `--force` only
   when the user explicitly asks (regenerating at the same version can revert local edits to generated artifacts).
   If version-sync returns `ok: false` or a non-empty `failedSteps` (exit 1), or the automatic sync notice lists a
   failed step, do not report "done" — state the failed step and the error in one line (e.g. a broken package.json
   fails `packageScript` → fix package.json, then re-run version-sync). If `viewer` is not among the failed steps the
   viewer has been redrawn; if `viewer` is among them the viewer may also be stale. Either way the version stamp is
   held back (other commands such as render do not change the stamp either), so the next sync (session start, the
   next CLI command, or version-sync) retries.
2. **Top-level baseline documents**: whether `architecture/architecture.md` / `infra/infra.md` are still the scaffold template.
3. **reference**: whether `reference/` is empty (no files + no entries in `paths.md`) — **existence check only; do
   not read the content.** Then `node "<cli>" reference-diff --quick --root .` — `unlocked` (no reference snapshot),
   `changed/removed` (changes), `added` (new files), `truncated` (only partly compared), `affected` (affected
   concepts), `newMaterial` (material for new concept candidates), `unreachable`.
4. **Concepts**: count and status distribution (🟢 green / 🟡 pending / 🔴 red) — for red/pending, use #6 audit's
   `unapproved`/`pending` (based on the concept sources) first. `concepts[].status` in
   `concepts/viewer/manifest.json` is a generated artifact that can be stale before `render`, so use it only as a
   secondary source (counts, green check).
5. **Features**: number of specs in `features/`.
6. **Integrity**: `node "<cli>" audit --root .` — **with no file arguments** (full scan: `unknownTags` +
   `duplicateSlugs` + `conceptless`). Exit 1 is diagnostic data, not a failure. If there are `duplicateSlugs`
   (two or more concept files with the same slug), report cleaning them up through update-concepts so only one
   remains as the first thing to do.

Report the result as a **stage map** — whether each stage is done / partial / not started, and where to start — then
ask whether to proceed to the first unfinished stage. If everything is done, report so and stop.

## Stage 1 — Baseline (top-level baseline documents — the higher standard for concepts)

If architecture.md / infra.md are still the template:

- Explain in one line that these are the **higher standard for concepts** (a higher layer constrains the concepts of
  lower layers) and ask how to write them:
  1. **Draft from code analysis (recommended)** — analyze the codebase and show a draft based on the current
     implementation. The draft is **only a proposal, not a save** — save it through the `update-concepts` (C)
     procedure only after the user has reviewed, edited and confirmed it. During review, always say: "This draft
     reads the **current implementation (as-is)**. The top-level baseline documents are the standard for **intent (to-be)**,
     so fix now any part that should differ from the implementation."
  2. **User writes it** — the user dictates the content and the agent writes it down.
  3. **Skip** — warn in one line: "Concepts defined without top-level baseline documents may later conflict with the higher
     standard."
- Whatever the method, **never save without the user's confirmation**.

## Stage 2 — Update concepts

Call `conceptpowers:update-concepts`. The diagnosis decides the trigger:

- If there are `changed/removed` or `added` → **trigger A (applying reference changes)** — affected concepts first.
  When done, record the reference snapshot after the user confirms.
- If there are no or few concepts → **trigger B batch definition**. If reference is empty before running, ask as that
  skill instructs: ① proceed ② add files ③ register an external path — never skip silently. Concept definition is the
  **only** time reference is read.
- If `unlocked` (no reference snapshot) and concepts already exist, propose recording the snapshot once after
  definition and review are done.
- Checkpoints inside the skill (confirming candidate scope, batch review, consistency check) follow that skill's rules
  as written — auto does not answer them on the user's behalf.

## Stage 3 — Scan

Call `conceptpowers:scan` — receive the list of concept-less code, broken tags, missing feature specs, red/pending
concepts and quality deficiencies, and ask how to handle each item:

- Concept-less code → tag with an existing concept / define one with `update-concepts` (trigger B) (loop back to
  Stage 2) / `@concept:none` / defer.
- 🔴 red → if the user wants, the `update-concepts` (D) approval flow (a user gate — auto never approves on its own).
- 🟡 pending → try to settle with an `update-concepts` (G) re-check / discuss editing or splitting (C) / defer.
- Green below the quality floor → ask the user and fill it in together (no automatic filling).
- Tagging + `map` + `render` finish inside scan.

## Stage 4 — Review

Call `conceptpowers:review` in **whole-project mode** — it judges whether mapped code is implemented as the concepts
say and returns a **list of mismatches**.

- Violation → the user chooses: fix the code (TDD, within the concept) / edit the concept (`update-concepts` C) /
  split the feature.
- Undecidable (vague concept) → recommend an `update-concepts` (F) upgrade (loop back to Stage 2 — reference is read
  then).
- If a loop-back changed a concept, first check that the concept has settled back to green, then run review once more
  to confirm convergence. If it is still pending/red it is not judged in whole-project mode, so record it as "not
  judged — not yet settled".
- When review is done, ask once as an option: "Run a redteam (critical review) on the finished work?
  (`conceptpowers:redteam`)". Run that skill **only if the user chooses to** — if there is no answer, an ambiguous
  answer, or a different answer, do not run it and record it as "skipped" in the final report. auto never decides to
  run it on its own.

## Final report

Compare the diagnosis (Stage 0) snapshot with the current state and report:

- Result per stage: done / skipped (user's choice) / deferred items.
- Remaining work: mismatch list, unapproved 🔴, unsettled 🟡, deferred gaps, a reference snapshot not yet recorded —
  and for each, which skill to continue with.
- Tell the user `/conceptpowers:auto` can be re-run at any time to resume from the remaining stages.
- Viewer check: `npm run concepts:view`.

## Prohibited

- Running stages back to back without the user's confirmation.
- Saving top-level baseline document or concept content **without the user's confirmation** (presenting drafts is allowed;
  confirming is always the human's call).
- auto approving a 🔴 red concept on its own.
- Recording a reference snapshot (`reference-snapshot`) without review.

## Viewer handoff (last step — never skip)

After `render`, end by handing over a clickable viewer link built from the viewer path and serve command that render
printed (reuse the running server's URL if one is up). The deep-link format and fallback launch method are defined in
the "Viewer handoff" section of `conceptpowers:update-concepts`.
