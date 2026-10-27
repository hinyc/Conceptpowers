# Review — ② 특정 개념 · ③ 전체 (references/whole.md)

This file is loaded by `conceptpowers:review` for modes ② and ③ only. Mode ① (pre-change check) never
reads it. The judgment rules, the concepts-only basis and the prohibitions stay in the skill's `SKILL.md`.

## ② 개념 → 파일

- `docs/conceptpowers/.cache/mapping.json`의 `slug → files` + 그 개념을 가리키는 feature의 `codePaths`
  (`docs/conceptpowers/features/**`). 디스크에 없는 경로는 건너뛴다.
- 파일이 많으면 규칙과 맞닿는 파일부터(허용·제한 행동이 바꾸는 관리 대상을 다루는 파일) 보고, 나머지는
  표본 검사한다고 사용자에게 밝힌다.

## ③ 전체

- `node "<cli>" audit --root .`로 매핑 무결성(`unknownTags`)을 먼저 확인하고, green 개념마다 ②를 돈다.
  red/pending 개념은 코드를 다스리지 않으므로 판정 대상이 아니다(목록만 보고).

## Report (②/③)

개념별로: 검사한 파일 수 / 위반 목록(파일·규칙·근거) / 판단 불가 목록(어느 규칙이 모호한지) / 표본 검사로
넘긴 파일. 권장 조치는 `SKILL.md` 판정표의 (a)/(b)/업그레이드 가운데 하나로 적는다. 기준선은 읽기 전용이므로 개념
생성·수정은 사용자 확인 뒤 `update-concepts`에서만 한다.
