# 현재 상황

> 매니저가 작업이 끝날 때마다 바뀐 절만 고친다. 통째로 다시 쓰지 않는다. 끝난 내용은 최근 완료에 한 줄만 남긴다.

갱신: 2026-11-18 16:04

## 진행 중 (형식: `롤 · 작업 · 등급 · 시도 n/최대 · 남은 실패 기준 · 기준이 적힌 곳(계획·설계 문서 경로)`)

- 공식 디렉터리 배포 준비 (develop 브랜치). 단계: 1 개념(concept-steward) → 2 게이트 문구·기본 locale(engine) → 3 스킬 영어화(skill-author) → 4 뷰어(viewer) → 5 배포 준비 → 6 릴리스 흐름 develop→main(release) → 7 레드팀·directory strict validate
- 지금: v1.19.0 push 완료(2026-11-11, develop·main·태그). 다음: 사용자가 claude.ai/directory/manage 포털 제출, Private vulnerability reporting 켜기

## 다음 할 일

- v1.21.0 push 완료(2026-11-18, develop·main·태그). plugin update로 설치판 반영 필요
- 단계마다 검증 통과 후 develop에 커밋. main 정리·릴리스는 마지막에 사용자 확인
- push는 사용자가 직접
- 사용자 확인: GitHub 저장소 설정에서 Private vulnerability reporting 켜기 (SECURITY.md가 의존)
- 결정 필요: CI matrix에 Node 20 추가 여부 (engines >=20인데 Node 20 실행 검증 없음)
- release 후속: Codex marketplace authentication ON_INSTALL 값 확인, Windows 검증
- skill-author 후속(선택): define.md 8줄 locale 문장에 "missing → ko" 추가, 영어 문장 자연스러움 사람 확인
- engine 후속: 사람이 보는 CLI·오류 문구 en/ko (src/cli.ts, src/concept/*, src/util/readJsonStrict.ts:27, src/init/ensureConfigDefaults.ts:39, src/init/packageScript.ts:56), ko 프로젝트 GATE FAILURE에 섞이는 영어 오류 2건(commitTree.ts:148, evidenceGate.ts:40), viewer render/manifest의 'ko' 폴백 점검

## 막힌 것

- 없음 (아이콘은 사용자가 준비한 logo.png로 해결. 아이콘은 포털에 처음 제출할 때 한 번만 반영됨)

## 롤 후보 (새 롤·분리·갱신 신호, 항목 앞에 [종류] 표시, 다시 쓸 때도 이어서 남김)

- 없음

## 점검할 결정 (중·상 일에서 매니저가 정한 결정. 형식: 날짜 · 작업 · 결정 · 이유 · 되돌리는 법. 점검이 끝나면 지우고, 다시 쓸 때도 이어서 남긴다. 10KB를 넘겨도 옮기거나 자르지 않는다)

- 2026-11-18 · 뷰어 링크 · 프로젝트 구별값은 실제 경로 sha256 앞 16자 · 경로를 노출하지 않음 · projectIdentity.ts 수정
- 2026-11-18 · 뷰어 링크 · 포트 4173~4192 · 서버를 유지하므로 범위 확대 · VIEWER_PORTS 수정
- 2026-11-18 · 뷰어 링크 · 뷰어 실패도 exit 0과 ok:false · 스킬이 이유를 알리고 글로 계속 · viewerLink.ts 수정
- 2026-11-18 · 뷰어 링크 · 종료는 프로젝트 id와 같은 출처 보호를 거친 로컬 요청으로 처리 · 응답의 pid를 믿지 않음 · /api/shutdown 수정
- 2026-11-18 · 뷰어 링크 · 링크 의무는 확정 질문에만 적용 · 수정 문구 승인은 제외 · update-concepts 절차 수정
- 2026-11-18 · 뷰어 비교 · 승인본 폴더를 `.alignment` 밖 `concepts/.approved`에 둠 · 정리 때 거버넌스 삭제 질문을 피함 · 경로 상수와 저장 함수 변경
- 2026-11-18 · 뷰어 비교 · 승인본은 커밋 대상이나 게이트로 강제하지 않음 · 빠져도 비교 불가 안내만 뜸 · 게이트 규칙 추가
- 2026-11-18 · 뷰어 비교 · pending→red 때 승인본 유지 · green이 되면 정리됨 · setConceptStatus 수정
- 2026-11-18 · 곁 목록 · 보이는 글자만 비교하고 별칭 제외 · 기존 동작 유지 · sidebar.js 수정
- 2026-11-18 · 뷰어 비교 · 목록 문장 수정 판정에 글자 2-gram 유사도 0.5 사용 · 미달은 삭제+추가로 안전하게 표시 · conceptDiff.js 상수 수정

## 최근 완료 (STATUS.md 전체 10KB 이하, 넘치면 오래된 것부터 archive/로)

- 2026-11-18 · concept-steward+viewer+engine+skill-author · 개념 확정 요청 시 뷰어 자동 실행·개념 링크, viewer-stop, 프로젝트 이름 띠, 새 개념 저장 승인 흐름 (검증 2회째 통과, 테스트 1927개 통과, 브라우저 확인, 커밋 전)
- 2026-11-18 · concept-steward+engine+viewer · 곁 목록 전체 개념 검색, pending 개념의 승인본 비교(추가·삭제·수정 음영), 승인본 저장, 개념 3개 사용자 확인 후 green 재정착 (독립 검증 통과, 테스트 1879개 통과, 브라우저 확인, develop 커밋, push 안 함)
- 2026-11-11 · release · 아이콘(.claude-plugin/icon.png) 추가, 첫 main 릴리스 v1.19.0 커밋·태그 (시도 1회, main 172개 파일, directory strict validate 통과, push는 사용자)
- 2026-11-11 · engine+release+manager · 레드팀 지적 수정: locale 폴백 단일화(readProjectLocale), 커밋 제목 정제, 릴리스 --resume·원상복구·main 뒤처짐 검사·--atomic·description 검사, README 링크·뷰어·PRIVACY 문서 (검증 19/21 → 문서 2건 매니저 수정)
- 2026-11-09 · redteam-reviewer · develop 변경분 레드팀 (지적 17건)
- 2026-11-09 · release+manager · 매니페스트 URL 필드, sourcemap 제거, Node>=20, 릴리스 흐름 develop→main(--yes 안전장치), CI, format, README·CHANGELOG·SECURITY·PRIVACY·CONTRIBUTING (검증: 문서 1건 실패 → manager 수정)
- 2026-11-09 · skill-author · 스킬 6개·references 14개 영어 원본 + .ko.md 번역본, skill-surface 개념 반영 (검증 통과 2회째)
- 2026-11-09 · viewer · 뷰어 locale 버그 수정(ko 프로젝트도 영어로 보이던 문제), 서버 안내 en/ko (검증 통과 1회)
- 2026-11-09 · engine · 게이트·훅 사람용 문구 en/ko, 새 init en·기존 ko 유지 (검증 통과 1회)
- 2026-11-09 · concept-steward · output-locale·skill-surface 개념 수정·재정착 (검증 통과 1회)
- 2026-11-09 · manager · 공식 디렉터리 배포 준비도 조사 (부족한 점 목록 작성)
- 2026-11-09 · manager · war-room 설치 (롤 6개: engine, viewer, skill-author, concept-steward, redteam-reviewer, release)
