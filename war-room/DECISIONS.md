# 결정 로그

> 되돌리기 어렵거나 나중에 "왜 이렇게 했지?"가 나올 결정만 적는다. 새 항목은 위에 추가한다. 지난 항목은 고치지 않고, 바뀌면 새 항목으로 뒤집는다.

<!-- 형식
## YYYY-MM-DD · 결정 제목
- 결정: 무엇으로 정했나
- 이유: 왜 (버린 대안 포함)
- 정한 사람: 사용자 | <롤 id> (사용자 승인)
- 영향: 관련 롤·파일
-->

## 2026-11-11 · main 허용 목록 보완 (2026-11-09 "main은 배포 전용" 결정에 추가)
- 결정: main 허용 목록에 PRIVACY.md · CONTRIBUTING.md · .gitignore를 더한다. 기준은 scripts/releaseSteps.mjs의 DEPLOY_ALLOWLIST다
- 이유: PRIVACY.md는 plugin.json privacyPolicyUrl이 main의 파일을 가리키고, CONTRIBUTING.md는 GitHub 저장소 첫 화면의 기여 안내로 쓰인다. 레드팀 #13에서 결정 로그와 코드가 어긋난 것이 드러남
- 정한 사람: release 롤 (2026-11-09 사용자 결정 범위 안), 매니저 기록
- 영향: release 롤, CONTRIBUTING.md

## 2026-11-09 · 기존 프로젝트는 locale이 비어 있으면 ko로 본다
- 결정: 새 init만 기본 en을 써 넣는다. 이미 초기화된 프로젝트의 init.json에 locale 값이 없으면 ko로 읽고 빈칸도 ko로 채운다
- 이유: 업데이트만으로 기존 사용자의 안내 언어가 소리 없이 바뀌지 않게 한다 (버린 대안: 전부 en + CHANGELOG 안내)
- 정한 사람: 사용자
- 영향: engine 롤 (src/schema/initConfig.ts, src/init/scaffold.ts)

## 2026-11-09 · main은 배포 전용, 개발은 develop
- 결정: main에는 배포 파일만 둔다(.claude-plugin · .codex-plugin · .agents · hooks · skills · dist(sourcemap 제외) · assets · src · README.md/README.ko.md · LICENSE · CHANGELOG · SECURITY · package.json). 테스트·기획 문서·war-room·이 저장소의 개념 데이터·CLAUDE.md는 develop에만 둔다. 릴리스는 develop에서 빌드해 허용 목록만 main에 커밋·태그한다. push는 사용자가 한다
- 이유: marketplace source "./"가 저장소 전체를 사용자 캐시에 복사해 개인·내부 문서가 배포되고, 디렉터리 심사의 파일 수·크기 기준에도 걸린다. src는 디렉터리 보안 스캔이 번들 대신 읽을 원본이라 main에 남긴다
- 정한 사람: 사용자
- 영향: release 롤, scripts/release*, plugin-version-sync 관련 개념

## 2026-11-09 · 영어 기본, 한국어는 번역본
- 결정: 사용자에게 보이는 문구·기본 locale·스킬 본문을 영어로 한다. 한국어는 locale ko로 계속 지원하고, 스킬 한국어판은 옆에 SKILL.ko.md(references도 *.ko.md)로 둔다. README.md/README.ko.md와 같은 방식
- 이유: 공식 디렉터리 사용자는 영어 사용자가 다수다
- 정한 사람: 사용자 (관련 개념 수정도 승인)
- 영향: engine · skill-author · viewer · concept-steward 롤

## 2026-11-09 · 훅·게이트와 엔진 코어를 engine 롤 하나로 합침
- 결정: 후보였던 hook-gate와 engine-core를 나누지 않고 engine 롤 하나로 둔다
- 이유: 최근 90일 동안 src/hooks를 고친 커밋 45개 중 25개가 엔진 코드도 함께 고쳤다. 나누면 한 일이 두 롤을 자주 오간다
- 정한 사람: 사용자 (매니저 제안 승인)
- 영향: roles/engine.md
