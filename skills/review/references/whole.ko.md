> 이 문서는 `references/whole.md`의 한국어 번역본이다. 도구는 영어 원본을 따른다. 어긋나면 원본이 맞다.

# Review — ② 특정 개념 · ③ 전체 (references/whole.md)

이 파일은 `conceptpowers:review`가 모드 ②와 ③에서만 읽는다. 모드 ①(변경 전 검사)은 읽지 않는다. 판정 규칙,
개념만을 근거로 삼는 원칙, 금지 사항은 스킬의 `SKILL.md`에 있다.

## ② 개념 → 파일

- `docs/conceptpowers/.cache/mapping.json`의 `slug → files` + 그 개념을 가리키는 feature의 `codePaths`
  (`docs/conceptpowers/features/**`). 디스크에 없는 경로는 건너뛴다.
- 파일이 많으면 규칙과 맞닿는 파일부터(허용·제한 행동이 바꾸는 관리 대상을 다루는 파일) 보고, 나머지는
  표본 검사한다고 사용자에게 밝힌다.

## ③ 전체

- `node "<cli>" audit --root .`로 매핑 무결성(`unknownTags`, 같은 이름표 개념 파일이 둘 이상인 `duplicateSlugs`)을
  먼저 확인하고, green 개념마다 ②를 돈다. `duplicateSlugs`가 있으면 그 개념은 어느 파일이 기준인지 정할 수 없으니
  판정을 미루고 보고해, 사용자 확인 아래 `update-concepts`로 하나만 남게 정리하게 한다.
  red/pending 개념은 코드를 다스리지 않으므로 판정 대상이 아니다(목록만 보고).

## 보고 (②/③)

개념별로: 검사한 파일 수 / 위반 목록(파일·규칙·근거) / 판단 불가 목록(어느 규칙이 모호한지) / 표본 검사로
넘긴 파일. 권장 조치는 `SKILL.md` 판정 절의 (a)/(b)/업그레이드 가운데 하나로 적는다. 기준선은 읽기 전용이므로 개념
생성·수정은 사용자 확인 뒤 `update-concepts`에서만 한다.
