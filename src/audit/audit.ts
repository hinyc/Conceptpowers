// src/audit/audit.ts
import { listConcepts } from '../store/conceptStore.js'
import { scanTags } from '../mapping/scan.js'

export interface UnknownTag { slug: string; file: string }
export interface AuditReport { ok: boolean; unknownTags: UnknownTag[] }

export async function auditIntegrity(root: string, files: string[]): Promise<AuditReport> {
  const known = new Set((await listConcepts(root)).map(c => c.slug))
  const tags = await scanTags(root, files)
  const unknownTags: UnknownTag[] = []
  for (const [file, slugs] of Object.entries(tags))
    for (const slug of slugs)
      if (!known.has(slug)) unknownTags.push({ slug, file })
  return { ok: unknownTags.length === 0, unknownTags }
}
