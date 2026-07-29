# concept-driven-tests 옵션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** init.json의 boolean 옵션 `conceptDrivenTests`(기본 true)를 추가하고, 켜져 있으면 세션 시작 훅이 "테스트 작성 전 대상 코드의 개념에서 시나리오를 도출하라"는 규칙을 주입하며, check-concept 스킬에 해당 절차를 문서화한다.

**Architecture:** zod 스키마 기본값 → scaffold가 자동 직렬화 → sessionStart 훅이 조건부 규칙 줄 주입 → 스킬 문서가 절차를 구체화. 코드 변경은 2개 파일(schema, hook), 문서 변경 2개(SKILL.md, 이 저장소 init.json), 거버넌스 산출물 2개(개념·기능 JSON).

**Tech Stack:** TypeScript(ESM), zod, vitest.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-29-concept-driven-tests-design.md`가 원본. 문구는 스펙에서 그대로 복사한다.
- 필드명은 정확히 `conceptDrivenTests`, zod 정의는 `z.boolean().default(true)`.
- 훅 주입 조건은 정확히 `config?.conceptDrivenTests !== false` (필드 없음 = 켜짐).
- TDD 필수: 테스트 먼저(RED 확인) → 구현(GREEN) → 커밋. 테스트 러너: `pnpm vitest run <파일>`.
- 개념·스킬 문서는 쉬운 한국어(코드 용어 최소화), Rules 주입 문구는 기존 Rules와 같은 영문.
- 커밋 메시지는 conventional commit(`feat:`/`docs:`/`test:`), 어트리뷰션 푸터 없음.
- baseline(docs/conceptpowers) 수정은 이 계획에 명시된 파일만 (사용자가 기능 추가를 명시 승인함).

---

### Task 1: 거버넌스 — 개념·기능 정의

**Files:**
- Create: `docs/conceptpowers/concepts/data/governance/concept-driven-tests.json`
- Create: `docs/conceptpowers/features/governance/concept-driven-testing.json`

**Interfaces:**
- Produces: 개념 slug `concept-driven-tests` — Task 2·3의 `@concept` 태그와 Task 4의 스킬 문서가 이 slug를 참조.

- [ ] **Step 1: 개념 JSON 작성** (status는 `pending`으로 시작)

```json
{
  "slug": "concept-driven-tests",
  "group": "governance",
  "category": ["behavior"],
  "status": "pending",
  "title": "테스트도 개념에서 나온다",
  "eyebrow": "개념 기반 테스트",
  "description": {
    "definition": "검사 코드(테스트)를 새로 만들거나 고칠 때, 먼저 그 대상의 개념을 찾아 개념의 허용·금지·불변 규칙에서 검사 시나리오를 뽑는다. 이 동작은 시작 설정의 스위치로 끌 수 있으며, 스위치 값이 없으면 켜진 것으로 본다.",
    "analogy": "시험 문제를 낼 때 교과서(개념)에서 출제 범위를 잡는 것 — 교과서에 없는 문제를 임의로 내지 않는다.",
    "components": [
      "스위치: 시작 설정 파일의 참/거짓 값 하나, 기본은 켜짐",
      "안내 주입: 켜져 있으면 작업 시작 안내에 규칙 한 줄이 들어간다",
      "시나리오 도출: 개념의 허용·금지·불변 규칙 각각을 검사 항목으로 바꾼다",
      "출처 표기: 각 시나리오는 자신이 어느 규칙을 확인하는지 밝힌다"
    ],
    "example": "저장 기능의 테스트를 추가할 때, 먼저 저장을 다루는 개념을 찾아 '도중에 멈춰도 기록이 깨지지 않는다' 같은 규칙을 확인하고, 그 규칙을 검증하는 시나리오를 만든다."
  },
  "purpose": {
    "reason": "테스트는 동작을 담을 뿐 그 이유를 담지 않는다. 개념 없이 만든 테스트는 통과해도 규칙이 지켜졌다는 보장이 없으므로, 시나리오의 출처를 개념으로 고정해 테스트와 규칙을 잇는다.",
    "benefits": [
      "테스트가 무엇을 왜 검사하는지 개념으로 추적된다",
      "개념이 바뀌면 어떤 테스트를 다시 봐야 하는지 드러난다"
    ],
    "vision": "모든 검사 항목이 자신의 근거 규칙을 가리킨다.",
    "painPoints": [
      "테스트가 통과하는데도 정작 지켜야 할 규칙은 검증되지 않는 문제"
    ]
  },
  "actions": {
    "allow": [
      "스위치가 켜진 프로젝트에서 작업 시작 안내에 이 규칙 한 줄을 넣는 것",
      "스위치 값이 설정에 없을 때 켜진 것으로 취급하는 것",
      "설정에서 스위치를 거짓으로 바꿔 이 동작을 끄는 것"
    ],
    "restrict": [
      "스위치를 껐는데도 작업 시작 안내에 이 규칙을 넣는 것",
      "스위치가 켜져 있는데 대상의 개념을 확인하지 않고 테스트 시나리오를 임의로 정하는 것"
    ],
    "interaction": "코드 판정(check-concept)의 개념 찾기 절차를 그대로 재사용한다 — 태그, 색인, 표적 읽기 순. 개념이 없으면 개념 정의(define-concept)로 먼저 만든다."
  },
  "principle": {
    "immutableRules": [
      "스위치가 켜진 프로젝트에서 테스트를 새로 만들거나 고칠 때는 먼저 대상의 개념을 찾아 그 규칙에서 시나리오를 도출한다",
      "각 시나리오는 자신이 어느 규칙을 확인하는지 밝힌다",
      "스위치 값이 설정에 없으면 켜진 것으로 보고, 거짓으로 명시한 경우에만 끈다"
    ],
    "tradeoffs": "테스트 작성 전에 개념을 찾는 한 단계가 늘지만, 그 덕에 테스트가 규칙의 증거가 된다.",
    "lifecycle": []
  },
  "relations": {
    "prev": "",
    "next": "",
    "related": ["concept-code-mapping"]
  },
  "codeLinks": [
    "src/schema/initConfig.ts",
    "src/hooks/sessionStart.ts"
  ]
}
```

- [ ] **Step 2: 기능 JSON 작성**

```json
{
  "slug": "concept-driven-testing",
  "group": "governance",
  "title": "개념 기반 테스트 유도",
  "description": "설정이 켜진 프로젝트에서 테스트를 만들 때 대상의 개념을 먼저 찾아 규칙에서 시나리오를 뽑도록, 작업 시작 안내에 규칙을 넣는다.",
  "concepts": ["concept-driven-tests"],
  "codePaths": ["src/schema/initConfig.ts", "src/hooks/sessionStart.ts"]
}
```

- [ ] **Step 3: 일관성 검사 + 증빙 + green 승격**

기존 green 개념들과 비교(특히 `concept-code-mapping`, `settled-status`, `init-gate` — 충돌 없어야 정상). 충돌이 없으면:

```bash
node dist/cli.js attest-consistency concept-driven-tests --result pass --root .
```

이후 개념 JSON의 `status`를 `"green"`으로 수정하고 렌더:

```bash
node dist/cli.js render --root .
node dist/cli.js resolve-conflict concept-driven-tests --root . || true
```

- [ ] **Step 4: 커밋**

```bash
git add docs/conceptpowers
git commit -m "docs(concepts): concept-driven-tests 개념·기능 정의"
```

---

### Task 2: 스키마 — `conceptDrivenTests` 필드

**Files:**
- Modify: `src/schema/initConfig.ts` (InitConfigSchema 안, `versionCheck` 줄 아래)
- Test: `tests/schema/initConfig.test.ts`

**Interfaces:**
- Produces: `InitConfig.conceptDrivenTests: boolean` — Task 3의 훅이 `config?.conceptDrivenTests !== false`로 소비.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/schema/initConfig.test.ts` 끝에 추가

```typescript
describe('conceptDrivenTests', () => {
  const base = { version: '0.1.0', enabled: true } as const;
  it('누락 시 기본값 true', () => {
    expect(parseInitConfig({ ...base }).conceptDrivenTests).toBe(true);
  });
  it('false로 명시하면 false', () => {
    expect(parseInitConfig({ ...base, conceptDrivenTests: false }).conceptDrivenTests).toBe(false);
  });
  it('boolean이 아니면 거부한다', () => {
    expect(() => parseInitConfig({ ...base, conceptDrivenTests: 'yes' })).toThrow();
  });
});
```

- [ ] **Step 2: RED 확인**

Run: `pnpm vitest run tests/schema/initConfig.test.ts`
Expected: FAIL — `conceptDrivenTests`가 undefined (기본값 테스트 실패).

- [ ] **Step 3: 최소 구현** — `src/schema/initConfig.ts`의 `versionCheck: z.boolean().default(true),` 바로 아래에 추가

```typescript
  // 테스트 코드도 개념의 지배를 받는다 — 켜져 있으면(기본) 세션 시작 규칙에
  // "테스트 작성 전 대상 코드의 개념을 찾아 규칙 기반 시나리오를 도출하라"가 주입된다.
  conceptDrivenTests: z.boolean().default(true),
```

파일 상단에 태그 줄이 없다면 첫 줄에 추가: `// @concept:concept-driven-tests`

- [ ] **Step 4: GREEN 확인 + scaffold 자동 직렬화 검증**

Run: `pnpm vitest run tests/schema/initConfig.test.ts tests/init/scaffold.test.ts`
Expected: 모두 PASS. 이어서 `tests/init/scaffold.test.ts`에 새 init.json 기록 확인 테스트 추가:

```typescript
  it('새 init.json에 conceptDrivenTests: true를 기록한다', async () => {
    await scaffoldInit(root, {});
    const cfg = JSON.parse(
      readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8')
    );
    expect(cfg.conceptDrivenTests).toBe(true);
  });
```

(이 테스트는 스키마 구현 후 바로 통과하는 직렬화 확인 테스트다. scaffold.test.ts의 기존 import/`root` 셋업을 그대로 쓴다 — `readFileSync`·`join`이 이미 import돼 있는지 확인하고 없으면 추가.)

Run: `pnpm vitest run tests/init/scaffold.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/schema/initConfig.ts tests/schema/initConfig.test.ts tests/init/scaffold.test.ts
git commit -m "feat: init 설정에 conceptDrivenTests 옵션 추가 (기본 true)"
```

---

### Task 3: 훅 — 세션 시작 규칙 주입

**Files:**
- Modify: `src/hooks/sessionStart.ts` (`context` 배열 구성부, `redLine` 위쪽 Rules 영역)
- Test: `tests/hooks/sessionStart.test.ts`

**Interfaces:**
- Consumes: Task 2의 `InitConfig.conceptDrivenTests`.
- Produces: 없음 (말단 출력).

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/hooks/sessionStart.test.ts`의 `describe('buildSessionStartOutput', ...)` 안에 추가

```typescript
  it('conceptDrivenTests 기본(필드 없음)이면 테스트 개념 규칙을 주입한다', async () => {
    await scaffoldInit(root, {});
    // scaffold는 필드를 기록하지만, 구버전 init.json(필드 없음)도 같아야 한다
    const initPath = join(root, 'docs/conceptpowers/init.json');
    const cfg = JSON.parse(readFileSync(initPath, 'utf8'));
    delete cfg.conceptDrivenTests;
    writeFileSync(initPath, JSON.stringify(cfg, null, 2));
    const o = await buildSessionStartOutput(root, '/plugin');
    expect(o!.hookSpecificOutput.additionalContext).toContain('Test code is governed too');
  });
  it('conceptDrivenTests: true면 테스트 개념 규칙을 주입한다', async () => {
    await scaffoldInit(root, {});
    const o = await buildSessionStartOutput(root, '/plugin');
    expect(o!.hookSpecificOutput.additionalContext).toContain('Test code is governed too');
  });
  it('conceptDrivenTests: false면 테스트 개념 규칙이 없다', async () => {
    await scaffoldInit(root, {});
    const initPath = join(root, 'docs/conceptpowers/init.json');
    const cfg = JSON.parse(readFileSync(initPath, 'utf8'));
    writeFileSync(initPath, JSON.stringify({ ...cfg, conceptDrivenTests: false }, null, 2));
    const o = await buildSessionStartOutput(root, '/plugin');
    expect(o!.hookSpecificOutput.additionalContext).not.toContain('Test code is governed too');
  });
```

주의: 구버전 케이스(필드 삭제)는 zod 기본값 경로를 검증한다. `readInitConfig`가 파싱에 zod를 쓰므로 필드 없는 init.json도 유효해야 한다 — 이 테스트가 그 증거다.

- [ ] **Step 2: RED 확인**

Run: `pnpm vitest run tests/hooks/sessionStart.test.ts`
Expected: 새 테스트 3개 중 포함 기대 2개가 FAIL ("Test code is governed too" 미포함), 미포함 기대 1개는 PASS(아직 규칙이 없으므로). 이 비대칭이 올바른 RED다.

- [ ] **Step 3: 최소 구현** — `src/hooks/sessionStart.ts`

`const config = await readInitConfig(root);` 아래에 조건부 줄 정의:

```typescript
  // 테스트도 개념의 지배를 받는다(conceptDrivenTests) — false로 명시한 경우에만 끈다.
  const conceptTestsLine =
    config?.conceptDrivenTests !== false
      ? [
          '- Test code is governed too: before writing or modifying tests, locate the concept(s) for the code under test (@concept tag → manifest index) and derive the test scenarios from their actions.allow / actions.restrict / principle.immutableRules — each scenario should state which rule it verifies. If no concept exists, define it first (conceptpowers:define-concept).',
        ]
      : [];
```

`context` 배열에서 `redLine` 바로 위에 전개 삽입:

```typescript
    ...conceptTestsLine,
    redLine,
```

파일 첫 줄 태그를 확장: `// @concept:plugin-version-sync @concept:concept-driven-tests`

- [ ] **Step 4: GREEN 확인 + 전체 스위트**

Run: `pnpm vitest run tests/hooks/sessionStart.test.ts`
Expected: 전부 PASS.

Run: `pnpm vitest run`
Expected: 전체 PASS (기존 테스트 중 Rules 줄 수·순서에 의존하는 테스트가 있으면 여기서 잡힌다).

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/sessionStart.ts tests/hooks/sessionStart.test.ts
git commit -m "feat: conceptDrivenTests 켜짐 시 세션 시작에 테스트-개념 규칙 주입"
```

---

### Task 4: 문서 — 스킬 보강 + 이 저장소 설정 + 빌드

**Files:**
- Modify: `skills/check-concept/SKILL.md` (Steps 섹션 뒤, "## Prohibited" 앞)
- Modify: `docs/conceptpowers/init.json` (`versionCheck` 아래에 필드 추가)

**Interfaces:**
- Consumes: Task 1의 slug `concept-driven-tests`, Task 2의 필드명 `conceptDrivenTests`.

- [ ] **Step 1: SKILL.md에 섹션 추가** — "## Prohibited" 바로 앞에 삽입

```markdown
## Test scenarios from concepts (conceptDrivenTests)

When the purpose of the change is writing or modifying **tests** and `init.json` has
`conceptDrivenTests` enabled (missing field = enabled; only an explicit `false` disables it):

- Do not stop at the violation verdict — turn the located concept's rules into a scenario
  checklist: each entry in `actions.allow` / `actions.restrict` / `principle.immutableRules`
  maps to at least one test scenario where feasible, and each scenario names the rule it
  verifies.
- Concept lookup reuses step 1 as-is (tag → index → targeted read) — no extra scanning.
- If `conceptDrivenTests` is explicitly `false`, skip this section entirely.
```

- [ ] **Step 2: 이 저장소의 init.json에 필드 명시** — `docs/conceptpowers/init.json`의 `"versionCheck": true,` 아래에 추가

```json
  "conceptDrivenTests": true,
```

- [ ] **Step 3: 빌드 + 전체 테스트** (훅은 dist를 직접 실행하므로 빌드 필수)

```bash
pnpm build && pnpm vitest run
```

Expected: 빌드 성공, 전체 PASS.

- [ ] **Step 4: 커밋**

```bash
git add skills/check-concept/SKILL.md docs/conceptpowers/init.json dist
git commit -m "docs: check-concept 스킬에 개념 기반 테스트 시나리오 절차 추가"
```

(dist가 gitignore면 `git add dist`는 조용히 무시된다 — 저장소 정책 그대로 따른다.)
