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
