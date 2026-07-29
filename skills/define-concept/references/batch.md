# Define Concept — Batch flow (전체 일괄 정의)

This file is loaded on demand when the user picks batch mode in
`conceptpowers:define-concept`. The single-flow steps, quality self-check, and status rules in
SKILL.md still apply to every concept defined here.

## Batch flow (전체 일괄 정의)

Human-owns-contract still applies: the AI drafts and asks; the user confirms. Batch reduces the
interaction to two checkpoints, not zero.

1. **Enumerate candidates** from ALL of these sources — do not skip any (a list built from only
   one source is incomplete):
   - **`reference/` documents**: glossary terms, domain rules, spec'd behaviors.
   - **UI surfaces in the code (필수)**: walk the nav menus, routes/pages, and every button /
     form submit / menu action — **each individual menu item and each action button gets its own
     candidate line** (예: "주문 취소 버튼" → 취소 정책 개념, "관리자 메뉴" → 관리자 권한 개념).
     **Never drop or merge a surface because it looks trivial** — a simple surface gets a simple
     concept (see "Simple UI concepts" below), and merging is the user's call at checkpoint 1,
     not the agent's. This mirrors the init-strict full scan's feature enumeration; screens and
     actions that never appear in reference docs still carry intent worth defining.
   - **Domain logic in the code**: validation rules, permission checks, state transitions,
     terms embedded in identifiers.
     Present the merged result as a numbered candidate list — one line each
     ("결제 불변성 — 결제 후 가격·수량 변경 금지", …) with the source marked
     (reference doc / UI surface / code logic).
2. **Scope confirmation (checkpoint 1)**: ask which candidates to proceed with. The choices
   **MUST include "전체 (define all candidates)" as the first option**, in addition to
   multi-selecting individual candidates — never force the user to tick every item one by one.
   Also allow adding candidates the list missed (free-form).
3. **Draft all selected**: write drafts for every selected candidate — plain language first,
   technical terms only as parenthetical aids — and present them **together** for review.
   Depth follows weight: domain concepts get the full treatment (definition, analogy,
   allow/restrict, immutable rules); **simple UI concepts may be short** (see below) — a brief
   definition plus one or two decidable rules is a complete draft, not a lazy one.
4. **Batch review (checkpoint 2)**: the user confirms / edits / drops each draft.
   - **Confirmed** drafts → continue with the single-flow steps 5-10 per concept (quality self-check
     already done in drafting; run consistency check across the whole batch at once, attest each,
     save as `green`).
   - Drafts the user wants to **keep but not review now** → save as `red` (unapproved), to be
     approved later via the `conceptpowers:update-baseline` approve flow.
   - Dropped drafts → do not save.
5. Wire each saved concept to a feature spec (single-flow step 1) and `@concept` tags, then
   regenerate the viewer once at the end: `node "<cli>" render --root .`

### Simple UI concepts (메뉴·버튼도 개념이다)

A nav menu item or an action button deserves a concept even when it looks trivial — its intent
("누가 보는가, 언제 눌리는가, 누르면 무엇이 보장되는가") is exactly what gets lost first.
Keep these concepts **short**:

- `description.definition`: one or two sentences — what this menu/button does for the user.
- Rules: **one decidable rule is enough** to clear the quality floor. Every UI surface has at
  least one — pick from: **노출 조건** ("관리자 메뉴는 관리자 권한이 있는 사용자에게만 보인다"),
  **활성 조건** ("주문 취소 버튼은 배송 시작 전 주문에서만 활성화된다"), or
  **동작 보장** ("저장 버튼을 누르면 유효성 검사를 통과한 값만 저장된다").
- Skip what doesn't apply (analogy, vision, lifecycle) — empty optional fields are fine.
- category is usually `feature` (+ `permission` if the rule is about who may see/use it).

Do not silently decide a surface is "not worth a concept" — offer it as a candidate and let the
user drop it at a checkpoint.
