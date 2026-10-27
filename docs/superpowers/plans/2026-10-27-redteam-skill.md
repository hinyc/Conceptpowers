# redteam 스킬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개념을 기준으로 다섯 축(개념 준수·레드팀·중복·과잉/목적 이탈·부작용)을 여러 에이전트로 점검하고, 반박을 견딘 지적만 보고해 승인된 것만 고치는 `conceptpowers:redteam` 스킬을 추가한다.

**Architecture:** 엔진(`src/`) 변경 없이 스킬 문서만 더한다. `skills/redteam/SKILL.md`가 흐름(0~6단계)과 모드를 들고, 긴 절차(축별 리뷰어·반박 프롬프트, 모드별 대상 수집)는 `references/`로 내린다. 개념 준수·최신 확인·태그 정리는 기존 `review`·`auto`·`scan` 절차를 가리켜 재사용한다.

**Tech Stack:** Markdown 스킬, vitest(문서 검사 테스트), Conceptpowers CLI(`map`, `render`, `audit`).

**Spec:** `docs/superpowers/specs/2026-10-27-redteam-skill-design.md` (승인됨)

## Global Constraints

- 스킬 이름 `redteam`, 폴더 `skills/redteam/`. 머리말은 `name`/`description` 두 항목뿐이다.
- 설명문은 한 줄, 1024자 이하, `": "`(쌍점 뒤 공백) 금지. 트리거 문구로 "레드팀", "redteam", "비판적 검토", "중복 정리", "과잉 구현 점검"을 담는다.
- `references/*.md`는 `---` 머리말로 시작하지 않는다.
- 스킬이 가리키는 `conceptpowers:<skill>`, `references/<file>.md`, `node "<cli>" <cmd>`는 모두 실재해야 한다 (`tests/compat/skillFrontmatter.test.ts`가 검사).
- redteam은 `reference/`를 읽지 않고, 개념을 고치지 않으며, 승인 없이 코드를 고치지 않고, 커밋하지 않는다.
- 개념 문서는 코드 용어 없이 쉬운 한국어로 쓴다.
- 커밋은 사용자 확인 뒤에만 한다. `gh auth switch --user hinyc`로 바꾼 뒤 커밋하고, 끝나면 `inyeol-hong`으로 되돌린다. `git add`와 `git commit`은 반드시 **따로** 실행한다.
- 작업 트리에 다른 세션이 남긴 `.alignment/` 변경이 있으면 이번 커밋에 섞지 않는다 (스테이징할 때 경로를 지정한다).

## Review Focus

1. **모드를 말하지 않고 호출** → 어떤 모드인지 묻는다. 변경분이 있으면 ①을 권한다. (Task 3 테스트: SKILL.md에 "모드를 말하지 않" 안내가 있다)
2. **main 위에서 커밋 안 된 변경도 태그 이후 커밋도 없음** → 변경분 ①의 대상이 비었다고 알리고 ②/③을 제안한다. 빈 대상으로 리뷰어를 띄우지 않는다. (Task 3 테스트: `references/modes.md`에 "대상이 비" 처리가 있다)
3. **릴리스 태그가 하나도 없는 저장소의 main** → 기준점을 정할 수 없으니 범위를 묻는다. (Task 3 테스트: modes.md에 "태그가 없" 처리가 있다)
4. **대상 코드가 전부 `@concept:none`/개념 없음 영역** → 개념 준수 축은 "해당 없음"으로 끝나고, 과잉 축은 작업 목적만을 기준으로 삼는다. 이 코드를 개념이 없다는 이유로 과잉으로 몰지 않는다. (Task 3 테스트: axes.md에 none 기준이 있다)
5. **서브에이전트 도구가 없는 환경** → 한 에이전트가 다섯 축을 차례로 보고, 반박은 따로 마지막에 한다. (Task 3 테스트: SKILL.md에 순차 대체 절차가 있다)

---

### Task 1: 이 스킬을 다스릴 개념 정의

**Files:**
- Create: `docs/conceptpowers/concepts/data/governance/redteam-review.json` (`update-concepts` 절차로만 만든다. 직접 파일을 쓰지 않는다)

**Interfaces:**
- Produces: 개념 slug `redteam-review` (green). 이후 Task의 테스트 파일 첫머리 `// @concept:redteam-review`가 이 slug를 쓴다. 이 개념의 `codeLinks`에는 `skills/redteam/SKILL.md`와 `skills/redteam/references/axes.md`, `skills/redteam/references/modes.md`를 넣는다. 이 파일들은 Task 3에서 만드는데, 그 전에 감사를 돌리면 `missing-file`이 나오는 게 정상이다.

- [ ] **Step 1: `conceptpowers:update-concepts`를 계기 B(새 개념 정의, `references/new-concept.md`)로 실행한다.** 아래 초안을 사용자에게 보이고 확인받는다. 문구는 사용자가 고칠 수 있다.
  - 제목: "비판적 점검(레드팀)", 그룹 `governance`, 분류 `behavior`
  - 허용
    - 대상 코드에 걸린 개념과 이번 작업의 목적에 비추어, 일부러 반대 입장에서 약점·중복·과잉·부작용을 지적하는 것
    - 사용자가 실행할 때 고르면 일반 품질(보안·성능·읽기 쉬움)까지 지적을 넓히는 것
    - 사용자가 고른 지적에 한해 코드를 고치는 것
  - 제한
    - 반박 검증을 견디지 못한 지적을 보고하는 것
    - 사용자 승인 없이 코드를 고치는 것
    - 개념 없음으로 밝힌 코드를 "어느 개념도 요구하지 않는다"는 이유로 과잉으로 모는 것
    - 참고자료를 읽는 것, 개념을 고치는 것, 커밋하는 것
  - 불변
    - 점검 전에 개념이 최신인지 확인하고, 대상에 닿는 낡음이 있으면 사용자에게 묻기 전에는 진행하지 않는다
    - 점검의 목적과 지적 범위(목적에 묶기 / 일반 품질까지)를 매번 사용자에게 확인받는다
    - 고친 뒤 그 수정이 새 과잉·목적 이탈·중복을 만들지 않았는지 다시 확인한다
  - 관련 개념: `concept-code-binding`, `human-owns-contract`, `skill-surface`
- [ ] **Step 2: 정합성 검사(`references/consistency.md`)를 돌린다.** 기존 green 개념과 충돌하면 **멈추고 사용자에게 묻는다.** 기존 개념 수정은 이 계획에 포함하지 않는다.
- [ ] **Step 3: 사용자 확인 아래 green으로 정착시킨다(`references/settle.md`).**
  확인: `docs/conceptpowers/concepts/data/governance/redteam-review.json`의 `"status": "green"`
- [ ] **Step 4: 사용자 확인 뒤 커밋한다.** 개념 JSON과 정합성 증빙(`.alignment/attest.json`)을 이번 개념에 해당하는 것만 스테이징한다(위 Global Constraints의 계정 전환과 분리 실행 규칙). 코드가 아직 없으니 게이트가 코드 없음 기록을 요구하면, 사유("스킬 문서는 다음 커밋에서 추가")를 사용자에게 밝히고 확인받은 뒤 기록한다.
  메시지: `feat: redteam 스킬을 다스릴 비판적 점검 개념 정의`

### Task 2: 스킬 문서 검사 테스트 (RED)

**Files:**
- Create: `tests/compat/redteamSkill.test.ts`

**Interfaces:**
- Consumes: 개념 slug `redteam-review` (Task 1)
- Produces: Task 3가 통과시켜야 할 단언 목록 (아래)

- [ ] **Step 1: 실패하는 테스트를 쓴다.** 첫머리 주석 블록에 `// @concept:redteam-review`를 두고, 시나리오마다 어느 규칙을 확인하는지 주석으로 밝힌다(기존 `skillFrontmatter.test.ts` 형식). 파일을 읽어 문자열 포함 여부로 단언한다.
  - `skills/redteam/SKILL.md`가 있다
  - 설명문에 `레드팀`과 `redteam`이 있다
  - SKILL.md에 세 모드 이름 `변경분`, `개념 하나`, `전체`가 있다
  - SKILL.md 0단계가 `conceptpowers:auto`의 Stage 0을 가리킨다 (`Stage 0` 포함)
  - SKILL.md에 범위 질문이 있다: `일반 품질`과 `항상 묻는다`
  - SKILL.md에 `reference/`를 읽지 않는다는 금지가 있다 (`## Prohibited` 절 안에 `reference/`)
  - SKILL.md에 `conceptpowers:review`, `conceptpowers:scan`, `conceptpowers:update-concepts`가 모두 나온다 (넘김 경로)
  - SKILL.md에 모드 미지정 안내 `모드를 말하지 않`이 있다 (Review Focus 1)
  - SKILL.md에 순차 대체 `서브에이전트` 절차가 있다 (Review Focus 5)
  - `references/modes.md`에 `대상이 비`와 `태그가 없`이 있다 (Review Focus 2, 3)
  - `references/axes.md`에 다섯 축 이름이 모두 있고, `@concept:none` 기준 문구가 있다 (Review Focus 4)
  - `references/axes.md`에 반박 상한 `10`과 `미검증`이 있다
- [ ] **Step 2: 실행해 실패를 확인한다.**
  Run: `pnpm vitest run tests/compat/redteamSkill.test.ts`
  Expected: FAIL (`skills/redteam/SKILL.md` 없음)

### Task 3: redteam 스킬 작성 (GREEN)

**Files:**
- Create: `skills/redteam/SKILL.md` (200줄 이내 목표)
- Create: `skills/redteam/references/axes.md` — 축별 리뷰어 지시, 코드 분류표, 반박 검증 규칙(높음은 하나씩, 중간·낮음은 축별로 묶음, 상한 10, 넘치면 `미검증`), 결과 형식(파일·위치 / 축 / 근거 / 심각도 높음·중간·낮음 / 제안 수정)
- Create: `skills/redteam/references/modes.md` — 모드별 대상과 작업 목적 수집. ① 기준점: 브랜치면 `git merge-base main HEAD`, main이면 `git describe --tags --abbrev=0`, 태그가 없으면 범위를 묻는다, 대상이 비면 알리고 ②/③을 제안한다. ②는 review의 개념→파일 찾기를 가리킨다. ③은 규모를 알리고 표본 검사 여부를 밝힌다.

**Interfaces:**
- Consumes: Task 2의 단언 목록; 기존 `skills/review/SKILL.md`(판정 절차), `skills/auto/SKILL.md` Stage 0, `skills/scan/SKILL.md`
- Produces: `conceptpowers:redteam` 스킬 (Task 4가 가리킨다)

- [ ] **Step 1: SKILL.md를 쓴다.** 머리말 아래 순서:
  1. Init required 안내 (다른 스킬과 같은 문구)
  2. 이 스킬이 하는 일과 하지 않는 일 (review·scan·update-concepts와의 경계 표)
  3. 모드 표 (`references/modes.md` 가리킴) + 모드를 말하지 않았을 때 묻기
  4. 0~6단계. 내용은 설계 문서 4.1 그대로이고, 5절의 결정(0단계 멈춤 범위, 반박 묶음, 기존 개념 충돌 시 멈춤, 6단계의 테스트 먼저·커밋 안 함·세 축 재확인)을 넣는다. 1단계에서 목적 확인과 함께 레드팀 범위를 **항상 묻는다**.
  5. 서브에이전트가 없을 때의 순차 대체 절차
  6. Report 형식
  7. Prohibited (reference/ 읽기, 개념 수정, 승인 없는 수정, 커밋, none 코드를 개념 부재로 과잉 판정)
- [ ] **Step 2: `references/axes.md`, `references/modes.md`를 쓴다** (위 Files 설명대로. 첫 줄은 `# Redteam — …` 제목이고 머리말은 두지 않는다).
- [ ] **Step 3: 테스트를 실행해 통과를 확인한다.**
  Run: `pnpm vitest run tests/compat/redteamSkill.test.ts tests/compat/skillFrontmatter.test.ts tests/compat/superpowers.test.ts`
  Expected: 모두 PASS
- [ ] **Step 4: 매핑을 갱신하고 감사한다.**
  Run: `node dist/cli.js map --root . tests/compat/redteamSkill.test.ts` 후 `node dist/cli.js audit --root .`
  Expected: `unknownTags` 비어 있음, `redteam-review` codeLinks의 `missing-file` 없음
- [ ] **Step 5: 사용자 확인 뒤 커밋한다** (스킬 폴더 + 테스트 + 매핑 캐시, add와 commit 분리).
  메시지: `feat: 개념 기준 비판적 점검 스킬 redteam 추가`

### Task 4: auto에서 redteam으로 잇기 + 문서 반영

> **실행 결과 (2026-10-27):** README 반영만 커밋했다. auto 연결은 커밋 게이트 차단(main에서 바뀐
> `human-owns-contract`의 테스트 검토 누락) 뒤 사용자 결정으로 **보류** — 설계 문서 5절 참고.

**Files:**
- Modify: `skills/auto/SKILL.md` — Stage 4(Review) 끝에 한 항목: review가 끝나면 "레드팀까지 할까요? (`conceptpowers:redteam`)"를 선택지로 묻는다. 강제하지 않고, 건너뛰면 최종 리포트에 남긴다.
- Modify: `README.md`, `README.ko.md` — 워크플로 목록(review·scan 설명 근처)에 redteam 한 줄을 넣는다. 다른 문단은 고치지 않는다.
- Test: `tests/compat/redteamSkill.test.ts`에 단언 추가

**Interfaces:**
- Consumes: `conceptpowers:redteam` (Task 3)

- [ ] **Step 1: 실패하는 단언을 더한다.** `skills/auto/SKILL.md`에 `conceptpowers:redteam`이 있다. `README.md`와 `README.ko.md`에 `/conceptpowers:redteam`이 있다.
- [ ] **Step 2: 실행해 실패를 확인한다.**
  Run: `pnpm vitest run tests/compat/redteamSkill.test.ts`
  Expected: FAIL (auto/README에 redteam 없음)
- [ ] **Step 3: 고치기 전에 `conceptpowers:review` ①(변경 전 검사)를 `skills/auto/SKILL.md`에 돌린다.** 걸린 개념은 `skill-surface`와 `human-owns-contract`다. 위반이면 멈추고 사용자에게 묻는다.
- [ ] **Step 4: 위 Files대로 고친다.**
- [ ] **Step 5: 전체 검증한다.**
  Run: `pnpm build && pnpm test && pnpm typecheck && pnpm format:check`
  Expected: 모두 통과 (커버리지 80% 이상 유지)
- [ ] **Step 6: 렌더하고 사용자 확인 뒤 커밋한다.**
  Run: `node dist/cli.js render --root .`
  메시지: `feat: auto 마지막 단계에서 redteam 점검을 선택지로 안내`

### Task 5: 마무리 점검

- [ ] **Step 1: 새로 만든 스킬로 이 작업 자체를 점검한다.** `/conceptpowers:redteam`을 모드 ①(변경분)로 실행한다. 대상은 이번 작업의 커밋들이다. 지적은 보고만 하고, 고칠지는 사용자가 정한다.
- [ ] **Step 2: 설계 문서 상태를 "구현됨"으로 바꾸고, 사용자 확인 뒤 설계·계획 문서를 함께 커밋한다.**
  메시지: `docs: redteam 스킬 설계와 구현 계획`
