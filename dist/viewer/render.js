// src/viewer/render.ts
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conceptPage, indexPage } from './template.js';
import { listConcepts } from '../store/conceptStore.js';
import { cpPaths } from '../paths.js';
export function renderViewer(concepts) {
    const out = { 'index.html': indexPage(concepts) };
    for (const c of concepts) {
        const rel = c.group ? `${c.group}/${c.slug}.html` : `${c.slug}.html`;
        out[rel] = conceptPage(c);
    }
    return out;
}
async function readBundledCss() {
    // dist/viewer/render.js 기준 → 패키지 루트의 assets/concept.css
    const here = dirname(fileURLToPath(import.meta.url));
    const cssPath = join(here, '..', '..', 'assets', 'concept.css');
    return readFile(cssPath, 'utf8');
}
export async function renderViewerToDisk(root) {
    const concepts = await listConcepts(root);
    const files = renderViewer(concepts);
    const viewer = cpPaths(root).conceptsViewer;
    for (const [rel, html] of Object.entries(files)) {
        const target = join(viewer, rel);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, html, 'utf8');
    }
    const cssTarget = cpPaths(root).cssTarget;
    await mkdir(dirname(cssTarget), { recursive: true });
    await writeFile(cssTarget, await readBundledCss(), 'utf8');
}
//# sourceMappingURL=render.js.map