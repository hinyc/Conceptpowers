# Update Concepts — D. red 승인 · G. pending 재검사·정착 (references/settle.md)

This file is loaded by `conceptpowers:update-concepts` for 계기 D and G — the two status transitions that
change no concept body. The common wrap-up (공통 마무리) and prohibitions stay in the skill's `SKILL.md`.

## D. red 개념 승인 (red → green)

사람이 쓴 개념은 여기로 오지 않는다(pending → green은 정합성 검사 증빙과 사용자 확인으로 정착). 전수 스캔이 **자동 추론**한 🔴 red를
사용자가 검토하고 승인을 요청했을 때만:

1. `references/consistency.md`를 먼저 실행한다 — green이 red보다 우선하고, green↔green 충돌은 사용자에게 돌아간다.
   충돌이 남아 있으면 승인하지 않는다.
2. `node "<cli>" approve --root . <slug>` (품질 최소치 + 신선한 pass 증빙이 없으면 엔진이 거부한다).
   - 수동 대안(사용자가 직접 할 때만): JSON의 `status`를 `green`으로 고친 뒤 `node "<cli>" render --root .`, 충돌 기록이 있었으면
     `node "<cli>" resolve-conflict <slug> --root .`. **되돌리기(green → red)**는 같은 절차에 `status: red` —
     역시 사용자 요청 시에만. 에이전트가 Edit/Write로 개념 파일을 쓰면 편집 권한 확인이 뜬다(Bash로 쓰면 뜨지 않는다) — 어느 경우든 사용자가 승인한 변경일 때만 진행한다.
3. 결과를 보고한다: 이제 green이며, 밀려난 red 개념이 있으면 수정/재표시됐음을 함께 알린다. 승인은 **사용자
   요청이 있을 때만** — 내 변경을 통과시키려고 승인하지 않는다.

## G. pending 재검사·정착

🟡 pending 개념(사람이 쓴 초안 또는 고쳐진 개념)을 다시 검사해 정착시킨다. **본문은 손대지 않는다.**

1. `references/consistency.md`를 실행하고 `attest-consistency`로 증빙을 남긴다.
2. 통과 → `SKILL.md` 공통 마무리 2(사용자 확인 후 green). 충돌 → `note-conflict`로 사유를 남기고 pending에 둔 채
   사용자에게 수정/분리를 묻는다(그 수정은 `references/edit.md`).
