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

  it('비-ASCII 파일명도 전체 스캔 대상에 포함되어 conceptless로 보고된다', async () => {
    writeFileSync(join(root, 'src/한글.ts'), 'export const x = 1;\n');
    execSync('git add -A && git commit -m init', { cwd: root });
    const code = await runCli(['audit', '--root', root], out);
    expect(code).toBe(1);
    const r = JSON.parse(output);
    expect(r.conceptless).toContain('src/한글.ts');
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

  it('전체 스캔 모드: .md 문서 안의 @concept 리터럴은 unknownTags 오탐으로 잡지 않는다', async () => {
    await writeConcept(root, conceptInput());
    writeFileSync(join(root, 'src/tagged.ts'), '// @concept:known-one\nexport const x = 1;\n');
    writeFileSync(
      join(root, 'README.md'),
      '예시: 파일 상단에 `@concept:ghost-doc` 처럼 태그를 답니다.\n'
    );
    execSync('git add -A && git commit -m init', { cwd: root });
    const code = await runCli(['audit', '--root', root], out);
    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.ok).toBe(true);
    expect(r.unknownTags).toEqual([]);
  });

  it('파일 지정 모드는 .md도 그대로 스캔한다 (계약 불변, Task 5b: 선행 블록 표식 기준)', async () => {
    // 확장자로 제외되지 않는다는 계약을 유지하면서, Task 5b 규칙(선행 주석 블록에서만 인식)에
    // 맞춰 표식을 파일 첫머리 마크다운 주석으로 둔다 — 본문 프로즈 속 표식 모양 글자는
    // 더 이상 태그로 인식되지 않는다(옛 전체 스캔 의미론 폐기).
    writeFileSync(
      join(root, 'README.md'),
      '<!-- @concept:ghost-doc -->\n예시: 파일 상단에 표식을 답니다.\n'
    );
    const code = await runCli(['audit', 'README.md', '--root', root], out);
    expect(code).toBe(1);
    const r = JSON.parse(output);
    expect(r.unknownTags).toEqual([{ slug: 'ghost-doc', file: 'README.md' }]);
  });
});
