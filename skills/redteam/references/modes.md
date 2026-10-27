# Redteam — 모드별 대상과 작업 목적 (references/modes.md)

This file is loaded by `conceptpowers:redteam` to collect the target files and the purpose of the work for
the chosen mode. The flow and the prohibitions stay in the skill's `SKILL.md`.

## ① 변경분

1. **기준점** — 사용자가 범위를 주면 그것을 쓴다. 아니면:
   - main이 아닌 브랜치: `git merge-base main HEAD`
   - main 위: 마지막 릴리스 태그 `git describe --tags --abbrev=0`
   - 태그가 없는 저장소의 main: 기준점을 정할 수 없다 — 어디서부터 볼지 사용자에게 묻는다.
2. **대상** — 기준점 이후 커밋이 바꾼 파일 + 커밋 안 된 변경(`git diff --name-only <기준점>`와
   `git status --porcelain`). 삭제된 파일은 대상에서 빼되, 그 파일을 부르던 쪽은 부작용 축에 넘긴다.
   `init.json`의 `ignoreGlobs`에 맞는 생성물은 뺀다.
3. **부르는 쪽** — 바뀐 파일이 내보내는 이름을 쓰는 파일을 찾아 부작용 축에만 넘긴다(다른 축의 대상은 아니다).
4. **대상이 비면** — "기준점 이후 바뀐 것이 없습니다"라고 알리고 ② 개념 하나나 ③ 전체를 제안한다. 빈
   대상으로 리뷰어를 띄우지 않는다.
5. **작업 목적** — 기준점 이후 커밋 메시지, 바뀐 파일을 `codePaths`로 가진 기능 명세(`features/**`), 사용자 설명.
   셋이 서로 다르면 1단계에서 그 차이를 보여 주고 사용자가 정하게 한다.

## ② 개념 하나

1. 대상은 `review`의 개념→파일 찾기와 같다: `docs/conceptpowers/.cache/mapping.json`의 slug → files와 그 개념을
   가리키는 기능 명세의 `codePaths`. 디스크에 없는 경로는 건너뛴다.
2. 개념이 green이 아니면(red/pending) 점검하지 않는다 — 코드를 다스리지 않는 개념이다. 정착부터 권한다
   (`conceptpowers:update-concepts`).
3. 작업 목적은 그 개념의 `purpose`다.

## ③ 전체

1. 대상은 모든 green 개념의 파일(② 반복) + `@concept:none`·개념 없음 영역(`noConceptGlobs`)의 파일.
2. 시작 전에 규모(개념 수·파일 수)를 알린다. 파일이 많으면 규칙과 맞닿는 파일부터 보고 나머지는 표본 검사한다고
   밝힌다 — 표본으로 넘긴 파일은 보고서에 남긴다.
3. 중복 축은 이 모드에서 개념 경계를 넘어 본다(서로 다른 개념의 파일끼리 같은 일을 하는지).
4. 작업 목적은 개념마다 그 `purpose`, `none` 코드는 그 코드의 쓰임새(부르는 쪽).
