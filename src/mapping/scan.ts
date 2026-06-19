// src/mapping/scan.ts
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { z } from 'zod'
import { cpPaths } from '../paths.js'

export type Mapping = Record<string, string[]>
const MappingSchema = z.record(z.string(), z.array(z.string()))
const TAG_RE = /@concept:([a-z0-9]+(?:-[a-z0-9]+)*)/g

export async function scanTags(root: string, files: string[]): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {}
  for (const rel of files) {
    let content: string
    try { content = await readFile(join(root, rel), 'utf8') } catch { continue }
    const slugs: string[] = []
    for (const m of content.matchAll(TAG_RE)) slugs.push(m[1])
    if (slugs.length) result[rel] = slugs
  }
  return result
}

export async function buildMapping(root: string, files: string[]): Promise<Mapping> {
  const tags = await scanTags(root, files)
  const mapping: Mapping = {}
  for (const [file, slugs] of Object.entries(tags)) {
    for (const slug of slugs) mapping[slug] = [...(mapping[slug] ?? []), file]
  }
  return mapping
}

export async function writeMappingCache(root: string, mapping: Mapping): Promise<void> {
  const target = cpPaths(root).mappingCache
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(mapping, null, 2) + '\n', 'utf8')
}

export async function readMappingCache(root: string): Promise<Mapping> {
  try {
    return MappingSchema.parse(JSON.parse(await readFile(cpPaths(root).mappingCache, 'utf8')))
  } catch {
    return {}
  }
}
