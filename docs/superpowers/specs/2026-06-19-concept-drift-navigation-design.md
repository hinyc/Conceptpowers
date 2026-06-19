# Conceptpowers 내비게이션 모드 — 개념 drift 감지 + why 전파

- 날짜: 2026-06-19
- 상태: 승인됨 (구현 대기)

## 배경 / 철학

ConceptPowers의 목적은 **"강제(enforcement)"가 아니라 "강제된 내비게이션"**이다.

> 자동차 내비게이션이 "왼쪽으로 가세요"라고 권유만 하는 게 아니라 핸들을 왼쪽으로
> *강제로 꺾는다*. 단, 운전자가 "왼쪽 아닌데?" 하고 틀면 그건 허용한다(override).

개념(concept)은 프로젝트 진행 중 얼마든지 바뀐다. 개념이 바뀌면:
1. 그 변경이 길잡이가 되어 **관련 코드가 바뀐 개념에 맞게 일관되게 수정**되도록 유도한다.
2. 개발자가 **"왜 이 코드가 바뀌었는가 = 개념이 바뀌어서(이유 Y)"**를 알게 한다.
3. 커밋은 막되(`ask`), 그래도 강행하면 막지 않는다(Warning-Gate + override).

### 현재 구현의 공백 (이 설계가 메우는 것)

- 개념 정의가 *바뀌었다*는 사실 자체를 감지할 수단이 없다(버전/해시 부재).
- drift(개념은 바뀌었는데 코드가 안 따라온 상태) 탐지 로직이 없다.
- "왜 바뀌었는지(why)"를 기록·전파하는 경로가 없다.
- 커밋 게이트의 미정의 태그 처리는 `deny`(탈출구 없음)라 override 철학과 충돌한다.

## 핵심 모델 — 계약 해시 (contract hash)

개념 JSON에서 **"코드가 따라야 할 계약" 필드만** 골라 결정론적 해시를 산출한다.

- 포함(계약): `description.definition`, `description.components`, `actions.allow`,
  `actions.restrict`, `actions.interaction`, `principle.immutableRules`,
  `principle.lifecycle`, `purpose.reason`
- 제외(비계약/표현): `slug`, `group`, `number`, `status`, `title`, `eyebrow`,
  `description.analogy`, `description.example`, `purpose.benefits/vision/painPoints`,
  `principle.tradeoffs`, `relations`, `codeLinks`
- 산출: 계약 부분집합 → 키 정렬된 정규 JSON → sha256 → 앞 12자 hex
- **요청 시 계산, baseline에 저장하지 않음** → 개념 정의(baseline)를 코드가 건드리지 않음

근거: 사소한 표현 편집(오타, analogy 수정)이 drift로 오인되지 않게 하기 위함.

## 상태 파일 (플러그인 관리 산출물, baseline 아님)

뷰어와 동일하게 플러그인이 관리하는 파생 상태. 위치:
`docs/conceptpowers/concepts/.alignment/`

- `alignment.lock.json` → `{ [slug]: { hash: string, at: string } }`
  - 마지막으로 "정렬됨"으로 인정된 계약 해시.
- `history.json` → `Array<{ slug, hash, prevHash, reason, at, ignored?: boolean }>`
  - append-only. 개념이 왜 바뀌었는지(reason) 기록 + override 시 `ignored: true`.

두 파일 모두 zod 스키마로 검증, 불변(immutable) 쓰기.

## Drift 감지 — `computeDrift(root): DriftItem[]`

1. 개념 목록 로드 → 각자의 현재 계약 해시 계산.
2. `alignment.lock.json` 로드.
3. 개념별 판정:
   - lock에 항목 없음(신규) → **drift 아님** (첫 커밋 시 lock 등록).
   - `lock[slug].hash === current` → 정렬됨.
   - `lock[slug].hash !== current` → **drifted**.
4. drifted 개념마다 관련 코드 경로 수집:
   - `@concept:slug` 태그를 포함한 파일 (기존 `scanTags`)
   - 그 slug를 `concepts[]`에 가진 feature의 `codePaths`
5. 반환: `{ slug, currentHash, lockedHash, reason(최신 history), relatedPaths[] }`

## 세 군데 접점

### PreToolUse (커밋 게이트, 수정)

`git commit` 감지 시:
- 기존 audit의 **미정의 태그**: `deny` → **`ask`로 완화** ("정의 안 된 개념 태그. 그래도 커밋?").
- `computeDrift` 실행. drifted 개념의 `relatedPaths`가 스테이지 파일에 **모두 포함되지 않으면**
  → `ask` ("개념 X가 바뀜(이유 Y). 코드 A·B가 안 따라옴. 그래도 커밋?").
- drifted 개념의 관련 코드가 스테이지에 모두 포함 → 정렬로 간주, 차단 없음.
- 미승인(red) 개념 `ask`(기존) 유지.
- **best-effort**: 상태 파일 오류/미초기화 시 절대 git을 막지 않음(allow/null).

### PostToolUse (신규) — lock 재조정 엔진

`git commit` **성공 후** 실행 (Bash 매처). 방금 커밋된 파일 목록 획득
(`git diff-tree --no-commit-id --name-only -r HEAD`).
- 현재 drifted 인 개념마다:
  - 관련 코드가 이번 커밋에 포함됨 → "정렬됨" → `lock[slug] = current` (history 추가 없음).
  - 관련 코드가 포함 안 됨(=override 강행) → `lock[slug] = current` + history에
    `{ ..., ignored: true }` append (`[Drift Ignored]`).
- 신규 개념(lock 없음) → `lock[slug] = current` 등록.
- best-effort: 실패해도 조용히 종료(이미 커밋은 됨).

### SessionStart (수정)

`computeDrift` 결과를 `<CONCEPT-DRIFT>` 블록으로 주입:
"개념 X가 'Y' 이유로 바뀜 — 관련 코드 N개 검토 필요: [경로...]". drift 없으면 블록 생략.

## Why 포착 — `cp note-change <slug> --reason "..."`

개념 정의를 수정하는 스킬(`define-concept`, `update-baseline`)이 편집 직후 이 CLI를 호출.
→ 해당 개념의 현재 계약 해시 + 이유를 `history.json`에 append (prevHash = 직전 history hash).
이유는 SessionStart·커밋게이트·`[Drift Ignored]`에 동일하게 전파된다.

## CLI 추가

- `cp drift` — 현재 drift 리포트 출력(JSON/텍스트).
- `cp note-change <slug> --reason "..."` — 변경 이유 history 기록.
- `cp status` — drift 개수 포함하도록 확장.

## 구현 단위

신규:
- `src/drift/hash.ts` — `contractHash(concept): string`
- `src/drift/lock.ts` — lock 읽기/쓰기 (zod, 불변)
- `src/drift/history.ts` — history 읽기/append (zod, 불변)
- `src/drift/detect.ts` — `computeDrift(root)`
- `src/drift/reconcile.ts` — `reconcileAfterCommit(root, committedFiles)`
- `src/hooks/postToolUse.ts` — PostToolUse 엔트리

수정:
- `src/hooks/preToolUse.ts` — deny→ask, drift 게이트 추가
- `src/hooks/sessionStart.ts` — drift 섹션 주입
- `src/cli.ts` — `drift`, `note-change` 추가, `status` 확장
- `src/paths.ts` — `.alignment` 경로 추가
- `hooks/hooks.json` — PostToolUse(Bash) → `dist/hooks/postToolUse.js`
- `skills/define-concept/SKILL.md`, `skills/update-baseline/SKILL.md` — note-change 호출 단계

## 오류 처리 / 불변성 / 검증

- 모든 상태 쓰기는 새 객체 생성(불변).
- lock·history는 zod 스키마 검증; 깨진 파일은 빈 상태로 폴백 + 경고.
- 모든 훅은 best-effort — 플러그인 오류가 사용자의 git을 막지 않는다.

## 테스트 (TDD, 80%+)

단위:
- `contractHash` 결정성(키 순서 무관) + 민감도(계약 필드 변경 시 변함, 표현 필드 변경 시 불변)
- lock 읽기/쓰기, history append(prevHash 연결)
- `computeDrift`: lock 없음→무drift, 일치→무drift, 불일치→drift+relatedPaths
- `reconcileAfterCommit`: 정렬(관련코드 포함) vs ignored(미포함) 분기, 신규 등록

통합:
- preToolUse: drift→ask, 미정의 태그→ask, 정렬/미초기화→allow
- postToolUse: 커밋 후 lock 재조정 E2E
- sessionStart: drift 주입 / drift 없을 때 블록 생략

엣지: 개념 삭제로 lock에 stale 항목, 관련 코드 0개(개념만 변경), 미초기화 프로젝트.

## 범위 제외 (YAGNI)

- 코드 주석 인라인 버전(`@concept:slug#hash`) 자동 갱신
- 뷰어 drift 배지 (2차 과제)
- 명시적 `cp sync` 명령 (자동 재조정으로 충분)
