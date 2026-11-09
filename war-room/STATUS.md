# 현재 상황

> 매니저가 작업이 끝날 때마다 통째로 다시 쓴다. 지난 내용은 남기지 않는다.

갱신: 2026-11-09 17:46

## 진행 중

- 공식 디렉터리 배포 준비 (develop 브랜치). 단계: 1 개념(concept-steward) → 2 게이트 문구·기본 locale(engine) → 3 스킬 영어화(skill-author) → 4 뷰어(viewer) → 5 배포 준비 → 6 릴리스 흐름 develop→main(release) → 7 레드팀·directory strict validate
- 지금: 3단계 skill-author (스킬 영어화 + SKILL.ko.md) 준비

## 다음 할 일

- 단계마다 검증 통과 후 develop에 커밋. main 정리·릴리스는 마지막에 사용자 확인
- push는 사용자가 직접
- engine 후속: 사람이 보는 CLI·오류 문구 en/ko (src/cli.ts, src/concept/*, src/util/readJsonStrict.ts:27, src/init/ensureConfigDefaults.ts:39, src/init/packageScript.ts:56), ko 프로젝트 GATE FAILURE에 섞이는 영어 오류 2건(commitTree.ts:148, evidenceGate.ts:40), viewer render/manifest의 'ko' 폴백 점검

## 막힌 것

- 없음

## 롤 후보 (롤 분리 신호, 다시 쓸 때도 이어서 남김)

- 없음

## 최근 완료 (최대 10개, 넘치면 archive/로)

- 2026-11-09 · engine · 게이트·훅 사람용 문구 en/ko, 새 init en·기존 ko 유지 (검증 통과 1회)
- 2026-11-09 · concept-steward · output-locale·skill-surface 개념 수정·재정착 (검증 통과 1회)
- 2026-11-09 · manager · 공식 디렉터리 배포 준비도 조사 (부족한 점 목록 작성)
- 2026-11-09 · manager · war-room 설치 (롤 6개: engine, viewer, skill-author, concept-steward, redteam-reviewer, release)
