# 현재 상황

> 매니저가 작업이 끝날 때마다 통째로 다시 쓴다. 지난 내용은 남기지 않는다.

갱신: 2026-11-09 18:41

## 진행 중

- 공식 디렉터리 배포 준비 (develop 브랜치). 단계: 1 개념(concept-steward) → 2 게이트 문구·기본 locale(engine) → 3 스킬 영어화(skill-author) → 4 뷰어(viewer) → 5 배포 준비 → 6 릴리스 흐름 develop→main(release) → 7 레드팀·directory strict validate
- 지금: 7단계 레드팀 점검 (redteam-reviewer) 준비
- 3단계 skill-author 완료 (603a9d7)

## 다음 할 일

- 단계마다 검증 통과 후 develop에 커밋. main 정리·릴리스는 마지막에 사용자 확인
- push는 사용자가 직접
- 사용자 확인: GitHub 저장소 설정에서 Private vulnerability reporting 켜기 (SECURITY.md가 의존)
- 결정 필요: CI matrix에 Node 20 추가 여부 (engines >=20인데 Node 20 실행 검증 없음)
- release 후속: Codex marketplace authentication ON_INSTALL 값 확인, Windows 검증
- skill-author 후속(선택): define.md 8줄 locale 문장에 "missing → ko" 추가, 영어 문장 자연스러움 사람 확인
- engine 후속: 사람이 보는 CLI·오류 문구 en/ko (src/cli.ts, src/concept/*, src/util/readJsonStrict.ts:27, src/init/ensureConfigDefaults.ts:39, src/init/packageScript.ts:56), ko 프로젝트 GATE FAILURE에 섞이는 영어 오류 2건(commitTree.ts:148, evidenceGate.ts:40), viewer render/manifest의 'ko' 폴백 점검

## 막힌 것

- 아이콘: 사용자가 직접 준비 (.claude-plugin/icon.png + plugin.json icon 필드). 그 전까지 directory strict validate는 아이콘 누락으로 실패

## 롤 후보 (롤 분리 신호, 다시 쓸 때도 이어서 남김)

- 없음

## 최근 완료 (최대 10개, 넘치면 archive/로)

- 2026-11-09 · release+manager · 매니페스트 URL 필드, sourcemap 제거, Node>=20, 릴리스 흐름 develop→main(--yes 안전장치), CI, format, README·CHANGELOG·SECURITY·PRIVACY·CONTRIBUTING (검증: 문서 1건 실패 → manager 수정)
- 2026-11-09 · skill-author · 스킬 6개·references 14개 영어 원본 + .ko.md 번역본, skill-surface 개념 반영 (검증 통과 2회째)
- 2026-11-09 · viewer · 뷰어 locale 버그 수정(ko 프로젝트도 영어로 보이던 문제), 서버 안내 en/ko (검증 통과 1회)
- 2026-11-09 · engine · 게이트·훅 사람용 문구 en/ko, 새 init en·기존 ko 유지 (검증 통과 1회)
- 2026-11-09 · concept-steward · output-locale·skill-surface 개념 수정·재정착 (검증 통과 1회)
- 2026-11-09 · manager · 공식 디렉터리 배포 준비도 조사 (부족한 점 목록 작성)
- 2026-11-09 · manager · war-room 설치 (롤 6개: engine, viewer, skill-author, concept-steward, redteam-reviewer, release)
