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

// 개념의 승인 상태를 불변으로 갱신한다(읽기 → 새 객체 → 쓰기).
// green으로 전환 시 pending 충돌 기록도 자동으로 정리한다.
export async function setConceptStatus(
  root: string,
  slug: string,
  status: ConceptStatus,
): Promise<Concept> {
  const concept = await readConcept(root, slug)
  if (!concept) throw new Error(`Concept not found: ${slug}`)
  const updated = await writeConcept(root, { ...concept, status })
  if (status === 'green') await clearPendingConflict(root, slug)
  return updated
}
