# 개념 근거(provenance) 기록 — 설계

- 날짜: 2026-09-12
- 상태: 설계 승인 대기 (구현 전)
- 배경: **개념이 어디서 나왔는지가 어디에도 남지 않는다.**
  1. `codeLinks`는 파일 경로 배열뿐이다 — 줄도 심볼도 없고, 그 파일이 *왜* 근거인지도 없다.
  2. 참고자료는 `reference-first-duty`에 따라 "한 번 걸러 개념의 문장으로" 옮겨지는데, 옮기고 나면
     어느 문서 몇 페이지에서 왔는지가 사라진다.
  3. `.alignment/`의 기록들은 원 출처가 아니다 — `attest.json`은 정합성 검사 이력,
     `history.json`은 변경 사유, `noCode.json`은 코드무관 판단이다.

  결과적으로 "이 규칙은 왜 이렇게 쓰였나"를 역추적할 방법이 없다.

## 원칙

- **근거는 추적용 기록이지 판단 입력이 아니다.** 코드 판정(check-concept / audit)은 여전히 개념의
  규칙만 본다 — `reference-first-duty`는 그대로 유지된다. 근거 칸은 그 규칙이 **어디서 왔는지**를
  적을 뿐, 판정의 근거로 쓰이지 않는다.
- **좌표만 적고 원문은 옮기지 않는다.** 등록된 참고자료는 "Proprietary and Confidential" 표기가
  달린 문서들이다. `reference-privacy`가 "자료는 저장소 밖으로 나가지 않고 위치만 공유"를 못박고
  있으므로, 근거에는 발췌문을 담을 칸 자체를 두지 않는다.
- **계약 밖이다.** 근거는 `contractHash()`에 들어가지 않는다. 따라서 근거만 고치는 것은 개념
  수정이 아니고, 어긋남(drift)도 재정합성검사도 일으키지 않는다.
- **위조 유인을 만들지 않는다.** 차단형 검사는 통과하려고 아무 경로나 적어 넣게 만든다. 그래서
  "사람이 판단해 정했다"를 정식 근거로 인정하는 출구를 둔다 — `concept-code-mapping`이 침묵과
  "따를 개념이 없다는 판단"을 구분하려고 `@concept:none`을 정식 표식으로 두는 것과 같은 구조다.

## A. 스키마 — `src/schema/concept.ts`

`codeLinks` 옆에 `sources`를 추가한다.

```ts
export const ConceptSourceKind = z.enum(['code', 'reference', 'decision']);

export const ConceptSource = z
  .object({
    kind: ConceptSourceKind,
    path: z.string().default(''),
    locator: z.string().default(''),
    supports: z.string().default(''),
  })
  .refine((s) => s.kind === 'decision' || s.path.trim() !== '', {
    message: 'code/reference source requires a path',
  })
  .refine((s) => s.kind !== 'decision' || s.supports.trim() !== '', {
    message: 'decision source requires supports (what the judgment rested on)',
  });

// ConceptSchema 안:
sources: z.array(ConceptSource).default([]),
```

| 칸         | code                      | reference                        | decision                    |
| ---------- | ------------------------- | -------------------------------- | --------------------------- |
| `path`     | 저장소 상대 경로 (필수)   | 문서명 또는 등록된 바깥 경로(필수) | 비움                        |
| `locator`  | 심볼명 우선, 줄 번호 보조 | `p.12`, `slide 7`, `3.2절`       | 언제/어디서 정해졌는지      |
| `supports` | 뒷받침하는 우리 규칙 요약 | 뒷받침하는 우리 규칙 요약        | 무엇을 근거로 정했는지(필수) |

- **좌표는 자유 형식이다.** 등록된 자료가 PDF(페이지)·PPTX 변환본(슬라이드)·저장소 안 `.md`(절/줄)로
  섞여 있어 하나의 형식으로 묶이지 않는다.
- **줄 번호보다 심볼 이름을 먼저 쓴다.** `L14-28`은 그 위에 한 줄만 추가돼도 낡는다.
  `contractHash()`처럼 이름으로 짚고 줄 번호는 보조로 적는다 (스킬 규약, 기계 강제 아님).
- `supports`는 **우리가 쓴 규칙의 요약**이지 출처 원문의 인용이 아니다.

## B. 검사 — `src/concept/quality.ts`

`deficiencies`에 근거 없음을 추가한다. 결격이므로 green 승격이 하드 거부되고, 커밋 게이트는
품질 결격으로 묻는다.

```
no source: sources must name at least 1 origin (code / reference / decision)
```

- **용어(term) 단독 개념도 동일하게 요구한다.** 용어도 어디선가 왔다.
- `decision` 하나만 있어도 통과한다 — 그것이 위조 방지 출구다.
- 경로가 실재하는지, 좌표가 낡았는지는 **검사하지 않는다**(비목표 참조).

## C. 뷰어 — `assets/viewer.js`

- 뷰어 상세 화면은 목록 매니페스트(`manifest.json`)가 아니라 **개념 원본 `data/*.json`을 직접
  fetch해서** 읽는다(`state.current`). 스키마에 `sources`가 생기면 그 fetch 결과에 자동으로
  실리므로 `src/viewer/manifest.ts`는 손대지 않는다 — `codeLinks`처럼 매핑 캐시와 병합할 필요도
  없다(근거는 사람이 적은 것이고 태그에서 유도되지 않는다).
- `assets/viewer.js`: 읽기 화면에서 "코드 경로" 난 옆에 "근거" 난을 추가한다
  (i18n 라벨 ko `근거` / en `Sources`).
- 편집은 기존 `codeLinks` 텍스트에어리어와 같은 방식으로, 한 줄에 하나씩 파이프로 끊는다.

```
code      | src/drift/hash.ts                  | contractHash()  | 계약 필드만 해시한다
reference | concept-centric-software-design.md | p.12 3.2절      | 개념은 혼자 서야 한다
decision  |                                    | 2026-09-12 설계 | 위조 방지 출구가 필요하다
```

칸이 넷을 넘으면 나머지는 무시하고, 모자라면 빈 값으로 채운다. `kind`가 셋 중 하나가 아닌 줄은
버린다.

## D. 상태 전이 — 예외 없음 (설계 변경, 2026-09-12)

당초 "`sources`만 고치면 green을 유지한다"는 예외를 `editConceptContent`에 두려 했으나,
`conceptStore.ts`/`serve.ts`/`viewer.js`를 이미 지배하는 기존 green 개념 `concept-inline-edit`의
불변규칙과 정면 충돌한다는 것을 구현 계획 단계에서 발견했다:

> "확정된 개념을 고치면 **예외 없이** 검토 중 상태로 내려간다"

green↔green 충돌이라 조용히 해결할 수 없는 사안이라 사용자에게 보고했고, **예외를 넣지 않는
쪽으로 결정했다.** `EDITABLE_FIELDS`에 `'sources'`는 추가하되(뷰어에서 근거를 고칠 수 있어야
하므로), 강등 로직은 손대지 않는다 — `sources`를 포함한 어떤 편집이든 기존 규칙대로 green을
pending으로 내린다.

이걸로 실질적인 문제가 생기지 않는 이유: 브레인스토밍에서 "계약 밖 메타 — green 유지"로 정한
것은 **F(23+1개 백필)**에 대한 결정이었고, 백필은 애초에 `editConceptContent`를 거치지 않고
개념 JSON 파일에 직접 쓴다(F 참조) — 이 강등 로직과 무관하다. 이후 누군가 뷰어에서 근거 한 줄만
고치고 싶어도, 그건 다른 본문 편집과 똑같이 재검토(pending)를 거치는 것이 `concept-inline-edit`과
일관적이다.

## E. 스킬 개정 — `skills/define-concept/SKILL.md`

- 3단계(구조 채우기)에 `sources` 항목을 추가한다 — 개념을 세운 근거를 코드·참고자료·사람의 결정
  가운데 하나 이상으로 밝힌다.
- 좌표 규약(심볼 우선, 줄 번호 보조)과 원문 인용 금지를 명시한다.
- `decision` 출구의 용법을 적는다 — 없는 근거를 지어내지 말고 "사람이 정했다"를 적으라는 지시.
- `check-concept` / `audit` 스킬은 **손대지 않는다.** 근거는 판정 입력이 아니다.

## F. 백필 — 기존 green 개념 23개

- 개념마다 근거 후보를 조사한다: 그 개념의 `codeLinks`, `@concept` 태그가 달린 파일, 그리고
  참고자료에서 그 개념을 뒷받침하는 자리.
- 조사는 병렬로 나눠 진행하고, 결과를 검토표로 한 번에 올려 사용자 확인을 받은 뒤 일괄 기록한다.
- **상태는 green을 유지한다.** 계약이 바뀌지 않으므로 `edit-concept`의 pending 강등 경로를 타지
  않고 개념 파일에 직접 기록한다.
- 등록된 참고자료: 저장소 안 `concept-centric-software-design.md`,
  바깥 경로의 PDF 3종(12p / 39p / 104p). PPTX 원본은 도구로 읽히지 않으므로 변환본 PDF를 인용한다.

## G. 거버넌스 절차 — 새 개념 `concept-provenance`

기존 23개 중 "개념이 어디서 왔는지 기록한다"를 목적으로 하는 개념은 없다.
`concept-code-binding`은 파일이 어느 개념을 따르는지(코드→개념 방향), `concept-code-mapping`은
태그 색인, `reference-first-duty`는 참고자료를 *언제* 읽는지라 목적이 다르다. 따라서 새 개념을
정의한다 — 제목 "개념의 근거".

- 관리 대상: 개념마다 기록된 근거 목록 — 코드 자리·참고자료 좌표·사람의 결정
- 규칙 뼈대
  - 모든 개념은 근거를 하나 이상 밝힌다
  - 근거에는 참고자료의 원문을 옮겨 적지 않고 위치만 적는다
  - 근거는 코드가 규칙을 지켰는지 판정하는 데 쓰이지 않는다
- 정합성 검사에서 `concept-scope`("코드 표기는 `codeLinks`로 옮긴다")와 마찰이 날 수 있다. 그때는
  기존 개념을 고치는 대신 새 개념의 `actions.interaction`에 맞물림을 적어 피하는 쪽을 먼저 시도하고,
  그래도 부딪히면 사용자 승인을 받는다.
- `check-consistency` 통과 후 `attest-consistency`로 증빙을 남긴다.

## H. 커밋 순서

검사를 먼저 켜면 기존 23개가 전부 결격이 되어 커밋 게이트가 물고 늘어진다. 그래서 둘로 나눈다.

1. **근거 칸 도입** — 스키마(A) + 뷰어(C) + 편집 화이트리스트(D, 강등 예외 없음) + 스킬(E) +
   새 개념(G) + 테스트. 품질 결격 검사는 아직 켜지 않는다.
2. **백필 + 결격 전환** — 24개 백필(F, 새 개념 자신 포함) + 품질 결격(B) + 테스트.

   실제 실행(2026-09-12)에서는 2번을 두 커밋으로 나눴다: (a) 백필 + 결격 규칙 + 규칙 전용
   테스트, (b) 다른 규칙을 검증하던 기존 픽스처에 최소 근거를 넣는 테스트 수정. 원래 "같은
   커밋"을 요구한 이유는 게이트가 근거 없는 개념을 새 규칙으로 보지 않게 하려는 것이었는데,
   커밋 게이트는 설치된 플러그인(이전 릴리스)에서 실행되므로 이 저장소의 소스 변경이 즉시
   게이트에 반영되지 않는다 — 순서 위험이 없어 나누는 쪽이 검토하기 쉬웠다.

## I. 테스트 계획

테스트는 `@concept:concept-provenance` 태그를 달고 그 개념의 규칙에서 시나리오를 얻는다.

| 대상           | 시나리오                                                               |
| -------------- | ---------------------------------------------------------------------- |
| 스키마         | `code`/`reference`에 경로가 없으면 거부, `decision`에 `supports`가 없으면 거부 |
| 스키마         | 옛 개념 파일(`sources` 없음)은 빈 배열로 파싱된다                      |
| 품질           | `sources`가 비면 결격, `decision` 하나만 있어도 통과                   |
| 품질           | 용어 단독 개념도 근거를 요구한다                                       |
| 상태 전이      | `sources`만 고쳐도 다른 필드와 똑같이 green이 pending으로 내려간다(특례 없음) |
| 뷰어 manifest  | `sources`가 매핑 캐시와 병합되지 않고 개념의 것만 실린다               |
| 지문           | `sources`를 고쳐도 `contractHash()`가 그대로다                         |

커버리지 80% 이상을 유지한다.

## 비목표

- **규칙 한 줄마다 근거** — 규칙 배열은 문자열 그대로 둔다. 개념 단위 근거에 "어느 규칙을
  뒷받침하는지"를 한 줄로 적는 것으로 대신한다.
- **경로 존재 검증·좌표 부패 자동 탐지** — v1에서는 하지 않는다. 훗날 audit의 경고로 검토한다.
- **근거를 코드 판단에 쓰는 것** — `reference-first-duty`를 어긴다.
- **지식 그래프 간선화** — 코드 노드는 `codeLinks`와 매핑 캐시가 이미 만든다.
- **원문 발췌 저장** — `reference-privacy`를 어긴다.
