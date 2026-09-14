# Update Concepts — C. 사용자 요청으로 개념·기준 문서 수정 (references/edit.md)

This file is loaded by `conceptpowers:update-concepts` for 계기 C, and by 계기 A·F when an approved
sentence is applied. The common wrap-up (공통 마무리) and prohibitions stay in the skill's `SKILL.md`.

**사용자가 명시적으로 요청했을 때만** 실행한다 — 코드 작업 중 스스로 개념을 고치지 않는다.

1. 무엇을 고치는지 확인한다: 개념 / 기능 명세 / `architecture.md` / `infra.md`.
2. **개념을 고칠 때** — 고칠 문장을 사용자에게 보여 승인을 받은 뒤:
   - 바뀌는 항목만 담은 패치 JSON을 만든다(최상위 항목은 통째로 바뀐다 — 건드리는 절 전체를 넣는다).
   - 엔진으로 적용해 pending 강등과 사유 기록을 보장한다:
     `node "<cli>" edit-concept <slug> --file <patch.json> --reason "<왜 바뀌는지>" --root .`
     green이면 `pending`으로 내려가고(`"downgradedToPending": true`) 뷰어가 다시 그려진다.
   - **green을 유지하려고 JSON을 손으로 고치지 않는다.** `SKILL.md`의 공통 마무리(정합성 검사 → 증빙 → 사용자
     확인 후 green 재정착)를 거친다.
   - 개념이 바뀌면 코드 영향 범위(`@concept` 태그·feature `codePaths`)를 보고한다. 관련 코드도 바꿔야 하면
     같은 커밋에 넣고, 정말 코드 변경이 필요 없으면 사용자 확인 후 기록한다:
     `node "<cli>" attest-no-code <slug> --note "<why>" --root .`
   - **같은 커밋에서 그 개념의 테스트를 검토한다**(conceptDrivenTests): 새 규칙에서 시나리오를 다시 뽑아
     옛 규칙을 검증하던 테스트를 고쳐 함께 스테이징한다. 고칠 것이 없거나 테스트가 아직 없으면 사용자 확인 후
     기록한다:
     `node "<cli>" attest-test-review <slug> --result updated|no-impact|no-tests --tests <paths> --note "<why>" --root .`
     테스트는 개념 범위 안에 머문다 — 개념에 없는 검사가 필요하면 그것은 또 하나의 개념 수정이다.
3. **기능 명세·architecture·infra를 고칠 때** — 상위 기준이 하위 개념을 제약하므로, 이 변경이 어떤 개념을 함께
   바꿔야 하는지 사용자와 검토한다. 저장은 사용자 확인 뒤에만.
4. 요약을 보고하고 **수정된 개념이 지금 pending임을 다시 알린다** — 정합성 검사 통과 + 사용자 확인으로 green에
   재정착하기 전까지는 코드를 다스리지 않는다.
