---
name: init
description: Use when the user wants to enable concept governance on a project ("개념 거버넌스 켜기", "init"). Scaffolds docs/conceptpowers and the activation marker.
---

# Conceptpowers: Init

Enable concept-driven governance on this project (opt-in, D3/D15).

Talk to the user in their language; the output language (`locale`) is not set until step 4, and the quoted prompts
below are templates to render in the user's language.

## Steps

1. Confirm the backfill mode with the user (default: incremental) — it only decides whether step 9 runs the full scan now; it is not passed to the CLI:
   - **incremental** (default): scaffold + marker only. Backfill missing concepts gradually via audit.
   - **strict (full scan)**: enforce a full backfill immediately by scanning the whole project.
     > ⚠️ **Full scan is time- and token-intensive.** It walks every UI button/action and on-screen
     > content to enumerate features, then infers a concept for each **promise** those features make
     > that no existing concept covers (one concept can serve many features). On a
     > mid-life or large project this can take a long time and consume many tokens. Recommend
     > incremental unless the user explicitly wants a one-shot full backfill. Always state this cost
     > before running strict.
2. Confirm the commit-gate enforcement level with the user (default: standard):
   - **strict**: "Blocks commits that conflict with a concept. To proceed, the concept must be fixed first and
     have no conflicts. Recommended for long-lived projects, multi-person collaboration, and projects that hold
     strongly to concept-first."
   - **standard** (default): "Shows the problem and asks 'Proceed anyway?'. Suits most projects."
   - **light**: "Never stops a commit; it only collects and reports warnings. Lowers the adoption barrier for
     small, short-lived or experimental projects. Can be raised to standard/strict later (edit `enforcement` in
     init.json directly)."
     Pass the choice as `--enforcement <strict|standard|light>`.
3. Confirm the output language with the user and pass it as `--lang` (`ko` or `en`, default `en`).
   This sets `locale` in `init.json`; the agent then produces concept content, architecture/infra
   docs, and user-facing messages in that language.
4. Scaffold via the CLI (the CLI path is in the `CONCEPTPOWERS-ACTIVE` session context or the plugin dist):
   `node "<cli>" init --root . --lang <ko|en> --enforcement <strict|standard|light>`
5. Report the result to the user: the 5 elements under `docs/conceptpowers/` (init/features/concepts/architecture/infra).
6. **Guide the user to fill in architecture.md / infra.md** (the high-level basis for concepts).
7. **Ask for reference material paths (skippable).** "Are there document folders or files to consult when writing
   concepts? Tell me the paths and I'll register them (several are fine — you can also skip this). Give material
   outside the repository as an absolute path (`~/…` if under your home) and material inside the repository as a
   path relative to the repository root."
   - If the user gives paths: `node "<cli>" reference-add "<path1>" "<path2>" --root .`, then report
     `added`/`skipped` and **warn about any `external[].status` that is not `ok`** — `missing`
     (the path does not exist) or `empty` (the path exists but holds no material to consult).
   - If the user skips: tell them once that they can register paths anytime with
     `/conceptpowers:update-concepts` (registering a reference path), or by writing one path per line in
     `docs/conceptpowers/reference/paths.md`, and that material can also be dropped straight into
     `docs/conceptpowers/reference/`. Do not ask again.
   - See the trigger E (registering a reference path) flow of `/conceptpowers:update-concepts` for the full flow.
8. **Offer update-concepts as the immediate next step.** Explain it in one line — "update-concepts is the step that
   writes the project's rules and intent (e.g. 'the price is immutable after checkout') as contracts (concepts) a
   machine can check. If you put reference material in reference/ or register external local paths (several are
   fine) in `reference/paths.md`, you and I write the concepts together based on that material." — then
   **ask the user whether to continue with `/conceptpowers:update-concepts` (trigger B: defining a new concept) right now.** Proceed only
   on yes; if they decline, remind them it is available anytime.
9. If strict (full scan): run the **full-scan procedure** below, then continue with `conceptpowers:scan`.

## Full-scan procedure (strict)

Run only after warning the user about time/token cost. Goal: build the full **concept · feature · code**
knowledge graph — enumerate features, infer concepts, and wire all three links so the `#/graph` view is connected.

1. **Enumerate features by behavior**: scan the codebase for every actionable surface first — buttons,
   form submits, menu actions, route handlers, commands — and describe the simple function of each.
2. **Enumerate features by screen**: analyze what each screen/view renders and list the features it
   exposes to the user. Merge with step 1 into a deduplicated feature list.
3. **Record each feature and wire it to code**: for each feature, write a feature spec with its
   implementing `codePaths` filled in (the _feature → code_ link) via the "Recording a feature spec" procedure of `conceptpowers:scan`.
4. **Infer concepts and wire features to them**: run the **auto-inference mode** of `conceptpowers:update-concepts`
   (its batch procedure) — it reads the reference material too, applies the "Qualification gate", and saves every
   new concept as `status: red` — an unapproved proposal, not a rule: per concept `human-owns-contract` it becomes
   a rule only after the user approves it, and governs no code before that. There is one feature per surface, but
   **not one concept per surface** — many features pointing at one concept is normal.
   Then write each concept slug (new or existing) into the matching feature's
   `concepts` (the _feature → concept_ link). Candidates that fail the gate go to feature specs or a one-line
   proposal for `architecture.md` / `infra.md`.
5. **Tag every code file (concept → code, no gaps)**: add `@concept:<slug>` tags to the implementing
   files. **Every governed code file must carry an explicit marker at the top** — for files where no
   concept applies (utils/types/config/scripts, shared UI used across features — buttons, modals, layouts,
   design-system components — etc.), write **`@concept:none`** explicitly rather than
   leaving them untagged. Then run the "Tag rules and mapping refresh" step of `conceptpowers:scan` (`node "<cli>" map ...`) so concept and
   feature converge on the same file. (`none` is a reserved marker: it satisfies the gate but is never a
   real concept. `ignoreGlobs` auto-excludes only regenerated/external code — `dist/**`, `**/*.generated.*`, etc.
   When such conceptless files share a folder — e.g. a shared UI kit — suggest the user declare it once as a
   no-concept area in `init.json` `noConceptGlobs` instead of tagging each file; the user edits that file.)
6. **Regenerate and report**: `node "<cli>" render --root .`, then report the feature list + inferred
   (red) concepts + the wired graph, and tell the user to review and approve the red concepts.

## Notes

- `docs/conceptpowers/` is a **read-only baseline** afterward. Modify it only via `update-concepts` on explicit user request.
- **Reference doctrine**: `reference/` is read only when authoring/upgrading concepts
  (`update-concepts`); verification skills (`review`, `scan`) judge against concept rules alone.
- The language can be changed later by editing `locale` in `init.json`.
- If `init.json` already exists, it is not overwritten (user settings are preserved).
- Concept `status` (3-state model):
  - `green` — settled contract: user-authored, consistency-checked, user-confirmed. It states what
    must hold, not that the current code already complies.
  - `pending` — user-authored draft; settles to `green` after a passing consistency check and the
    user's confirmation,
    else stays pending until resolved. See `conceptpowers:update-concepts`.
  - `red` — auto-inferred (full scan) proposal awaiting user review and approval.
    See the approve flow (D) of `conceptpowers:update-concepts`.
