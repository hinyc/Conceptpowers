// src/viewer/render.ts
import type { Concept } from '../schema/concept.js'
import { conceptPage, indexPage } from './template.js'

export function renderViewer(concepts: Concept[]): Record<string, string> {
  const out: Record<string, string> = { 'index.html': indexPage(concepts) }
  for (const c of concepts) {
    const rel = c.group ? `${c.group}/${c.slug}.html` : `${c.slug}.html`
    out[rel] = conceptPage(c)
  }
  return out
}
