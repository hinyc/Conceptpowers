# 개념 기반 테스트 시나리오 옵션 (`conceptDrivenTests`) 설계

날짜: 2026-07-29
상태: 사용자 승인됨

## 목표

Conceptpowers가 init된 프로젝트에서 **테스트 코드를 작성·수정할 때, 대상 코드의 개념을
먼저 확인하고 개념 규칙(allow / restrict / immutableRules)에서 테스트 시나리오를
도출하도록** 에이전트를 유도한다. 이 동작은 init.json의 boolean 설정으로 켜고 끌 수 있다.

## 결정 사항 (사용자 확정)

- **강제 방식**: 프롬프트 규칙 주입 (세션 시작 훅 + check-concept 스킬 문구).
  훅 기반 파일 검사, 전용 스킬 신설, 테스트 파일 태그 강제는 하지 않는다.
- **기본값**: `true` (기본 켜짐). 기존 프로젝트의 init.json에 필드가 없어도 zod 기본값으로
  켜진다. 끄려면 init.json에서 `"conceptDrivenTests": false`로 명시한다.

## 변경 사항

### 1. 스키마 — `src/schema/initConfig.ts`

`InitConfigSchema`에 필드 추가:

```typescript
// 테스트 코드도 개념의 지배를 받는다 — 켜져 있으면(기본) 세션 시작 규칙에
// "테스트 작성 전 대상 코드의 개념을 찾아 규칙 기반 시나리오를 도출하라"가 주입된다.
conceptDrivenTests: z.boolean().default(true),
```

### 2. 세션 시작 규칙 주입 — `src/hooks/sessionStart.ts`

`<CONCEPTPOWERS-ACTIVE>` Rules 배열에 조건부 한 줄 추가.
조건: `config?.conceptDrivenTests !== false` (필드 없음 = 기본 켜짐과 동일).

주입 문구 (영문 — 기존 Rules 줄과 동일한 언어/톤):

```
- Test code is governed too: before writing or modifying tests, locate the concept(s) for the code under test (@concept tag → manifest index) and derive the test scenarios from their actions.allow / actions.restrict / principle.immutableRules — each scenario should state which rule it verifies. If no concept exists, define it first (conceptpowers:define-concept).
```

false면 이 줄은 주입되지 않는다 (기존 출력과 동일).

### 3. check-concept 스킬 보강 — `skills/check-concept/SKILL.md`

"Steps" 아래(5단계 뒤)에 짧은 섹션 추가:

```markdown
## Test scenarios from concepts (conceptDrivenTests)

When the purpose of the change is writing or modifying **tests** and `init.json` has
`conceptDrivenTests` enabled (missing field = enabled; only an explicit `false` disables it):

- Do not stop at the violation verdict — turn the located concept's rules into a scenario
  checklist: each entry in `actions.allow` / `actions.restrict` / `principle.immutableRules`
  maps to at least one test scenario where feasible, and each scenario names the rule it
  verifies.
- Concept lookup reuses step 1 as-is (tag → index → targeted read) — no extra scanning.
- If `conceptDrivenTests` is explicitly `false`, skip this section entirely.
```

### 4. scaffold — 코드 수정 없음

`src/init/scaffold.ts`는 `parseInitConfig(...)` 결과를 그대로 직렬화하므로, zod 기본값이
추가되면 새 프로젝트의 init.json에 `"conceptDrivenTests": true`가 자동 기록된다.

### 5. 이 저장소의 init.json (dogfooding)

`docs/conceptpowers/init.json`에 `"conceptDrivenTests": true`를 명시적으로 추가한다
(baseline 데이터가 아닌 설정 파일이며, 사용자가 이 기능 추가를 명시 요청했다).

## 거버넌스

이 동작 자체가 새 개념이므로 구현 전에 정의한다:

- 개념: `concept-driven-tests` (governance 그룹) — "테스트도 개념의 지배를 받는다"
- 기능 명세: 기존 `consistency-check` 또는 신규 feature에 연결
- 관련 코드에 `@concept:concept-driven-tests` 태그

## 테스트 (TDD, RED→GREEN)

1. `tests/schema/initConfig.test.ts` — 필드 없으면 `true`, 명시 `false` 파싱, 비-boolean 거부.
2. `tests/hooks/sessionStart.test.ts` — 세 케이스:
   - 필드 없음 → 규칙 줄 포함
   - `true` → 규칙 줄 포함
   - `false` → 규칙 줄 미포함
3. `tests/init/scaffold.test.ts` — 새 init.json에 `conceptDrivenTests: true` 기록 확인.

## 범위 밖 (YAGNI)

- PostToolUse 훅의 테스트 파일 검사 / 경고
- 전용 스킬 (`test-from-concept` 등)
- 커밋 게이트 · 감사(audit) · 뷰어 변경
- 시나리오-규칙 매핑의 기계적 검증
