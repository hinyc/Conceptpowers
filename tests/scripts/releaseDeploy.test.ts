// @concept:generated-not-hand-edited
// tests/scripts/releaseDeploy.test.ts
// 릴리스의 배포(main) 판단부 — 허용 목록·삭제 계획·--yes 안전장치·인자 해석·ls-tree 해석을 직접 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - generated-not-hand-edited 불변 "원본을 고쳤으면 같은 작업 안에서 다시 만들기까지 마쳐 생성물을 맞춰 둔다"
//    → 배포 브랜치에는 빌드 산출물(dist, assets)이 허용 목록으로 실리고 sourcemap은 실리지 않는다
//    → 빌드는 sourcemap을 만들지 않는다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DEPLOY_ALLOWLIST,
  REMOVAL_CONFIRM_THRESHOLD,
  isDeployPath,
  needsRemovalConfirmation,
  parseLsTree,
  parseReleaseArgs,
  planMainSync,
  toIndexInfo,
  VERIFY_COMMANDS,
} from '../../scripts/releaseSteps.mjs';

const repoRoot = resolve(__dirname, '../..');

describe('isDeployPath', () => {
  it('허용 목록의 디렉터리와 파일은 main에 들어간다', () => {
    for (const p of [
      '.claude-plugin/plugin.json',
      '.codex-plugin/plugin.json',
      '.agents/plugins/marketplace.json',
      'hooks/hooks.json',
      'skills/init/SKILL.md',
      'dist/cli.js',
      'assets/serve.mjs',
      'src/cli.ts',
      'README.md',
      'README.ko.md',
      'LICENSE',
      'CHANGELOG.md',
      'SECURITY.md',
      'PRIVACY.md',
      'CONTRIBUTING.md',
      'package.json',
      '.gitignore',
    ]) {
      expect(isDeployPath(p), p).toBe(true);
    }
  });

  it('develop에만 두는 파일은 main에 들어가지 않는다', () => {
    for (const p of [
      'tests/scripts/release.test.ts',
      'docs/conceptpowers/concepts/data/x.json',
      'war-room/STATUS.md',
      'CLAUDE.md',
      '.github/workflows/ci.yml',
      'pnpm-lock.yaml',
      'tsconfig.json',
      'scripts/release.mjs',
    ]) {
      expect(isDeployPath(p), p).toBe(false);
    }
  });

  it('허용 목록 안이라도 sourcemap과 .DS_Store는 뺀다', () => {
    expect(isDeployPath('dist/cli.js.map')).toBe(false);
    expect(isDeployPath('dist/hooks/preToolUse.js.map')).toBe(false);
    expect(isDeployPath('assets/.DS_Store')).toBe(false);
    expect(isDeployPath('src/viewer/.DS_Store')).toBe(false);
  });

  it('이름이 비슷한 다른 경로는 허용 목록이 아니다', () => {
    expect(isDeployPath('distribution/x.js')).toBe(false);
    expect(isDeployPath('srcs/a.ts')).toBe(false);
    expect(isDeployPath('README.md.bak')).toBe(false);
  });
});

describe('planMainSync', () => {
  it('허용 목록만 남기고, main에 있던 목록 밖 파일은 지운다', () => {
    const plan = planMainSync(
      ['package.json', 'dist/cli.js', 'dist/cli.js.map', 'tests/a.test.ts', 'src/a.ts'],
      ['package.json', 'docs/x.md', 'dist/old.js', 'dist/cli.js.map']
    );
    expect(plan.keep).toEqual(['package.json', 'dist/cli.js', 'src/a.ts']);
    expect(plan.remove).toEqual(['docs/x.md', 'dist/old.js', 'dist/cli.js.map']);
    expect(plan.added).toEqual(['dist/cli.js', 'src/a.ts']);
  });

  it('main이 비어 있으면(첫 배포) 지울 것이 없다', () => {
    const plan = planMainSync(['package.json', 'tests/a.ts'], []);
    expect(plan.remove).toEqual([]);
    expect(plan.keep).toEqual(['package.json']);
  });
});

describe('needsRemovalConfirmation', () => {
  const planWith = (n: number) => ({ keep: [], added: [], remove: Array(n).fill('x') });
  it('기준 수를 넘게 지우면 --yes 없이는 멈춘다', () => {
    expect(needsRemovalConfirmation(planWith(REMOVAL_CONFIRM_THRESHOLD + 1), false)).toBe(true);
    expect(needsRemovalConfirmation(planWith(REMOVAL_CONFIRM_THRESHOLD + 1), true)).toBe(false);
  });
  it('기준 이하로 지우면 확인 없이 진행한다', () => {
    expect(needsRemovalConfirmation(planWith(REMOVAL_CONFIRM_THRESHOLD), false)).toBe(false);
    expect(needsRemovalConfirmation(planWith(0), false)).toBe(false);
  });
});

describe('parseReleaseArgs', () => {
  it('버전 인자와 --yes를 읽는다', () => {
    expect(parseReleaseArgs(['patch'])).toEqual({ bump: 'patch', confirmed: false });
    expect(parseReleaseArgs(['--yes', 'minor'])).toEqual({ bump: 'minor', confirmed: true });
    expect(parseReleaseArgs(['1.2.0', '--yes'])).toEqual({ bump: '1.2.0', confirmed: true });
  });
  it('버전 인자가 없거나 여럿이면 거부한다', () => {
    expect(() => parseReleaseArgs([])).toThrow('버전 인자');
    expect(() => parseReleaseArgs(['--yes'])).toThrow('버전 인자');
    expect(() => parseReleaseArgs(['patch', 'minor'])).toThrow('버전 인자');
  });
  it('알 수 없는 옵션은 오타로 보고 거부한다', () => {
    expect(() => parseReleaseArgs(['patch', '--force'])).toThrow('--force');
  });
});

describe('ls-tree 해석', () => {
  it('-z 출력을 항목으로 풀고, 공백이 든 경로도 보존한다', () => {
    const out = '100644 blob abc123\ta b.txt\x00100755 blob def456\tsrc/x.ts\0';
    const entries = parseLsTree(out);
    expect(entries).toEqual([
      { mode: '100644', type: 'blob', sha: 'abc123', path: 'a b.txt' },
      { mode: '100755', type: 'blob', sha: 'def456', path: 'src/x.ts' },
    ]);
    expect(toIndexInfo(entries)).toBe('100644 abc123\ta b.txt\x00100755 def456\tsrc/x.ts\x00');
  });
});

describe('배포 구성', () => {
  it('릴리스 검증에 포맷 검사가 들어 있다', () => {
    expect(VERIFY_COMMANDS).toContainEqual(['pnpm', ['format:check']]);
  });
  it('허용 목록에 src와 dist가 있다(보안 스캔용 원본 + 실행 번들)', () => {
    expect(DEPLOY_ALLOWLIST).toEqual(expect.arrayContaining(['src', 'dist', 'assets']));
  });
  it('빌드는 sourcemap을 만들지 않는다', () => {
    const build = readFileSync(join(repoRoot, 'scripts/build.mjs'), 'utf8');
    expect(build).not.toMatch(/sourcemap:\s*true/);
  });
});
