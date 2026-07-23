---
name: audit
description: Use when the user wants a full project audit ("개념 전수 점검", "구멍 찾기") in a governance-active project. Finds concept-less code (gaps) and verifies existing @concept links.
---

# Conceptpowers: Audit (full audit)

> **Precondition — init required:** if `docs/conceptpowers/init.json` does not exist, **STOP here**.
> Tell the user this project is not initialized and that governance commands are disabled until
> `/conceptpowers:init` is run (the engine CLI refuses too). Offer to run init now; do not execute
> any step below without the marker.

Manual run. Inspect the whole project for ① unlinked gaps and ② integrity of existing links (D13).

## Steps

> **Judgment basis: concepts ONLY.** Defined concepts are the facts — every verification in this
> audit judges code against **concept rules alone**. Do NOT read `docs/conceptpowers/reference/`
> content during the audit (reference is consumed only when authoring/upgrading concepts; reading
> it here wastes tokens and lets unwritten rules leak into verdicts untraceably). The only
> reference interaction allowed is a cheap **existence check** (directory listing + whether
> `paths.md` has entries) used in step 2's define-concept handoff below.

1. **Integrity (deterministic)**: run the CLI audit over the full source:
   `node "<cli>" audit --root . <source files...>`
   - Reports `unknownTags` (tags pointing to nonexistent concepts).
2. **Unlinked gaps (semantic judgment)**: scan the source for features/behaviors/roles/permissions/terms
   that need a concept but have no `@concept` tag. For each:
   - If a related concept already exists → suggest adding the tag (update-mapping).
   - If no concept exists → suggest define-concept. **When recommending define-concept, check
     whether reference is empty** (no files besides the scaffold `README.md`, and no usable
     entry in `paths.md` — existence check only, don't read content). If empty, tell the user:
     "reference/가 비어 있습니다 — 이 상태로 개념을 정의하면 근거 자료 없이 작성됩니다." and
     offer: ① 그대로 정의 진행 ② 파일을 reference/에 추가 ③ **외부 로컬 경로 등록** — 경로
     (여러 개 가능)를 입력받아 `reference/paths.md`에 기록하면 정의 시 바로 사용된다.
   - If the file is genuinely concept-agnostic (utils/types/config/scripts) → suggest an explicit
     **`@concept:none`** marker (not silence). Every hand-written code file should carry a top marker.
   - Note: the commit gate flags concept-less code automatically (any governed code file with **no**
     `@concept` marker → `[WARNING] 개념 없는 코드`). `@concept:none` counts as marked and passes.
     Only regenerated/external code matching `init.json` `ignoreGlobs` (`dist/**`, `**/*.generated.*`, …)
     is exempt; a single file may carry multiple `@concept` tags.
2b. **Feature coverage (knowledge graph)**: check that each user-facing feature surface is recorded as a
   feature spec under `features/` with its `concepts` (feature → concept) and `codePaths` (feature → code)
   filled in. For any surface missing a spec, or a spec missing those links, suggest
   `conceptpowers:define-feature`. This is what keeps the `#/graph` view connected (concept · feature · code).
3. **Verify existing links (semantic judgment)**: for each `@concept` link, sample-check that the code
   complies with the concept's allow/restrict/immutable rules (reuse check-concept — concepts only,
   three-way verdict). When a link is **undecidable** (the concept's rules are too vague to judge
   the code against), do not guess and do not consult reference — record it as a
   **판단 불가(개념 모호)** item with the specific ambiguity, and recommend upgrading that concept
   via define-concept (reference is read there; change recorded via `note-change`).
4. **Unapproved concepts (status)**: the CLI audit also returns `unapproved` (all `red` concepts) and
   `unapprovedRefs` (red concepts referenced by the scanned files). List them and recommend the user
   review and approve each (see `conceptpowers:approve`). Auto-inferred concepts start `red`.
5. **Lingering pending concepts (reminder, non-blocking)**: list any concepts with `status: pending`
   (user-authored, not yet settled). Pending concepts auto-promote to `green` once they pass a
   consistency check; until then they remain pending. Remind the user to run
   `conceptpowers:check-consistency` for each or to decide whether to revise/split them.
   Do **not** refer to pending concepts as "unapproved" — they are user-authored drafts, not
   auto-inferred proposals.
6. **Quality floor of green concepts:** run `node "<cli>" quality <slug> --root .` for each
   green concept; report any deficiencies (rule-less concepts predate the quality gate).
   Recommended action: fill the missing rules with the user — do not auto-fill; demotion is
   a human decision.
7. **Report**: present the list of gaps + violations + **판단 불가(개념 모호 — 업그레이드 권장)** +
   unapproved (red) concepts + lingering pending (non-blocking) + quality deficiencies +
   recommended actions.
   - The baseline is read-only, so create/modify concepts only after user confirmation.

## Backfill modes

- incremental: report gaps only and recommend gradual backfill — including missing feature specs and
  their concept/code links (define-feature), so the graph fills in over time.
- strict: force immediate resolution of all gaps (init strict or on user request), wiring every feature
  to its concept(s) and code.
