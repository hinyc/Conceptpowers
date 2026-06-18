// src/audit/audit.ts
import { listConcepts } from '../store/conceptStore.js'
import { scanTags } from '../mapping/scan.js'

export interface UnknownTag { slug: string; file: string }
export interface AuditReport {
  ok: boolean
  unknownTags: UnknownTag[]
  unapproved: string[]     // 프로젝트 전체의 미승인(red) 개념 slug
  unapprovedRefs: string[] // 스캔한 파일이 참조하는 미승인(red) 개념 slug
}

export async function auditIntegrity(root: string, files: string[]): Promise<AuditReport> {
  const concepts = await listConcepts(root)
  const known = new Set(concepts.map(c => c.slug))
  const red = new Set(concepts.filter(c => (c.status ?? 'red') === 'red').map(c => c.slug))
  const tags = await scanTags(root, files)
  const unknownTags: UnknownTag[] = []
  const refRed = new Set<string>()
  for (const [file, slugs] of Object.entries(tags))
    for (const slug of slugs) {
      if (!known.has(slug)) unknownTags.push({ slug, file })
      else if (red.has(slug)) refRed.add(slug)
    }
  return {
    ok: unknownTags.length === 0, // 미승인(red)은 정합성을 막지 않음(경고만)
    unknownTags,
    unapproved: [...red],
    unapprovedRefs: [...refRed]
  }
}
