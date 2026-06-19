# Concept 상태 3단계(red / pending / green) 도입 — 설계 스펙

- 작성일: 2026-06-19
- 상태: 확정 (구현 계획 작성 완료)
- 선행 문서: `docs/specs/2026-06-18-conceptpowers-design.md`

---

## 1. 한 줄 요약

개념 상태를 기존 이진(`red`/`green`)에서 **3단계(`red` / `pending` / `green`)**로 확장하여,
"사용자가 직접 작성한 개념"과 "에이전트가 자동 추론한 개념"을 분리하고,
에이전트의 status 권한을 **`pending → green` 단일 승급**으로만 제한한다.

## 2. 문제 정의

현재 `status`는 `red`/`green` 이진이며, `define-concept` 6단계가 사용자 작성 개념을
무조건 `green`으로 설정한다. 이는 다음과 충돌한다:

- `src/hooks/sessionStart.ts:43` — "manual 모드에서 status 변경 금지, never auto-approve"
- `src/concept/approve.ts` — CLI approve는 `approvalMode='cli'`에서만 허용
- `skills/approve/SKILL.md` — manual 모드에서 approve 비활성
- `README` 스킬 표 — define-concept 산출물을 "🔴 red"로 명시

**근본 원인:** `red`가 서로 신뢰 수준이 전혀 다른 두 부류를 뭉뚱그린다.
① 자동 스캔이 추론한(사람 미개입) 개념, ② 사용자가 define으로 직접 작성한 개념.
이 이진이 사용자 작성 개념에 대해 "red(지정했으나 안 지켜짐)" 또는 "green(검토 체크포인트 없는 자동 승인)"
중 **둘 다 흠 있는 선택**을 강요한다.

## 3. 해결 — 3-상태 모델

| 상태 | 의미 | 적용(enforce) 여부 |
| --- | --- | --- |
| 🟡 `pending` | 사용자가 define으로 작성, 아직 정착 전 | **미적용**(미사용으로 간주) |
| 🟢 `green` | 일관성 검증된 source of truth | 적용 |
| 🔴 `red` | 자동 추론(미작성) 또는 사람이 거부/보류 | 미적용 |

### 3.1 상태 전이표 (잠금)

| from | to | 트리거 | 주체 |
| --- | --- | --- | --- |
| (신규·사용자 define) | 🟡 pending | 작성 | 에이전트 출생 |
| (신규·자동 스캔) | 🔴 red | 추론 | 에이전트 출생 |
| 🟡 pending | 🟢 green | 일관성 **통과** | **에이전트 (자동)** |
| 🟡 pending | 🟡 pending (유지) | 일관성 **충돌** | 에이전트는 *이유만 보고*, 변경 안 함 |
| 🟢 / 🔴 (정착됨) | 무엇이든 | 수동 | **사람 전속** |

### 3.2 에이전트 권한 경계 (불변식)

- 에이전트가 수행하는 status 변경은 **`pending → green` 단 하나** + 출생 상태 지정뿐이다.
- 에이전트는 **강등하지 않으며**(`green→red`, `pending→red` 자동 변경 없음),
  **정착된 `green`/`red`를 절대 건드리지 않는다.**
- 충돌난 pending은 계속 `pending`에 머물고, 에이전트는 "왜 green이 안 되는지" 이유만 표면화한다.
- 자동 추론 개념은 `red`로 태어나며 에이전트가 승급할 수 없다(사람만).

> 이 경계 덕분에 "두 green 충돌 시 에이전트가 한쪽을 임의 강등"하는 함정이 구조적으로 불가능하다.

## 4. 의미 변화 (명문화 필요)

`pending → green` 자동 승급을 받아들이면 `green`의 정의가 이동한다:

- 기존: `green` = "사람이 직접 확정한 것"
- 신규: `green` = **"사람이 작성 + 기계가 일관성 검증한 것"**
- 통제점이 **승인(status)에서 작성(내용)으로 이동**한다.

→ `README` 헤드라인("only a person approves")과 `sessionStart`의 status 규칙을 이에 맞게 다시 쓴다.
사람의 불가침 통제점은 이제 **개념 내용 작성**(`define-concept` 대화형 + baseline 수정 사용자 전속)이다.

## 5. 표면화 / 알림 정책

1. **커밋 게이트(`preToolUse`)**: `pending` 개념은 통과시킨다(미사용이므로 위반 아님).
   단, **충돌로 묶인 pending**은 **더 강한 알림**을 띄운다(충돌 이유 포함).
2. **audit**: `pending`을 미승인(violation) 판정에서 **제외**한다(미사용으로 간주).
   단, **계속 보류 중인 pending 개수/목록을 리마인더로 보고**한다.
3. **충돌 이유 표면화 위치**: ① 세션 시작(보류 잔존 리마인더) ② 커밋 게이트(강한 알림) ③ viewer 배지.
   충돌 이유는 개념과 함께 저장한다(저장 위치는 §8 리뷰 포인트).
4. **viewer**: `pending` 전용 배지를 추가한다.

## 6. 영향 파일

- `src/schema/concept.ts` — `ConceptStatus` enum에 `'pending'` 추가(`['green','pending','red']`). 기본값은 `red` 유지(스키마 안전 기본; define-concept가 `pending`을 명시 지정).
- `src/hooks/sessionStart.ts` — status 설명 텍스트 갱신, 보류 잔존 리마인더 주입, manual-mode 규칙 재작성.
- `src/hooks/preToolUse.ts` — 게이트의 pending 처리(통과), 충돌-pending 강한 알림.
- `src/audit/audit.ts` — `AuditReport`에서 pending을 unapproved에서 제외, `pending`/`lingeringPending` 집계 추가.
- `src/viewer/template.ts` — pending 배지 렌더.
- `src/concept/approve.ts` / `skills/approve/SKILL.md` — approve는 여전히 자동추론 `red → green` 승급 담당. `approvalMode` 처리(§8).
- `skills/define-concept/SKILL.md` — 6단계: 출생 `pending` → 일관성 통과 시 `green`, 충돌 시 `pending` 유지 + 이유 보고.
- `skills/check-consistency/SKILL.md` — pending 대상 처리 명시.
- `README.md` / `README.ko.md` — 상태 절, 스킬 표, 헤드라인/승인 모델 재작성.
- `tests/schema/concept.test.ts` — `'yellow'` 거부 테스트를 `'pending'` 허용 + 미지값 거부로 교체. 신규: audit pending 제외, 게이트 pending 동작.

## 7. 하위 호환 / 마이그레이션

- 기존 개념 파일은 `green`/`red`만 존재 → enum 확장은 **상위 호환**(기존 값 그대로 유효).
- 신규 상태는 신규 생성 경로에서만 발생하므로 마이그레이션 스크립트는 불필요.

## 8. 확정된 결정 (2026-06-19)

1. **`approvalMode` 폐기** — 3-상태가 manual-mode 보호를 구조적으로 흡수한다
   (에이전트 자동 green은 *사용자 작성* pending에만 발생, 자동추론은 red로 태어나 에이전트가 못 건드림).
   `initConfig`/scaffold/cli/`approve.ts`/sessionStart에서 제거. `approve`는 자동추론 `red→green` 승급 전용.
   기존 init.json의 `approvalMode` 키는 zod가 무시(상위 호환).
2. **충돌 이유 저장 = `.alignment/pending-conflicts.json`** (slug→reason). 개념 JSON 오염 방지.
3. **pending 참조 코드 커밋 = 소프트 통과.** 단, 충돌 기록이 있는 pending 참조는 게이트에서 강한 알림.

---

## 9. 테스트 계획 (개요)

- 단위: enum `pending` 허용/미지값 거부, define 출생 상태, 일관성 통과/충돌 분기.
- 통합: 게이트의 pending 통과 + 충돌-pending 강한 알림, audit의 pending 제외 + 보류 리마인더.
- 회귀: 기존 `green`/`red` 동작 불변.
