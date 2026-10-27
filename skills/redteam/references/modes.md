# Redteam — 모드별 대상과 작업 목적 (references/modes.md)

This file is loaded by `conceptpowers:redteam` to collect the target files and the purpose of the work for
the chosen mode. The flow and the prohibitions stay in the skill's `SKILL.md`.

## ① 변경분

1. **기본 브랜치** — `main`으로 가정하지 않는다. `git symbolic-ref --short refs/remotes/origin/HEAD`로 알아내고
   (`origin/` 접두어는 뗀다), 알아내지 못하면 사용자에게 묻는다. 아래 `<기본>`이 그 이름이다.
2. **기준점** — 사용자가 범위를 주면 그것을 쓴다. 아니면:
   - `<기본>`이 아닌 브랜치: `git merge-base <기본> HEAD`
   - `<기본>` 위: 마지막 릴리스 태그 `git describe --tags --abbrev=0`
   - 태그가 없는 저장소의 `<기본>` 위: 기준점을 정할 수 없다 — 어디서부터 볼지 사용자에게 묻는다.
   - 정한 기준점(커밋)과 대상 파일 수는 1단계 확인 때 함께 보여 준다.
3. **대상** — 기준점 이후 커밋이 바꾼 파일 + 커밋 안 된 변경(`git diff --name-only <기준점>`와
   `git status --porcelain`). 삭제된 파일은 대상에서 빼되, 그 파일을 부르던 쪽은 부작용 축에 넘긴다.
   `init.json`의 `ignoreGlobs`에 맞는 생성물은 뺀다.
4. **부르는 쪽** — 바뀐 파일이 내보내는 이름을 쓰는 파일을 찾아 부작용 축에만 넘긴다(다른 축의 대상은 아니다).
5. **대상이 비면** — "기준점 이후 바뀐 것이 없습니다"라고 알리고 ② 개념 하나나 ③ 전체를 제안한다. 빈
   대상으로 리뷰어를 띄우지 않는다.
6. **작업 목적** — 기준점 이후 커밋 메시지, 바뀐 파일을 `codePaths`로 가진 기능 명세(`features/**`), 사용자 설명.
   셋이 서로 다르면 1단계에서 그 차이를 보여 주고 사용자가 정하게 한다.

## ② 개념 하나

1. 대상은 `conceptpowers:review`의 「② 개념 → 파일」 찾기 그대로 모은다 — 여기서 다시 정의하지 않는다.
2. 개념이 green이 아니면(red/pending) 점검하지 않는다 — 코드를 다스리지 않는 개념이다. 정착부터 권한다
   (`conceptpowers:update-concepts`).
3. 작업 목적은 그 개념의 `purpose`다.

## ③ 전체

1. 개념 쪽 대상과 표본 검사 규칙은 `conceptpowers:review`의 「③ 전체」 수집 그대로다. 여기에 redteam만의 대상으로
   `@concept:none`·개념 없음 영역(`noConceptGlobs`)의 파일을 더한다.
2. 시작 전에 규모(개념 수·파일 수)를 알리고, 표본으로 넘긴 파일은 보고서에 남긴다.
3. 중복 축은 이 모드에서 개념 경계를 넘어 본다(서로 다른 개념의 파일끼리 같은 일을 하는지).
4. 작업 목적은 개념마다 그 `purpose`, `none` 코드는 그 코드의 쓰임새(부르는 쪽).
