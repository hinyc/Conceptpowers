// @concept:generated-not-hand-edited @concept:plugin-version-sync
// tests/scripts/releaseFlow.test.ts
// 릴리스 흐름 전체를 임시 git 저장소(develop/main 두 브랜치)에서 끝까지 돌려 본다. 실제 저장소는 건드리지 않는다.
// 검증 대상 규칙 ↔ 시나리오:
//  - plugin-version-sync / generated-not-hand-edited: 버전 4곳이 함께 오르고, 빌드 산출물이 같은 릴리스 커밋에 담긴다
//  - 배포 규칙(main은 배포 전용): main에는 허용 목록 파일만 남고, sourcemap은 없고, annotated 태그가 main 커밋에 달린다
//  - 안전장치: 처음 대량 삭제는 --yes 없이 멈추고 아무것도 바꾸지 않는다 / develop이 아니면 멈춘다
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runRelease } from '../../scripts/release.mjs';
import { isDeployPath } from '../../scripts/releaseSteps.mjs';

let repo: string;

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();

const put = (rel: string, content: string) => {
  const path = join(repo, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

const manifest = (extra = '') => `{\n  "name": "demo",\n  "version": "1.0.0"${extra}\n}\n`;

// 빌드 스텁: dist를 다시 만들되 sourcemap은 만들지 않는다(진짜 빌드와 같은 계약).
const BUILD_STUB = `import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/hooks', { recursive: true });
mkdirSync('assets', { recursive: true });
const v = JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8')).version;
writeFileSync('dist/cli.js', '// built ' + v + '\\n');
writeFileSync('dist/hooks/sessionStart.js', '// hook ' + v + '\\n');
writeFileSync('assets/serve.mjs', '// serve ' + v + '\\n');
`;

function seedRepo() {
  git('init', '-q', '-b', 'develop');
  git('config', 'user.name', 'tester');
  git('config', 'user.email', 'tester@example.com');
  git('config', 'commit.gpgsign', 'false');
  const scripts = `,\n  "scripts": {\n    "typecheck": "node -e 0",\n    "test:coverage": "node -e 0",\n    "format:check": "node -e 0",\n    "build": "node build-stub.mjs"\n  }`;
  put('package.json', manifest(scripts));
  put('.claude-plugin/plugin.json', manifest());
  put('.claude-plugin/marketplace.json', manifest());
  put('.codex-plugin/plugin.json', manifest());
  put('.agents/plugins/marketplace.json', '{}\n');
  put('hooks/hooks.json', '{}\n');
  put('skills/a/SKILL.md', '# a\n');
  put('src/a.ts', 'export const a = 1;\n');
  put('README.md', '# demo\n');
  put('LICENSE', 'MIT\n');
  put('.gitignore', 'node_modules/\n');
  put('dist/cli.js', '// built 1.0.0\n');
  put('dist/cli.js.map', '{}\n'); // 옛 빌드의 sourcemap — 릴리스 뒤 main에 없어야 한다
  put('assets/serve.mjs', '// serve 1.0.0\n');
  put('build-stub.mjs', BUILD_STUB);
  put('CLAUDE.md', '# dev notes\n');
  put('tests/a.test.ts', '// test\n');
  put('war-room/STATUS.md', '# status\n');
  put('.github/workflows/ci.yml', 'name: ci\n');
  put('docs/conceptpowers/concepts/viewer/index.html', '<html></html>\n'); // 렌더 사본 경로(릴리스 경로)
  for (let i = 0; i < 12; i += 1) put(`docs/note-${i}.md`, `note ${i}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  // 배포 전용으로 쓰기 전의 main: develop과 같은 내용(= 처음 릴리스에서 대량 삭제가 나는 상황)
  git('branch', 'main');
}

const files = (ref: string) => git('ls-tree', '-r', '--name-only', ref).split('\n').filter(Boolean);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'cp-release-flow-'));
  seedRepo();
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const run = (...args: string[]) => runRelease({ root: repo, args, log: () => {} });

// 실제 git·pnpm 프로세스를 여러 번 띄우므로 전체 병렬 실행 부하에서도 넉넉히 기다린다.
describe('릴리스 흐름 (임시 저장소)', { timeout: 60_000 }, () => {
  it('처음 대량 삭제는 --yes 없이 멈추고 아무것도 바꾸지 않는다', async () => {
    const mainBefore = git('rev-parse', 'main');
    const developBefore = git('rev-parse', 'develop');
    await expect(run('patch')).rejects.toThrow('--yes');
    expect(git('rev-parse', 'main')).toBe(mainBefore);
    expect(git('rev-parse', 'develop')).toBe(developBefore);
    expect(git('tag', '--list')).toBe('');
    expect(readFileSync(join(repo, 'package.json'), 'utf8')).toContain('"version": "1.0.0"');
  });

  it('--yes로 끝까지 돌리면 main에 허용 목록만 남고 태그는 main 커밋에 달린다', async () => {
    const { tag, mainCommit } = await run('patch', '--yes');
    expect(tag).toBe('v1.0.1');

    // main: 허용 목록만, sourcemap 없음, 개발 전용 파일 없음
    const mainFiles = files('main');
    expect(mainFiles.length).toBeGreaterThan(0);
    expect(mainFiles.filter((p) => !isDeployPath(p))).toEqual([]);
    expect(mainFiles.some((p) => p.endsWith('.map'))).toBe(false);
    for (const gone of ['CLAUDE.md', 'tests/a.test.ts', 'war-room/STATUS.md', 'docs/note-0.md']) {
      expect(mainFiles).not.toContain(gone);
    }
    expect(mainFiles).toEqual(
      expect.arrayContaining(['dist/cli.js', 'assets/serve.mjs', 'src/a.ts', 'package.json'])
    );

    // 태그: annotated, main 커밋을 가리키고 develop 커밋은 아니다
    expect(git('cat-file', '-t', tag)).toBe('tag');
    expect(git('rev-parse', `${tag}^{commit}`)).toBe(mainCommit);
    expect(git('rev-parse', 'main')).toBe(mainCommit);
    expect(git('rev-parse', `${tag}^{commit}`)).not.toBe(git('rev-parse', 'develop'));
    expect(git('log', '-1', '--format=%s', 'main')).toBe('chore(release): v1.0.1');

    // 버전 4곳이 main에서도 모두 새 값이고 빌드 산출물이 새 버전이다
    for (const rel of [
      'package.json',
      '.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
      '.codex-plugin/plugin.json',
    ]) {
      expect(git('show', `main:${rel}`)).toContain('"version": "1.0.1"');
    }
    expect(git('show', 'main:dist/cli.js')).toContain('built 1.0.1');

    // develop: 릴리스 커밋이 쌓이고 전체 파일은 그대로, 작업 트리는 깨끗, 현재 브랜치 유지
    expect(git('log', '-1', '--format=%s', 'develop')).toBe('chore(release): v1.0.1');
    expect(files('develop')).toContain('CLAUDE.md');
    expect(files('develop').some((p) => p.endsWith('.map'))).toBe(false);
    expect(git('status', '--porcelain')).toBe('');
    expect(git('rev-parse', '--abbrev-ref', 'HEAD')).toBe('develop');
  });

  it('다음 릴리스는 지울 것이 적어 --yes 없이 진행되고 main 이력이 이어진다', async () => {
    await run('patch', '--yes');
    const first = git('rev-parse', 'main');
    const { tag } = await run('minor');
    expect(tag).toBe('v1.1.0');
    expect(git('rev-parse', 'main~1')).toBe(first);
    expect(git('show', 'main:package.json')).toContain('"version": "1.1.0"');
  });

  it('develop이 아닌 브랜치에서는 멈춘다', async () => {
    git('checkout', '-q', 'main');
    await expect(run('patch', '--yes')).rejects.toThrow('develop');
  });

  it('트리가 더러우면 멈춘다', async () => {
    put('src/a.ts', 'export const a = 2;\n');
    await expect(run('patch', '--yes')).rejects.toThrow('깨끗하지');
  });

  it('main 브랜치가 아직 없어도 첫 배포 커밋을 만든다', async () => {
    git('branch', '-D', 'main');
    await expect(run('patch')).rejects.toThrow('--yes'); // 부모 없는 첫 배포는 확인을 요구한다
    expect(git('status', '--porcelain')).toBe('');
    const { tag } = await run('patch', '--yes');
    expect(files('main').filter((p) => !isDeployPath(p))).toEqual([]);
    expect(git('rev-parse', `${tag}^{commit}`)).toBe(git('rev-parse', 'main'));
  });

  it('완료 안내의 push 명령은 --atomic이다', async () => {
    const logs: string[] = [];
    await runRelease({ root: repo, args: ['patch', '--yes'], log: (m: string) => logs.push(m) });
    expect(logs.join('\n')).toContain('git push --atomic origin develop main refs/tags/v1.0.1');
  });
});

// 중간 실패 복구 — 주입한 실패로 릴리스를 깨고, 안내(--resume)대로 같은 버전을 완성한다.
const verifyCompleted = (tag: string) => {
  expect(git('cat-file', '-t', tag)).toBe('tag');
  expect(git('rev-parse', `${tag}^{commit}`)).toBe(git('rev-parse', 'main'));
  expect(files('main').filter((p) => !isDeployPath(p))).toEqual([]);
  expect(git('show', 'main:package.json')).toContain('"version": "1.0.1"');
};

describe('릴리스 중간 실패 복구 (임시 저장소)', { timeout: 60_000 }, () => {
  it('main ref를 못 옮기면(main.lock) 복구 안내를 내고, --resume으로 같은 버전을 완성한다', async () => {
    const mainBefore = git('rev-parse', 'main');
    const lock = join(repo, '.git/refs/heads/main.lock');
    writeFileSync(lock, '');
    const error = await run('patch', '--yes').then(
      () => null,
      (e: Error) => e
    );
    expect(error?.message).toContain('pnpm release --resume');
    expect(error?.message).toContain('main.lock');
    expect(git('rev-parse', 'main')).toBe(mainBefore);
    expect(git('tag', '--list')).toBe('');
    expect(git('log', '-1', '--format=%s', 'develop')).toBe('chore(release): v1.0.1');

    // 같은 버전을 다시 올리려 하면 거절되지만 안내가 --resume을 가리킨다
    await expect(run('1.0.1', '--yes')).rejects.toThrow('--resume');

    rmSync(lock);
    const { tag } = await run('--resume', '--yes');
    expect(tag).toBe('v1.0.1');
    verifyCompleted(tag);
    expect(git('rev-parse', 'main~1')).toBe(mainBefore);
    expect(git('status', '--porcelain')).toBe('');
  });

  it('태그 단계만 실패하면(서명 실패 흉내) main은 옮겨졌고, --resume이 태그만 단다', async () => {
    git('config', 'tag.gpgSign', 'true');
    git('config', 'gpg.program', 'false');
    const error = await run('patch', '--yes').then(
      () => null,
      (e: Error) => e
    );
    expect(error?.message).toContain('pnpm release --resume');
    expect(git('tag', '--list')).toBe('');
    const movedMain = git('rev-parse', 'main');
    expect(git('log', '-1', '--format=%s', 'main')).toBe('chore(release): v1.0.1');

    git('config', '--unset', 'tag.gpgSign');
    const { tag, mainCommit } = await run('--resume', '--yes');
    expect(mainCommit).toBe(movedMain); // main 커밋을 또 쌓지 않는다
    verifyCompleted(tag);
    expect(git('rev-list', '--count', 'main')).toBe('2');
  });

  it('이미 끝난 릴리스에 --resume을 하면 아무것도 바꾸지 않는다', async () => {
    await run('patch', '--yes');
    const main = git('rev-parse', 'main');
    await run('--resume', '--yes');
    expect(git('rev-parse', 'main')).toBe(main);
  });

  it('develop HEAD가 릴리스 커밋이 아니면 --resume은 멈춘다', async () => {
    await expect(run('--resume', '--yes')).rejects.toThrow('릴리스 커밋이 아닙니다');
  });

  it('build가 실패하면 릴리스 경로를 되돌리고 트리가 깨끗하게 남는다', async () => {
    put('build-stub.mjs', 'process.exit(3);\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'break build');
    const head = git('rev-parse', 'develop');
    await expect(run('patch', '--yes')).rejects.toThrow();
    expect(git('status', '--porcelain')).toBe('');
    expect(git('rev-parse', 'develop')).toBe(head);
    expect(readFileSync(join(repo, 'package.json'), 'utf8')).toContain('"version": "1.0.0"');
  });

  it('릴리스 경로 밖이 더럽혀져도 되돌리는 건 릴리스 경로뿐이다(릴리스 밖 파일은 남는다)', async () => {
    put(
      'build-stub.mjs',
      `${BUILD_STUB}\nimport { writeFileSync as w } from 'node:fs';\nw('stray.txt', 'x');\n`
    );
    git('add', '-A');
    git('commit', '-q', '-m', 'stray output');
    await expect(run('patch', '--yes')).rejects.toThrow('stray.txt');
    expect(git('status', '--porcelain')).toBe('?? stray.txt');
    expect(readFileSync(join(repo, 'package.json'), 'utf8')).toContain('"version": "1.0.0"');
    expect(readFileSync(join(repo, 'dist/cli.js'), 'utf8')).toBe('// built 1.0.0\n');
  });
});

describe('main 상태 점검 (임시 저장소)', { timeout: 60_000 }, () => {
  it('로컬 main이 없고 origin/main이 있으면 멈춘다(--yes여도)', async () => {
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'main'));
    git('branch', '-D', 'main');
    const developBefore = git('rev-parse', 'develop');
    await expect(run('patch', '--yes')).rejects.toThrow('origin/main');
    expect(git('rev-parse', 'develop')).toBe(developBefore);
    expect(git('status', '--porcelain')).toBe('');
    expect(git('branch', '--list', 'main')).toBe('');
  });

  it('로컬 main이 origin/main보다 뒤처지면 멈춘다', async () => {
    const tree = git('rev-parse', 'main^{tree}');
    const ahead = git('commit-tree', tree, '-p', 'main', '-m', 'remote only');
    git('update-ref', 'refs/remotes/origin/main', ahead);
    const developBefore = git('rev-parse', 'develop');
    await expect(run('patch', '--yes')).rejects.toThrow('뒤처졌');
    expect(git('rev-parse', 'develop')).toBe(developBefore);
  });

  it('로컬 main이 origin/main을 포함하면 진행한다', async () => {
    git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'main'));
    const { tag } = await run('patch', '--yes');
    verifyCompleted(tag);
  });
});

describe('매니페스트 description 일치 (임시 저장소)', { timeout: 60_000 }, () => {
  it('description이 다르면 아무것도 바꾸기 전에 멈춘다', async () => {
    put('.codex-plugin/plugin.json', manifest(',\n  "description": "다른 소개"'));
    git('add', '-A');
    git('commit', '-q', '-m', 'diverge description');
    const head = git('rev-parse', 'develop');
    await expect(run('patch', '--yes')).rejects.toThrow('description');
    expect(git('rev-parse', 'develop')).toBe(head);
    expect(git('status', '--porcelain')).toBe('');
  });
});
