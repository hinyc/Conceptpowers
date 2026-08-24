---
name: init
description: Use when the user wants to enable concept governance on a project ("개념 거버넌스 켜기", "init"). Scaffolds docs/conceptpowers and the activation marker.
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
2. Confirm the commit-gate enforcement level with the user (default: standard):
   - **strict**: 개념과 어긋난 커밋을 차단합니다. 진행하려면 개념을 먼저 수정하고 충돌이
     없어야 합니다. 장기 운영·다인 협업·개념 우선 원칙을 강하게 지킬 프로젝트에 권합니다.
   - **standard** (default): 문제를 보여주고 "그래도 진행할까요?"라고 묻습니다. 대부분의
     프로젝트에 알맞습니다.
   - **light**: 커밋을 멈추지 않고 경고만 모아 보고합니다. 소규모·단기·실험 프로젝트의
     도입 장벽을 낮춥니다. 나중에 standard/strict로 올릴 수 있습니다(init.json의
     `enforcement`를 사용자가 직접 수정).
     Pass the choice as `--enforcement <strict|standard|light>`.
3. Confirm the output language with the user and pass it as `--lang` (`ko` or `en`, default `ko`).
   This sets `locale` in `init.json`; the agent then produces concept content, architecture/infra
   docs, and user-facing messages in that language.
4. Scaffold via the CLI (the CLI path is in the `CONCEPTPOWERS-ACTIVE` session context or the plugin dist):
   `node "<cli>" init --root . --mode <incremental|strict> --lang <ko|en> --enforcement <strict|standard|light>`
5. Report the result to the user: the 5 elements under `docs/conceptpowers/` (init/features/concepts/architecture/infra).
6. **Guide the user to fill in architecture.md / infra.md** (the high-level basis for concepts).
7. **Ask for reference material paths (skippable).** "개념을 작성할 때 참고할 문서 폴더나 파일이
   있나요? 경로를 알려주시면 등록해 두겠습니다 (여러 개 가능 — 건너뛰어도 됩니다).
   저장소 밖 자료는 절대 경로로(홈 아래면 `~/…`), 저장소 안 자료는 저장소 루트 기준
   상대 경로로 알려주세요."
   - If the user gives paths: `node "<cli>" reference-add "<path1>" "<path2>" --root .`, then report
     `added`/`skipped` and **warn about any `external[].status` that is not `ok`** — `missing`
     (경로 없음) or `empty` (경로는 있으나 참고할 자료가 없음).
   - If the user skips: tell them once that they can register paths anytime with
     `/conceptpowers:add-reference`, or by writing one path per line in
     `docs/conceptpowers/reference/paths.md`, and that material can also be dropped straight into
     `docs/conceptpowers/reference/`. Do not ask again.
   - See `/conceptpowers:add-reference` for the full flow.
8. **Offer define-concept as the immediate next step.** Explain it in one line — "define-concept는
   프로젝트의 규칙과 의도(예: '결제 후 가격은 불변')를 기계가 검사할 수 있는 계약(개념)으로
   작성하는 단계입니다. 참고자료를 reference/에 넣어두거나 `reference/paths.md`에 외부 로컬
   경로(여러 개 가능)를 등록해두면 그걸 근거로 함께 작성합니다." — then
   **ask the user whether to continue with `/conceptpowers:define-concept` right now.** Proceed only
   on yes; if they decline, remind them it is available anytime.
9. If strict (full scan): run the **full-scan procedure** below, then continue with `conceptpowers:audit`.

## Full-scan procedure (strict)

Run only after warning the user about time/token cost. Goal: build the full **concept · feature · code**
knowledge graph — enumerate features, infer concepts, and wire all three links so the `#/graph` view is connected.

1. **Enumerate features by behavior**: scan the codebase for every actionable surface first — buttons,
   form submits, menu actions, route handlers, commands — and describe the simple function of each.
2. **Enumerate features by screen**: analyze what each screen/view renders and list the features it
   exposes to the user. Merge with step 1 into a deduplicated feature list.
3. **Record each feature and wire it to code**: for each feature, write a feature spec with its
   implementing `codePaths` filled in (the _feature → code_ link) via `conceptpowers:define-feature`.
4. **Infer concepts and wire features to them**: for each feature with no covering concept, infer a
   concept (define-concept) — auto-inferred concepts are saved with `status: red` (unapproved) — then
   record the concept slug in that feature's `concepts` (the _feature → concept_ link).
5. **Tag every code file (concept → code, no gaps)**: add `@concept:<slug>` tags to the implementing
   files. **Every governed code file must carry an explicit marker at the top** — for files where no
   concept applies (utils/types/config/scripts, etc.), write **`@concept:none`** explicitly rather than
   leaving them untagged. Then run `conceptpowers:update-mapping` (`node "<cli>" map ...`) so concept and
   feature converge on the same file. (`none` is a reserved marker: it satisfies the gate but is never a
   real concept. `ignoreGlobs` auto-excludes only regenerated/external code — `dist/**`, `**/*.generated.*`, etc.)
6. **Regenerate and report**: `node "<cli>" render --root .`, then report the feature list + inferred
   (red) concepts + the wired graph, and tell the user to review and approve the red concepts.

## Notes

- `docs/conceptpowers/` is a **read-only baseline** afterward. Modify it only via update-baseline.
- **Reference doctrine**: `reference/` is read only when authoring/upgrading concepts
  (define-concept / check-consistency); verification skills judge against concept rules alone.
- The language can be changed later by editing `locale` in `init.json`.
- If `init.json` already exists, it is not overwritten (user settings are preserved).
- Concept `status` (3-state model):
  - `green` — user-approved and consistent; source of truth.
  - `pending` — user-authored draft; auto-promotes to `green` after a passing consistency check,
    else stays pending until resolved. See `conceptpowers:define-concept`.
  - `red` — auto-inferred (full scan) proposal awaiting user review and approval.
    See the approve flow of `conceptpowers:update-baseline`.
