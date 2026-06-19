// 배포 빌드: 런타임 진입점을 의존성까지 인라인한 자족(self-contained) 번들로 생성한다.
// 플러그인 설치 환경에는 node_modules가 없으므로 zod/commander 등을 번들에 포함해야 한다.
import { build } from 'esbuild'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outdir = join(root, 'dist')

const entryPoints = [
  join(root, 'src/hooks/sessionStart.ts'),
  join(root, 'src/hooks/preToolUse.ts'),
  join(root, 'src/hooks/postToolUse.ts'),
  join(root, 'src/cli.ts'),
]

async function run() {
  try {
    await rm(outdir, { recursive: true, force: true })
    await build({
      entryPoints,
      outdir,
      outbase: join(root, 'src'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      sourcemap: true,
      // node 내장 모듈만 외부로 두고, npm 의존성(zod/commander)은 번들에 인라인한다.
      // commander(CJS)가 require('node:events')를 호출하므로 ESM 출력에 require를 주입한다.
      banner: {
        js: [
          '#!/usr/bin/env node',
          "import { createRequire as __cpCreateRequire } from 'node:module';",
          'const require = __cpCreateRequire(import.meta.url);',
        ].join('\n'),
      },
    })
    console.log('빌드 완료: dist/{cli,hooks/sessionStart,hooks/preToolUse}.js')
  } catch (error) {
    console.error('빌드 실패:', error)
    process.exit(1)
  }
}

run()
