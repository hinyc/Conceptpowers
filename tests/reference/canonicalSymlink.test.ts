// @concept:reference-sync
// tests/reference/canonicalSymlink.test.ts
// 심볼릭 링크가 낀 등록 경로, 삭제 판정의 일관성, 이름이 특이한 파일 열쇠를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 허용 "현재 자료를 기준점과 견줘 추가·변경·삭제를 가려내는 것"
//    → 링크 폴더를 등록해도 열쇠는 적힌 이름 그대로다 — 옛 기준점과 추가·삭제로 어긋나지 않는다
//    → 저장소 안 링크가 바깥을 가리켜도 열쇠는 저장소 상대 이름이다
//    → constructor·toString 같은 이름의 파일도 기준점에 없으면 추가로 잡힌다
//  - reference-sync 불변 "영향 개념은 개념의 근거 목록에 적힌 참고자료 좌표와 맞춰서만 고르며, 다른 추측으로 넓히지 않는다"
//    → 링크 폴더 아래 파일을 등록한 이름으로 근거에 적은 개념이 영향 개념으로 잡힌다
//  - reference-sync 불변 "닿지 않는 위치의 자료는 삭제로 세지 않는다"
//    → 가장 구체적인 위치가 판정한다: 저장소 루트(.)를 함께 등록해도 닿지 않는 gone/ 아래는 삭제가 아니다
//    → 기기와 무관한 ~/… 표기는 같은 깊이의 닿는 위치에 진다(내가 실제로 지운 파일은 삭제로 센다)
// (절대 이름 링크가 저장소를 가리키는 경우는 canonicalFinal.test.ts — 그 경우도 열쇠는 적힌 이름이다)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffReference, countsAsRemoved } from '../../src/reference/diff.js';
import { snapshotReference, writeReferenceLock } from '../../src/reference/lock.js';
import { hashFile } from '../../src/reference/fingerprint.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { cpPaths } from '../../src/paths.js';

const AT = '2026-09-14T00:00:00.000Z';

describe('countsAsRemoved — 가장 구체적인 위치가 판정한다', () => {
  it('더 넓은 닿는 위치(.)가 있어도 더 구체적인 닿지 않는 위치 아래는 삭제가 아니다', () => {
    expect(countsAsRemoved('gone/y.pdf', ['gone'], ['.'])).toBe(false);
    expect(countsAsRemoved('other/y.pdf', ['gone'], ['.'])).toBe(true);
  });
  it('기기와 무관한 ~/… 표기는 같은 깊이의 닿는 위치에 진다', () => {
    expect(countsAsRemoved('~/docs/a.pdf', [], ['~/docs'], ['~/docs'])).toBe(true);
    expect(countsAsRemoved('~/docs/a.pdf', [], [], ['~/docs'])).toBe(false);
    expect(countsAsRemoved('~/docs/sub/a.pdf', [], ['~/docs'], ['~/docs/sub'])).toBe(false);
  });
});

describe('symlinked registrations', () => {
  let root: string;
  let refDir: string;
  let target: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-link-root-'));
    await scaffoldInit(root, {});
    refDir = cpPaths(root).reference;
    target = await mkdtemp(join(tmpdir(), 'cp-link-target-'));
    await writeFile(join(target, 'a.pdf'), 'v1');
  });

  const register = (...lines: string[]) =>
    writeFile(join(refDir, 'paths.md'), lines.map((l) => `- ${l}`).join('\n') + '\n', 'utf8');

  async function cite(slug: string, path: string): Promise<void> {
    await writeConcept(root, {
      slug,
      category: ['behavior'],
      status: 'green',
      title: slug,
      description: { definition: '정의' },
      purpose: { reason: '이유' },
      actions: {},
      principle: {},
      sources: [{ kind: 'reference', path, locator: 'p.1', supports: '규칙' }],
    });
  }

  it('링크 폴더를 등록해도 열쇠는 적힌 이름 그대로 — 1.14.0 형식 기준점과 어긋나지 않고 영향 개념도 잡힌다', async () => {
    const link = `${target}-link`;
    await symlink(target, link, 'dir');
    await register(link);
    await cite('cite-link', `${link}/a.pdf`);
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: {
        [`${link}/a.pdf`]: { hash: await hashFile(join(target, 'a.pdf')), size: 2, mtime: AT },
      },
      truncated: [],
    });
    const same = await diffReference(root);
    expect(same.added).toEqual([]);
    expect(same.removed).toEqual([]);

    await writeFile(join(target, 'a.pdf'), 'v2 — 개정');
    const d = await diffReference(root);
    expect(d.changed).toEqual([`${link}/a.pdf`]);
    expect(d.affected.map((a) => a.slug)).toEqual(['cite-link']);
  });

  it('저장소 안 링크가 바깥을 가리켜도 열쇠는 저장소 상대 이름이다', async () => {
    await symlink(target, join(root, 'shared'), 'dir');
    await register('shared/');
    await cite('cite-shared', 'shared/a.pdf');
    await snapshotReference(root, AT);
    await writeFile(join(target, 'a.pdf'), 'v2 — 개정');
    const d = await diffReference(root);
    expect(d.changed).toEqual(['shared/a.pdf']);
    expect(d.affected.map((a) => a.slug)).toEqual(['cite-shared']);
  });

  it('저장소 루트(.)를 함께 등록해도 닿지 않는 gone/ 아래는 삭제가 아니다', async () => {
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: { 'gone/y.pdf': { hash: 'abc', size: 1, mtime: AT } },
      truncated: [],
    });
    await register('.', 'gone/');
    const d = await diffReference(root, 'quick');
    expect(d.removed).toEqual([]);
  });

  it('constructor·toString 같은 이름의 파일도 기준점에 없으면 추가로 잡힌다', async () => {
    await mkdir(join(root, 'names'), { recursive: true });
    await writeFile(join(root, 'names', 'seed.md'), 'seed');
    await register('names/');
    await snapshotReference(root, AT);
    await register('.');
    await writeFile(join(root, 'constructor'), 'c');
    await writeFile(join(root, 'toString'), 't');
    const d = await diffReference(root, 'quick');
    expect(d.added).toContain('constructor');
    expect(d.added).toContain('toString');
    expect(d.changed).not.toContain('constructor');
    expect(d.changed).not.toContain('toString');
  });
});
