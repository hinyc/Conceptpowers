// @concept:governance-mode @concept:drift-reconcile @concept:human-owns-contract
// tests/hooks/entrypoint.e2e.test.ts
// 훅을 배포 형태(자족 번들)로 구워 공백·한글이 든 설치 경로에 두고, stdin 페이로드로 직접 실행해 검증한다.
// 단위 테스트가 닿지 않는 진입점(직접 실행 판정·예외 처리·stdout 종료) 회귀를 잡는다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 운용 원리 "검사에서 문제가 나올 때마다 그 강도에 맞춰 막거나 묻거나 경고한다"
//    → 설치 경로에 공백·한글이 있어도 훅이 실제로 실행돼 응답한다
//    → 판정 응답은 크기와 무관하게 끝까지 전달된다(잘린 응답 = 판정 없음 = 조용한 통과)
//  - governance-mode 구성요소 "엄격(strict): … 커밋을 막는다"
//    → 스키마가 깨진 개념 파일로 검사가 무너져도 번들 진입점이 deny를 내보낸다
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다 — 명령을 실행하기 전에 그 파일들을
//    확정할 수 없으면 검사를 마친 것처럼 통과시키지 않고 강도에 맞춰 대응한다"
//    → 배포 번들로 실행해도 스테이징+커밋 한 명령은 strict에서 막힌다
//    → 전역 옵션·alias·diff.relative+하위 폴더 커밋을 거쳐도 실제 커밋 파일의 위반으로 막힌다
//  - governance-mode 불변 "문지기는 검사를 통과한 명령을 사람의 권한 확인 없이 대신 승인하지 않는다"
//    → 통과 응답에 permissionDecision이 없고, 커밋 글자만 든 명령에는 아무 판정도 내지 않는다
//  - drift-reconcile 불변 "코드 변경이 필요 없다는 기록은 사람의 확인을 거쳐 남긴다 — … 어떤 방법으로 썼든 묻는다"
//    → include 범위로 스테이징만 된 판단 기록을 끼워 넣어도 번들이 묻는다
//  - human-owns-contract 불변 "개념 문서의 내용 변경은 반드시 사람의 확인을 거친다"
//    → 바로가기 경로로 거버넌스 파일을 편집하려 해도 번들이 묻는다
//  - 상위 기준 문서 "실패를 감추지 않는다"와 같은 태도
//    → 세션 시작 번들은 계산 실패를 무출력이 아닌 오류 블록으로 알린다
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
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
// 사용자·시스템 git 설정(서명·전역 훅)과 바깥 git 환경 변수(훅 안에서 실행될 때)가 테스트 저장소에 새지 않게 막는다.
// 저장소 로컬 설정(alias·diff.relative)은 그대로 적용된다.
const GIT_ENV: NodeJS.ProcessEnv = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_DIR: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_WORK_TREE: undefined,
};
const isolatedEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...GIT_ENV, ...extra };
  return Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
};
const tempDirs: string[] = [];
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

beforeAll(async () => {
  pluginRoot = join(tempDir('cp-e2e-'), '홍 길동', 'plugin cache');
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
  const root = tempDir('cp-e2e-proj-');
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'docs/conceptpowers'), { recursive: true });
  writeFileSync(
    join(root, 'docs/conceptpowers/init.json'),
    JSON.stringify({ version: '0.1.0', enabled: true, enforcement })
  );
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], {
      cwd: root,
      env: isolatedEnv(),
    });
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
    env: isolatedEnv({ CONCEPTPOWERS_NO_VERSION_CHECK: '1', ...env }),
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

describe('적대적 커밋 형태 (배포 번들, 실제 git)', () => {
  const gitIn = (root: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], {
      cwd: root,
      env: isolatedEnv(),
    });
  const decide = (root: string, command: string) => {
    const r = runHook('dist/hooks/preToolUse.js', root, {
      tool_name: 'Bash',
      tool_input: { command },
    });
    return {
      status: r.status,
      stdout: r.stdout,
      out: r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null,
    };
  };
  const stageGhost = (root: string, rel: string) => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), '// @concept:ghost\nexport const g = 1\n');
    gitIn(root, 'add', rel);
  };

  it('strict: 스테이징과 커밋을 한 명령에 섞으면 막는다 [규칙: 확정할 수 없으면 강도에 맞춰 대응한다]', () => {
    const root = makeProject('strict');
    const { out } = decide(root, 'git add -A && git commit -m x');
    expect(out.permissionDecision).toBe('deny');
    expect(out.permissionDecisionReason).toContain('COMMIT UNRESOLVED');
  });

  it('strict: 전역 옵션·alias를 거친 커밋도 실제 커밋 파일의 위반으로 막는다 [규칙: 실제로 들어갈 파일 기준]', () => {
    const root = makeProject('strict');
    stageGhost(root, 'src/ghost.ts');
    gitIn(root, 'config', 'alias.ci', 'commit');
    for (const command of ['git -C . commit -m x', 'git --no-pager commit -m x', 'git ci -m x']) {
      const { out } = decide(root, command);
      expect(out.permissionDecision, command).toBe('deny');
      expect(out.permissionDecisionReason).toContain('ghost');
    }
  });

  it('strict: diff.relative 설정과 하위 폴더 커밋으로 목록을 줄여도 막는다 [규칙: 실제로 들어갈 파일 기준]', () => {
    const root = makeProject('strict');
    stageGhost(root, 'lib/ghost.ts');
    gitIn(root, 'config', 'diff.relative', 'true');
    const { out } = decide(root, 'git -C src commit -m x');
    expect(out.permissionDecision).toBe('deny');
    expect(out.permissionDecisionReason).toContain('ghost');
  });

  it('standard: include 범위로 스테이징만 된 판단 기록을 끼워 넣으면 묻는다 [규칙: 어떤 방법으로 썼든 묻는다]', () => {
    const root = makeProject('standard');
    gitIn(root, 'commit', '-q', '-m', 'base');
    const record = 'docs/conceptpowers/concepts/.alignment/no-code.json';
    mkdirSync(join(root, 'docs/conceptpowers/concepts/.alignment'), { recursive: true });
    writeFileSync(
      join(root, record),
      JSON.stringify({
        foo: { hash: '3:x', note: '몰래 남긴 사유', at: '2026-01-01T00:00:00.000Z' },
      })
    );
    gitIn(root, 'add', record);
    rmSync(join(root, record));
    writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 2\n');
    const { out } = decide(root, 'git commit -i src/a.ts -m x');
    expect(out.permissionDecision).toBe('ask');
    expect(out.permissionDecisionReason).toContain('HUMAN RECORD');
  });

  it('통과 응답에 자동 승인을 싣지 않고, 커밋 글자만 든 명령에는 판정을 내지 않는다 [규칙: 통과는 실행 허락이 아니다]', () => {
    const root = makeProject('standard');
    const pass = decide(root, 'git commit -m x');
    expect(pass.out.permissionDecision).toBeUndefined();
    const grep = decide(root, 'grep -rn "git commit" .');
    expect(grep.status).toBe(0);
    expect(grep.stdout).toBe('');
  });

  it('바로가기 경로로 거버넌스 설정을 편집하려 해도 묻는다 [규칙: 개념 문서의 내용 변경은 사람의 확인을 거친다]', () => {
    const root = makeProject('standard');
    symlinkSync(join(root, 'docs/conceptpowers'), join(root, 'cp-link'));
    const r = runHook('dist/hooks/preToolUse.js', root, {
      tool_name: 'Edit',
      tool_input: { file_path: join(root, 'cp-link/init.json') },
    });
    const out = JSON.parse(r.stdout).hookSpecificOutput;
    expect(out.permissionDecision).toBe('ask');
    expect(out.permissionDecisionReason).toContain('GOVERNANCE CONFIG');
    // 대조군: 같은 바로가기를 거쳐도 거버넌스 파일이 아니면 묻지 않는다(프로젝트 밖으로 오인한 것이 아니다).
    mkdirSync(join(root, 'docs/conceptpowers/reference'), { recursive: true });
    const plain = runHook('dist/hooks/preToolUse.js', root, {
      tool_name: 'Edit',
      tool_input: { file_path: join(root, 'cp-link/reference/note.md') },
    });
    expect(JSON.parse(plain.stdout).hookSpecificOutput.permissionDecision).toBeUndefined();
  });
});
