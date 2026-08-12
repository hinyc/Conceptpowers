---
name: audit
description: Use when the user wants a full project audit ("개념 전수 점검", "구멍 찾기") in a governance-active project. Finds concept-less code (gaps) and verifies existing @concept links.
---

# Conceptpowers: Audit (full audit)

> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.

Manual run. Inspect the whole project for ① unlinked gaps and ② integrity of existing links (D13).

## Steps

> **Concepts ONLY** (session doctrine): never read `reference/` content during the audit. The only
> allowed interaction is the cheap existence check (directory listing + `paths.md` entries) in step 2.

1. **Integrity + gaps (deterministic)**: run the CLI audit with NO file args — full scan mode. It walks
   `git ls-files` (ignoreGlobs applied to both scans) and prints `{...report, conceptless: [...]}`,
   exiting 1 when `unknownTags` or `conceptless` is non-empty:
   `node "<cli>" audit --root .`
   - `unknownTags`: tags pointing to nonexistent concepts.
   - `conceptless`: files with no `@concept` marker at all — this is the deterministic starting point
     for step 2's gap detection, not something to re-derive by manual enumeration.
   - (File-args mode — `audit --root . <files...>` — still exists for a narrower, non-full scan; use
     the no-arg form for this whole-project audit.)
2. **Unlinked gaps (semantic judgment)**: take the `conceptless` list from step 1 as the deterministic
   starting point, then apply semantic judgment to each entry (and to any file the deterministic scan
   couldn't classify) to look for features/behaviors/roles/permissions/terms that need a concept but
   have no `@concept` tag. For each:
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
   review and approve each (see the `conceptpowers:update-baseline` approve flow). Auto-inferred concepts start `red`.
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
