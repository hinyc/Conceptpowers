// @concept:governance-mode
// tests/hooks/entrypoint.e2e.test.ts
// 훅을 배포 형태(자족 번들)로 구워 공백·한글이 든 설치 경로에 두고, stdin 페이로드로 직접 실행해 검증한다.
// 단위 테스트가 닿지 않는 진입점(직접 실행 판정·예외 처리·stdout 종료) 회귀를 잡는다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 운용 원리 "검사에서 문제가 나올 때마다 그 강도에 맞춰 막거나 묻거나 경고한다"
//    → 설치 경로에 공백·한글이 있어도 훅이 실제로 실행돼 응답한다
//    → 판정 응답은 크기와 무관하게 끝까지 전달된다(잘린 응답 = 판정 없음 = 조용한 통과)
//  - governance-mode 구성요소 "엄격(strict): … 커밋을 막는다"
//    → 스키마가 깨진 개념 파일로 검사가 무너져도 번들 진입점이 deny를 내보낸다
//  - 상위 기준 문서 "실패를 감추지 않는다"와 같은 태도
//    → 세션 시작 번들은 계산 실패를 무출력이 아닌 오류 블록으로 알린다
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';

const repoRoot = resolve(__dirname, '../..');
const BANNER = [
  "import { createRequire as __cpCreateRequire } from 'node:module';",
  'const require = __cpCreateRequire(import.meta.url);',
].join('\n');

let pluginRoot: string;

beforeAll(async () => {
  pluginRoot = join(mkdtempSync(join(tmpdir(), 'cp-e2e-')), '홍 길동', 'plugin cache');
  mkdirSync(pluginRoot, { recursive: true });
  const bigEntry = join(pluginRoot, 'big-entry.ts');
  writeFileSync(
    bigEntry,
    `import { exitAfterWrite } from ${JSON.stringify(join(repoRoot, 'src/util/exitAfterWrite.ts'))};\n` +
      "exitAfterWrite('x'.repeat(200000));\n"
  );
  await build({
    entryPoints: {
      'dist/hooks/preToolUse': join(repoRoot, 'src/hooks/preToolUse.ts'),
      'dist/hooks/sessionStart': join(repoRoot, 'src/hooks/sessionStart.ts'),
      big: bigEntry,
    },
    outdir: pluginRoot,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    banner: { js: BANNER },
    logLevel: 'silent',
  });
}, 60_000);

function makeProject(enforcement: 'strict' | 'standard'): string {
  const root = mkdtempSync(join(tmpdir(), 'cp-e2e-proj-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'docs/conceptpowers'), { recursive: true });
  writeFileSync(
    join(root, 'docs/conceptpowers/init.json'),
    JSON.stringify({ version: '0.1.0', enabled: true, enforcement })
  );
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], { cwd: root });
  git('init', '-q');
  writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 1\n');
  git('add', 'src/a.ts');
  return root;
}

function breakConcepts(root: string) {
  const dir = join(root, 'docs/conceptpowers/concepts/data/misc');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'broken.json'), JSON.stringify({ slug: 'broken', status: 'approved' }));
}

function runHook(file: string, cwd: string, payload: unknown, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [join(pluginRoot, file)], {
    cwd,
    input: JSON.stringify(payload),
    env: { ...process.env, CONCEPTPOWERS_NO_VERSION_CHECK: '1', ...env },
    encoding: 'utf8',
  });
}

describe('훅 번들 진입점 (공백·한글 설치 경로)', () => {
  it('설치 경로에 공백·한글이 있어도 훅이 실행돼 응답한다 [규칙: 문제마다 강도에 맞춰 대응한다]', () => {
    const root = makeProject('standard');
    const r = runHook('dist/hooks/preToolUse.js', root, {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/a.ts' },
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput.hookEventName).toBe('PreToolUse');
  });

  it('strict: 깨진 개념 파일로 검사가 무너져도 번들이 커밋을 막는다 [규칙: 엄격은 막는다]', () => {
    const root = makeProject('strict');
    breakConcepts(root);
    const r = runHook('dist/hooks/preToolUse.js', root, {
      tool_name: 'Bash',
      tool_input: { command: 'git commit -m x' },
    });
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    expect(out.permissionDecision).toBe('deny');
    expect(out.permissionDecisionReason).toContain('GATE FAILURE');
  });

  it('세션 시작 번들은 계산 실패를 오류 블록으로 알린다 [규칙: 실패를 감추지 않는다]', () => {
    const root = makeProject('standard');
    breakConcepts(root);
    const r = spawnSync(process.execPath, [join(pluginRoot, 'dist/hooks/sessionStart.js')], {
      cwd: root,
      input: '',
      env: { ...process.env, CONCEPTPOWERS_NO_VERSION_CHECK: '1', CLAUDE_PLUGIN_ROOT: pluginRoot },
      encoding: 'utf8',
    });
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain(
      'CONCEPTPOWERS-ERROR'
    );
  });

  it('64KB를 넘는 응답도 잘리지 않고 끝까지 전달된다 [규칙: 대응이 전달돼야 강도가 의미 있다]', () => {
    const r = spawnSync(process.execPath, [join(pluginRoot, 'big.js')], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBe(200000);
  });
});
