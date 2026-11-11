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
  MANIFESTS,
  REMOVAL_CONFIRM_THRESHOLD,
  findDescriptionMismatch,
  isDeployPath,
  judgeMainState,
  needsRemovalConfirmation,
  parseLsTree,
  parseReleaseArgs,
  planMainSync,
  pushCommand,
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
    expect(parseReleaseArgs(['patch'])).toEqual({ bump: 'patch', confirmed: false, resume: false });
    expect(parseReleaseArgs(['--yes', 'minor'])).toEqual({
      bump: 'minor',
      confirmed: true,
      resume: false,
    });
    expect(parseReleaseArgs(['1.2.0', '--yes'])).toEqual({
      bump: '1.2.0',
      confirmed: true,
      resume: false,
    });
  });
  it('버전 인자가 없거나 여럿이면 거부한다', () => {
    expect(() => parseReleaseArgs([])).toThrow('버전 인자');
    expect(() => parseReleaseArgs(['--yes'])).toThrow('버전 인자');
    expect(() => parseReleaseArgs(['patch', 'minor'])).toThrow('버전 인자');
  });
  it('--resume은 버전 인자 없이 읽고, 버전 인자와 함께면 거부한다', () => {
    expect(parseReleaseArgs(['--resume'])).toEqual({ bump: null, confirmed: false, resume: true });
    expect(parseReleaseArgs(['--resume', '--yes'])).toEqual({
      bump: null,
      confirmed: true,
      resume: true,
    });
    expect(() => parseReleaseArgs(['--resume', 'patch'])).toThrow('--resume');
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

describe('main 상태 판정', () => {
  it('로컬 main이 없고 origin/main이 있으면 멈추고 fetch를 안내한다', () => {
    const verdict = judgeMainState({
      localMain: false,
      remoteMain: true,
      localContainsRemote: true,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('git fetch');
  });
  it('둘 다 없으면 첫 배포로 본다', () => {
    expect(
      judgeMainState({ localMain: false, remoteMain: false, localContainsRemote: true })
    ).toEqual({
      ok: true,
      firstDeploy: true,
    });
  });
  it('로컬 main이 origin/main을 포함하지 않으면 멈춘다', () => {
    const verdict = judgeMainState({
      localMain: true,
      remoteMain: true,
      localContainsRemote: false,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('뒤처졌');
  });
  it('로컬 main이 있고 원격이 없거나 앞서 있으면 진행한다', () => {
    expect(
      judgeMainState({ localMain: true, remoteMain: false, localContainsRemote: true }).ok
    ).toBe(true);
    expect(
      judgeMainState({ localMain: true, remoteMain: true, localContainsRemote: true }).ok
    ).toBe(true);
  });
});

describe('push 안내', () => {
  it('원자적(--atomic)으로 develop·main·태그를 한 번에 민다', () => {
    expect(pushCommand('v1.2.3')).toBe('git push --atomic origin develop main refs/tags/v1.2.3');
  });
});

describe('매니페스트 description 일치', () => {
  const plain = (description?: string) => JSON.stringify({ description });
  const market = (description?: string) =>
    JSON.stringify({ description: 'Marketplace intro', plugins: [{ description }] });

  it('같으면 통과하고, marketplace는 플러그인 항목의 description을 본다', () => {
    expect(
      findDescriptionMismatch({
        'package.json': plain('same'),
        '.claude-plugin/plugin.json': plain('same'),
        '.claude-plugin/marketplace.json': market('same'),
        '.codex-plugin/plugin.json': plain('same'),
      })
    ).toEqual([]);
  });
  it('하나라도 다르면 경로와 값을 알려 준다', () => {
    const mismatch = findDescriptionMismatch({
      'package.json': plain('same'),
      '.claude-plugin/plugin.json': plain('same'),
      '.claude-plugin/marketplace.json': market('different'),
      '.codex-plugin/plugin.json': plain('same'),
    });
    expect(mismatch.join(' ')).toContain('.claude-plugin/marketplace.json="different"');
  });
  it('하나만 비어 있어도 다른 것으로 본다', () => {
    expect(findDescriptionMismatch({ a: plain('x'), b: plain(undefined) })).not.toEqual([]);
  });
  it('이 저장소의 실제 매니페스트 4곳은 일치한다', () => {
    const texts = Object.fromEntries(
      MANIFESTS.map((rel) => [rel, readFileSync(join(repoRoot, rel), 'utf8')])
    );
    expect(findDescriptionMismatch(texts)).toEqual([]);
  });
});
