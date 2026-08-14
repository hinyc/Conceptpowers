// @concept:governance-mode
// src/hooks/gates/conceptSlugs.ts
import { CP_REL } from '../../paths.js';
import { normalizeRel } from '../../drift/safe.js';

// 스테이징 목록에서 개념 데이터 파일의 slug를 뽑는다 (slug는 파일명 = 전역 유일).
export function stagedConceptSlugs(files: string[]): string[] {
  const conceptDataPrefix = `${CP_REL}/concepts/data/`;
  return files
    .map(normalizeRel)
    .filter((f) => f.startsWith(conceptDataPrefix) && f.endsWith('.json'))
    .map((f) => f.slice(f.lastIndexOf('/') + 1, -'.json'.length));
}
