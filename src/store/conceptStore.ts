// src/store/conceptStore.ts
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join, dirname } from 'node:path'
import { cpPaths } from '../paths.js'
import { parseConcept, type Concept } from '../schema/concept.js'

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
    throw new Error(`slug 중복: ${concept.slug} 은(는) 이미 존재합니다 (전역 고유)`)
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
    catch (error) { throw new Error(`개념 파일 파싱 실패: ${f} — ${(error as Error).message}`) }
  }
  return concepts
}

export async function readConcept(root: string, slug: string): Promise<Concept | null> {
  return (await listConcepts(root)).find(c => c.slug === slug) ?? null
}

export async function slugExists(root: string, slug: string): Promise<boolean> {
  return (await readConcept(root, slug)) !== null
}
