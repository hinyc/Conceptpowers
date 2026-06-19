import { readFile } from 'node:fs/promises'
import { cpPaths } from '../paths.js'
import { AlignmentLock } from '../schema/alignment.js'
import { writeFileAtomic } from '../util/atomicWrite.js'

export async function readLock(root: string): Promise<AlignmentLock> {
  try {
    return AlignmentLock.parse(JSON.parse(await readFile(cpPaths(root).alignmentLock, 'utf8')))
  } catch {
    return {}
  }
}

export async function writeLock(root: string, lock: AlignmentLock): Promise<void> {
  await writeFileAtomic(cpPaths(root).alignmentLock, JSON.stringify(lock, null, 2) + '\n')
}
