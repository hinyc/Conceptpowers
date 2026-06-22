// src/store/conceptStore.ts
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join, dirname } from 'node:path'
import { cpPaths } from '../paths.js'
import { parseConcept, type Concept, type ConceptStatus } from '../schema/concept.js'
import { clearPendingConflict } from '../concept/pendingConflicts.js'

function fileFor(root: string, c: Concept): string {
  const dataDir = cpPaths(root).conceptsData
  return c.group ? join(dataDir, c.group, `${c.slug}.json`) : join(dataDir, `${c.slug}.json`)
}

export async function writeConcept(root: string, input: unknown): Promise<Concept> {
  const concept = parseConcept(input)
  const target = fileFor(root, concept)
  const existing = await listConcepts(root)
  const duplicate = existing.find(
    (c) => c.slug === concept.slug && fileFor(root, c) !== target
  )
  if (duplicate) {
    throw new Error(`Duplicate slug: ${concept.slug} already exists (globally unique)`)
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(concept, null, 2) + '\n', 'utf8')
  return concept
}

async function walkJson(dir: string): Promise<string[]> {
  let entries: Dirent[]
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return [] }
  const out: string[] = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...await walkJson(full))
    else if (e.name.endsWith('.json')) out.push(full)
  }
  return out
}

export async function listConcepts(root: string): Promise<Concept[]> {
  const files = await walkJson(cpPaths(root).conceptsData)
  const concepts: Concept[] = []
  for (const f of files) {
    try { concepts.push(parseConcept(JSON.parse(await readFile(f, 'utf8')))) }
    catch (error) { throw new Error(`Failed to parse concept file: ${f} — ${(error as Error).message}`) }
  }
  return concepts
}

export async function readConcept(root: string, slug: string): Promise<Concept | null> {
  return (await listConcepts(root)).find(c => c.slug === slug) ?? null
}

export async function slugExists(root: string, slug: string): Promise<boolean> {
  return (await readConcept(root, slug)) !== null
}

// 허용 상태 전이(programmatic). green/red는 settled — 이 헬퍼로는 변경 불가.
// red→green은 사람의 승인(approve), pending→green은 일관성 통과, pending→red는 거부.
// (사용자가 직접 JSON을 다시 작성하는 writeConcept 경로는 이 가드의 대상이 아니다.)
const ALLOWED_STATUS_TRANSITIONS: Record<ConceptStatus, readonly ConceptStatus[]> = {
  red: ['red', 'green'],
  pending: ['pending', 'green', 'red'],
  green: ['green'],
}

// 개념의 승인 상태를 불변으로 갱신한다(읽기 → 전이 검증 → 새 객체 → 쓰기).
// green으로 전환 시 pending 충돌 기록도 자동으로 정리한다.
export async function setConceptStatus(
  root: string,
  slug: string,
  status: ConceptStatus,
): Promise<Concept> {
  const concept = await readConcept(root, slug)
  if (!concept) throw new Error(`Concept not found: ${slug}`)
  const from = concept.status
  if (!ALLOWED_STATUS_TRANSITIONS[from].includes(status)) {
    throw new Error(
      `Illegal status transition: ${from} → ${status} (${slug}). ` +
        `green/red are settled; only red→green (human approval) and pending→green/red are allowed.`,
    )
  }
  const updated = await writeConcept(root, { ...concept, status })
  if (status === 'green') await clearPendingConflict(root, slug)
  return updated
}

// 내용 편집으로 바꿀 수 있는 필드(섹션 단위 교체). slug/group(파일 경로 키)과
// status(상태 전이는 setConceptStatus 전용)는 의도적으로 제외한다.
const EDITABLE_FIELDS = [
  'category', 'number', 'title', 'eyebrow',
  'description', 'purpose', 'actions', 'principle', 'relations', 'codeLinks',
] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]
export type ConceptContentPatch = Partial<Pick<Concept, EditableField>>

// 개념 본문을 불변으로 편집한다(읽기 → 화이트리스트 병합 → 검증 → 쓰기).
// 병합은 "최상위 필드 단위 교체"다(deep-merge 아님): patch에 description이 오면
// description 전체가 교체된다. 호출자(뷰어 폼)는 각 섹션을 통째로 보내야 부분 유실이 없다.
// 정책: green 개념을 편집하면 status를 pending으로 내려 재검증을 유도한다
// (이는 setConceptStatus 가드가 막는 전이이므로 별도의 의도된 연산으로 둔다).
// pending/red는 내용만 바뀌고 상태를 유지한다.
export async function editConceptContent(
  root: string,
  slug: string,
  patch: ConceptContentPatch,
): Promise<Concept> {
  const concept = await readConcept(root, slug)
  if (!concept) throw new Error(`Concept not found: ${slug}`)
  const safe: Partial<Concept> = {}
  for (const key of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined) {
      ;(safe as Record<string, unknown>)[key] = patch[key]
    }
  }
  const nextStatus: ConceptStatus = concept.status === 'green' ? 'pending' : concept.status
  return writeConcept(root, { ...concept, ...safe, slug: concept.slug, group: concept.group, status: nextStatus })
}
