# 참고자료 경로 등록 (reference path registration) — 설계

날짜: 2026-08-06

## 문제

개념을 정의할 때 에이전트는 `docs/conceptpowers/reference/`의 파일과 `reference/paths.md`에
등록된 외부 경로를 참고한다. 그런데:

1. `init` 시점에 참고자료 경로를 물어보는 단계가 없다. 사용자는 `paths.md`의 존재를 모른 채
   지나가고, 개념 정의가 근거 없이 진행된다.
2. 경로를 등록하려면 `paths.md`를 손으로 열어 편집해야 한다. 스킬로 바로 추가할 수단이 없다.
3. `checkReferencePaths`의 `empty` 판정이 최상위 `readdir` 길이만 본다. 빈 하위 폴더만 있거나
   `.DS_Store` 하나만 있어도 `ok`로 판정되어, "등록은 됐지만 읽을 자료가 없는" 상태를 놓친다.

## 설계

### 1. 검증 강화 — `src/init/referencePaths.ts`

내부 헬퍼 `hasUsableContent(path)`를 도입해 `empty` 판정을 실질 기준으로 바꾼다.

- **폴더**: 하위까지 재귀하며 "점(`.`)으로 시작하지 않고 크기 > 0인 파일"을 찾는다. 하나라도
  찾으면 즉시 중단(early exit). 심볼릭 링크는 `Dirent.isDirectory()`가 false이므로 재귀하지
  않는다 → 순환 안전.
- **파일**: 크기 0이면 `empty`.
- **순회 상한**: 방문 엔트리 5000개를 넘기면 보수적으로 `ok`로 판정한다(거짓 경고 방지).

`ReferencePathStatus`(`ok` | `missing` | `empty`)와 `ReferencePathCheck`의 형태는 그대로 두어
기존 소비자(`reference` CLI, SessionStart 경고 블록)가 변경 없이 개선된 판정을 사용한다.

### 2. 쓰기 경로 — `src/init/addReferencePath.ts` (신규)

```
addReferencePath(root, raws: string[]) → { added: string[], skipped: {raw, reason}[] }
```

- `ensureReferencePaths`로 템플릿을 보장한 뒤, **기존 내용과 주석을 보존한 채 끝에 append**한다.
  쓰기는 `writeFileAtomic`.
- 정규화(`normalizeEntry`): trim → 감싼 따옴표(`'`, `"`) 제거 → 앞의 불릿(`-`, `*`) 제거.
  `~`는 보존한다(홈 이동에 견디는 표기).
- 중복은 **resolve 후** 경로로 비교해 skip한다(`~/x`와 `/Users/me/x`를 같은 항목으로 취급).
  사유는 `duplicate`.
- 빈 문자열/주석만 있는 입력은 `invalid`로 skip.
- **존재 여부로 거부하지 않는다.** 없는 경로도 기록하고, 상태로 경고한다(선등록 허용).

### 3. CLI — `reference-add <path...>`

기존 `reference`와 나란한 flat 명령. 여러 경로를 한 번에 받는다.

```json
{
  "ok": true,
  "added": ["~/work/specs"],
  "skipped": [{ "raw": "docs/x", "reason": "duplicate" }],
  "files": ["glossary.md"],
  "external": [{ "raw": "~/work/specs", "resolved": "/Users/me/work/specs", "status": "empty" }]
}
```

응답에 등록된 **전체 경로 현황**을 함께 실어, 스킬이 한 번의 호출로 추가와 경고를 모두
보고할 수 있게 한다. exit 코드는 쓰기 성공 시 0 — `missing`/`empty`는 실패가 아니라 데이터로
전달한다("경고 후 기록"). 기존 `reference`는 검증 실패 시 exit 1을 유지한다.

### 4. 스킬 & init 흐름

- **신규 스킬 `skills/add-reference/SKILL.md`** (`/conceptpowers:add-reference`):
  경로를 입력받아(여러 개 가능) `reference-add`를 호출하고, 추가분 + 전체 현황을 보고한다.
  `missing`/`empty` 항목은 "이 경로에는 참고할 자료가 없습니다"로 경고한다.
- **`skills/init/SKILL.md`**: define-concept 제안 단계 **앞에** 참고자료 경로 질문 단계를
  추가한다. 건너뛸 수 있으며, 건너뛰면 `paths.md` 직접 편집 또는 `/conceptpowers:add-reference`로
  언제든 등록 가능함을 안내한다.
- **`src/i18n/messages.ts`**: `InitHintStrings`에 `referencePaths` 항목을 추가(ko/en)하고
  `buildInitHint`의 다음 단계 목록을 4개 → 5개로 늘린다. 안내 문구가 LLM 재량이 아니라
  테스트 가능한 코드에 산다.

## 테스트

- `tests/init/referencePaths.test.ts` 확장: 빈 하위 폴더만 있는 폴더 / 점 파일만 있는 폴더 /
  0바이트 파일 → `empty`, 중첩된 실제 파일 → `ok`.
- `tests/init/addReferencePath.test.ts` 신규: 템플릿 자동 생성, 주석 보존 append, 정규화,
  resolve 기준 중복 skip, 없는 경로도 기록.
- `tests/cli/reference.test.ts` 확장: `reference-add`의 응답 형태와 exit 0.
- `tests/i18n` 또는 기존 힌트 테스트: `buildInitHint`에 참고자료 경로 안내가 포함되는지.

## 범위 밖

- `paths.md`의 삭제/수정 명령(사용자가 파일을 직접 편집).
- 참고자료 **내용** 읽기 — 기존 doctrine대로 개념 정의/검증 시점 에이전트의 몫이다.
