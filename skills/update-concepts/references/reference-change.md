# Update Concepts — A. 참고자료 변경 반영 (references/reference-change.md)

This file is loaded by `conceptpowers:update-concepts` for 계기 A. The common wrap-up (공통 마무리) and
prohibitions stay in the skill's `SKILL.md`.

1. `reference-diff` 결과를 사용자에게 보고한다: 변경·삭제·추가 개수, `affected`(영향 개념 slug와 상태),
   `newMaterial`(새 개념 후보 자료), `unreachable`(이 기기에서 닿지 않는 등록 위치 — 삭제가 아니다).
   파일 이름은 사용자에게만 보이고, 내용은 발췌하지 않는다.
2. **영향 개념마다** `references/upgrade.md`를 따른다 — 그 개념의 근거(`sources`)에 적힌 참고자료 좌표를
   다시 읽고, 바뀐 자료와 현재 규칙이 어긋나는지 사용자와 함께 판단한다.
   - 어긋남 없음 → 그대로 둔다(근거 좌표만 낡았으면 `sources`만 고친다).
   - 어긋남 있음 → 고칠 문장을 사용자에게 제안하고, **승인 후** `references/edit.md`의 `edit-concept` 절차로 적용한다.
   - 자료가 삭제됐다면 그 근거를 빼거나 `decision`으로 바꾸자고 제안한다.
   - 참고자료가 **green 개념과 어긋나면 개념이 우선**이다 — 어느 문서의 어느 부분이 어느 규칙과 다른지
     보고하고 사람이 정할 때까지 개념을 고치지 않는다.
3. `newMaterial`이 있으면 `references/batch.md`의 후보 추출 규칙으로 그 자료에서 개념 후보를 뽑아 제안한다.
   사용자가 고른 것만 `references/new-concept.md`로 정의한다. 조용히 건너뛰지 않는다.
4. **기준점 기록**: 영향 개념을 모두 처리(갱신 또는 "그대로 둠")하거나 사용자가 명시적으로 보류한 뒤,
   사용자 확인을 받고 찍는다:
   ```
   node "<cli>" reference-snapshot --reviewed --root .
   ```
   `--reviewed`는 "영향 개념을 사람과 함께 다시 봤다"는 선언이다 — 검토 없이 붙이지 않는다.
   보류가 남았으면 찍지 않는다(다음 세션에 다시 알림이 온다). 결과의 `skipped`(읽지 못해 빠진 파일)와
   `mode`(`shared`/`local` — 기준점을 저장소에 올리는지)를 보고한다.
