import { join } from 'node:path'

export const CP_REL = 'docs/conceptpowers'

export function cpPaths(root: string) {
  const base = join(root, CP_REL)
  return {
    base,
    initFile: join(base, 'init.json'),
    features: join(base, 'features'),
    conceptsData: join(base, 'concepts', 'data'),
    conceptsViewer: join(base, 'concepts', 'viewer'),
    architecture: join(base, 'architecture'),
    infra: join(base, 'infra'),
    mappingCache: join(base, '.cache', 'mapping.json'),
    cssTarget: join(base, 'concepts', 'viewer', 'assets', 'concept.css'),
    alignmentDir: join(base, 'concepts', '.alignment'),
    alignmentLock: join(base, 'concepts', '.alignment', 'alignment.lock.json'),
    alignmentHistory: join(base, 'concepts', '.alignment', 'history.json')
  } as const
}
