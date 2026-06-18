---
name: conceptpowers-audit
description: Use when the user wants a full project audit ("conceptpowers audit", "개념 전수 점검", "구멍 찾기") in a Conceptpowers-active project. Finds concept-less code (gaps) and verifies existing @concept links.
---

# Conceptpowers: Audit (전체 감사)

수동 실행. 프로젝트 전체를 점검해 ① 미연결 구멍, ② 기존 연결 정합성을 본다. (D13)

## 절차

1. **정합성(결정론적)**: 소스 전체에 대해 CLI 감사를 실행한다:
   `node "<cli>" audit --root . <소스 파일들...>`
   - `unknownTags`(없는 개념을 가리키는 태그)를 리포트한다.
2. **미연결 구멍(의미 판단)**: 소스를 훑어 개념이 필요한데 `@concept` 태그가 없는
   기능·동작·역할·권한·용어를 찾는다. 각 항목에 대해:
   - 관련 개념이 이미 있으면 → 태그 추가 제안(update-mapping).
   - 개념이 없으면 → define-concept 제안.
3. **기존 연결 검증(의미 판단)**: 각 `@concept` 연결에 대해 코드가 개념의 allow/restrict/불변원칙을
   준수하는지 표본 검증한다(check-concept 재사용).
4. **리포트**: 구멍 목록 + 위반 목록 + 권장 조치를 사용자에게 제시한다.
   - baseline은 읽기 전용이므로 개념 생성/수정은 사용자 확인 후 진행한다.

## 백필 모드

- incremental: 구멍을 리포트만 하고 점진 백필을 권장.
- strict: 모든 구멍을 즉시 해소하도록 강제(init strict 또는 사용자 요청 시).
