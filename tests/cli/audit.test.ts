// @concept:audit-gap-detection @concept:init-gate
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';

function conceptInput() {
  return {
    slug: 'known-one',
    category: ['behavior'],
    title: 'K',
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    principle: { immutableRules: ['규칙은 반드시 지켜진다'] },
  };
}

describe('cli: audit 전체 스캔 모드', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cp-audit-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    await scaffoldInit(root, {});
    execSync('git init', { cwd: root });
    execSync('git config user.email "test@test.com"', { cwd: root });
    execSync('git config user.name "Test"', { cwd: root });
    output = '';
  });

  it('인자 없이 실행하면 추적 파일 전체를 스캔하고 conceptless를 보고한다 (gap 시 exit 1)', async () => {
    writeFileSync(join(root, 'src/naked.ts'), 'export const x = 1;\n');
    execSync('git add -A && git commit -m init', { cwd: root });
    const code = await runCli(['audit', '--root', root], out);
    expect(code).toBe(1);
    const r = JSON.parse(output);
    expect(r.conceptless).toContain('src/naked.ts');
  });

  it('전 파일이 태그되어 있으면 exit 0, conceptless 빈 배열', async () => {
    await writeConcept(root, conceptInput());
    writeFileSync(join(root, 'src/tagged.ts'), '// @concept:known-one\nexport const x = 1;\n');
    execSync('git add -A && git commit -m init', { cwd: root });
    const code = await runCli(['audit', '--root', root], out);
    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.ok).toBe(true);
    expect(r.conceptless).toEqual([]);
  });

  it('파일 지정 모드는 기존 동작 그대로 (conceptless 필드 없음)', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n');
    const code = await runCli(['audit', 'src/a.ts', '--root', root], out);
    expect(code).toBe(1);
    const r = JSON.parse(output);
    expect(r.unknownTags.length).toBe(1);
    expect(r.conceptless).toBeUndefined();
  });
});
