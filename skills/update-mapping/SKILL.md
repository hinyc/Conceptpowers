---
name: conceptpowers-update-mapping
description: Use after modifying code to sync @concept tags and the mapping cache, or run manually to refresh concept↔code links in a Conceptpowers-active project.
---

# Conceptpowers: Update Mapping

`@concept` 태그(코드 측 진실)와 `mapping.json` 캐시를 동기화한다. (규칙 5, D6)

## 절차

1. 코드를 수정했다면 변경 파일에 적절한 `@concept:<slug>` 태그가 있는지 확인하고, 없으면 추가한다.
   - 태그는 관련 개념의 slug와 정확히 일치해야 한다(전역 고유).
2. 매핑 캐시를 재생성한다:
   `node "<cli>" map --root . <변경된 파일들...>`
   - 또는 전체 갱신이 필요하면 소스 전체를 인자로 넘긴다.
3. 정의되지 않은 개념을 가리키는 태그가 있으면(audit unknownTags), 개념을 정의(define-concept)하거나 태그를 고친다.

## 주의

- `mapping.json`은 **캐시**이며 baseline이 아니다. 진실은 코드의 `@concept` 태그다.
