// @concept:none
import { join } from 'node:path';

export const CP_REL = 'docs/conceptpowers';

export function cpPaths(root: string) {
  const base = join(root, CP_REL);
  return {
    base,
    initFile: join(base, 'init.json'),
    features: join(base, 'features'),
    reference: join(base, 'reference'),
    conceptsData: join(base, 'concepts', 'data'),
    conceptsViewer: join(base, 'concepts', 'viewer'),
    architecture: join(base, 'architecture'),
    infra: join(base, 'infra'),
    mappingCache: join(base, '.cache', 'mapping.json'),
    cssTarget: join(base, 'concepts', 'viewer', 'assets', 'concept.css'),
    alignmentDir: join(base, 'concepts', '.alignment'),
    alignmentLock: join(base, 'concepts', '.alignment', 'alignment.lock.json'),
    // 예전 한 파일 이력(읽기 전용) — 새 기록은 alignmentHistoryDir에 기록마다 파일로 더한다.
    alignmentHistory: join(base, 'concepts', '.alignment', 'history.json'),
    alignmentHistoryDir: join(base, 'concepts', '.alignment', 'history'),
    alignmentLastCommit: join(base, 'concepts', '.alignment', 'last-commit'),
    pendingConflicts: join(base, 'concepts', '.alignment', 'pending-conflicts.json'),
    attestFile: join(base, 'concepts', '.alignment', 'attest.json'),
    testReviewFile: join(base, 'concepts', '.alignment', 'test-review.json'),
    noCodeFile: join(base, 'concepts', '.alignment', 'no-code.json'),
    referenceLock: join(base, 'concepts', '.alignment', 'reference.lock.json'),
  } as const;
}
