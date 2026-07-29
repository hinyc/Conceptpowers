# 스킬 최적화 (11→10, 보일러플레이트 제거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스킬 11개(903줄)를 10개(~570줄)로 정리한다 — 반복 보일러플레이트 3종 제거, define-concept batch 플로우 분할, approve를 update-baseline에 통합, viewer handoff를 render CLI 출력 기반으로 축약.

**Architecture:** 스킬 프로즈의 중복은 (a) 짧은 canonical 문구로 축약하고, (b) 전역 독트린은 sessionStart 훅 주입 컨텍스트로 올리고, (c) 결정적 정보(뷰어 경로)는 render CLI의 JSON 출력으로 내린다. CLI 서브커맨드(`approve` 등)는 전부 유지 — 병합되는 것은 **스킬**뿐이다.

**Tech Stack:** Markdown(SKILL.md), TypeScript(src/cli.ts, src/hooks/sessionStart.ts), vitest.

## Global Constraints

- 커밋 메시지는 conventional commit(`refactor:`, `feat:`, `docs:`), 어트리뷰션 푸터 없음 (~/.claude/settings.json에서 비활성화됨).
- 훅은 `dist/hooks/*.js`를 직접 실행하므로 src 변경 후 `pnpm build` 필수.
- 테스트는 `pnpm test`(vitest). src 변경 태스크는 테스트 먼저(RED→GREEN).
- `docs/conceptpowers/`(baseline)는 이 계획에서 절대 건드리지 않는다.
- CLI 서브커맨드 이름(`approve`, `edit-concept` 등)은 변경 금지 — 외부 프로젝트가 사용 중.
- 각 SKILL.md의 frontmatter `description`은 트리거 조건을 유지해야 한다(설명 삭제 금지, 축약만 허용).
- push는 사용자가 직접 한다 (계정 이슈).

---

### Task 1: init 가드 블록 축소 (10개 스킬)

**Files:**
- Modify: `skills/auto/SKILL.md`, `skills/define-concept/SKILL.md`, `skills/define-feature/SKILL.md`, `skills/check-concept/SKILL.md`, `skills/check-consistency/SKILL.md`, `skills/audit/SKILL.md`, `skills/update-mapping/SKILL.md`, `skills/update-baseline/SKILL.md`, `skills/approve/SKILL.md`, `skills/version-sync/SKILL.md`

**Interfaces:**
- Produces: 2줄 표준 init 가드 문구 (이후 태스크에서 새 스킬 작성 시 동일 문구 사용).

- [ ] **Step 1: 10개 파일에서 4줄 blockquote를 2줄로 치환**

각 파일 상단(H1 바로 아래)의 이 블록을:

```markdown
> **Precondition — init required:** if `docs/conceptpowers/init.json` does not exist, **STOP here**.
> Tell the user this project is not initialized and that governance commands are disabled until
> `/conceptpowers:init` is run (the engine CLI refuses too). Offer to run init now; do not execute
> any step below without the marker.
```

다음으로 치환한다 (10개 파일 전부 동일):

```markdown
> **Init required:** if `docs/conceptpowers/init.json` is missing, **STOP** — governance is disabled
> until `/conceptpowers:init` runs (the engine CLI refuses too). Offer to run init now.
```

- [ ] **Step 2: 치환 누락 검증**

Run: `grep -rln "Precondition — init required" skills/`
Expected: 출력 없음 (0건)

Run: `grep -rlc "Init required" skills/ | wc -l`
Expected: 10

- [ ] **Step 3: Commit**

```bash
git add skills/
git commit -m "refactor(skills): init 가드 블록을 2줄 표준 문구로 축소 (10개 스킬)"
```

---

### Task 2: reference 독트린 일원화 (sessionStart 주입 + 4개 스킬 트리밍)

**Files:**
- Modify: `src/hooks/sessionStart.ts:98` 인근 (context 배열)
- Modify: `tests/hooks/sessionStart.test.ts` (line 164 인근의 컨텍스트 검증 테스트)
- Modify: `skills/check-concept/SKILL.md`, `skills/audit/SKILL.md`, `skills/init/SKILL.md`, `skills/define-feature/SKILL.md`

**Interfaces:**
- Consumes: sessionStart의 `<CONCEPTPOWERS-ACTIVE>` context 배열 (src/hooks/sessionStart.ts 91~107행).
- Produces: 세션 컨텍스트에 reference 독트린 1줄 — 이후 스킬들은 요약 1~2줄만 유지.
- 주의: **define-concept과 check-consistency의 reference 블록은 그대로 둔다** — 그 두 곳이 reference를 실제로 읽는 canonical 위치다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/hooks/sessionStart.test.ts`의 기존 컨텍스트 검증 테스트(‘Never auto-approve’를 확인하는 164행 인근 테스트)에 다음 단언을 추가:

```typescript
expect(ctx).toContain('consumed ONLY when authoring/upgrading concepts');
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test tests/hooks/sessionStart.test.ts`
Expected: FAIL (해당 문자열이 컨텍스트에 없음)

- [ ] **Step 3: sessionStart.ts context 배열에 독트린 1줄 추가**

`src/hooks/sessionStart.ts`의 context 배열에서 `'- docs/conceptpowers/ is the baseline: ...'` 줄 바로 다음에 추가:

```typescript
    '- reference/ (docs/conceptpowers/reference/) is consumed ONLY when authoring/upgrading concepts (define-concept / check-consistency). Code verification (check-concept, audit) judges against concept rules alone — if a concept is too vague to judge with, upgrade the concept; never fall back to reference at check time.',
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm test tests/hooks/sessionStart.test.ts`
Expected: PASS

- [ ] **Step 5: check-concept의 "Judgment basis" 섹션 축약**

`skills/check-concept/SKILL.md`에서 `## Judgment basis: concepts ONLY (do not read reference/)` 제목 아래 첫 문단(“**Defined concepts are the facts.** … paper over it with reference lookups.” 8줄)을 다음 2줄로 치환 (**“Read narrow, not wide.” 문단은 유지** — 비용 규칙은 이 스킬 고유 내용):

```markdown
**Defined concepts are the facts** — never read `docs/conceptpowers/reference/` here (session
doctrine). A concept too vague to decide with is a **concept defect** → verdict ③ below.
```

- [ ] **Step 6: audit의 독트린 blockquote 축약**

`skills/audit/SKILL.md`의 `## Steps` 아래 blockquote(“**Judgment basis: concepts ONLY.** … define-concept handoff below.” 7줄)를 다음 2줄로 치환:

```markdown
> **Concepts ONLY** (session doctrine): never read `reference/` content during the audit. The only
> allowed interaction is the cheap existence check (directory listing + `paths.md` entries) in step 2.
```

- [ ] **Step 7: init의 Notes 독트린 축약**

`skills/init/SKILL.md`의 Notes에서 `- **Reference doctrine**: ...` 항목(6줄)을 다음 2줄로 치환:

```markdown
- **Reference doctrine**: `reference/` is read only when authoring/upgrading concepts
  (define-concept / check-consistency); verification skills judge against concept rules alone.
```

- [ ] **Step 8: define-feature의 독트린 blockquote 축약**

`skills/define-feature/SKILL.md`의 `## Steps` 아래 blockquote(“**No reference reads here.** …” 4줄)를 다음 1줄로 치환:

```markdown
> **No reference reads here** — a feature spec is graph wiring, not contract authoring (session doctrine).
```

- [ ] **Step 9: 빌드 + 전체 테스트**

Run: `pnpm build && pnpm test`
Expected: 빌드 성공, 전체 PASS

- [ ] **Step 10: Commit**

```bash
git add src/hooks/sessionStart.ts tests/hooks/sessionStart.test.ts skills/ dist/
git commit -m "refactor: reference 독트린을 세션 컨텍스트로 일원화, 스킬 4곳 중복 서술 축약"
```

(주의: dist/가 git 추적 대상이 아니면 `git add dist/`는 생략.)

---

### Task 3: define-concept batch 플로우 분할

**Files:**
- Create: `skills/define-concept/references/batch.md`
- Modify: `skills/define-concept/SKILL.md`

**Interfaces:**
- Produces: `references/batch.md` — batch 모드 진입 시에만 읽는 참조 문서 (progressive disclosure).

- [ ] **Step 1: references/batch.md 생성**

`skills/define-concept/SKILL.md`의 두 섹션을 **그대로 잘라** 새 파일로 옮긴다:
- `## Batch flow (전체 일괄 정의)` 전체 (Steps 1~5 포함)
- `### Simple UI concepts (메뉴·버튼도 개념이다)` 전체

새 파일 `skills/define-concept/references/batch.md`는 다음 헤더로 시작하고, 그 아래에 잘라낸 두 섹션을 원문 그대로 붙인다:

```markdown
# Define Concept — Batch flow (전체 일괄 정의)

This file is loaded on demand when the user picks batch mode in
`conceptpowers:define-concept`. The single-flow steps, quality self-check, and status rules in
SKILL.md still apply to every concept defined here.
```

- [ ] **Step 2: SKILL.md에 진입 안내로 대체**

잘라낸 자리(Mode selection 섹션 다음)에 다음을 넣는다:

```markdown
## Batch flow (전체 일괄 정의)

Batch mode → read `references/batch.md` **in this skill's directory** and follow it. It enumerates
candidates from reference docs + UI surfaces + domain logic (each menu item / button gets its own
candidate line), runs two user checkpoints (scope, review), then loops the single-flow steps 5-10
per confirmed concept. Simple UI concepts stay short — one decidable rule clears the floor.
```

- [ ] **Step 3: 검증**

Run: `wc -l skills/define-concept/SKILL.md skills/define-concept/references/batch.md`
Expected: SKILL.md ≈ 135줄 이하, batch.md ≈ 60줄. 그리고 `grep -c "Simple UI" skills/define-concept/SKILL.md` → 1 (진입 안내의 언급만).

- [ ] **Step 4: Commit**

```bash
git add skills/define-concept/
git commit -m "refactor(skills): define-concept batch 플로우를 references/batch.md로 분할"
```

---

### Task 4: render CLI가 뷰어 안내를 JSON으로 출력

**Files:**
- Modify: `src/cli.ts:86-90` (render 커맨드 action)
- Test: `tests/cli/cli.test.ts`

**Interfaces:**
- Consumes: `renderViewerToDisk(root)` (src/viewer/render.ts), CLI의 `out(s: string)` 출력 함수 (기존 액션들과 동일 패턴).
- Produces: render 출력 JSON `{ ok: true, viewer: 'docs/conceptpowers/concepts/viewer/index.html', serve: 'npm run concepts:view' }` — Task 5의 축약된 viewer handoff 문구가 이 출력을 전제한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/cli/cli.test.ts`에 추가 (기존 version-sync 테스트와 같은 패턴):

```typescript
it('render 서브커맨드가 뷰어 경로 안내를 JSON으로 출력한다', async () => {
  await runCli(['init', '--root', root, '--mode', 'incremental']);
  let captured = '';
  const code = await runCli(['render', '--root', root], (s) => (captured += s));
  expect(code).toBe(0);
  const r = JSON.parse(captured);
  expect(r.ok).toBe(true);
  expect(r.viewer).toContain('concepts/viewer/index.html');
  expect(r.serve).toContain('concepts:view');
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm test tests/cli/cli.test.ts`
Expected: FAIL (render는 현재 아무것도 출력하지 않아 `JSON.parse('')` 에러)

- [ ] **Step 3: render action에 출력 추가**

`src/cli.ts`의 render 커맨드를 다음으로 변경:

```typescript
  program
    .command('render')
    .option('--root <dir>', 'project root', process.cwd())
    .action(async (o) => {
      await renderViewerToDisk(o.root);
      out(
        JSON.stringify({
          ok: true,
          viewer: 'docs/conceptpowers/concepts/viewer/index.html',
          serve: 'npm run concepts:view',
        })
      );
    });
```

- [ ] **Step 4: 테스트 통과 + 전체 회귀 확인**

Run: `pnpm test`
Expected: 전체 PASS (render 출력을 파싱하던 기존 소비자는 없음 — 스킬은 실행만 함)

- [ ] **Step 5: 빌드 + Commit**

```bash
pnpm build
git add src/cli.ts tests/cli/cli.test.ts
git commit -m "feat(cli): render가 뷰어 경로·serve 명령을 JSON으로 출력"
```

---

### Task 5: viewer handoff 블록 축약 (5개 스킬)

**Files:**
- Modify: `skills/define-concept/SKILL.md`, `skills/auto/SKILL.md`, `skills/define-feature/SKILL.md`, `skills/update-mapping/SKILL.md`, `skills/update-baseline/SKILL.md`
- (참고: `skills/approve/SKILL.md`의 블록은 Task 6에서 병합되며 함께 사라지므로 여기서 건드리지 않는다)

**Interfaces:**
- Consumes: Task 4의 render JSON 출력(`viewer`, `serve` 필드).
- Produces: 4줄 표준 viewer handoff 문구 — Task 6의 병합 스킬도 이 문구를 그대로 쓴다.

- [ ] **Step 1: 5개 파일에서 15줄 블록을 4줄로 치환**

각 파일 끝의 `## Viewer handoff (마지막 단계 — 생략 금지)` 섹션 전체(제목 포함 ~15줄)를 다음으로 치환 (5개 파일 전부 동일):

```markdown
## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/feature/<slug>` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
```

- [ ] **Step 2: 검증**

Run: `grep -rln "hunt for the viewer" skills/`
Expected: `skills/approve/SKILL.md` 1건만 (Task 6에서 제거됨)

- [ ] **Step 3: Commit**

```bash
git add skills/
git commit -m "refactor(skills): viewer handoff 블록을 render 출력 기반 4줄로 축약 (5개 스킬)"
```

---

### Task 6: approve 스킬을 update-baseline에 통합 (11개 → 10개)

**Files:**
- Modify: `skills/update-baseline/SKILL.md` (전면 재작성 — 승인 플로우 흡수)
- Delete: `skills/approve/` 디렉터리
- Modify: `skills/init/SKILL.md:73`, `skills/check-concept/SKILL.md:61`, `skills/auto/SKILL.md:84,112`, `skills/check-consistency/SKILL.md:64`, `skills/define-concept/SKILL.md`(구 60행), `skills/audit/SKILL.md:54`, `skills/update-baseline` 내부 자기참조
- Modify: `src/concept/approve.ts:4` (주석), `src/hooks/sessionStart.ts:98` (컨텍스트 문구)
- Modify: `README.md:134,228대`, `README.ko.md:127,219대` (프로즈 + 스킬 표)
- Test: `tests/hooks/sessionStart.test.ts` (기존 테스트가 문구 변경에 걸리는지 확인)

**Interfaces:**
- Consumes: Task 1의 2줄 init 가드, Task 5의 4줄 viewer handoff 문구.
- Produces: 병합 스킬 `conceptpowers:update-baseline` — 승인(red→green)과 수정(green→pending) 두 플로우를 가짐. **CLI `approve` 서브커맨드는 그대로 유지된다** (스킬만 병합).

- [ ] **Step 1: update-baseline SKILL.md 전면 재작성**

`skills/update-baseline/SKILL.md`를 다음 내용으로 교체:

````markdown
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
     run `conceptpowers:check-consistency`, then the user re-approves via the approve flow above.
   - If the change affects existing code (@concept links), report the impact scope to the user.
3. **When modifying architecture/infra/feature spec**: review with the user whether the change should
   also change a concept (the high-level basis constrains lower-level concepts, D9).
4. Report a summary, and **remind the user an edited concept is now `pending`** until re-approved.

## Viewer handoff (마지막 단계 — 생략 금지)

After `render`, always end with a clickable viewer link (render prints the path + serve command).
Reuse the running server's URL if one is up — deep-link `#/concept/<slug>` / `#/feature/<slug>` —
otherwise start `concepts:view` in the background (fallback: `node docs/conceptpowers/concepts/viewer/serve.mjs`) and print its URL.
````

- [ ] **Step 2: approve 스킬 디렉터리 삭제**

```bash
git rm -r skills/approve
```

- [ ] **Step 3: 스킬 내 참조 치환 (7곳)**

각 파일에서 `conceptpowers:approve`를 다음과 같이 치환:

- `skills/init/SKILL.md:73`: `See the `conceptpowers:approve` skill.` → ``See the approve flow of `conceptpowers:update-baseline`.``
- `skills/check-concept/SKILL.md:61`: `(`conceptpowers:approve`)` → `` (`conceptpowers:update-baseline` approve flow)``
- `skills/auto/SKILL.md:84`: `` `conceptpowers:approve`(사용자 게이트 — auto가 스스로 승인하지 않는다)`` → `` `conceptpowers:update-baseline` 승인 플로우(사용자 게이트 — auto가 스스로 승인하지 않는다)``
- `skills/auto/SKILL.md:112`: `승인은 사용자 요청 + approve 스킬` → `승인은 사용자 요청 + update-baseline 승인 플로우`
- `skills/check-consistency/SKILL.md:64`: `or `conceptpowers:approve` on explicit user request` → `or the `conceptpowers:update-baseline` approve flow on explicit user request`
- `skills/define-concept/SKILL.md` (구 60행, "approved later via"): `via `conceptpowers:approve`` → `via the `conceptpowers:update-baseline` approve flow`
- `skills/audit/SKILL.md:54`: `(see `conceptpowers:approve`)` → `(see the `conceptpowers:update-baseline` approve flow)`

- [ ] **Step 4: src 참조 치환 (2곳)**

`src/concept/approve.ts:4`:

```typescript
// 정책(사용자 명시 요청 시에만 호출)은 conceptpowers:update-baseline 스킬(approve flow)이 강제한다.
```

`src/hooks/sessionStart.ts:98`의 문장 끝부분 `(conceptpowers:approve)` → `(the conceptpowers:update-baseline approve flow)`:

```typescript
    '- docs/conceptpowers/ is the baseline: never edit it on your own judgment. You MAY edit a concept when the user explicitly approves the exact change (conceptpowers:update-baseline / edit-concept) — but editing a green concept drops it to pending, and it does not govern code again until the user manually approves it back to green (the conceptpowers:update-baseline approve flow). Never keep a hand-edited concept green.',
```

- [ ] **Step 5: README 두 곳 갱신**

`README.md` / `README.ko.md`:
- 스킬 표에서 `conceptpowers:approve` 행을 삭제하고, `conceptpowers:update-baseline` 행의 설명에 승인 기능을 합친다.
  - README.md의 update-baseline 행 설명을: `The requested baseline edit (demotes an edited 🟢 green concept to 🟡 pending, reason recorded via `note-change`), and — on explicit user request — the approve flow that promotes a reviewed 🔴 red concept to 🟢 green after a consistency check. The agent never edits or approves on its own.`
  - README.ko.md의 update-baseline 행 설명을: `요청된 baseline 수정(수정된 🟢 green 개념은 🟡 pending으로 강등, 사유는 `note-change`로 기록). 사용자가 명시적으로 요청하면 승인 플로우로 검토된 🔴 red 개념을 일관성 검사 뒤 🟢 green으로 승급한다. 에이전트가 임의로 수정·승인하지 않는다.`
- 프로즈(README.md:134, README.ko.md:127)의 `conceptpowers:approve` → `the approve flow of conceptpowers:update-baseline` / `conceptpowers:update-baseline의 승인 플로우` 로 치환.
- 스킬 개수를 언급하는 문구가 있으면 11→10으로 수정 (`grep -n "11" README.md README.ko.md`로 확인).

- [ ] **Step 6: 잔여 참조 0건 검증 + 빌드 + 테스트**

Run: `grep -rn "conceptpowers:approve" skills/ src/ README.md README.ko.md CLAUDE.md`
Expected: 출력 없음 (docs/specs·docs/plans의 과거 기록은 제외 — 수정하지 않는다)

Run: `pnpm build && pnpm test`
Expected: 전체 PASS (sessionStart.test.ts가 구 문구를 단언하면 새 문구로 테스트 갱신)

- [ ] **Step 7: Commit**

```bash
git add -A skills/ src/ tests/ README.md README.ko.md
git commit -m "refactor: approve 스킬을 update-baseline에 통합 (스킬 11→10, CLI approve는 유지)"
```

---

### Task 7: 최종 검증 + 결과 보고

**Files:**
- 없음 (검증만)

- [ ] **Step 1: 전체 빌드·테스트·라인 수 확인**

Run: `pnpm build && pnpm test && wc -l skills/*/SKILL.md skills/define-concept/references/batch.md | tail -1`
Expected: 빌드·테스트 PASS, SKILL.md 합계 ≈ 570줄 이하 (batch.md 제외 기준)

- [ ] **Step 2: 스킬 개수·보일러플레이트 잔존 확인**

Run: `ls skills/ | wc -l` → Expected: 10
Run: `grep -rln "Precondition — init required\|hunt for the viewer" skills/` → Expected: 0건

- [ ] **Step 3: 사용자 보고**

before/after 라인 수, 스킬 목록, src 변경점(sessionStart 독트린 1줄, render JSON 출력, 참조 문구 2곳)을 요약 보고. 릴리스(`pnpm release`)와 push는 사용자 결정에 맡긴다.
