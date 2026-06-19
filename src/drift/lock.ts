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
