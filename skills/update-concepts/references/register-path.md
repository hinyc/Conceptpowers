# Update Concepts — E. 참고자료 경로 등록 (references/register-path.md)

This file is loaded by `conceptpowers:update-concepts` for 계기 E. The common wrap-up (공통 마무리) and
prohibitions stay in the skill's `SKILL.md`.

1. 경로를 받는다(여러 개 가능). 저장소 밖은 절대 경로(홈 아래면 `~/…`), 안은 저장소 루트 기준 상대 경로.
   모호한 상대 경로는 등록 전에 형식을 사용자와 확정한다 — 항목은 적힌 그대로 저장되며, `paths.md`는 커밋되므로
   `/Users/<name>/…`은 그 기기에서만 풀리고, 저장소 안 경로는 작업 디렉터리가 아니라 저장소 루트 기준으로 풀린다.
2. `node "<cli>" reference-add "<path1>" "<path2>" --root .`
3. 결과 보고: `added` / `skipped`(duplicate·invalid) / `external[].status` — `missing`(경로 없음), `empty`(읽을
   자료 없음)은 경고한다. 없는 경로도 등록은 된다(미리 등록 허용) — 경고가 신호다. 경고가 있으면 고쳐질
   때까지 개념 작업이 그 자료 없이 진행됨을 알린다.
4. 등록은 추가만 한다 — 지우거나 고치는 것은 사용자가 `reference/paths.md`를 직접 편집한다. 자료 자체는
   저장소에 복사되지 않는다(경로만 공유).
5. 새 자료가 등록됐으니 참고자료 변경 반영(`references/reference-change.md`)으로 이어갈지 묻는다.
