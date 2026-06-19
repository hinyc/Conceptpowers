# 개념 Drift 내비게이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개념(concept) 정의가 바뀌면 그 변경을 감지(drift)해 커밋 시점에 관련 코드를 함께 고치도록 유도하고(막되 override 허용), "왜 바뀌었는지(why)"를 개발자에게 전파한다.

**Architecture:** 개념의 "계약 필드"로 결정론적 해시를 산출하고, `alignment.lock.json`(마지막 정렬 해시)·`history.json`(변경 이유)을 baseline과 분리된 플러그인 상태 파일에 둔다. 커밋 전(PreToolUse)에는 drift를 `ask`로 경고하고, 커밋 성공 후(PostToolUse)에 lock을 재조정한다. SessionStart는 현재 drift를 컨텍스트로 주입한다.

**Tech Stack:** TypeScript(ESM), zod, commander, vitest, esbuild, node:crypto.

## Global Constraints

- 불변성: 절대 객체를 변경하지 말 것. 항상 새 객체/배열 생성(`{...x}`, `[...a]`).
- 입력 검증: 상태 파일(lock/history)은 zod 스키마로 파싱.
- 파일 크기 200–400줄(최대 800), 기능/도메인별 작은 파일.
- 패키지 매니저는 **pnpm** (npm 아님). 빌드 `pnpm build`, 테스트 `pnpm test`.
- 훅은 `dist/hooks/*.js`를 직접 실행 → **배포 전 `pnpm build` 필수**.
- 훅은 **best-effort**: 플러그인 상태 오류가 사용자의 git을 절대 막지 않는다.
- baseline(`docs/conceptpowers/concepts/data`의 개념 정의)은 코드가 임의 수정 금지. lock/history는 baseline이 아닌 파생 상태(`.alignment/`).
- 커밋 메시지: `<타입>: <설명>` (feat/fix/refactor/docs/test/chore). Co-Authored-By 미사용.
- 날짜 `at`은 ISO 문자열. 함수는 테스트를 위해 선택적 `at?: string` 인자를 받고 기본값 `new Date().toISOString()`.
- 테스트 명령은 단일 파일 실행 시 `pnpm exec vitest run <path>`.

---

### Task 1: 경로 + alignment 스키마

**Files:**
- Modify: `src/paths.ts`
- Create: `src/schema/alignment.ts`
- Test: `tests/schema/alignment.test.ts`

**Interfaces:**
- Produces:
  - `cpPaths(root).alignmentLock: string`, `cpPaths(root).alignmentHistory: string`
  - `AlignmentLock` (type) = `Record<string, { hash: string; at: string }>`
  - `History` (type) = `HistoryEntry[]`; `HistoryEntry` = `{ slug: string; hash: string; prevHash: string; reason: string; at: string; ignored: boolean }`
  - zod 객체 `AlignmentLock`, `History`, `HistoryEntry` (값과 타입 동일 이름으로 export)

- [ ] **Step 1: 실패 테스트 작성** — `tests/schema/alignment.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { AlignmentLock, History, HistoryEntry } from '../../src/schema/alignment.js'

describe('alignment schemas', () => {
  it('AlignmentLock은 slug→{hash,at} 레코드를 파싱한다', () => {
    const v = AlignmentLock.parse({ 'auth-token': { hash: 'a1b2', at: '2026-06-19T00:00:00.000Z' } })
    expect(v['auth-token'].hash).toBe('a1b2')
  })
  it('HistoryEntry는 prevHash/reason/ignored에 기본값을 채운다', () => {
    const e = HistoryEntry.parse({ slug: 'auth-token', hash: 'a1b2', at: '2026-06-19T00:00:00.000Z' })
    expect(e.prevHash).toBe('')
    expect(e.reason).toBe('')
    expect(e.ignored).toBe(false)
  })
  it('History는 엔트리 배열을 파싱한다', () => {
    const h = History.parse([{ slug: 's', hash: 'h', at: 't' }])
    expect(h).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/schema/alignment.test.ts`
Expected: FAIL (Cannot find module '../../src/schema/alignment.js')

- [ ] **Step 3: 스키마 구현** — `src/schema/alignment.ts`

```ts
import { z } from 'zod'

export const LockEntry = z.object({ hash: z.string(), at: z.string() })
export const AlignmentLock = z.record(z.string(), LockEntry)
export type AlignmentLock = z.infer<typeof AlignmentLock>

export const HistoryEntry = z.object({
  slug: z.string(),
  hash: z.string(),
  prevHash: z.string().default(''),
  reason: z.string().default(''),
  at: z.string(),
  ignored: z.boolean().default(false),
})
export type HistoryEntry = z.infer<typeof HistoryEntry>

export const History = z.array(HistoryEntry)
export type History = z.infer<typeof History>
```

- [ ] **Step 4: 경로 추가** — `src/paths.ts`의 반환 객체에 다음 3줄을 `cssTarget` 뒤에 추가(쉼표 주의)

```ts
    cssTarget: join(base, 'concepts', 'viewer', 'assets', 'concept.css'),
    alignmentDir: join(base, 'concepts', '.alignment'),
    alignmentLock: join(base, 'concepts', '.alignment', 'alignment.lock.json'),
    alignmentHistory: join(base, 'concepts', '.alignment', 'history.json')
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec vitest run tests/schema/alignment.test.ts tests/paths.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/schema/alignment.ts src/paths.ts tests/schema/alignment.test.ts
git commit -m "feat: alignment lock/history 스키마와 경로 추가" --no-verify
```

---

### Task 2: 계약 해시 `contractHash`

**Files:**
- Create: `src/drift/hash.ts`
- Test: `tests/drift/hash.test.ts`

**Interfaces:**
- Consumes: `Concept` (`src/schema/concept.js`), `parseConcept`
- Produces: `contractHash(c: Concept): string` (12자 hex)

- [ ] **Step 1: 실패 테스트 작성** — `tests/drift/hash.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { contractHash } from '../../src/drift/hash.js'
import { parseConcept } from '../../src/schema/concept.js'

const base = {
  slug: 'auth-token', category: ['behavior'], title: 'Auth Token',
  description: { definition: '토큰 발급', components: ['만료'] },
  purpose: { reason: '세션 유지' },
  actions: { allow: ['발급'], restrict: ['무한 만료'] },
  principle: { immutableRules: ['만료는 1시간'] },
}

describe('contractHash', () => {
  it('동일 계약이면 동일 해시(결정론적)', () => {
    expect(contractHash(parseConcept(base))).toBe(contractHash(parseConcept(base)))
  })
  it('계약 필드(definition)가 바뀌면 해시가 바뀐다', () => {
    const a = contractHash(parseConcept(base))
    const b = contractHash(parseConcept({ ...base, description: { ...base.description, definition: '바뀐 정의' } }))
    expect(a).not.toBe(b)
  })
  it('비계약 필드(title/eyebrow/status)가 바뀌어도 해시는 불변', () => {
    const a = contractHash(parseConcept(base))
    const b = contractHash(parseConcept({ ...base, title: '다른 제목', eyebrow: 'X', status: 'green' }))
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/drift/hash.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/drift/hash.ts`

```ts
import { createHash } from 'node:crypto'
import type { Concept } from '../schema/concept.js'

// 코드가 따라야 할 "계약" 필드만 해시한다. 표현/메타 필드(title, eyebrow, status,
// analogy, example 등)는 제외해 사소한 편집을 drift로 오인하지 않는다.
export function contractHash(c: Concept): string {
  const contract = {
    definition: c.description.definition,
    components: c.description.components,
    allow: c.actions.allow,
    restrict: c.actions.restrict,
    interaction: c.actions.interaction,
    immutableRules: c.principle.immutableRules,
    lifecycle: c.principle.lifecycle,
    reason: c.purpose.reason,
  }
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex').slice(0, 12)
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run tests/drift/hash.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/drift/hash.ts tests/drift/hash.test.ts
git commit -m "feat: 개념 계약 해시 contractHash 추가" --no-verify
```

---

### Task 3: lock 읽기/쓰기

**Files:**
- Create: `src/drift/lock.ts`
- Test: `tests/drift/lock.test.ts`

**Interfaces:**
- Consumes: `cpPaths`, `AlignmentLock`
- Produces: `readLock(root: string): Promise<AlignmentLock>` (없거나 깨지면 `{}`), `writeLock(root, lock): Promise<void>`

- [ ] **Step 1: 실패 테스트 작성** — `tests/drift/lock.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readLock, writeLock } from '../../src/drift/lock.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('lock', () => {
  it('없으면 빈 객체를 반환한다', async () => {
    expect(await readLock(root)).toEqual({})
  })
  it('쓰고 다시 읽으면 동일하다', async () => {
    await writeLock(root, { 'auth-token': { hash: 'a1b2', at: 't' } })
    expect(await readLock(root)).toEqual({ 'auth-token': { hash: 'a1b2', at: 't' } })
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/drift/lock.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/drift/lock.ts`

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { cpPaths } from '../paths.js'
import { AlignmentLock } from '../schema/alignment.js'

export async function readLock(root: string): Promise<AlignmentLock> {
  try {
    return AlignmentLock.parse(JSON.parse(await readFile(cpPaths(root).alignmentLock, 'utf8')))
  } catch {
    return {}
  }
}

export async function writeLock(root: string, lock: AlignmentLock): Promise<void> {
  const target = cpPaths(root).alignmentLock
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(lock, null, 2) + '\n', 'utf8')
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run tests/drift/lock.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/drift/lock.ts tests/drift/lock.test.ts
git commit -m "feat: alignment lock 읽기/쓰기 추가" --no-verify
```

---

### Task 4: history append + `noteChange`

**Files:**
- Create: `src/drift/history.ts`
- Create: `src/drift/note.ts`
- Test: `tests/drift/history.test.ts`

**Interfaces:**
- Consumes: `cpPaths`, `History`, `HistoryEntry`, `readConcept`, `contractHash`
- Produces:
  - `readHistory(root): Promise<HistoryEntry[]>` (없으면 `[]`)
  - `appendHistory(root, input: { slug: string; hash: string; reason?: string; ignored?: boolean; at?: string }): Promise<HistoryEntry>` (prevHash = 같은 slug의 직전 hash)
  - `noteChange(root, slug: string, reason: string, at?: string): Promise<HistoryEntry>` (개념 현재 해시로 history append; 개념 없으면 throw)

- [ ] **Step 1: 실패 테스트 작성** — `tests/drift/history.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readHistory, appendHistory } from '../../src/drift/history.js'
import { noteChange } from '../../src/drift/note.js'
import { writeConcept } from '../../src/store/conceptStore.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('history', () => {
  it('없으면 빈 배열', async () => {
    expect(await readHistory(root)).toEqual([])
  })
  it('append는 같은 slug의 직전 hash를 prevHash로 연결한다', async () => {
    await appendHistory(root, { slug: 'auth-token', hash: 'h1', reason: '최초', at: 't1' })
    const e2 = await appendHistory(root, { slug: 'auth-token', hash: 'h2', reason: '변경', at: 't2' })
    expect(e2.prevHash).toBe('h1')
    expect(await readHistory(root)).toHaveLength(2)
  })
  it('noteChange는 개념의 현재 계약 해시로 이유를 기록한다', async () => {
    await writeConcept(root, {
      slug: 'auth-token', category: ['behavior'], title: 'A',
      description: { definition: 'd' }, purpose: { reason: 'r' }, actions: {}, principle: {},
    })
    const e = await noteChange(root, 'auth-token', '만료 30분으로', 't1')
    expect(e.slug).toBe('auth-token')
    expect(e.reason).toBe('만료 30분으로')
    expect(e.hash).toHaveLength(12)
  })
  it('noteChange는 없는 개념이면 throw', async () => {
    await expect(noteChange(root, 'ghost', 'x', 't')).rejects.toThrow('ghost')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/drift/history.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: history 구현** — `src/drift/history.ts`

```ts
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { cpPaths } from '../paths.js'
import { History, HistoryEntry } from '../schema/alignment.js'

export async function readHistory(root: string): Promise<HistoryEntry[]> {
  try {
    return History.parse(JSON.parse(await readFile(cpPaths(root).alignmentHistory, 'utf8')))
  } catch {
    return []
  }
}

export interface HistoryInput {
  slug: string
  hash: string
  reason?: string
  ignored?: boolean
  at?: string
}

export async function appendHistory(root: string, input: HistoryInput): Promise<HistoryEntry> {
  const existing = await readHistory(root)
  const prev = [...existing].reverse().find((e) => e.slug === input.slug)
  const entry = HistoryEntry.parse({
    slug: input.slug,
    hash: input.hash,
    prevHash: prev?.hash ?? '',
    reason: input.reason ?? '',
    ignored: input.ignored ?? false,
    at: input.at ?? new Date().toISOString(),
  })
  const next = [...existing, entry]
  const target = cpPaths(root).alignmentHistory
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return entry
}
```

- [ ] **Step 4: noteChange 구현** — `src/drift/note.ts`

```ts
import { readConcept } from '../store/conceptStore.js'
import { contractHash } from './hash.js'
import { appendHistory } from './history.js'
import type { HistoryEntry } from '../schema/alignment.js'

// 개념 정의를 바꾼 직후, "왜 바꿨는지"를 현재 계약 해시와 함께 history에 남긴다.
export async function noteChange(
  root: string,
  slug: string,
  reason: string,
  at?: string,
): Promise<HistoryEntry> {
  const concept = await readConcept(root, slug)
  if (!concept) throw new Error(`Concept not found: ${slug}`)
  return appendHistory(root, { slug, hash: contractHash(concept), reason, at })
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec vitest run tests/drift/history.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/drift/history.ts src/drift/note.ts tests/drift/history.test.ts
git commit -m "feat: history append와 noteChange(why 기록) 추가" --no-verify
```

---

### Task 5: mapping 캐시 읽기 + `computeDrift`

**Files:**
- Modify: `src/mapping/scan.ts` (`readMappingCache` 추가)
- Create: `src/drift/detect.ts`
- Test: `tests/drift/detect.test.ts`

**Interfaces:**
- Consumes: `listConcepts`, `listFeatures`, `readMappingCache`, `readLock`, `readHistory`, `contractHash`
- Produces:
  - `readMappingCache(root): Promise<Mapping>` (없으면 `{}`)
  - `DriftItem` = `{ slug: string; currentHash: string; lockedHash: string; reason: string; relatedPaths: string[] }`
  - `computeDrift(root): Promise<DriftItem[]>`

- [ ] **Step 1: 실패 테스트 작성** — `tests/drift/detect.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeDrift } from '../../src/drift/detect.js'
import { writeConcept, readConcept } from '../../src/store/conceptStore.js'
import { writeFeature } from '../../src/store/featureStore.js'
import { writeLock } from '../../src/drift/lock.js'
import { contractHash } from '../../src/drift/hash.js'
import { appendHistory } from '../../src/drift/history.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

const concept = (over: Record<string, unknown> = {}) => ({
  slug: 'auth-token', category: ['behavior'], title: 'A',
  description: { definition: 'v1' }, purpose: { reason: 'r' }, actions: {}, principle: {}, ...over,
})

describe('computeDrift', () => {
  it('lock에 없는 개념은 drift가 아니다', async () => {
    await writeConcept(root, concept())
    expect(await computeDrift(root)).toEqual([])
  })
  it('lock 해시와 현재 해시가 같으면 drift가 아니다', async () => {
    await writeConcept(root, concept())
    const c = await readConcept(root, 'auth-token')
    await writeLock(root, { 'auth-token': { hash: contractHash(c!), at: 't' } })
    expect(await computeDrift(root)).toEqual([])
  })
  it('개념이 바뀌면 drift로 보고하고 feature codePaths를 relatedPaths로 모은다', async () => {
    await writeConcept(root, concept())
    const c1 = await readConcept(root, 'auth-token')
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } })
    await writeFeature(root, { slug: 'login', title: 'Login', concepts: ['auth-token'], codePaths: ['src/login.ts'] })
    await appendHistory(root, { slug: 'auth-token', hash: 'new', reason: '만료 단축', at: 't2' })
    await writeConcept(root, concept({ description: { definition: 'v2-변경됨' } }))
    const drift = await computeDrift(root)
    expect(drift).toHaveLength(1)
    expect(drift[0].slug).toBe('auth-token')
    expect(drift[0].reason).toBe('만료 단축')
    expect(drift[0].relatedPaths).toContain('src/login.ts')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/drift/detect.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: `readMappingCache` 추가** — `src/mapping/scan.ts` 끝에 추가

```ts
export async function readMappingCache(root: string): Promise<Mapping> {
  try {
    return JSON.parse(await readFile(cpPaths(root).mappingCache, 'utf8'))
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: `computeDrift` 구현** — `src/drift/detect.ts`

```ts
import { listConcepts } from '../store/conceptStore.js'
import { listFeatures } from '../store/featureStore.js'
import { readMappingCache } from '../mapping/scan.js'
import { readLock } from './lock.js'
import { readHistory } from './history.js'
import { contractHash } from './hash.js'

export interface DriftItem {
  slug: string
  currentHash: string
  lockedHash: string
  reason: string
  relatedPaths: string[]
}

// 개념이 마지막 정렬(lock) 이후 바뀌었는지 판정하고, 따라와야 할 관련 코드 경로를 모은다.
export async function computeDrift(root: string): Promise<DriftItem[]> {
  const [concepts, features, mapping, lock, history] = await Promise.all([
    listConcepts(root),
    listFeatures(root),
    readMappingCache(root),
    readLock(root),
    readHistory(root),
  ])
  const items: DriftItem[] = []
  for (const c of concepts) {
    const locked = lock[c.slug]?.hash
    if (locked === undefined) continue // 신규: 첫 커밋에서 등록됨
    const current = contractHash(c)
    if (locked === current) continue // 정렬됨
    const fromFeatures = features
      .filter((f) => f.concepts.includes(c.slug))
      .flatMap((f) => f.codePaths)
    const fromTags = mapping[c.slug] ?? []
    const relatedPaths = [...new Set([...fromTags, ...fromFeatures])]
    const reason =
      [...history].reverse().find((e) => e.slug === c.slug && !e.ignored)?.reason ?? ''
    items.push({ slug: c.slug, currentHash: current, lockedHash: locked, reason, relatedPaths })
  }
  return items
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec vitest run tests/drift/detect.test.ts tests/mapping/scan.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/mapping/scan.ts src/drift/detect.ts tests/drift/detect.test.ts
git commit -m "feat: computeDrift(개념 drift 감지)와 mapping 캐시 읽기 추가" --no-verify
```

---

### Task 6: `reconcileAfterCommit` (lock 재조정)

**Files:**
- Create: `src/drift/reconcile.ts`
- Test: `tests/drift/reconcile.test.ts`

**Interfaces:**
- Consumes: `listConcepts`, `readLock`, `writeLock`, `appendHistory`, `computeDrift`, `contractHash`, `AlignmentLock`
- Produces:
  - `ReconcileResult` = `{ aligned: string[]; ignored: string[] }`
  - `reconcileAfterCommit(root, committedFiles: string[], at?: string): Promise<ReconcileResult>`

- [ ] **Step 1: 실패 테스트 작성** — `tests/drift/reconcile.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { reconcileAfterCommit } from '../../src/drift/reconcile.js'
import { writeConcept, readConcept } from '../../src/store/conceptStore.js'
import { writeFeature } from '../../src/store/featureStore.js'
import { writeLock, readLock } from '../../src/drift/lock.js'
import { readHistory } from '../../src/drift/history.js'
import { contractHash } from '../../src/drift/hash.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

const concept = (over: Record<string, unknown> = {}) => ({
  slug: 'auth-token', category: ['behavior'], title: 'A',
  description: { definition: 'v1' }, purpose: { reason: 'r' }, actions: {}, principle: {}, ...over,
})

// v1을 lock에 등록한 뒤 v2로 바꿔 drift를 만든다.
async function makeDrift() {
  await writeConcept(root, concept())
  const c1 = await readConcept(root, 'auth-token')
  await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } })
  await writeFeature(root, { slug: 'login', title: 'L', concepts: ['auth-token'], codePaths: ['src/login.ts'] })
  await writeConcept(root, concept({ description: { definition: 'v2' } }))
}

describe('reconcileAfterCommit', () => {
  it('관련 코드가 커밋에 포함되면 aligned로 분류하고 lock을 현재 해시로 갱신', async () => {
    await makeDrift()
    const c2 = await readConcept(root, 'auth-token')
    const r = await reconcileAfterCommit(root, ['src/login.ts'], 't2')
    expect(r.aligned).toContain('auth-token')
    expect(r.ignored).toEqual([])
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c2!))
  })
  it('관련 코드가 빠지면 ignored로 분류하고 history에 ignored 기록 + lock 갱신', async () => {
    await makeDrift()
    const r = await reconcileAfterCommit(root, ['README.md'], 't2')
    expect(r.ignored).toContain('auth-token')
    const h = await readHistory(root)
    expect(h.some((e) => e.slug === 'auth-token' && e.ignored)).toBe(true)
  })
  it('lock에 없던 신규 개념은 현재 해시로 등록한다', async () => {
    await writeConcept(root, concept())
    const c = await readConcept(root, 'auth-token')
    const r = await reconcileAfterCommit(root, [], 't1')
    expect(r.aligned).toEqual([])
    expect(r.ignored).toEqual([])
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c!))
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/drift/reconcile.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/drift/reconcile.ts`

```ts
import { listConcepts } from '../store/conceptStore.js'
import { readLock, writeLock } from './lock.js'
import { appendHistory } from './history.js'
import { computeDrift } from './detect.js'
import { contractHash } from './hash.js'
import type { AlignmentLock } from '../schema/alignment.js'

export interface ReconcileResult {
  aligned: string[]
  ignored: string[]
}

// 커밋 성공 후 호출. drift였던 개념을 "코드가 따라옴(aligned)" 또는 "override(ignored)"로
// 분류하고, 어느 쪽이든 lock을 현재 해시로 재조정한다. 신규 개념은 등록만 한다.
export async function reconcileAfterCommit(
  root: string,
  committedFiles: string[],
  at?: string,
): Promise<ReconcileResult> {
  const stamp = at ?? new Date().toISOString()
  const committed = new Set(committedFiles)
  const [concepts, lock, drift] = await Promise.all([
    listConcepts(root),
    readLock(root),
    computeDrift(root),
  ])
  const driftBySlug = new Map(drift.map((d) => [d.slug, d]))
  const nextLock: AlignmentLock = { ...lock }
  const aligned: string[] = []
  const ignored: string[] = []
  for (const c of concepts) {
    const d = driftBySlug.get(c.slug)
    if (d) {
      const followed =
        d.relatedPaths.length === 0 || d.relatedPaths.every((p) => committed.has(p))
      if (followed) {
        aligned.push(c.slug)
      } else {
        ignored.push(c.slug)
        await appendHistory(root, {
          slug: c.slug,
          hash: d.currentHash,
          reason: d.reason,
          ignored: true,
          at: stamp,
        })
      }
      nextLock[c.slug] = { hash: d.currentHash, at: stamp }
    } else if (lock[c.slug] === undefined) {
      nextLock[c.slug] = { hash: contractHash(c), at: stamp }
    }
  }
  await writeLock(root, nextLock)
  return { aligned, ignored }
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run tests/drift/reconcile.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/drift/reconcile.ts tests/drift/reconcile.test.ts
git commit -m "feat: reconcileAfterCommit(lock 재조정 엔진) 추가" --no-verify
```

---

### Task 7: PreToolUse — deny→ask + drift 게이트

**Files:**
- Modify: `src/hooks/preToolUse.ts`
- Test: `tests/hooks/preToolUse.test.ts` (기존 2개 기대값 수정 + drift 케이스 추가)

**Interfaces:**
- Consumes: `computeDrift` (`src/drift/detect.js`)
- Produces: 동작 변경 — 미정의 태그는 `ask`, drift(관련 코드 미스테이지)는 `ask`.

- [ ] **Step 1: 기존 테스트의 기대값 수정** — `tests/hooks/preToolUse.test.ts`

기존 `deny`를 기대하던 두 테스트를 `ask`로 바꾼다.
- 33–43줄 테스트 제목/기대: `it("git commit이면서 unknownTag가 있으면 ask한다 (changedFiles 제공)", ...)` 안의
  `expect(r!.hookSpecificOutput.permissionDecision).toBe("deny")` → `.toBe("ask")`.
- 70–85줄 테스트 제목/기대: 마찬가지로 `expect(...permissionDecision).toBe("deny")` → `.toBe("ask")`.

- [ ] **Step 2: drift 테스트 2개를 같은 파일 `describe` 안에 추가**

```ts
import { writeFeature } from "../../src/store/featureStore.js";
import { writeLock } from "../../src/drift/lock.js";
import { readConcept } from "../../src/store/conceptStore.js";
import { contractHash } from "../../src/drift/hash.js";

// ... describe 내부에 추가:
it("개념 drift인데 관련 코드가 스테이지에 없으면 ask로 경고한다", async () => {
  await scaffoldInit(root, {});
  await writeConcept(root, {
    slug: "auth-token", category: ["behavior"], title: "A", status: "green",
    description: { definition: "v1" }, purpose: { reason: "r" }, actions: {}, principle: {},
  } as any);
  const c1 = await readConcept(root, "auth-token");
  await writeLock(root, { "auth-token": { hash: contractHash(c1!), at: "t" } });
  await writeFeature(root, { slug: "login", title: "L", concepts: ["auth-token"], codePaths: ["src/login.ts"] } as any);
  await writeConcept(root, {
    slug: "auth-token", category: ["behavior"], title: "A", status: "green",
    description: { definition: "v2" }, purpose: { reason: "r" }, actions: {}, principle: {},
  } as any);
  const r = await decidePreToolUse(root, {
    tool: "Bash", input: { command: "git commit -m x" }, changedFiles: ["README.md"],
  });
  expect(r!.hookSpecificOutput.permissionDecision).toBe("ask");
  expect(r!.hookSpecificOutput.permissionDecisionReason).toContain("DRIFT");
});
it("drift여도 관련 코드가 스테이지에 함께 있으면 막지 않는다(allow)", async () => {
  await scaffoldInit(root, {});
  await writeConcept(root, {
    slug: "auth-token", category: ["behavior"], title: "A", status: "green",
    description: { definition: "v1" }, purpose: { reason: "r" }, actions: {}, principle: {},
  } as any);
  const c1 = await readConcept(root, "auth-token");
  await writeLock(root, { "auth-token": { hash: contractHash(c1!), at: "t" } });
  await writeFeature(root, { slug: "login", title: "L", concepts: ["auth-token"], codePaths: ["src/login.ts"] } as any);
  await writeConcept(root, {
    slug: "auth-token", category: ["behavior"], title: "A", status: "green",
    description: { definition: "v2" }, purpose: { reason: "r" }, actions: {}, principle: {},
  } as any);
  const r = await decidePreToolUse(root, {
    tool: "Bash", input: { command: "git commit -m x" }, changedFiles: ["src/login.ts"],
  });
  expect(r!.hookSpecificOutput.permissionDecision).toBe("allow");
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec vitest run tests/hooks/preToolUse.test.ts`
Expected: FAIL (drift 케이스: 아직 allow/리마인더만 반환; 수정 전 deny 테스트는 이미 ask로 바꿔 실패)

- [ ] **Step 4: 구현 수정** — `src/hooks/preToolUse.ts`

상단 import 추가:

```ts
import { computeDrift } from "../drift/detect.js";
```

`if (!report.ok) { ... }` 블록의 `permissionDecision: "deny"`를 `"ask"`로 바꾸고 이유 문구를 다음으로 교체:

```ts
    if (!report.ok) {
      const detail = report.unknownTags
        .map((t) => `${t.file} → @concept:${t.slug} (undefined)`)
        .join(", ");
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `⚠️ 정의되지 않은 개념 태그 — ${detail}. define-concept로 개념을 정의하거나 태그를 고치세요. 그래도 커밋하시겠습니까?`,
        },
      };
    }
```

그 바로 아래(미승인  refs 검사 위)에 drift 게이트를 추가:

```ts
    const drift = await computeDrift(root);
    const staged = new Set(files);
    const lagging = drift.filter(
      (d) => d.relatedPaths.length > 0 && !d.relatedPaths.every((p) => staged.has(p)),
    );
    if (lagging.length > 0) {
      const detail = lagging
        .map((d) => {
          const missing = d.relatedPaths.filter((p) => !staged.has(p)).join(", ");
          return `${d.slug}${d.reason ? ` (이유: ${d.reason})` : ""} → 미반영 코드: ${missing}`;
        })
        .join(" / ");
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `⚠️ CONCEPT DRIFT — ${detail}. 개념이 바뀌었는데 관련 코드가 이번 커밋에 안 따라왔습니다. 코드를 함께 수정하거나, 그래도 진행하려면 커밋하세요(강행 시 [Drift Ignored]로 기록됨).`,
          additionalContext:
            "Concept drift detected: listed concepts changed since last alignment but their related code is not staged. Run conceptpowers:check-concept to update the code, or override (the commit will be allowed and recorded as drift-ignored on the next reconcile).",
        },
      };
    }
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm exec vitest run tests/hooks/preToolUse.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/preToolUse.ts tests/hooks/preToolUse.test.ts
git commit -m "feat: 커밋 게이트 deny→ask 완화 및 개념 drift 경고 추가" --no-verify
```

---

### Task 8: PostToolUse 훅 + 배선

**Files:**
- Create: `src/hooks/postToolUse.ts`
- Modify: `hooks/hooks.json`
- Modify: `scripts/build.mjs`
- Test: `tests/hooks/postToolUse.test.ts`

**Interfaces:**
- Consumes: `isInitialized`, `reconcileAfterCommit`, `ReconcileResult`
- Produces: `PostToolEvent` = `{ tool: string; input: { command?: string }; committedFiles?: string[] }`; `runPostToolUse(root, ev): Promise<ReconcileResult | null>`

- [ ] **Step 1: 실패 테스트 작성** — `tests/hooks/postToolUse.test.ts`

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPostToolUse } from "../../src/hooks/postToolUse.js";
import { scaffoldInit } from "../../src/init/scaffold.js";
import { writeConcept, readConcept } from "../../src/store/conceptStore.js";
import { writeFeature } from "../../src/store/featureStore.js";
import { writeLock, readLock } from "../../src/drift/lock.js";
import { contractHash } from "../../src/drift/hash.js";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "cp-")); });

describe("runPostToolUse", () => {
  it("init 안 됐으면 null", async () => {
    const r = await runPostToolUse(root, { tool: "Bash", input: { command: "git commit -m x" } });
    expect(r).toBeNull();
  });
  it("git commit이 아니면 null", async () => {
    await scaffoldInit(root, {});
    const r = await runPostToolUse(root, { tool: "Bash", input: { command: "ls" } });
    expect(r).toBeNull();
  });
  it("커밋 후 drift를 재조정한다(관련 코드 포함→aligned, lock 갱신)", async () => {
    await scaffoldInit(root, {});
    await writeConcept(root, {
      slug: "auth-token", category: ["behavior"], title: "A",
      description: { definition: "v1" }, purpose: { reason: "r" }, actions: {}, principle: {},
    } as any);
    const c1 = await readConcept(root, "auth-token");
    await writeLock(root, { "auth-token": { hash: contractHash(c1!), at: "t" } });
    await writeFeature(root, { slug: "login", title: "L", concepts: ["auth-token"], codePaths: ["src/login.ts"] } as any);
    await writeConcept(root, {
      slug: "auth-token", category: ["behavior"], title: "A",
      description: { definition: "v2" }, purpose: { reason: "r" }, actions: {}, principle: {},
    } as any);
    const c2 = await readConcept(root, "auth-token");
    const r = await runPostToolUse(root, {
      tool: "Bash", input: { command: "git commit -m x" }, committedFiles: ["src/login.ts"],
    });
    expect(r!.aligned).toContain("auth-token");
    expect((await readLock(root))["auth-token"].hash).toBe(contractHash(c2!));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/hooks/postToolUse.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/hooks/postToolUse.ts`

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isInitialized } from "../init/scaffold.js";
import { reconcileAfterCommit, type ReconcileResult } from "../drift/reconcile.js";

const execFileAsync = promisify(execFile);
const isGitCommit = (cmd?: string) => !!cmd && /\bgit\s+commit\b/.test(cmd);

export interface PostToolEvent {
  tool: string;
  input: { command?: string };
  committedFiles?: string[];
}

async function committedFiles(root: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["--no-pager", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"],
      { cwd: root },
    );
    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function runPostToolUse(
  root: string,
  ev: PostToolEvent,
): Promise<ReconcileResult | null> {
  if (!(await isInitialized(root))) return null;
  if (!(ev.tool === "Bash" && isGitCommit(ev.input.command))) return null;
  const files = ev.committedFiles ?? (await committedFiles(root));
  try {
    return await reconcileAfterCommit(root, files);
  } catch {
    return null; // best-effort: 이미 커밋은 끝났다
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", async () => {
    try {
      const payload = JSON.parse(raw || "{}");
      await runPostToolUse(process.cwd(), {
        tool: payload.tool_name,
        input: payload.tool_input ?? {},
      });
    } catch {
      /* no-op */
    }
    process.exit(0);
  });
}
```

- [ ] **Step 4: 빌드 엔트리 추가** — `scripts/build.mjs`의 `entryPoints` 배열에 추가

```ts
const entryPoints = [
  join(root, 'src/hooks/sessionStart.ts'),
  join(root, 'src/hooks/preToolUse.ts'),
  join(root, 'src/hooks/postToolUse.ts'),
  join(root, 'src/cli.ts'),
]
```

- [ ] **Step 5: 훅 등록** — `hooks/hooks.json`의 `hooks` 객체에 `PostToolUse` 추가(`PreToolUse` 뒤, 닫는 중괄호 앞)

```json
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/postToolUse.js\"",
            "async": false
          }
        ]
      }
```

(주의: `PreToolUse` 배열 뒤에 쉼표를 추가하고 위 블록을 넣는다.)

- [ ] **Step 6: 통과 확인**

Run: `pnpm exec vitest run tests/hooks/postToolUse.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add src/hooks/postToolUse.ts hooks/hooks.json scripts/build.mjs tests/hooks/postToolUse.test.ts
git commit -m "feat: PostToolUse 훅으로 커밋 후 lock 재조정 배선" --no-verify
```

---

### Task 9: SessionStart drift 주입

**Files:**
- Modify: `src/hooks/sessionStart.ts`
- Test: `tests/hooks/sessionStart.test.ts` (drift 케이스 추가)

**Interfaces:**
- Consumes: `computeDrift`
- Produces: drift가 있으면 `additionalContext`에 `<CONCEPT-DRIFT>` 블록 포함, 없으면 미포함.

- [ ] **Step 1: 실패 테스트 작성** — `tests/hooks/sessionStart.test.ts`의 `describe` 안에 추가

상단에 import 보강(이미 있으면 생략):

```ts
import { writeConcept, readConcept } from "../../src/store/conceptStore.js";
import { writeFeature } from "../../src/store/featureStore.js";
import { writeLock } from "../../src/drift/lock.js";
import { contractHash } from "../../src/drift/hash.js";
```

테스트 추가:

```ts
it("drift가 있으면 <CONCEPT-DRIFT> 블록과 이유를 주입한다", async () => {
  await scaffoldInit(root, {});
  await writeConcept(root, {
    slug: "auth-token", category: ["behavior"], title: "A",
    description: { definition: "v1" }, purpose: { reason: "r" }, actions: {}, principle: {},
  } as any);
  const c1 = await readConcept(root, "auth-token");
  await writeLock(root, { "auth-token": { hash: contractHash(c1!), at: "t" } });
  await writeFeature(root, { slug: "login", title: "L", concepts: ["auth-token"], codePaths: ["src/login.ts"] } as any);
  await writeConcept(root, {
    slug: "auth-token", category: ["behavior"], title: "A",
    description: { definition: "v2" }, purpose: { reason: "r" }, actions: {}, principle: {},
  } as any);
  const o = await buildSessionStartOutput(root, root);
  expect(o!.hookSpecificOutput.additionalContext).toContain("<CONCEPT-DRIFT>");
  expect(o!.hookSpecificOutput.additionalContext).toContain("auth-token");
});
it("drift가 없으면 <CONCEPT-DRIFT> 블록이 없다", async () => {
  await scaffoldInit(root, {});
  const o = await buildSessionStartOutput(root, root);
  expect(o!.hookSpecificOutput.additionalContext).not.toContain("<CONCEPT-DRIFT>");
});
```

(기존 sessionStart.test.ts에 `scaffoldInit`/`buildSessionStartOutput` import가 이미 있다고 가정. 없으면 보강한다.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/hooks/sessionStart.test.ts`
Expected: FAIL (블록 미포함)

- [ ] **Step 3: 구현** — `src/hooks/sessionStart.ts`

상단 import 추가:

```ts
import { computeDrift } from "../drift/detect.js";
```

`const context = [ ... ].join("\n")` 직후, `return` 직전에 drift 블록을 덧붙인다:

```ts
  const drift = await computeDrift(root);
  const driftBlock =
    drift.length > 0
      ? "\n" +
        [
          "<CONCEPT-DRIFT>",
          "These concepts changed since their code was last aligned. Their related code may need updating:",
          ...drift.map(
            (d) =>
              `- ${d.slug}${d.reason ? ` (이유: ${d.reason})` : ""} → related code: ${
                d.relatedPaths.length ? d.relatedPaths.join(", ") : "(none yet)"
              }`,
          ),
          "Guide the user to update the related code (or the concept) so they re-align; run conceptpowers:check-concept.",
          "</CONCEPT-DRIFT>",
        ].join("\n")
      : "";
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context + driftBlock,
    },
  };
```

(기존 `return { hookSpecificOutput: { ... additionalContext: context } }`를 위 형태로 교체.)

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run tests/hooks/sessionStart.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/hooks/sessionStart.ts tests/hooks/sessionStart.test.ts
git commit -m "feat: SessionStart에 개념 drift 컨텍스트 주입" --no-verify
```

---

### Task 10: CLI(`drift`/`note-change`/`status`) + 스킬 + 최종 빌드

**Files:**
- Modify: `src/cli.ts`
- Modify: `skills/define-concept/SKILL.md`
- Modify: `skills/update-baseline/SKILL.md`
- Test: `tests/cli/cli.test.ts` (drift/note-change/status 케이스 추가)

**Interfaces:**
- Consumes: `computeDrift`, `noteChange`
- Produces: CLI `drift`, `note-change <slug> --reason <r>`, 확장된 `status`(`{ initialized, drift }`)

- [ ] **Step 1: 실패 테스트 작성** — `tests/cli/cli.test.ts`의 `describe` 안에 추가

기존 테스트 패턴(`runCli(['...'], out)`)을 따른다. 상단 import에 다음이 필요하면 보강:

```ts
import { writeConcept } from "../../src/store/conceptStore.js";
import { readHistory } from "../../src/drift/history.js";
```

테스트:

```ts
it("status는 drift 개수를 포함한다", async () => {
  let captured = "";
  await runCli(["init", "--root", root], () => {});
  const code = await runCli(["status", "--root", root], (s) => (captured += s));
  expect(code).toBe(0);
  expect(JSON.parse(captured)).toMatchObject({ initialized: true, drift: 0 });
});
it("note-change는 history에 이유를 기록한다", async () => {
  await runCli(["init", "--root", root], () => {});
  await writeConcept(root, {
    slug: "auth-token", category: ["behavior"], title: "A",
    description: { definition: "d" }, purpose: { reason: "r" }, actions: {}, principle: {},
  } as any);
  await runCli(["note-change", "auth-token", "--reason", "만료 30분", "--root", root], () => {});
  const h = await readHistory(root);
  expect(h.some((e) => e.slug === "auth-token" && e.reason === "만료 30분")).toBe(true);
});
it("drift는 JSON 배열을 출력한다", async () => {
  let captured = "";
  await runCli(["init", "--root", root], () => {});
  await runCli(["drift", "--root", root], (s) => (captured += s));
  expect(JSON.parse(captured)).toEqual([]);
});
```

(테스트 파일 상단의 `root` 셋업이 기존에 있으면 재사용한다. 없으면 `beforeEach`로 `mkdtempSync` 생성.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run tests/cli/cli.test.ts`
Expected: FAIL (명령 미정의 / status에 drift 없음)

- [ ] **Step 3: CLI 구현** — `src/cli.ts`

상단 import 추가:

```ts
import { computeDrift } from "./drift/detect.js";
import { noteChange } from "./drift/note.js";
```

`status` 커맨드의 action을 교체:

```ts
  program
    .command("status")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      out(JSON.stringify({
        initialized: await isInitialized(o.root),
        drift: (await computeDrift(o.root)).length,
      }));
    });
```

`audit` 커맨드 정의 뒤에 두 커맨드 추가:

```ts
  program
    .command("drift")
    .option("--root <dir>", "project root", process.cwd())
    .action(async (o) => {
      out(JSON.stringify(await computeDrift(o.root)));
    });

  program
    .command("note-change")
    .option("--root <dir>", "project root", process.cwd())
    .requiredOption("--reason <reason>", "why the concept changed")
    .argument("<slug>")
    .action(async (slug, o) => {
      await noteChange(o.root, slug, o.reason);
    });
```

- [ ] **Step 4: 스킬 단계 추가** — `skills/update-baseline/SKILL.md`

step 2(개념 수정)의 "If the concept change affects existing code..." 줄 바로 뒤에 한 줄 추가:

```markdown
   - Record **why** the concept changed so drift detection can surface the reason:
     `node "<cli>" note-change <slug> --reason "<why it changed>" --root .`
```

- [ ] **Step 5: 스킬 단계 추가** — `skills/define-concept/SKILL.md`

step 8 뒤에 step 9 추가:

```markdown
9. If this **redefines an existing** concept (not a brand-new one), record why it changed so drift is
   traceable: `node "<cli>" note-change <slug> --reason "<why it changed>" --root .`
```

- [ ] **Step 6: 통과 확인**

Run: `pnpm exec vitest run tests/cli/cli.test.ts`
Expected: PASS

- [ ] **Step 7: 전체 테스트 + 빌드 + 커밋**

```bash
pnpm test
pnpm build
git add src/cli.ts skills/define-concept/SKILL.md skills/update-baseline/SKILL.md tests/cli/cli.test.ts dist
git commit -m "feat: drift/note-change CLI와 스킬 note-change 단계 추가, dist 재빌드" --no-verify
```

Expected: `pnpm test` 전부 PASS (80%+ 커버리지 유지), `pnpm build`가 `dist/{cli,hooks/sessionStart,hooks/preToolUse,hooks/postToolUse}.js` 생성.

---

## Self-Review

**Spec coverage:**
- 계약 해시(요청 시 계산, 비계약 필드 제외) → Task 2 ✅
- 상태 파일 lock/history(baseline 분리, zod) → Task 1·3·4 ✅
- computeDrift(lock 비교 + relatedPaths = 태그∪feature) → Task 5 ✅
- PreToolUse: deny→ask, drift→ask → Task 7 ✅
- PostToolUse: 커밋 후 재조정(aligned/ignored, 신규 등록) → Task 6·8 ✅
- SessionStart drift 주입 → Task 9 ✅
- why 포착(noteChange) + CLI `drift`/`note-change` + status 확장 → Task 4·10 ✅
- 스킬 note-change 단계 → Task 10 ✅
- 빌드 엔트리/hooks.json 배선 → Task 8 ✅
- YAGNI 제외(인라인 버전/뷰어 배지/sync 명령) → 계획에 미포함 ✅

**Placeholder scan:** 모든 스텝에 실제 코드/명령 포함, TBD 없음 ✅

**Type consistency:** `contractHash(Concept):string`, `DriftItem{slug,currentHash,lockedHash,reason,relatedPaths}`, `ReconcileResult{aligned,ignored}`, `HistoryEntry{slug,hash,prevHash,reason,at,ignored}`, `AlignmentLock=Record<string,{hash,at}>` — Task 간 시그니처 일치 확인 ✅

**엣지 케이스:** lock 없음→무drift(Task5), 관련 코드 0개→aligned(Task6), 미초기화→null/빈 결과(Task8·10), 깨진 상태파일→폴백(Task3·4) ✅
