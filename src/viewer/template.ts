// src/viewer/template.ts
import type { Concept } from '../schema/concept.js'
import type { Feature } from '../schema/feature.js'
import type { Locale } from '../schema/initConfig.js'
import { viewerStrings, type ViewerStrings } from '../i18n/messages.js'

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function list(items: string[]): string {
  return items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''
}

function statusBadge(c: Concept, t: ViewerStrings): string {
  const status = c.status ?? 'red'
  const label = status === 'green' ? t.statusApproved : t.statusUnapproved
  return `<span class="badge badge--${status}">${esc(label)}</span>`
}

// 뷰어 루트 기준 절대 경로 + 깊이(슬래시 수)로 상대 경로를 만든다.
const depthOf = (rel: string) => rel.split('/').length - 1
const upTo = (rel: string) => '../'.repeat(depthOf(rel))
const cssHref = (depth: number) => `${'../'.repeat(depth)}assets/concept.css`
export const conceptRel = (c: Pick<Concept, 'group' | 'slug'>) =>
  c.group ? `${c.group}/${c.slug}.html` : `${c.slug}.html`
export const featureRel = (f: Pick<Feature, 'group' | 'slug'>) =>
  f.group ? `features/${f.group}/${f.slug}.html` : `features/${f.slug}.html`

export function conceptPage(c: Concept, locale: Locale = 'ko', relatedFeatures: Feature[] = []): string {
  const rel = conceptRel(c)
  const up = upTo(rel)
  const t = viewerStrings[locale]
  const related = relatedFeatures.length
    ? `<section class="section"><h2>${t.relatedFeatures}</h2><ul class="links">${relatedFeatures
        .map((f) => `<li><a href="${up}${esc(featureRel(f))}">${esc(f.title)}</a></li>`)
        .join('')}</ul></section>`
    : ''
  return `<!DOCTYPE html>
<html lang="${locale}"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(c.title)} · concept</title>
<link rel="stylesheet" href="${cssHref(depthOf(rel))}"/></head>
<body><div class="wrap">
<header class="hero"><span class="hero__eyebrow">${esc(c.eyebrow)}</span>${statusBadge(c, t)}
<h1>${esc(c.title)}</h1><p>${esc(c.description.definition)}</p>
<p class="cats">${c.category.map(esc).join(' · ')}</p></header>
<section class="section"><h2>${t.description}</h2><p>${esc(c.description.definition)}</p>
${c.description.analogy ? `<p class="analogy">${esc(c.description.analogy)}</p>` : ''}
${list(c.description.components)}</section>
<section class="section"><h2>${t.purpose}</h2><p>${esc(c.purpose.reason)}</p>${list(c.purpose.benefits)}</section>
<section class="section cols"><div class="col-card col-card--allow"><h3>${t.allow}</h3>${list(c.actions.allow)}</div>
<div class="col-card col-card--restrict"><h3>${t.restrict}</h3>${list(c.actions.restrict)}</div></section>
<section class="section"><h2>${t.principle}</h2>${list(c.principle.immutableRules)}
${c.principle.tradeoffs ? `<p>${esc(c.principle.tradeoffs)}</p>` : ''}</section>
${related}
<nav class="pagenav"><a href="${up}index.html">${esc(t.conceptList)}</a> · <a href="${up}graph.html">${esc(t.graphTitle)}</a></nav>
</div></body></html>\n`
}

// 기능 페이지: 관련 개념 링크 + 구현 경로. concepts는 slug→Concept 조회용.
export function featurePage(f: Feature, locale: Locale = 'ko', concepts: Map<string, Concept> = new Map()): string {
  const rel = featureRel(f)
  const up = upTo(rel)
  const t = viewerStrings[locale]
  const conceptLinks = f.concepts
    .map((slug) => {
      const c = concepts.get(slug)
      return c
        ? `<li><a href="${up}${esc(conceptRel(c))}">${esc(c.title)}</a></li>`
        : `<li><span class="muted">${esc(slug)}</span></li>`
    })
    .join('')
  const paths = f.codePaths.length
    ? `<ul class="paths">${f.codePaths.map((p) => `<li><code>${esc(p)}</code></li>`).join('')}</ul>`
    : ''
  return `<!DOCTYPE html>
<html lang="${locale}"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(f.title)} · feature</title>
<link rel="stylesheet" href="${cssHref(depthOf(rel))}"/></head>
<body><div class="wrap">
<header class="hero"><span class="hero__eyebrow">${esc(t.featureEyebrow)}</span>
<h1>${esc(f.title)}</h1>${f.description ? `<p>${esc(f.description)}</p>` : ''}</header>
<section class="section"><h2>${t.relatedConcepts}</h2><ul class="links">${conceptLinks}</ul></section>
<section class="section"><h2>${t.implementationPaths}</h2>${paths}</section>
<nav class="pagenav"><a href="${up}index.html">${esc(t.conceptList)}</a> · <a href="${up}graph.html">${esc(t.graphTitle)}</a></nav>
</div></body></html>\n`
}

export function indexPage(concepts: Concept[], locale: Locale = 'ko', features: Feature[] = []): string {
  const byGroup = new Map<string, Concept[]>()
  for (const c of concepts) {
    const g = c.group || '(ungrouped)'
    byGroup.set(g, [...(byGroup.get(g) ?? []), c])
  }
  const t = viewerStrings[locale]
  const sections = [...byGroup.entries()].map(([g, cs]) =>
    `<section class="group"><h2>${esc(g)}</h2><ul>${cs.map(c => {
      const href = conceptRel(c)
      return `<li>${statusBadge(c, t)} <a href="${esc(href)}">${esc(c.title)}</a> <small>${c.category.map(esc).join(', ')}</small></li>`
    }).join('')}</ul></section>`).join('')
  const featureSection = features.length
    ? `<section class="group"><h2>${esc(t.featureList)}</h2><ul>${features
        .map((f) => `<li><a href="${esc(featureRel(f))}">${esc(f.title)}</a> <small>${f.codePaths.length}</small></li>`)
        .join('')}</ul></section>`
    : ''
  const title = t.conceptList
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="UTF-8"/>
<title>${title} · Conceptpowers</title><link rel="stylesheet" href="assets/concept.css"/></head>
<body><div class="wrap"><header class="hero"><h1>${title}</h1>
<nav class="pagenav"><a class="graph-link" href="graph.html">${esc(t.openGraph)} →</a></nav></header>
${sections}${featureSection}</div></body></html>\n`
}
