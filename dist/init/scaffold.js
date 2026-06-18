// src/init/scaffold.ts
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { cpPaths } from '../paths.js';
import { parseInitConfig } from '../schema/initConfig.js';
export async function isInitialized(root) {
    try {
        await access(cpPaths(root).initFile);
        return true;
    }
    catch {
        return false;
    }
}
export async function scaffoldInit(root, opts) {
    const p = cpPaths(root);
    for (const d of [p.features, p.conceptsData, p.conceptsViewer, p.architecture, p.infra])
        await mkdir(d, { recursive: true });
    if (await isInitialized(root))
        return; // 보존: 사용자 전속(규칙4)
    const config = parseInitConfig({
        version: '0.1.0', enabled: true,
        backfillMode: opts.backfillMode ?? 'incremental',
        project: { name: opts.name ?? '', description: opts.description ?? '' }
    });
    await writeFile(p.initFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
    await writeFile(join(p.architecture, 'architecture.md'), '# 아키텍처\n\n<!-- 사용자가 직접 작성: 개념의 상위 기준 -->\n', 'utf8');
    await writeFile(join(p.infra, 'infra.md'), '# 인프라\n\n<!-- 사용자가 직접 작성 -->\n', 'utf8');
}
//# sourceMappingURL=scaffold.js.map