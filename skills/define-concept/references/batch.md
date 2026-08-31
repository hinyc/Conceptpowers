# Define Concept — Batch flow (전체 일괄 정의)

This file is loaded on demand when the user picks batch mode in
`conceptpowers:define-concept`. The single-flow steps, quality self-check, and status rules in
SKILL.md still apply to every concept defined here.

## Batch flow (전체 일괄 정의)

Human-owns-contract still applies: the AI drafts and asks; the user confirms. Batch reduces the
interaction to two checkpoints, not zero.

**자격 기준 관문도 그대로 적용된다** (SKILL.md의 「자격 기준 관문」 절, 개념 `concept-scope`).
일괄 정의는 **후보를 많이 모으는 것**이지 후보를 전부 개념으로 만드는 것이 아니다 — 관문을
통과하지 못한 후보는 기능 명세나 상위 기준 문서로 내려가고, 그 판정은 checkpoint 1에서
사용자가 확인한다.

1. **Enumerate candidates** from ALL of these sources — do not skip any (a list built from only
   one source is incomplete):
   - **`reference/` documents**: glossary terms, domain rules, spec'd behaviors.
   - **UI surfaces in the code (필수)**: walk the nav menus, routes/pages, and every button /
     form submit / menu action. 화면 접점은 **빠짐없이 훑되**, 접점 하나가 곧 개념 하나가 되지는
     않는다 — 접점에서 **그 접점이 사용자에게 하는 약속**을 뽑아 후보로 올린다
     (예: "주문 취소 버튼" → *취소 가능 시점*이라는 약속, "관리자 메뉴" → *권한별 노출*이라는 약속).
     여러 접점이 같은 약속을 실현하면 **후보 한 줄로 묶는다** — 그것이 자격 기준의 "목적이 같으면
     새로 만들지 않고 넓힌다"이다. 약속이 안 나오고 생김새·배치·글자 표기만 남는 접점은
     개념 후보가 아니라 **기능 명세** 후보로 표시한다. This mirrors the init-strict full scan's
     feature enumeration; screens and actions that never appear in reference docs still carry
     intent worth surfacing — 다만 그 intent가 약속인지 방법인지는 관문이 가른다.
   - **Domain logic in the code**: validation rules, permission checks, state transitions,
     terms embedded in identifiers.
     Present the merged result as a numbered candidate list — one line each
     ("결제 불변성 — 결제 후 가격·수량 변경 금지", …) with the source marked
     (reference doc / UI surface / code logic).
2. **자격 기준 관문 일괄 적용**: 모은 후보를 SKILL.md의 「자격 기준 관문」 여섯 물음에 차례로
   걸어, 각 후보를 **개념 후보 / 기능 명세 / 상위 기준 문서 / 기존 개념으로 흡수** 중 하나로
   분류한다. 목적이 같은 후보끼리는 이 단계에서 한 줄로 합친다. 판정과 근거(어느 물음에서
   막혔는지)를 후보 줄에 적어 둔다 — 조용히 지우지 않는다.
3. **Scope confirmation (checkpoint 1)**: ask which candidates to proceed with. **관문을 통과한
   개념 후보와 탈락 후보(어디로 내려가는지 포함)를 함께 보여주고**, 판정을 사용자가 뒤집을 수
   있게 한다 — 경계에 걸친 것은 사람이 정한다. The choices
   **MUST include "전체 (define all candidates)" as the first option**, in addition to
   multi-selecting individual candidates — never force the user to tick every item one by one.
   Also allow adding candidates the list missed (free-form).
4. **Draft all selected**: write drafts for every selected candidate — plain language first,
   technical terms only as parenthetical aids — and present them **together** for review.
   Depth follows weight: 약속이 넓은 개념은 definition·analogy·allow/restrict·immutable rules를
   모두 채우고, 약속이 좁은 개념은 짧아도 된다 (see below) — a brief definition plus one or two
   decidable rules is a complete draft, not a lazy one.
5. **Batch review (checkpoint 2)**: the user confirms / edits / drops each draft.
   - **Confirmed** drafts → continue with the single-flow steps 5-10 per concept (quality self-check
     already done in drafting; run consistency check across the whole batch at once, attest each,
     then promote to `green`).
   - Drafts the user wants to **keep but not review now** → keep them `pending` (사람이 쓴 초안은
     노랑으로 태어난다 — 개념 `settled-status`). `red`는 전수 스캔이 **자동 추론**한 제안 전용이니
     사람이 쓴 초안에 붙이지 않는다. 정합성 검사를 통과하고 사용자가 확인하면 그때 green으로
     정착시킨다.
   - Dropped drafts → do not save.
6. Wire each saved concept to a feature spec (single-flow step 1) and `@concept` tags, then
   regenerate the viewer once at the end: `node "<cli>" render --root .`
   관문에서 **기능 명세로 내려간 후보**도 이때 함께 기록한다 (`conceptpowers:define-feature`) —
   개념이 되지 못했다고 지식 지도에서 사라지면 안 된다. **상위 기준 문서로 내려간 후보**는
   `architecture.md` / `infra.md`에 한 줄로 남기자고 사용자에게 제안한다(기준선 수정이므로
   저장은 `conceptpowers:update-baseline`으로, 사용자 승인 아래에서만).

### 화면 접점에서 나온 개념 (짧아도 되지만, 약속이어야 한다)

화면 접점에서 뽑은 개념은 **짧아도 완전할 수 있다**. 다만 짧다는 것과 접점 하나마다 하나씩
만든다는 것은 다르다 — 개념이 되는 것은 버튼이 아니라 **그 버튼이 지키는 약속**이다.

- 통과 예: "관리자 메뉴는 관리자 권한이 있는 사용자에게만 보인다" → *권한별 노출*이라는 약속.
  같은 약속을 지키는 다른 메뉴·버튼이 열 개여도 개념은 하나다.
- 통과 예: "주문 취소 버튼은 배송 시작 전 주문에서만 활성화된다" → *취소 가능 시점*이라는 약속.
- 탈락 예: "취소 버튼은 오른쪽 아래에 회색으로 놓는다" → 생김새·배치라 상위 기준 문서로.
- 탈락 예: "메뉴 목록은 한 번 읽어 캐시해 둔다" → 약속을 지키는 방법이라 상위 기준 문서로.

통과한 개념을 적을 때:

- `description.definition`: 한두 문장 — 이 약속이 사용자에게 무엇을 보장하는가.
- 규칙: **판별 가능한 한 줄이면 품질 최소치를 넘긴다** — 노출 조건 / 활성 조건 / 동작 보장 중 하나.
- 안 맞는 칸(analogy, vision, lifecycle)은 비워 둔다 — 선택 항목이 비는 것은 정상이다.
- category는 보통 `feature` (+ 누가 보고 쓸 수 있는지에 대한 규칙이면 `permission`).

접점을 조용히 흘려보내지 않는다 — 개념이 안 되면 **어디로 갔는지**(기능 명세 / 상위 기준 문서 /
기존 개념으로 흡수) 후보 줄에 남기고 checkpoint에서 사용자가 확인하게 한다.
