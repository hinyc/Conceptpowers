# 개념 근거(provenance) 도입 — 1차 커밋 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개념 스키마에 `sources`(코드 자리·참고자료 좌표·사람의 결정) 필드를 추가하고, 뷰어에서
읽고 고칠 수 있게 하며, `define-concept` 스킬이 이를 채우도록 개정한다. 품질 결격 검사(초록 승격
차단)와 기존 24개 개념의 백필은 이 계획에 **포함하지 않는다** — 별도 2차 계획.

**Architecture:** `codeLinks`와 나란히 두는 새 배열 필드 하나. 계약 해시(`contractHash`)에는
넣지 않아 기존 개념들과 drift를 일으키지 않는다. 뷰어 상세 화면은 매니페스트가 아니라 개념 원본
JSON을 직접 fetch하므로(`assets/viewer.js`의 `state.current`), 스키마에 필드를 추가하면 뷰어
읽기 경로에 별도 배선 없이 자동으로 실린다 — `src/viewer/manifest.ts`는 이 계획에서 건드리지
않는다.

**Tech Stack:** TypeScript(ESM) + zod(스키마) + vitest(테스트) + 의존성 0의 바닐라 JS 뷰어
(`assets/viewer.js`, Node `vm` 샌드박스로 테스트).

**Spec:** `docs/superpowers/specs/2026-09-12-concept-provenance-design.md`

## Global Constraints

- **커밋 정책**: 사용자가 subagent-driven-development 실행 방식을 명시적으로 선택했고, 그
  워크플로우는 태스크마다 커밋 → 리뷰 패키지(diff) → 리뷰 순으로 동작한다. 이 선택 자체가
  태스크별 **로컬** 커밋에 대한 승인이다 — 각 태스크는 끝에서 `git add` + `git commit`까지
  수행한다(커밋 메시지 형식은 `<타입>: <설명>`, 이 저장소 관례). **`git push`는 별도다** — 이
  계획 실행 중에는 push하지 않는다. push는 사용자가 별도로 명시 요청했을 때만, 아래 "git 계정"
  절차를 밟아 진행한다.
- **git 계정**: 이 저장소 CLAUDE.md 규칙 — 실제 커밋/푸시를 실행하게 되면 `gh auth switch --user
  hinyc` 후 진행하고, 끝나면 `gh auth switch --user inyeol-hong`로 복구한다. 로컬 `git commit`
  자체는 이미 `user.name=hinyc`로 설정되어 있어 별도 조치가 필요 없다 — 이 규칙은 push에 한한다.
- **테스트 커맨드**: `pnpm test`(vitest run), `pnpm test:coverage`(coverage 포함), `pnpm
  typecheck`(tsc --noEmit). 커버리지 게이트는 `src/**`만 대상이다(`vitest.config.ts`) —
  `assets/viewer.js`는 커버리지 수치에 잡히지 않지만, 기존 관례대로 순수 함수는 여전히 단위
  테스트한다.
- **테스트 파일 헤더 규칙(이 저장소 전용)**: 모든 새/수정 테스트 파일은 첫 줄에 `@concept:<slug>`
  태그, 그다음 "검증 대상 규칙 ↔ 시나리오" 매핑 주석을 둔다(기존 테스트 파일 참고). 아래 각
  태스크의 테스트 코드에 이 헤더를 정확히 포함시켰다 — 그대로 옮겨 쓴다.
- **코딩 스타일**: 불변 갱신(스프레드로 새 객체), 얕은 중첩, 주석은 WHY만. `src/schema/concept.ts`,
  `src/store/conceptStore.ts`는 이미 각각 여러 개념을 함께 다루는 "조합 자리" 파일이다 — 새
  태그(`@concept:concept-provenance`)를 기존 태그 목록에 이어 붙인다(별도 분리 검토 불필요,
  기존 패턴과 동일).
- **범위 밖(중요)**: `src/viewer/manifest.ts`, `src/viewer/graph.ts`, `src/store/conceptStore.ts`의
  강등(green→pending) 로직, `src/viewer/serve.ts`, `src/concept/quality.ts`는 이 계획에서
  **손대지 않는다**. (`quality.ts`는 2차 계획에서 근거 결격 검사를 추가할 때 수정한다.)

---

### Task 1: 스키마에 `sources` 필드 추가

**Files:**
- Modify: `src/schema/concept.ts:1` (태그 목록), `src/schema/concept.ts:72` (필드 추가 위치)
- Modify: `tests/schema/concept.test.ts`
- Modify: `tests/drift/hash.test.ts` (계약 해시 제외 회귀 테스트 1건 추가)

**Interfaces:**
- Consumes: 없음(최하위 계층).
- Produces: `ConceptSource`(zod 스키마·타입), `ConceptSourceKind`(zod enum·타입) —
  Task 2·3이 `Concept['sources']: ConceptSource[]`를 그대로 사용한다. 각 항목의 필드는
  `{ kind: 'code' | 'reference' | 'decision', path: string, locator: string, supports: string }`.

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

  `tests/schema/concept.test.ts`의 `describe('ConceptSchema', ...)` 블록 끝(마지막 `it` 다음,
  `});` 직전)에 아래를 추가한다. 파일 맨 위 주석 헤더(`@concept:...` 줄과 "검증 대상 규칙 ↔
  시나리오" 목록)에도 아래 줄을 이어 붙인다:

  헤더에 추가할 태그: `@concept:concept-provenance` (기존 `@concept:globally-unique-slug
  @concept:settled-status` 뒤에 이어 붙임 → `// @concept:globally-unique-slug
  @concept:settled-status @concept:concept-provenance`)

  헤더 주석 목록에 추가할 줄(기존 항목들 뒤, `import` 문 앞):
  ```
  //  - concept-provenance 불변 "모든 개념은 근거를 하나 이상 밝힌다"
  //    → sources 기본값은 빈 배열(옛 개념 본문도 그대로 읽힌다)
  //  - concept-provenance 구성요소 "코드 자리 / 참고자료 좌표 / 사람의 결정"
  //    → kind가 code/reference/decision 셋 중 하나가 아니면 거부한다
  //  - concept-provenance 구성요소 "사람의 결정: 코드에도 참고자료에도 없이 사람이 판단해
  //    정했다는 기록" → decision은 path 없이도 허용되지만 supports는 필수다
  //  - concept-provenance 정의 "코드 자리·참고자료 좌표"는 path로 가리킨다
  //    → code/reference는 path가 비면 거부한다
  ```

  테스트 코드(파일 끝, `describe('ConceptSchema', () => { ... });` 블록 안 마지막에 추가):
  ```typescript
  it('sources 기본값은 빈 배열이다(옛 개념 본문도 그대로 읽힌다)', () => {
    expect(parseConcept(valid).sources).toEqual([]);
  });
  it('code/reference/decision 근거를 받는다', () => {
    const c = parseConcept({
      ...valid,
      sources: [
        { kind: 'code', path: 'src/drift/hash.ts', locator: 'contractHash()', supports: '계약 필드만 해시한다' },
        { kind: 'reference', path: 'concept-centric-software-design.md', locator: 'p.12', supports: '개념은 혼자 서야 한다' },
        { kind: 'decision', locator: '2026-09-12 설계', supports: '위조 방지 출구가 필요하다' },
      ],
    });
    expect(c.sources).toHaveLength(3);
    expect(c.sources[2].kind).toBe('decision');
    expect(c.sources[2].path).toBe(''); // 기본값
  });
  it('알 수 없는 kind 값을 거부한다', () => {
    expect(() =>
      parseConcept({ ...valid, sources: [{ kind: 'guess', path: 'x', supports: 'y' }] })
    ).toThrow();
  });
  it('code/reference 근거는 path가 비면 거부한다', () => {
    expect(() =>
      parseConcept({ ...valid, sources: [{ kind: 'code', path: '', supports: 'x' }] })
    ).toThrow();
    expect(() =>
      parseConcept({ ...valid, sources: [{ kind: 'reference', path: '  ', supports: 'x' }] })
    ).toThrow();
  });
  it('decision 근거는 supports가 비면 거부한다', () => {
    expect(() =>
      parseConcept({ ...valid, sources: [{ kind: 'decision', locator: 'today' }] })
    ).toThrow();
  });
  it('decision 근거는 path 없이 허용된다', () => {
    expect(() =>
      parseConcept({ ...valid, sources: [{ kind: 'decision', locator: 'today', supports: '사람이 정함' }] })
    ).not.toThrow();
  });
  ```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

  Run: `pnpm test tests/schema/concept.test.ts`
  Expected: 방금 추가한 6개 테스트 모두 FAIL — `sources` 필드가 스키마에 없어 zod가 조용히
  걸러내므로 `parseConcept(...).sources`는 `undefined`이고, 잘못된 값을 거부하는 테스트들은
  애초에 거부할 필드 자체가 없어 throw하지 않아 실패한다.

- [ ] **Step 3: 스키마에 `ConceptSource` 추가 — 최소 구현**

  `src/schema/concept.ts:1`의 첫 줄을 다음으로 교체:
  ```typescript
  // @concept:globally-unique-slug @concept:viewer-readability @concept:concept-scope @concept:concept-provenance
  ```

  `export const ConceptStatus = ...` 블록 다음(대략 17번째 줄, `export const ConceptSchema = z.object({` 앞)에 추가:
  ```typescript
  // 개념이 어디서 왔는지 밝히는 근거 하나(concept-provenance). code/reference는 path로
  // 코드 자리·참고자료 좌표를 가리키고, decision은 path 없이 사람의 판단만으로 성립한다.
  export const ConceptSourceKind = z.enum(['code', 'reference', 'decision']);
  export type ConceptSourceKind = z.infer<typeof ConceptSourceKind>;

  export const ConceptSource = z
    .object({
      kind: ConceptSourceKind,
      path: z.string().default(''),
      locator: z.string().default(''),
      supports: z.string().default(''),
    })
    .refine((s) => s.kind === 'decision' || s.path.trim() !== '', {
      message: 'code/reference source requires a non-empty path',
    })
    .refine((s) => s.kind !== 'decision' || s.supports.trim() !== '', {
      message: 'decision source requires a non-empty supports',
    });
  export type ConceptSource = z.infer<typeof ConceptSource>;
  ```

  `codeLinks: z.array(z.string()).default([]),` 줄(현재 72번째 줄) 바로 다음에 추가:
  ```typescript
    sources: z.array(ConceptSource).default([]),
  ```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

  Run: `pnpm test tests/schema/concept.test.ts`
  Expected: 전체 PASS.

- [ ] **Step 5: 계약 해시 제외 회귀 테스트 추가 (RED 없이 바로 GREEN — 의도적 잠금 테스트)**

  `tests/drift/hash.test.ts`의 헤더 주석(파일 맨 위, "검증 대상 규칙 ↔ 시나리오" 목록)에 아래
  줄을 "비계약 필드(title/status/analogy)가 바뀌어도 해시는 불변" 항목 다음에 추가:
  ```
  //    → 비계약 필드(sources)가 바뀌어도 해시는 불변 — concept-provenance는 계약 밖 메타다
  ```

  `describe('contractHash', () => { ... });` 블록 안, `'비계약 필드(title/status/analogy)가
  바뀌어도 해시는 불변'` 테스트 바로 다음에 추가:
  ```typescript
  it('비계약 필드(sources)가 바뀌어도 해시는 불변 — concept-provenance는 계약 밖 메타다', () => {
    const a = contractHash(parseConcept(base));
    const b = contractHash(
      parseConcept({
        ...base,
        sources: [{ kind: 'decision', locator: '오늘', supports: '테스트' }],
      })
    );
    expect(a).toBe(b);
  });
  ```

  Run: `pnpm test tests/drift/hash.test.ts`
  Expected: PASS 즉시(`contractHash`의 `contract` 객체 리터럴이 `sources`를 언급하지 않으므로
  Step 3만으로 이미 성립 — 이 테스트는 향후 누군가 실수로 `sources`를 계약에 끼워 넣는 것을
  막는 잠금 테스트다).

- [ ] **Step 6: 커밋**

  이 저장소의 커밋 게이트 훅은 add와 commit을 별도 명령으로 실행해야 정상 동작한다 — 아래 두
  명령을 **각각 별도의 셸 호출로** 실행한다(하나로 이어 붙이지 않는다):
  ```bash
  git add src/schema/concept.ts tests/schema/concept.test.ts tests/drift/hash.test.ts
  ```
  ```bash
  git commit -m "$(cat <<'EOF'
  feat: 개념 스키마에 sources(근거) 필드 추가

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016QoBoEc1F6iLgKWJzxNjFe
  EOF
  )"
  ```

---

### Task 2: 뷰어 편집 화이트리스트에 `sources` 추가

**Files:**
- Modify: `src/store/conceptStore.ts:1` (태그 목록), `src/store/conceptStore.ts:168-179`
  (`EDITABLE_FIELDS` 배열)
- Modify: `tests/store/conceptStore.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Concept['sources']`.
- Produces: `editConceptContent(root, slug, { sources: ConceptSource[] })`가 다른 필드와
  동일하게 동작 — green 개념을 고치면 예외 없이 pending으로 내려간다(`concept-inline-edit`
  불변규칙, 변경하지 않음).

- [ ] **Step 1: 실패하는 테스트 작성**

  `tests/store/conceptStore.test.ts` 헤더의 `@concept:` 태그 줄(1번째 줄)에
  `@concept:concept-provenance`를 이어 붙인다:
  ```
  // @concept:settled-status @concept:globally-unique-slug @concept:human-owns-contract @concept:concept-inline-edit @concept:viewer-readability @concept:concept-provenance
  ```

  헤더의 "검증 대상 규칙 ↔ 시나리오" 목록에 추가:
  ```
  //  - concept-provenance 불변 "모든 개념은 근거를 하나 이상 밝힌다"
  //    → sources도 다른 본문 필드처럼 편집 화이트리스트에 있다 — 근거만 고쳐도 concept-inline-edit의
  //    "확정된 개념을 고치면 예외 없이 검토 중 상태로 내려간다"가 그대로 적용된다(특례 없음)
  ```

  `describe('editConceptContent', () => { ... });` 블록 안, 마지막 `it` 다음에 추가:
  ```typescript
  it('sources도 편집 가능한 필드다', async () => {
    await writeConcept(root, { ...base, status: 'pending' } as any);
    const updated = await editConceptContent(root, 'admin-role', {
      sources: [{ kind: 'decision', locator: '2026-09-12', supports: '테스트 근거' }],
    });
    expect(updated.sources).toEqual([
      { kind: 'decision', path: '', locator: '2026-09-12', supports: '테스트 근거' },
    ]);
  });
  it('sources만 고쳐도 다른 필드와 똑같이 green이 pending으로 내려간다(특례 없음)', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any);
    const updated = await editConceptContent(root, 'admin-role', {
      sources: [{ kind: 'decision', locator: '2026-09-12', supports: '테스트 근거' }],
    });
    expect(updated.status).toBe('pending');
  });
  ```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

  Run: `pnpm test tests/store/conceptStore.test.ts`
  Expected: 두 테스트 모두 FAIL. 첫 번째는 `EDITABLE_FIELDS`에 `'sources'`가 없어 patch가
  무시되므로 `updated.sources`가 `undefined`(또는 `[]`)라서 실패. 두 번째는 우연히 통과할 수
  있다(다른 필드도 이미 강등을 일으키므로) — 그래도 먼저 실행해 현재 동작을 확인한다.

- [ ] **Step 3: `EDITABLE_FIELDS`에 `sources` 추가**

  `src/store/conceptStore.ts:1`을 다음으로 교체:
  ```typescript
  // @concept:settled-status @concept:viewer-readability @concept:globally-unique-slug @concept:concept-provenance
  ```

  `EDITABLE_FIELDS` 배열(현재 168~179번째 줄)의 `'codeLinks',` 다음 줄에 추가:
  ```typescript
    'sources',
  ```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

  Run: `pnpm test tests/store/conceptStore.test.ts`
  Expected: 전체 PASS.

- [ ] **Step 5: 커밋**

  add와 commit을 **각각 별도의 셸 호출로** 실행한다:
  ```bash
  git add src/store/conceptStore.ts tests/store/conceptStore.test.ts
  ```
  ```bash
  git commit -m "$(cat <<'EOF'
  feat: 뷰어 편집 화이트리스트에 sources 추가

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016QoBoEc1F6iLgKWJzxNjFe
  EOF
  )"
  ```

---

### Task 3: 뷰어 화면에 근거 표시·편집 추가

**Files:**
- Modify: `assets/viewer.js` (I18N 라벨, 헬퍼 함수, `renderConceptRead`, `renderConceptEdit`)
- Create: `tests/viewer/sources.test.ts`

**Interfaces:**
- Consumes: Task 1의 `Concept['sources']`(런타임에는 raw JSON 필드, 타입 없음 — 뷰어는 순수 JS).
- Produces: 순수 함수 `sourceToLine(s)`, `lineToSource(line)`, `sourcesToLines(sources)`,
  `linesToSources(text)`, `describeSource(t, s)` — 전부 `assets/viewer.js` 전역 함수로 선언해
  `vm` 테스트 하네스가 `ctx`에서 바로 꺼내 쓸 수 있게 한다(기존 `toLines`/`linesOf`와 동일한
  선언 방식).

- [ ] **Step 1: 실패하는 헬퍼 함수 테스트 작성**

  `tests/viewer/sources.test.ts`를 새로 만든다. `tests/viewer/detailTitle.test.ts`의 로딩
  하네스(`makeDocument`, `load()` 패턴)를 그대로 재사용한다:

  ```typescript
  // @concept:concept-provenance @concept:viewer-readability
  // tests/viewer/sources.test.ts
  // 뷰어의 근거(sources) 표시·편집 헬퍼(assets/viewer.js)를 검증한다.
  // 검증 대상 규칙 ↔ 시나리오:
  //  - concept-provenance 구성요소 "코드 자리 / 참고자료 좌표 / 사람의 결정"
  //    → 한 줄 형식(kind | path | locator | supports)으로 왕복 변환된다(근거 → 줄, 줄 → 근거)
  //  - concept-provenance 정의 "위치만 남기고 옮겨 적지 않는다"
  //    → 표시 문구에는 kind·path·locator·supports만 들어가고 별도 원문 필드가 없다
  //  - 상위 기준 문서(설계 C) "칸이 넷을 넘으면 나머지는 무시하고, 모자라면 빈 값으로 채운다"
  //    → 칸이 모자란 줄은 빈 값으로 채우고, 넘치는 줄은 앞 네 칸만 쓴다
  //  - 상위 기준 문서(설계 C) "kind가 셋 중 하나가 아닌 줄은 버린다"
  //    → 알 수 없는 kind의 줄은 파싱 결과에서 제외된다
  //  - viewer-readability 대응: I18N ko/en에 근거 라벨이 존재한다(다른 필드 라벨과 동일한 관례)
  import { describe, it, expect } from 'vitest';
  import { readFileSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import vm from 'node:vm';

  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, '../../assets/viewer.js'), 'utf8').replace(
    /\nboot\(\);?\s*$/,
    '\n'
  );

  function load() {
    const ctx: Record<string, unknown> = { window: {}, document: { createElementNS() {}, createTextNode() {} } };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return ctx as Record<string, unknown> & {
      sourceToLine: (s: { kind: string; path?: string; locator?: string; supports?: string }) => string;
      lineToSource: (line: string) => { kind: string; path: string; locator: string; supports: string } | null;
      sourcesToLines: (sources: unknown[]) => string;
      linesToSources: (text: string) => unknown[];
      I18N: Record<string, Record<string, string>>;
    };
  }

  describe('sourceToLine / lineToSource — 왕복 변환', () => {
    it('code 근거를 한 줄로 만들고 다시 되돌린다', () => {
      const { sourceToLine, lineToSource } = load();
      const s = { kind: 'code', path: 'src/drift/hash.ts', locator: 'contractHash()', supports: '계약만 해시' };
      const line = sourceToLine(s);
      expect(lineToSource(line)).toEqual(s);
    });
    it('decision 근거는 path가 비어도 왕복된다', () => {
      const { sourceToLine, lineToSource } = load();
      const s = { kind: 'decision', path: '', locator: '2026-09-12', supports: '사람이 정함' };
      expect(lineToSource(sourceToLine(s))).toEqual(s);
    });
    it('칸이 모자라면 빈 값으로 채운다', () => {
      const { lineToSource } = load();
      expect(lineToSource('code | src/x.ts')).toEqual({
        kind: 'code',
        path: 'src/x.ts',
        locator: '',
        supports: '',
      });
    });
    it('칸이 넷을 넘으면 앞 네 칸만 쓴다', () => {
      const { lineToSource } = load();
      expect(lineToSource('code | src/x.ts | L1 | 설명 | 여분')).toEqual({
        kind: 'code',
        path: 'src/x.ts',
        locator: 'L1',
        supports: '설명',
      });
    });
    it('알 수 없는 kind의 줄은 버린다(null)', () => {
      const { lineToSource } = load();
      expect(lineToSource('guess | x | y | z')).toBeNull();
    });
  });

  describe('sourcesToLines / linesToSources — 텍스트에어리어 왕복', () => {
    it('근거 배열을 줄바꿈 텍스트로, 다시 배열로 되돌린다(잘못된 줄은 걸러진다)', () => {
      const { sourcesToLines, linesToSources } = load();
      const sources = [
        { kind: 'code', path: 'a.ts', locator: 'L1', supports: 'x' },
        { kind: 'reference', path: 'doc.md', locator: 'p.1', supports: 'y' },
      ];
      const text = sourcesToLines(sources);
      expect(linesToSources(text)).toEqual(sources);
      expect(linesToSources(text + '\nguess | bad')).toEqual(sources); // 잘못된 줄은 무시
    });
  });

  describe('I18N — 근거 라벨', () => {
    it('ko/en 모두 근거 라벨을 갖는다', () => {
      const { I18N } = load();
      expect(I18N.ko.sourcesLabel).toBeTruthy();
      expect(I18N.en.sourcesLabel).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

  Run: `pnpm test tests/viewer/sources.test.ts`
  Expected: 전부 FAIL — `sourceToLine`/`lineToSource`/`sourcesToLines`/`linesToSources`가 아직
  없어 `ctx.sourceToLine is not a function` 류의 TypeError.

- [ ] **Step 3: I18N 라벨 추가**

  `assets/viewer.js`의 `I18N.ko` 객체(약 6~89번째 줄) 안, `codeLinksLabel: '코드 경로',` 다음
  줄에 추가:
  ```javascript
      sourcesLabel: '근거',
      sourceLinesHint: '한 줄에 하나씩 — 종류 | 경로 | 좌표 | 뒷받침',
      sourceKind_code: '코드',
      sourceKind_reference: '참고자료',
      sourceKind_decision: '사람의 결정',
  ```

  `I18N.en` 객체 안, `codeLinksLabel: 'Code paths',` 다음 줄에 추가:
  ```javascript
      sourcesLabel: 'Sources',
      sourceLinesHint: 'one per line — kind | path | locator | supports',
      sourceKind_code: 'Code',
      sourceKind_reference: 'Reference',
      sourceKind_decision: 'Decision',
  ```

- [ ] **Step 4: 헬퍼 함수 추가**

  `assets/viewer.js`에서 `function linesOf(arr) { ... }` 함수 정의 바로 다음(편집 폼 헬퍼
  섹션, `toLines`/`linesOf` 옆)에 추가:
  ```javascript
  var SOURCE_KINDS = ['code', 'reference', 'decision'];
  // 근거 한 줄 ↔ 구조체 왕복(concept-provenance). 표시와 저장 모두 이 형식을 쓴다 —
  // 원문을 옮겨 적을 칸을 애초에 두지 않는다(reference-privacy).
  function sourceToLine(s) {
    return [s.kind || '', s.path || '', s.locator || '', s.supports || ''].join(' | ');
  }
  function lineToSource(line) {
    var parts = line.split('|').map(function (p) {
      return p.trim();
    });
    var kind = parts[0];
    if (SOURCE_KINDS.indexOf(kind) === -1) return null;
    return { kind: kind, path: parts[1] || '', locator: parts[2] || '', supports: parts[3] || '' };
  }
  function sourcesToLines(sources) {
    return (sources || []).map(sourceToLine).join('\n');
  }
  function linesToSources(text) {
    return toLines(text)
      .map(lineToSource)
      .filter(Boolean);
  }
  function describeSource(t, s) {
    var kindLabel = t['sourceKind_' + s.kind] || s.kind;
    var bits = [kindLabel];
    if (s.path) bits.push(s.path);
    if (s.locator) bits.push(s.locator);
    var head = bits.join(' · ');
    return s.supports ? head + ' — ' + s.supports : head;
  }
  ```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

  Run: `pnpm test tests/viewer/sources.test.ts`
  Expected: 전체 PASS.

- [ ] **Step 6: 읽기 화면에 근거 섹션 추가**

  `renderConceptRead` 함수 안, `codeLinks.length ? h('section', ...) : null,` 블록(코드 경로
  섹션) **바로 앞**에 추가한다. 먼저 함수 상단에서 `codeLinks` 변수를 선언하는 줄
  (`var codeLinks = (entry && entry.codeLinks) || [];`) 다음에 한 줄 추가:
  ```javascript
    var sources = c.sources || [];
  ```

  그리고 `sections` 배열 안, 코드 경로 섹션 바로 앞에 다음 항목을 추가:
  ```javascript
    sources.length
      ? h('section', { class: 'section' }, [
          h('h2', null, t.sourcesLabel),
          h(
            'ul',
            { class: 'sources' },
            sources.map(function (s) {
              return h('li', null, describeSource(t, s));
            })
          ),
        ])
      : null,
  ```

- [ ] **Step 7: 편집 화면에 근거 필드 추가**

  `renderConceptEdit` 함수 안, `f.codeLinks = area(linesOf(c.codeLinks), 3);` 줄 다음에 추가:
  ```javascript
    f.sources = area(sourcesToLines(c.sources), 3);
  ```

  같은 함수의 `collect()` 안, `codeLinks: toLines(f.codeLinks.value),` 줄 다음에 추가:
  ```javascript
      sources: linesToSources(f.sources.value),
  ```

  같은 함수에서 폼 필드를 나열하는 부분(`field(t.codeLinksLabel, f.codeLinks, t.linesHint)`가
  있는 줄) 바로 다음에 추가:
  ```javascript
        field(t.sourcesLabel, f.sources, t.sourceLinesHint),
  ```

- [ ] **Step 8: 수동 확인 (뷰어 실행)**

  Run: `pnpm concepts:view` (백그라운드) 후 브라우저에서 아무 개념 상세 페이지 →
  편집(Edit) 클릭 → "근거" 필드가 보이는지, `code | src/x.ts | L1 | 설명` 형식으로 한 줄
  입력 후 저장하면 읽기 화면에 "코드 · src/x.ts · L1 — 설명"처럼 나오는지 눈으로 확인한다.
  (자동화된 렌더 트리 테스트는 Step 1~5의 헬퍼 함수 테스트로 대신한다 — 이 파일은 커버리지
  게이트 대상이 아니고, 기존 관례도 전체 DOM 트리가 아닌 추출된 순수 함수를 테스트한다.)

- [ ] **Step 9: 커밋**

  add와 commit을 **각각 별도의 셸 호출로** 실행한다:
  ```bash
  git add assets/viewer.js tests/viewer/sources.test.ts
  ```
  ```bash
  git commit -m "$(cat <<'EOF'
  feat: 뷰어에 근거(sources) 표시·편집 추가

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016QoBoEc1F6iLgKWJzxNjFe
  EOF
  )"
  ```

---

### Task 4: `define-concept` 스킬 개정

**Files:**
- Modify: `skills/define-concept/SKILL.md`

**Interfaces:**
- Consumes: 없음(문서).
- Produces: 없음(문서) — 코드 태스크가 아니므로 RED/GREEN 사이클이 없다. 아래 단계만 수행한다.

- [ ] **Step 1: 3단계(구조 채우기)에 근거 작성 지침 추가**

  `skills/define-concept/SKILL.md`에서 3번 항목(`3. Fill in the following structure together
  with the user. ...`)의 하위 불릿 목록 — `**작동 원리 (개념 \`concept-scope\`):**` 항목 바로
  다음에 새 하위 불릿을 추가한다:

  ```markdown
     - **근거 (개념 `concept-provenance`):** `sources`에는 이 개념이 어디서 왔는지 코드
       자리·참고자료 좌표·사람의 결정 가운데 하나 이상을 적는다.
       - `code`/`reference`는 `path`가 필수다 — 코드는 저장소 상대 경로, 참고자료는 문서명 또는
         `reference/paths.md`에 등록된 바깥 경로.
       - `locator`는 자유 형식이다 — 코드는 심볼 이름을 먼저 짚고 줄 번호는 보조로만 쓴다
         (줄 번호만 적으면 위 몇 줄만 고쳐도 낡는다). 참고자료는 `p.12`, `slide 7`, `3.2절`처럼
         PDF 페이지·PPTX 슬라이드·문서 절 등 실제 형태를 따른다.
       - `supports`에는 그 근거가 뒷받침하는 **우리가 쓴 규칙의 요약**을 적는다 — 참고자료의
         원문을 옮겨 적지 않는다(`reference-privacy`). 발췌가 아니라 위치만 남긴다.
       - 코드에도 참고자료에도 없이 사람이 판단해 정한 규칙은 `decision`으로 밝힌다 — `path` 없이
         `locator`(언제/어떤 논의에서)와 `supports`(그 판단이 무엇에 기댔는지)만 채운다. **없는
         근거를 지어내는 것보다 "사람이 정했다"고 정직하게 적는 것이 낫다.**
       - 근거는 코드 판단(`check-concept`/`audit`)의 입력이 아니다 — 이 스킬(개념을 만들고 고칠
         때)에서만 채운다.
  ```

- [ ] **Step 2: 자체 검토**

  파일을 다시 읽고 다음을 확인한다:
  - 새로 추가한 문단이 기존 마크다운 들여쓰기(4-space 하위 불릿)와 일치하는가.
  - `concept-provenance`라는 slug가 실제 개념 파일과 일치하는가 —
    `docs/conceptpowers/concepts/data/governance/concept-provenance.json` 존재 확인:
    ```bash
    test -f docs/conceptpowers/concepts/data/governance/concept-provenance.json && echo OK
    ```
    Expected: `OK`

- [ ] **Step 3: 커밋**

  add와 commit을 **각각 별도의 셸 호출로** 실행한다:
  ```bash
  git add skills/define-concept/SKILL.md
  ```
  ```bash
  git commit -m "$(cat <<'EOF'
  docs: define-concept 스킬에 근거(sources) 작성 지침 추가

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016QoBoEc1F6iLgKWJzxNjFe
  EOF
  )"
  ```

---

### Task 5: 전체 검증 및 마무리

**Files:** 없음(검증만).

**Interfaces:** 없음.

- [ ] **Step 1: 타입 검사**

  Run: `pnpm typecheck`
  Expected: 에러 없음.

- [ ] **Step 2: 전체 테스트 + 커버리지**

  Run: `pnpm test:coverage`
  Expected: 전체 PASS. `src/**` 커버리지 80% 이상 유지(Task 1·2에서 추가한 필드는 기존
  함수들이 그대로 순회하므로 커버리지가 떨어지지 않는다 — 새 분기(zod refine 2개)는 Task 1의
  거부 테스트들이 커버한다).

- [ ] **Step 3: 새 개념 파일이 실제로 존재하고 통과하는지 재확인**

  이 계획 착수 전 별도로 정의해 둔 `concept-provenance` 개념(green, 이미 정합성 검사 통과)이
  이번 스키마 변경과 어긋나지 않는지 엔진으로 재확인한다:
  ```bash
  node "/Users/inyeol/.claude/plugins/cache/conceptpowers-dev/conceptpowers/1.11.1/dist/cli.js" quality concept-provenance --root .
  node "/Users/inyeol/.claude/plugins/cache/conceptpowers-dev/conceptpowers/1.11.1/dist/cli.js" render --root .
  ```
  Expected: `{"ok":true,"deficiencies":[],"warnings":[]}` — 이번 스키마 추가로 이 개념 자신도
  `sources` 필드를 실제로 쓸 수 있게 됐는지 뷰어에서 눈으로 한 번 더 확인한다(백필은 2차 계획).

- [ ] **Step 4: 거버넌스 산출물 커밋**

  이 계획에 앞서 별도로 만들어 둔, 아직 커밋되지 않은 문서·개념 파일을 마저 커밋한다 — 설계
  문서 G("새 개념 `concept-provenance`")가 실제로 커밋에 실리는 자리다. `git status --short`로
  먼저 확인하고, add와 commit을 **각각 별도의 셸 호출로** 실행한다:
  ```bash
  git status --short
  ```
  ```bash
  git add docs/conceptpowers/concepts/data/governance/concept-provenance.json \
    docs/conceptpowers/features/governance/concept-definition.json \
    docs/conceptpowers/concepts/.alignment/attest.json \
    docs/conceptpowers/concepts/.alignment/history.json \
    docs/conceptpowers/concepts/viewer/manifest.json \
    docs/conceptpowers/concepts/viewer/serve.mjs \
    docs/superpowers/specs/2026-09-12-concept-provenance-design.md \
    docs/superpowers/plans/2026-09-12-concept-provenance.md
  ```
  ```bash
  git commit -m "$(cat <<'EOF'
  feat: 개념 근거(concept-provenance) 개념 정의 및 설계·계획 문서

  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016QoBoEc1F6iLgKWJzxNjFe
  EOF
  )"
  ```
  Expected: `git status --short`가 깨끗해진다(이 계획이 만든 파일 기준 — `.superpowers/sdd/`
  워크스페이스는 git-ignored라 상관없다).

- [ ] **Step 5: 커밋 전 정지 — 사용자 확인 (push)**

  **여기서 push하지 않는다.** 지금까지의 로컬 커밋 목록을 사용자에게 보여준다:
  ```bash
  git log --oneline -6
  ```
  push는 사용자가 명시적으로 요청했을 때만, `gh auth switch --user hinyc` → `git push` →
  `gh auth switch --user inyeol-hong` 순서로 진행한다. 각 태스크 커밋은 이미 시스템 프롬프트가
  지정한 attribution 트레일러를 달고 있다(각 커밋 메시지에 포함).

---

## Not in scope (2차 계획으로 이월)

- `src/concept/quality.ts`에 근거 결격(`no source`) 검사 추가 — 설계 문서 B.
- 기존 green 개념 24개(23개 + `concept-provenance` 자신)의 실제 `sources` 값 채우기 — 설계
  문서 F. 개념 파일에 직접 기록하고 green을 유지한다(`editConceptContent`를 거치지 않는다).
- `conceptStore.ts`의 강등(green→pending) 로직 변경 — `concept-inline-edit`의 "예외 없이"
  규칙과 충돌해 폐기됨(설계 문서 D 참고).
