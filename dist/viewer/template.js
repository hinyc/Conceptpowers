export function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function list(items) {
    return items.length ? `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
}
const cssHref = (depth) => `${'../'.repeat(depth)}assets/concept.css`;
export function conceptPage(c) {
    const depth = c.group ? 1 : 0;
    return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(c.title)} · concept</title>
<link rel="stylesheet" href="${cssHref(depth)}"/></head>
<body><div class="wrap">
<header class="hero"><span class="hero__eyebrow">${esc(c.eyebrow)}</span>
<h1>${esc(c.title)}</h1><p>${esc(c.description.definition)}</p>
<p class="cats">${c.category.map(esc).join(' · ')}</p></header>
<section class="section"><h2>설명</h2><p>${esc(c.description.definition)}</p>
${c.description.analogy ? `<p class="analogy">${esc(c.description.analogy)}</p>` : ''}
${list(c.description.components)}</section>
<section class="section"><h2>목적</h2><p>${esc(c.purpose.reason)}</p>${list(c.purpose.benefits)}</section>
<section class="section cols"><div class="col-card col-card--allow"><h3>허용 행동</h3>${list(c.actions.allow)}</div>
<div class="col-card col-card--restrict"><h3>제한 행동</h3>${list(c.actions.restrict)}</div></section>
<section class="section"><h2>운영 원칙</h2>${list(c.principle.immutableRules)}
${c.principle.tradeoffs ? `<p>${esc(c.principle.tradeoffs)}</p>` : ''}</section>
</div></body></html>\n`;
}
export function indexPage(concepts) {
    const byGroup = new Map();
    for (const c of concepts) {
        const g = c.group || '(ungrouped)';
        byGroup.set(g, [...(byGroup.get(g) ?? []), c]);
    }
    const sections = [...byGroup.entries()].map(([g, cs]) => `<section class="group"><h2>${esc(g)}</h2><ul>${cs.map(c => {
        const href = c.group ? `${esc(c.group)}/${esc(c.slug)}.html` : `${esc(c.slug)}.html`;
        return `<li><a href="${href}">${esc(c.title)}</a> <small>${c.category.map(esc).join(', ')}</small></li>`;
    }).join('')}</ul></section>`).join('');
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<title>개념 목록 · Conceptpowers</title><link rel="stylesheet" href="assets/concept.css"/></head>
<body><div class="wrap"><header class="hero"><h1>개념 목록</h1></header>${sections}</div></body></html>\n`;
}
//# sourceMappingURL=template.js.map