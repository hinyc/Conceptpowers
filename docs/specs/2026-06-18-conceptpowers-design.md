# Conceptpowers — 설계 문서 (Design Spec)

- 작성일: 2026-06-18
- 상태: 브레인스토밍 진행 중 (결정 사항 누적 기록)
- 참고 프로젝트: `/Users/inyeol/Documents/GitHub/superpowers` (Claude Code 플러그인 배포 구조 참고)

> 이 문서는 브레인스토밍에서 확정되는 결정들을 실시간으로 누적 정리한다.
> 미확정 항목은 `TBD`로 표시하고, 확정 시 갱신한다.

---

## 1. 한 줄 요약

**Conceptpowers** 는 코드를 작성·수정하기 전에 "개념(Concept)"을 먼저 정의하고,
모든 기능·동작 변경이 정의된 개념의 규칙에 위배되지 않는지 자동으로 검증하도록
강제하는 **개념 기반 개발 거버넌스(Concept-driven Development Governance) Claude Code 플러그인**이다.

## 2. 문제 정의 / 동기

- 에이전트가 코드를 빠르게 수정·추가하다 보면, 프로젝트가 원래 의도한 **개념적 일관성**이 무너진다.
- "이 기능이 원래 무엇을 위한 것인가", "무엇을 해도 되고 무엇을 하면 안 되는가"가
  코드 곳곳에 암묵적으로 흩어져 있어, 변경이 기존 설계 원칙을 위배해도 감지되지 않는다.
- Conceptpowers는 **개념을 1급 산출물(first-class artifact)로 승격**시키고,
  코드 변경을 개념에 대해 검증함으로써 일관성을 강제한다.

## 3. 핵심 동작 루프 (The Core Loop)

```
[에이전트가 새 기능 추가 / 기존 동작 변경을 시도]
        │
        ▼
이 프로젝트가 Conceptpowers로 init 되었는가? ──(아니오)──▶ 강제 없음, 일반 진행
        │ (예)
        ▼
변경 대상에 연결된 @concept 태그가 있는가?
        │
   ┌────┴────────────────────────┐
 (없음)                         (있음)
   │                               │
   ▼                               ▼
관련 개념이 존재하나?            연결된 개념 규칙 로드
   │                          (Allow/Restrict/불변 원칙)
 (아니오) → 개념을 먼저 정의 강제      │
   │  (conceptpowers:define)          ▼
   │                          변경이 개념을 위배하는가?
   └──────────┐                   ┌──┴───┐
              ▼                 (아니오) (예)
     개념 정의 후 진행            │       │
                                 ▼       ▼
                       코드 수정 진행   ❌ 코드 수정 중단
                       + @concept 태그/  사용자에게:
                         매핑 동시 갱신     (a) 개념을 명시적으로 업데이트, 또는
                                          (b) 새 기능/개념으로 분리
```

### 핵심 규칙 (Invariants)

1. **Opt-in 강제**: `docs/conceptpowers/` 가 존재하는(=`conceptpowers:init` 한) 프로젝트에서만 강제가 활성화된다.
2. **개념 우선**: 개념이 없는 새 기능·동작 변경은 개념 정의를 먼저 강제한다.
3. **위배 시 중단**: 변경이 개념을 위배하면 코드를 수정하지 않는다. 사용자가 개념을 바꾸거나 기능을 분리해야 한다.
4. **`docs/conceptpowers/` 전체가 기준(baseline)이며 사용자 전속 수정**: 이 폴더의 모든 내용(init 마커, 기능 명세, 개념, 아키텍처, 인프라)은 프로젝트의 **판단 기준**이다. 따라서 사용자가 **명시적으로 요청**하거나 **직접 수정**할 때만 변경된다. 에이전트는 일반 코드 작업 중 이 폴더를 **임의로 수정하지 않는다**(읽기 전용으로 취급해 위배를 판단). 새 항목 생성(예: 없는 개념 정의)은 사용자가 그 기능을 추가하려는 명시적 흐름 안에서, 사용자 확인을 거쳐 전용 스킬로만 이루어진다.
5. **매핑 동기화**: 에이전트가 코드를 수정할 때는 `@concept` 태그/매핑도 **항상 함께** 갱신한다. (매핑 태그는 코드 측 산출물이므로 baseline 수정 제약의 예외)
6. **개념 범위는 포괄적(구멍 없음)**: 개념은 기능·동작뿐 아니라 **역할(role)·권한(permission)**, 그리고 프로젝트에서 특정 대상·기능을 지칭하는 **용어/표현(terminology)**까지 포함한다. 다소 까다롭더라도 지칭 표현이 모호하게 남지 않도록(=구멍이 없도록) 명확히 정의하는 것을 지향한다.
7. **개념 간 무모순(consistency) 강제**: 개념을 **추가/수정할 때마다** 기존의 다른 개념들과 **충돌(conflict)·위배(violation)** 여부를 항상 검토한다. 충돌·위배가 **하나도 없을 때만** 생성·수정이 허용된다. 충돌이 있으면 생성·수정을 중단하고 사용자에게 해소(개념 조정/분리)를 요청한다.
8. **테스트도 개념을 따른다**: 테스트 코드를 작성할 때 관련 개념을 항상 참조하고, 테스트가 개념을 위배하면 사용자에게 알린다(에이전트가 개념을 임의 수정해 정당화하지 않음).

## 4. 확정된 설계 결정 (Decisions)

| # | 결정 항목 | 선택 | 비고 |
|---|-----------|------|------|
| D1 | 플러그인 성격 | 개념 기반 개발 거버넌스 | superpowers와 유사한 스킬/훅 패키지 |
| D2 | 개념 저장 방식 | **데이터(JSON/MD) + HTML 뷰어** | 데이터가 진실, HTML은 렌더링된 뷰. status-dashboard 스킬 패턴 차용 |
| D3 | 강제 활성화 | **Opt-in** — `conceptpowers:init` 호출로 `docs/conceptpowers/` 생성 시에만 | 마커 폴더 존재 = 강제 허용 |
| D4 | 개념↔코드 연결 | **태그/주석 기반** (`@concept:<slug>`) | 에이전트가 수정 시 태그 자동 갱신 + 수동 매핑 갱신 스킬 제공 |
| D5 | 강제 범위 | **새 기능·동작 변경만** | 단순 리팩터링·오타·포맷은 제외 |
| D6 | 매핑 진실의 원천 | **코드 내 `@concept` 태그가 진실**, `mapping.json`은 재생성 가능한 캐시 | 코드 이동 시에도 연결 불일치 없음 |
| D7 | HTML 뷰어 렌더링 | **데이터 저장 시 정적 HTML 재생성** | 서버 불필요, 파일 열면 바로 보임 |
| D8 | 배포 채널 | **자체 마켓플레이스** (`.claude-plugin/marketplace.json`) | `superpowers`의 `obra/superpowers-marketplace` 방식 차용 |
| D9 | baseline 폴더 구성 | `docs/conceptpowers/` = **init / features / concepts / architecture / infra** 5요소 | 전체가 사용자 전속 수정 대상(기준). `mapping.json`은 캐시로 분리 |
| D10 | 개념 범주 | `feature` · `behavior` · `role` · `permission` · `term` (복수 가능) | 역할·권한·용어까지 포괄해 구멍 없게 |
| D11 | 개념 무모순 게이트 | 개념 추가/수정 시 **기존 개념과 충돌·위배 검사 통과 시에만** 커밋 | 위반 시 중단·사용자 해소 요청 |
| D12 | 상위 그룹(도메인) 분리 | features/concepts가 많아지면 **`<group>/` 폴더로 계층 분리** | `group` 필드로 표기, `slug`은 전역 고유. `category` 필드와는 별개 축 |
| D13 | 전체 감사 스킬 | **`conceptpowers:audit`** — 수동 실행, 프로젝트 전체 스캔으로 미연결 구멍 탐지 + 기존 연결 정합성 검증 | 실시간 게이트(`check-concept`)를 보완하는 사후 전수 점검 |
| D14 | 테스트 코드 개념 검증 | 테스트 작성 시 개념 참조, 위배 시 사용자 알림 (개념 임의수정 금지) | `check-concept` 검증 대상에 테스트 포함 |
| D15 | 활성화 방식 | 플러그인 번들 **SessionStart 훅이 `init.json` 마커 자동 탐색**으로 활성화 | **CLAUDE.md 수정 불필요**. 설치만 하면 자동, init 안 한 프로젝트는 무동작 |

## 5. 아키텍처

### 5.1 플러그인 저장소 구조 (이 레포 = Conceptpowers 플러그인)

superpowers 구조를 참고하여:

```
Conceptpowers/
├── .claude-plugin/
│   ├── plugin.json          # 플러그인 매니페스트 (name, version, ...)
│   └── marketplace.json     # 마켓플레이스 등록 정보
├── skills/                  # 자동 트리거되는 스킬들
│   ├── conceptpowers/       # (진입 스킬 — 사용법 안내)
│   ├── init/
│   ├── define-concept/
│   ├── check-concept/
│   ├── update-concept/
│   └── update-mapping/
├── hooks/                   # SessionStart / PreToolUse 훅
├── assets/                  # HTML 뷰어 템플릿, concept.css 등
├── docs/                    # (이 플러그인 자체의 설계 문서 — 본 파일 위치)
├── tests/
├── README.md
└── CLAUDE.md
```

> 주의: 위 `docs/`는 **플러그인 레포 자신의 설계 문서**다.
> `conceptpowers:init`이 **대상 프로젝트**에 만드는 `docs/conceptpowers/`와 혼동하지 말 것.

### 5.2 대상 프로젝트에 생성되는 구조 (`conceptpowers:init` 산출물)

`docs/conceptpowers/` 는 5개 구성요소로 이루어진 **프로젝트의 기준(baseline) 저장소**다.
전체가 사용자 전속 수정 대상이다(규칙 4).

```
<대상 프로젝트>/
└── docs/conceptpowers/
    │
    ├── 1) init.json             # init 마커 — "Conceptpowers의 강제 개입을 허용한다"는 명시
    │                            #   + 프로젝트 간단 정보, 강제 범위 등 설정
    │
    ├── 2) features/             # 기능 명세 — 구현하고자 하는 기능을 기술.
    │   ├── <group>/             #   많아지면 상위 그룹(도메인)별로 분리 (예: auth/, billing/)
    │   │   └── <feature>.md     #   개념(concept)은 이 명세를 기반으로 구성된다.
    │   └── ...
    │
    ├── 3) concepts/             # 개념 폴더 — 데이터(진실) + 뷰(HTML)
    │   ├── data/                #   개념 정리용 JSON / MD (진실의 원천)
    │   │   ├── <group>/         #     많아지면 상위 그룹(도메인)별로 분리
    │   │   │   ├── admin-role.json
    │   │   │   └── admin-role.md
    │   │   └── ...
    │   └── viewer/              #   뷰용 HTML (데이터에서 정적 재생성, D7)
    │       ├── index.html       #     그룹별 섹션으로 목록 구성
    │       ├── <group>/
    │       │   └── admin-role.html
    │       └── assets/concept.css
    │
    ├── 4) architecture/         # 프로젝트 전체 아키텍처 — 명시적으로 정리.
    │   └── architecture.md      #   아키텍처에 따라 개념이 달라질 수 있어 기준으로 둠.
    │
    └── 5) infra/                # 인프라 정보 — 명시적으로 기록하고 판단에 사용.
        └── infra.md
```

> `mapping.json`(@concept 태그 인덱스 캐시, D6)은 **코드 측 캐시**이므로
> 이 baseline 폴더가 아니라 별도(예: `docs/conceptpowers/.cache/mapping.json`)에 두어
> 사용자 전속 수정 제약과 분리한다.

#### 구성요소 간 관계 (기준의 계층)

```
infra (5)  ─┐
            ├─▶  architecture (4)  ─▶  features (2)  ─▶  concepts (3)  ─▶  코드 (@concept 태그)
init (1) 허용 게이트                                         ▲
                                                  검증 기준(Allow/Restrict/불변원칙)
```

- **infra → architecture → features → concepts** 순으로 상위 기준이 하위 개념을 제약한다.
- 코드 변경은 최종적으로 **concepts**의 규칙에 대해 검증된다.
- 상위(아키텍처·인프라·기능명세)가 바뀌면 개념도 달라질 수 있으므로 모두 명시적 기준으로 보존한다.

### 5.3 개념 데이터 스키마 (JSON)

보여준 LGEHS `Admin Role` HTML 예시의 구조를 데이터화한다. (Zod로 검증)

개념은 다음 **범주(category)** 중 하나 이상을 가진다 (구멍 없이 포괄, 규칙 6):

| category | 의미 | 예 |
|----------|------|----|
| `feature` | 기능 | "토큰 사용량 대시보드" |
| `behavior` | 동작 규칙 | "역할 회수 시 키 폐기와 권한 회수를 한 번에 처리" |
| `role` | 역할 | "Admin Role", "Agent Developer Role" |
| `permission` | 권한 | "에이전트 단위 개발 권한", "API Key 발급 가능 상태" |
| `term` | 용어/표현 | "에이전트", "위임", "공동 개발자" — 지칭이 모호하지 않도록 정의 |

```jsonc
{
  "slug": "admin-role",          // 프로젝트 전역 고유 (그룹이 달라도 중복 불가)
  "group": "auth",               // 상위 그룹(도메인). 많아지면 폴더 분리 (선택, 기본 "")
  "category": ["role"],          // feature | behavior | role | permission | term (복수 가능)
  "number": 3,
  "title": "Admin Role",
  "eyebrow": "운영자 역할",
  "description": {
    "definition": "핵심 정의 ...",
    "analogy": "핵심 비유 ...",
    "components": ["주요 구성 요소 ..."],
    "example": "개념 예시 ..."
  },
  "purpose": {
    "reason": "존재 이유 ...",
    "benefits": ["기대 효과 ..."],
    "vision": "최종 목표 ...",
    "painPoints": ["해결하는 문제 ..."]
  },
  "actions": {
    "allow": ["허용 행동 ..."],
    "restrict": ["제한 행동 ..."],
    "interaction": "상호작용 ..."
  },
  "principle": {
    "immutableRules": ["불변 원칙 ..."],
    "tradeoffs": "의사결정 우선순위 ...",
    "lifecycle": ["관리 및 지속성 ..."]
  },
  "relations": {
    "prev": "user-role",
    "next": "agent",
    "related": ["agent-developer"]
  },
  "codeLinks": ["src/auth/admin/**", "@concept:admin-role"]
}
```

> 검증 기준 핵심: `actions.allow` / `actions.restrict` / `principle.immutableRules` 가
> 코드 변경의 **위배 판단 기준**이 된다.

### 5.4 구성 요소 (Skills / Commands)

| 스킬 | 트리거 | 역할 |
|------|--------|------|
| `conceptpowers` (진입) | 세션 시작 / 사용법 질문 | Conceptpowers 사용법·규칙 안내, 다른 스킬로 라우팅 |
| `conceptpowers:init` | 사용자 명시 호출 | 대상 프로젝트에 `docs/conceptpowers/` 5요소 스캐폴딩(init·features·concepts·architecture·infra + viewer/css) → 강제 활성화 |
| `conceptpowers:define-concept` | 개념 없는 새 기능 시 자동, 또는 명시 호출 | `features/` 명세 기반으로 구조화 개념(범주 포함: feature/behavior/role/permission/term)을 대화로 정의 → **무모순 검사 통과 시에만** `concepts/data/` 저장 + 뷰어 재생성 |
| `conceptpowers:check-consistency` | define/update 시 자동 (내부 게이트) | 새/수정 개념을 **기존 모든 개념과 대조**해 충돌·위배 탐지. 통과해야만 커밋 (규칙 7) |
| `conceptpowers:check-concept` | 새 기능·동작 변경 직전 자동 | 관련 개념(코드↔개념)을 찾아 **코드 변경**의 위배 여부 판단. 위배 시 중단 안내 (baseline은 읽기 전용) |
| `conceptpowers:update-baseline` | **사용자 명시 요청 시에만** | baseline(개념·기능명세·아키텍처·인프라) 수정. 에이전트 임의 수정 금지. 개념 수정 시 `check-consistency` 통과 필수 |
| `conceptpowers:update-mapping` | 코드 수정 시 자동 + 수동 호출 | `@concept` 태그/`mapping.json` 캐시 갱신 (baseline 아님) |
| `conceptpowers:audit` | **사용자 수동 실행** | 프로젝트 전체 스캔: ① 개념 미연결 코드(구멍) 탐지·연결 강제, ② 기존 `@concept` 연결의 정합성(대상 개념 존재·코드의 개념 준수·캐시 일치) 검증. 리포트 + 해소 안내 |

### 5.5 훅 (Hooks)

| 훅 | 시점 | 동작 |
|----|------|------|
| SessionStart | 세션 시작 | 플러그인이 **자동으로** `docs/conceptpowers/init.json` 마커를 탐색. 존재하면 Conceptpowers 강제 컨텍스트 주입(활성화), 없으면 아무것도 안 함 |
| PreToolUse (Edit/Write) | 코드 파일 수정 직전 | init된 프로젝트에서 새 기능·동작 변경이면 `check-concept` 수행을 강제하는 리마인더/게이트 |

> 훅은 **의미 판단을 하지 않는다**(불가능). 훅은 게이트·리마인더 역할만 하고,
> 실제 개념 검증·위배 판단은 **스킬(에이전트의 추론)**이 수행한다. (하이브리드)

#### 활성화 흐름 (Activation) — 완전 자동, CLAUDE.md 수정 불필요

```
플러그인 설치 (/plugin install conceptpowers@<marketplace>)
        │  → 플러그인에 번들된 SessionStart 훅이 함께 등록됨
        ▼
매 세션 시작 시, 번들 훅이 현재 프로젝트 루트에서 docs/conceptpowers/init.json 탐색
        │
   ┌────┴────┐
 (있음)     (없음)
   │           └─▶ 비활성. 일반 동작 (이 프로젝트는 강제 안 함)
   ▼
강제 컨텍스트 주입 → check-concept / 개념 우선 / 위배 중단 규칙 활성
```

- 사용자는 **CLAUDE.md에 아무것도 추가하지 않는다.** 활성화 신호는 오직 `init.json`(마커) 존재 여부다.
- `conceptpowers:init`은 그 `init.json`을 만드는 행위이고, 그게 곧 "이 프로젝트는 강제를 허용한다"는 명시적 표시다.
- 플러그인을 설치했어도 `init` 안 한 프로젝트에서는 훅이 마커를 못 찾아 **아무 일도 일어나지 않는다**(opt-in, D3).

### 5.6 전체 감사 (`conceptpowers:audit`)

실시간 게이트(`check-concept`)는 "지금 바뀌는 코드"만 본다. `audit`은 이를 보완하는
**사후 전수 점검**으로, 사용자가 수동 실행한다.

- **① 미연결 구멍 탐지**: 프로젝트 전체를 스캔해 개념과 연결되지 않은(=`@concept` 태그 없는)
  기능·동작·역할·권한·용어를 찾아낸다. 개념이 필요한데 누락된 곳을 목록화하고 연결(또는 개념 정의)을 강제한다.
- **② 기존 연결 정합성 검증**: 각 `@concept:<slug>`에 대해 — (a) 대상 개념이 실제 존재하는가,
  (b) 코드가 그 개념의 Allow/Restrict/불변원칙을 준수하는가, (c) `mapping.json` 캐시가 실제 태그와 일치하는가.
- **출력**: 위반/구멍 리포트 + 해소 안내. (baseline은 읽기 전용이므로 개념 수정은 사용자에게 위임)

### 5.7 테스트 코드와 개념

테스트는 "기대 동작"을 코드로 박제하므로, 개념과 어긋난 테스트는 위험하다.

- **테스트 작성 시 개념 참조 강제**: 새 테스트를 만들 때 관련 개념(해당 기능·동작·역할·권한)을 항상 참조한다.
- **위배 시 사용자 알림**: 테스트가 개념의 규칙(Allow/Restrict/불변원칙)과 충돌하면 **조용히 통과시키지 않고**
  사용자에게 알린다. 원인은 둘 중 하나다 — (a) 테스트가 잘못됨, 또는 (b) 개념이 갱신되어야 함.
  개념 수정은 사용자 전속(규칙 4)이므로 에이전트가 임의로 개념을 바꿔 테스트를 정당화하지 않는다.
- `check-concept`의 검증 대상에 **테스트 코드도 포함**된다.

## 6. 범위 밖 (Non-goals / YAGNI)

- 단순 리팩터링·오타·포맷 변경에 대한 개념 검증 (D5에 따라 제외)
- 개념의 자동 생성/자동 수정 (개념 수정은 사용자 전속, 규칙 4)
- 비-Claude-Code 하니스 지원 (1차 범위는 Claude Code only) — `TBD: 추후 검토`

## 7. 미확정 항목 (Open Questions)

- ~~OQ1: HTML 뷰어 정적 vs 온디맨드~~ → **해결(D7)**: 데이터 저장 시 정적 재생성
- ~~OQ2: 매핑 진실의 원천~~ → **해결(D6)**: 코드 `@concept` 태그가 진실, mapping.json은 캐시
- OQ3: "새 기능·동작 변경" 판정 기준의 구체적 휴리스틱 → **구현 시 `check-concept` 스킬 내에서 정의** (설계 단계에서는 보류)
- ~~OQ4: 플러그인 배포 채널~~ → **해결(D8)**: 자체 마켓플레이스

## 8. 다음 단계

1. 본 설계 문서 사용자 리뷰
2. 미확정 항목(OQ1~OQ4) 해소
3. `writing-plans` 스킬로 구현 계획 작성 → 단계별 구현
```
