# Update Concepts — B. 새 개념 정의 (references/new-concept.md)

This file is loaded by `conceptpowers:update-concepts` for 계기 B. The common wrap-up (공통 마무리) and
prohibitions stay in the skill's `SKILL.md`.

- **실행 전 reference 확인(필수)**: `reference/`가 비어 있으면(파일 없음 + `paths.md` 항목 없음 — 존재 확인만)
  "reference/ 폴더가 비어 있습니다. 이대로 진행하면 코드·UI만 근거로 개념 후보를 뽑게 됩니다. 용어집·PRD·
  외부 명세가 있다면 지금 넣는 것이 정의 품질에 좋습니다." → ① 그냥 진행 ② 파일을 넣을 테니 잠시 중단
  ③ 바깥 경로 등록(`references/register-path.md`)을 묻는다. 조용히 건너뛰지 않는다.
- 사용자가 개념/주제를 **이미 말했으면** `references/define.md`의 단일 흐름.
- 말하지 않았으면 묻는다: ① 전체 일괄 정의(`references/batch.md`) ② 특정 개념 하나(단일 흐름).
- 저장 전 **중복 확인**과 **자격 관문**(define.md)을 반드시 거친다 — 목적이 같은 개념이 있으면 새로 세우지 않고
  그 개념을 `references/edit.md`로 넓힌다.
- 기능 명세(`features/`)가 없으면 함께 만든다(define.md step 1) — 개념은 기능이 가리켜야 지식 지도에 연결된다.
