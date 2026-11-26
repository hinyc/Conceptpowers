# 현재 상황

> 매니저가 작업이 끝날 때마다 바뀐 절만 고친다. 통째로 다시 쓰지 않는다. 끝난 내용은 최근 완료에 한 줄만 남긴다.

갱신: 2026-11-26

## 진행 중 (형식: `롤 · 작업 · 등급 · 시도 n/최대 · 남은 실패 기준 · 기준이 적힌 곳(계획·설계 문서 경로)`)

- release · v1.22.0 릴리스 (allowUntagged feat 46fdb5d 포함이라 minor, 수정 3e67fc0) · 상(정형) · 시도 2 (1회째 format:check 실패: README.md·README.ko.md·tests/audit/gaps.test.ts 서식, CHANGELOG 커밋 1361799까지 됨) · 남은 일: 서식 커밋 → release → 사용자 요청으로 push · 기준: war-room/roles/release.md. push는 사용자 확인

- 공식 디렉터리 배포 준비 (develop 브랜치). 단계: 1 개념(concept-steward) → 2 게이트 문구·기본 locale(engine) → 3 스킬 영어화(skill-author) → 4 뷰어(viewer) → 5 배포 준비 → 6 릴리스 흐름 develop→main(release) → 7 레드팀·directory strict validate
- 지금: v1.19.0 push 완료(2026-11-11, develop·main·태그). 다음: 사용자가 claude.ai/directory/manage 포털 제출, Private vulnerability reporting 켜기

## 다음 할 일

- engine 후속(선택): `src/hooks/gates/governanceFilesGate.ts:336` 편집 안내의 "(conceptDrivenTests is the concept-driven-tests switch)" 괄호가 USER_OWNED_SETTINGS 목록과 겹침 — 정리
- skill-author 후속(선택): init·scan 스킬의 "test-file rules do not change"를 "검사 파일은 허용이 켜져도 마커가 필요하다"처럼 직접적인 표현으로
- engine 후속(선택): `src/hooks/sessionStart.ts:104-107` 검사 파일 표식 안내가 conceptDrivenTests 켜짐일 때만 붙음. 게이트·감사는 스위치와 무관하게 표식 없는 검사 파일을 잡으므로 조건 맞출지 검토
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

- 2026-11-26 · allowUntagged · 검사 파일 판별은 testGlobs(비면 스키마 기본값), conceptDrivenTests와 무관하게 허용에서 제외 · 개념 불변 "허용과 무관하게 검사 파일은 개념을 가리켜야" · gaps.ts의 testGlobs 인자 제거
- 2026-11-26 · allowUntagged 참고 지적 · 게이트 사람용 ko/en 문구에는 "표식 생략 허용"만 넣고 검사 파일 예외 단서는 에이전트용 안내에만 둠 · 사람용 한 줄 문구가 길어지지 않게, 판정 에이전트 동의 · gateMessages.ts에 단서 추가
- 2026-11-26 · allowUntagged 참고 지적 · init·scan의 "test-file rules do not change"는 같은 문단에 예외가 있어 고치지 않음 · 뜻이 맞음, 판정 에이전트 동의 · 해당 문장 교체
- 2026-11-26 · allowUntagged · 허용이 켜져도 표식 없는 검사 파일은 게이트 "개념 없는 코드" 항목에도 나옴(꺼진 때와 동일) · 꺼진 때와 같게 다룬다는 규칙 · testScopeGate.test.ts 단정과 gaps.ts 조건 되돌리기

## 최근 완료 (STATUS.md 전체 10KB 이하, 넘치면 오래된 것부터 archive/로)

- 2026-11-26 · skill-author+engine+manager · allowUntagged 참고 지적 반영: redteam·scan 스킬·README에 검사 파일 예외, governanceFilesGate 안내에 allowUntagged·noConceptGlobs (상 병렬, 판정 3회: S1 실패 → scan 수정 → README ignoreGlobs 행 2줄 매니저 직접 수정 후 통과, 테스트 1959개·typecheck·build 통과)
- 2026-11-26 · concept-steward+engine+skill-author · @concept 표식 생략 허용 옵션(allowUntagged) (상, 시도 2/2 통과: 검사 파일은 허용에서 제외, 테스트 1957개 통과, typecheck·build 통과, develop 46fdb5d, .approved/ 제외, push 안 함)
- 2026-11-26 · manager · war-room 템플릿 4 → 8 반영 (하, 스크립트 검사 ✓, PLACES.md 생성, 사용자 문장 0줄)
- 2026-11-19 · release · v1.21.2 패치 릴리스 (정형, 문서만 바뀌어 별도 테스트·빌드 생략, 스크립트 검증 통과, develop 878dfc5, main 713edc6, 태그 v1.21.2, push 완료)
- 2026-11-19 · manager · v1.21.1 push 완료 (develop bf052f6, main 748c06f, 태그 v1.21.1, 사용자 요청으로 계정 전환 후 push, 플러그인 1.21.1 업데이트 확인)
- 2026-11-19 · manager · release 롤에 "직전 릴리스 이후 바뀐 파일로 별도 전체 테스트·빌드 여부 결정" 규칙 추가 (중, 검증 통과 1회, 결정 3개 점검 통과, 커밋 전)
- 2026-11-19 · release · v1.21.1 패치 릴리스 (정형, 문서만 바뀌어 별도 테스트·빌드 생략, 스크립트 검증 통과, develop 72a08e6·bf052f6, main 748c06f, 태그 v1.21.1, push 안 함)
- 2026-11-19 · manager · war-room 템플릿 3 → 4 반영, maxAttempts 1 (하 등급, 파일 1개, upgrade 검사 통과, 커밋 전)
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
