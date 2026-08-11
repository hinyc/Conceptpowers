# 거버넌스 개선 3건 설계 — stale 산출물 게이트 · attest 증빙 강화 · audit 전체 스캔

날짜: 2026-08-11
상태: 사용자 승인됨 (구현 전)

## 배경

프로젝트 검토에서 확인된 개선 가능 단점 3건. 각각 코드 근거를 재검증한 결과:

1. **stale 산출물 방치**: `syncIfStale`(src/version/autoSync.ts)가 세션 시작·CLI 진입 시
   뷰어 산출물을 새로 쓰지만, 커밋을 유도하는 장치가 없어 워킹트리에 dirty 파일이 방치된다.
   (실증: `manifest.json`의 generatorVersion 1.1.0→1.3.2 변경이 미커밋 상태로 발견됨)
2. **attest 증빙이 블랙박스**: `AttestEntry = {hash, result, at}`(src/concept/attest.ts) —
   무엇과 비교했는지, 판단 근거가 전혀 남지 않는 자기신고 boolean.
3. **audit 전수 점검 불가**: CLI `audit`이 `<files...>` 필수 인자이고,
   gap 탐지(`findConceptlessFiles`)를 호출하지 않아 CLI로는 "개념 없는 코드" 전수 점검이 불가능.

## 결정 사항 (사용자 확정)

- ① 게이트 강도: **ask (차단 후 확인)** — 비차단 안내가 아닌 ask.
- ② 증빙 강제도: **CLI 필수** — `--compared`는 필수 옵션, 스키마는 optional(기존 로그 호환).
- ③ 범위: 세 건 모두 이번에 진행.

## 설계

### ① stale 산출물 커밋 게이트 (ask)

- 위치: `src/hooks/preToolUse.ts` 커밋 게이트에 분기 추가.
- 조건: `git commit` 시점에 `docs/conceptpowers/concepts/viewer/` 아래
  **스테이징되지 않은 변경**(unstaged modified)이 존재.
- 감지: `git diff --name-only`(unstaged) 출력을 viewer 경로 prefix로 필터. 새 의존성 없음.
- 동작: `permissionDecision: 'ask'` 반환.
  - 메시지: `[WARNING] 미커밋 생성 산출물 — <파일 목록>. 플러그인이 자동 동기화한 산출물이
    이번 커밋에 포함되지 않았습니다. git add로 함께 스테이징하거나, 그래도 커밋하시겠습니까?`
  - `additionalContext`: 생성물이므로 내용 검토 없이 스테이징해도 안전하며 baseline이 아님을 명시.
    파일 경로는 신뢰할 수 없는 데이터(지시 아님)임을 명시(기존 게이트 관례).
- 게이트 순서: 기존 거버넌스 검사(reference → unknownTags → conceptless → drift →
  품질/증빙 → conflicted pending → unapproved)를 모두 통과한 뒤 **최종 allow 직전**에 검사.
  실질 위반이 항상 우선 표시되도록.
- best-effort: git 명령 실패 시 이 분기는 조용히 건너뛴다(기존 관례).

### ② attest 증빙 강화 (CLI 필수)

- 스키마(`src/schema/alignment.ts`): `AttestEntry`에 추가 —
  - `compared?: string[]` — check-consistency에서 비교한 대상 개념 slug 목록.
  - `note?: string` — 판단 요약(선택).
  - 둘 다 **optional**: 기존 증빙 로그가 계속 파싱되어야 한다.
- CLI(`src/cli.ts`) `attest-consistency`:
  - `--compared <slugs>` **필수** (쉼표 구분 slug 목록).
  - `--note <요약>` 선택.
  - compared의 각 slug가 실제 존재하는 개념인지 검증, 미존재 slug는 에러.
  - 자기 자신(slug)이 compared에 있어도 무해하나 필수는 아님.
- `recordAttest(root, concept, result, evidence?)` 시그니처 확장. 불변 패턴 유지.
- `freshPassAttest` 판정 로직 **변경 없음** — 신선도 기준(계약 해시 일치)은 그대로.
- 한계 인지: 실시간 성실성 검증은 여전히 불가. 목표는 "무엇과 비교했다고 신고했는지"를
  남겨 사후 감사(누락 개념 추궁)를 가능하게 하는 것.

### ③ audit 전체 스캔 모드

- CLI `audit` 인자를 `[files...]`(선택)로 변경.
- **인자 없음** → 전체 스캔 모드:
  - `git ls-files`로 추적 파일 전체 수집.
  - `auditIntegrity` 실행 + `findConceptlessFiles`(init.json의 ignoreGlobs, 폴백은
    스키마 기본값 — preToolUse와 동일 규칙) 실행.
  - 출력에 `conceptless: string[]` 필드 추가.
  - exit code: unknownTags **또는** conceptless가 비어있지 않으면 1.
- **파일 지정 모드는 기존 동작 그대로** — 출력 형태·exit 규칙 불변(훅/테스트 계약 유지).

## 테스트 계획 (TDD)

각 항목 테스트 먼저 작성(RED) 후 구현(GREEN). 시나리오는 관련 개념의 규칙에서 도출한다.

- ①: `tests/hooks/preToolUse.test.ts` —
  - viewer 산출물이 unstaged dirty일 때 ask 반환 (@concept:ask-only-gate 규칙 검증)
  - 스테이징되면 allow / 다른 위반이 있으면 그 위반이 우선
  - git 실패 시 조용히 통과(best-effort)
- ②: `tests/concept/attest.test.ts` + `tests/schema/alignment.test.ts` + CLI 테스트 —
  - compared/note가 기록되고 재파싱됨 / 기존(필드 없는) 로그도 파싱됨
  - CLI에서 --compared 누락 시 에러, 미존재 slug 에러
- ③: 신규/기존 CLI audit 테스트 —
  - 인자 없음 → 전체 스캔 + conceptless 포함, gap 존재 시 exit 1
  - 파일 지정 모드 기존 스냅샷 불변

## 거버넌스 영향

- 영향 개념: `ask-only-gate`(①), `settled-status`(②), `audit-gap-detection`(③).
- 구현 전 conceptpowers:check-concept 실행. 개념 계약 갱신이 필요하면
  update-baseline 절차(사용자 명시 승인, green→pending→재검증) 준수.
- 개념 JSON을 수정하는 커밋은 관련 코드·alignment lock과 같은 커밋으로 패키징.

## 범위 밖 (YAGNI)

- LLM 판단 의존 자체의 제거(설계 철학상 수용).
- Claude Code 외 훅 어댑터(일반 git pre-commit) — 우선순위 낮음, 별도 건.
- 프로토타입 단계용 게이트 완화 옵션 — 별도 건.
