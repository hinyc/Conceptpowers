// src/store/featureStore.ts
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join, dirname } from 'node:path'
import { cpPaths } from '../paths.js'
import { parseFeature, type Feature } from '../schema/feature.js'

function fileFor(root: string, f: Feature): string {
  const dir = cpPaths(root).features
  return f.group ? join(dir, f.group, `${f.slug}.json`) : join(dir, `${f.slug}.json`)
}

export async function writeFeature(root: string, input: unknown): Promise<Feature> {
  const feature = parseFeature(input)
  const target = fileFor(root, feature)
  const existing = await listFeatures(root)
  const duplicate = existing.find((f) => f.slug === feature.slug && fileFor(root, f) !== target)
  if (duplicate) {
    throw new Error(`Duplicate feature slug: ${feature.slug} already exists (globally unique)`)
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(feature, null, 2) + '\n', 'utf8')
  return feature
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

export async function listFeatures(root: string): Promise<Feature[]> {
  const files = await walkJson(cpPaths(root).features)
  const features: Feature[] = []
  for (const file of files) {
    try { features.push(parseFeature(JSON.parse(await readFile(file, 'utf8')))) }
    catch (error) { throw new Error(`Failed to parse feature file: ${file} — ${(error as Error).message}`) }
  }
  return features
}

export async function readFeature(root: string, slug: string): Promise<Feature | null> {
  return (await listFeatures(root)).find((f) => f.slug === slug) ?? null
}
