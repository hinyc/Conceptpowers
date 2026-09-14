// @concept:reference-sync @concept:init-gate
// tests/cli/referenceSync.test.ts
// reference-snapshot / reference-diff 명령을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 불변 "기준점은 사람의 명시적 명령으로만 옮긴다"
//    → reference-snapshot이 기준점 파일을 만들고 개수를 돌려준다 / reference-diff는 기준점을 만들지 않는다
//  - reference-sync 제한 "영향 개념을 처리하지 않은 채 기준점을 찍는 것"
//    → 영향 개념이 남아 있으면 --reviewed 없이는 거부(exit 1)하고 목록을 돌려준다
//  - reference-sync 생애주기 "기준점 없음 — 모든 자료가 새 자료로 보인다"
//    → 기준점 없이 diff하면 unlocked=true
//  - reference-sync 허용 "현재 자료를 기준점과 견줘 추가·변경·삭제를 가려내는 것"
//    → 찍은 뒤 고치면 changed와 영향 개념이 나오고, 정보성 명령이라 exit 0이다 / --quick을 받는다
//  - init-gate 불변 "초기화되지 않았으면 실행하지 않고, 무엇을 먼저 해야 하는지 알린다"
//    → 초기화 안 된 루트에서는 error와 exit 1
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { cpPaths } from '../../src/paths.js';

describe('cli: reference-snapshot / reference-diff', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-rsync-'));
    await scaffoldInit(root, {});
    output = '';
  });

  it('reference-snapshot이 기준점 파일을 만들고 개수를 돌려준다', async () => {
    await writeFile(join(cpPaths(root).reference, 'a.md'), '자료');
    const code = await runCli(['reference-snapshot', '--root', root], out);
    expect(code).toBe(0);
    const r = JSON.parse(output);
    expect(r).toMatchObject({ ok: true, files: 1, repo: 1, external: 0 });
    await expect(access(cpPaths(root).referenceLock)).resolves.toBeUndefined();
  });

  it('기준점 없이 diff하면 unlocked=true이고 기준점을 만들지 않는다', async () => {
    await writeFile(join(cpPaths(root).reference, 'a.md'), '자료');
    const code = await runCli(['reference-diff', '--root', root], out);
    expect(code).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      unlocked: true,
      added: ['docs/conceptpowers/reference/a.md'],
    });
    await expect(access(cpPaths(root).referenceLock)).rejects.toThrow();
  });

  it('찍은 뒤 고치면 changed와 영향 개념이 나오고 exit 0', async () => {
    const p = join(cpPaths(root).reference, 'a.md');
    await writeFile(p, '자료');
    await writeConcept(root, {
      slug: 'cite-a',
      category: ['behavior'],
      status: 'green',
      title: 'cite-a',
      description: { definition: '정의' },
      purpose: { reason: '이유' },
      actions: {},
      principle: {},
      sources: [{ kind: 'reference', path: 'a.md', locator: '§1', supports: '규칙' }],
    });
    await runCli(['reference-snapshot', '--root', root], out);
    output = '';
    await writeFile(p, '자료 — 고침');
    const code = await runCli(['reference-diff', '--quick', '--root', root], out);
    expect(code).toBe(0);
    const d = JSON.parse(output);
    expect(d.changed).toEqual(['docs/conceptpowers/reference/a.md']);
    expect(d.affected.map((a: { slug: string }) => a.slug)).toEqual(['cite-a']);
  });

  it('영향 개념이 남아 있으면 --reviewed 없이는 기준점을 찍지 않는다', async () => {
    const p = join(cpPaths(root).reference, 'a.md');
    await writeFile(p, '자료');
    await writeConcept(root, {
      slug: 'cite-a',
      category: ['behavior'],
      status: 'green',
      title: 'cite-a',
      description: { definition: '정의' },
      purpose: { reason: '이유' },
      actions: {},
      principle: {},
      sources: [{ kind: 'reference', path: 'a.md', locator: '§1', supports: '규칙' }],
    });
    await runCli(['reference-snapshot', '--root', root], out);
    await writeFile(p, '자료 — 고침');
    output = '';
    expect(await runCli(['reference-snapshot', '--root', root], out)).toBe(1);
    expect(JSON.parse(output)).toMatchObject({ ok: false, affected: ['cite-a'] });
    output = '';
    expect(await runCli(['reference-snapshot', '--reviewed', '--root', root], out)).toBe(0);
    expect(JSON.parse(output)).toMatchObject({ ok: true, reviewed: ['cite-a'], mode: 'shared' });
    output = '';
    await runCli(['reference-diff', '--root', root], out);
    expect(JSON.parse(output).changed).toEqual([]);
  });

  it('초기화 안 된 루트에서는 error와 exit 1', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'cp-cli-rsync-bare-'));
    const code = await runCli(['reference-diff', '--root', bare], out);
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toBeTruthy();
  });
});
