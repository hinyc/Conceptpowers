// @concept:none
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { cpPaths } from '../../src/paths.js';

describe('cli: reference', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-ref-'));
    await scaffoldInit(root, {});
    output = '';
  });

  it('등록 경로가 전부 유효하면 ok=true, exit 0', async () => {
    await writeFile(join(root, 'spec.md'), '명세', 'utf8');
    await writeFile(join(cpPaths(root).reference, 'paths.md'), '- spec.md\n', 'utf8');
    const code = await runCli(['reference', '--root', root], out);
    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.ok).toBe(true);
    expect(r.external[0]).toMatchObject({ raw: 'spec.md', status: 'ok' });
  });

  it('없는 경로가 있으면 ok=false, exit 1', async () => {
    await writeFile(join(cpPaths(root).reference, 'paths.md'), '- no/such\n', 'utf8');
    const code = await runCli(['reference', '--root', root], out);
    expect(code).toBe(1);
    const r = JSON.parse(output);
    expect(r.ok).toBe(false);
    expect(r.external[0].status).toBe('missing');
  });

  it('paths.md가 없으면 external은 빈 배열, exit 0', async () => {
    const code = await runCli(['reference', '--root', root], out);
    expect(code).toBe(0);
    expect(JSON.parse(output).external).toEqual([]);
  });
});

describe('cli: reference-add', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-refadd-'));
    await scaffoldInit(root, {});
    output = '';
  });

  it('경로를 등록하고 전체 현황을 함께 돌려준다, exit 0', async () => {
    await writeFile(join(root, 'spec.md'), '명세', 'utf8');
    const code = await runCli(['reference-add', 'spec.md', '--root', root], out);
    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r).toMatchObject({ ok: true, added: ['spec.md'], skipped: [] });
    expect(r.external).toEqual([{ raw: 'spec.md', resolved: join(root, 'spec.md'), status: 'ok' }]);
  });

  it('여러 경로를 한 번에 받고, 없는 경로는 기록하되 empty/missing으로 경고한다', async () => {
    const code = await runCli(['reference-add', 'no/such', 'also/missing', '--root', root], out);
    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.added).toEqual(['no/such', 'also/missing']);
    expect(r.external.map((e: { status: string }) => e.status)).toEqual(['missing', 'missing']);
  });

  it('이미 등록된 경로는 duplicate로 건너뛴다', async () => {
    await runCli(['reference-add', 'spec.md', '--root', root], out);
    output = '';
    const code = await runCli(['reference-add', 'spec.md', '--root', root], out);
    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r.added).toEqual([]);
    expect(r.skipped).toEqual([{ raw: 'spec.md', reason: 'duplicate' }]);
  });
});
