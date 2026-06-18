// src/mapping/scan.ts
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { cpPaths } from '../paths.js';
const TAG_RE = /@concept:([a-z0-9]+(?:-[a-z0-9]+)*)/g;
export async function scanTags(root, files) {
    const result = {};
    for (const rel of files) {
        let content;
        try {
            content = await readFile(join(root, rel), 'utf8');
        }
        catch {
            continue;
        }
        const slugs = [];
        for (const m of content.matchAll(TAG_RE))
            slugs.push(m[1]);
        if (slugs.length)
            result[rel] = slugs;
    }
    return result;
}
export async function buildMapping(root, files) {
    const tags = await scanTags(root, files);
    const mapping = {};
    for (const [file, slugs] of Object.entries(tags)) {
        for (const slug of slugs)
            mapping[slug] = [...(mapping[slug] ?? []), file];
    }
    return mapping;
}
export async function writeMappingCache(root, mapping) {
    const target = cpPaths(root).mappingCache;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
}
//# sourceMappingURL=scan.js.map