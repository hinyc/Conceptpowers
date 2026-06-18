---
name: conceptpowers-init
description: Use when the user wants to enable Conceptpowers governance on a project ("conceptpowers init", "개념 거버넌스 켜기", "concept 강제 활성화"). Scaffolds docs/conceptpowers and the activation marker.
---

# Conceptpowers: Init

이 프로젝트에 개념 기반 거버넌스를 **활성화**한다. (opt-in, D3/D15)

## 절차

1. 사용자에게 백필 모드를 확인한다 (기본 incremental):
   - **incremental**(기본): 스캐폴드+마커만. 누락 개념은 audit으로 점진 백필.
   - **strict**: 즉시 전체 백필 강제(레거시 큰 프로젝트는 부담 큼).
2. CLI로 스캐폴드한다 (CLI 경로는 세션 컨텍스트 `CONCEPTPOWERS-ACTIVE` 또는 플러그인 dist):
   `node "<cli>" init --root . --mode <incremental|strict>`
3. 생성 결과를 사용자에게 보고한다: `docs/conceptpowers/`의 5요소(init/features/concepts/architecture/infra).
4. **architecture.md / infra.md를 사용자가 채우도록 안내**한다(개념의 상위 기준).
5. strict 모드면 즉시 `conceptpowers-audit` 스킬을 이어서 실행한다.

## 주의

- `docs/conceptpowers/`는 이후 **읽기 전용 기준**이다. 수정은 update-baseline으로만.
- init.json이 이미 있으면 덮어쓰지 않는다(사용자 설정 보존).
