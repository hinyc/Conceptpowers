import { readFile } from 'node:fs/promises'
import { cpPaths } from '../paths.js'
import { History, HistoryEntry } from '../schema/alignment.js'
import { writeFileAtomic } from '../util/atomicWrite.js'

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

function toEntry(input: HistoryInput, prevHash: string): HistoryEntry {
  return HistoryEntry.parse({
    slug: input.slug,
    hash: input.hash,
    prevHash,
    reason: input.reason ?? '',
    ignored: input.ignored ?? false,
    at: input.at ?? new Date().toISOString(),
  })
}

// 여러 항목을 한 번의 read + 일괄 append + 한 번의 원자적 write로 기록한다.
// (슬러그별 다중 read/write로 인한 경쟁·항목 유실을 피한다.)
export async function appendHistoryMany(
  root: string,
  inputs: HistoryInput[],
): Promise<HistoryEntry[]> {
  if (inputs.length === 0) return []
  const all = [...(await readHistory(root))]
  const added: HistoryEntry[] = []
  for (const input of inputs) {
    const prev = [...all].reverse().find((e) => e.slug === input.slug)
    const entry = toEntry(input, prev?.hash ?? '')
    all.push(entry)
    added.push(entry)
  }
  await writeFileAtomic(cpPaths(root).alignmentHistory, JSON.stringify(all, null, 2) + '\n')
  return added
}

export async function appendHistory(root: string, input: HistoryInput): Promise<HistoryEntry> {
  return (await appendHistoryMany(root, [input]))[0]
}
