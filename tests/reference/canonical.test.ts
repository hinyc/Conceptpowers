// @concept:reference-sync
// tests/reference/canonical.test.ts
// 같은 위치를 다른 표기로 등록해도 같은 자료로 보는 것과, 이미 읽어 둔 재료로 견주는 것을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 허용 "현재 자료를 기준점과 견줘 추가·변경·삭제를 가려내는 것"
//    → 등록 표기를 정규화한다: 홈 아래는 ~/…, 저장소 안은 저장소 상대, 그 밖은 절대, 끝 슬래시 없음
//    → 같은 폴더를 상대 경로에서 절대 경로로 고쳐 적어도 추가·삭제가 생기지 않는다
//    → 옛 기준점에 절대 표기로 남은 열쇠도 같은 자료로 본다(추가·삭제·영향 없음)
//  - reference-sync 불변 "닿지 않는 위치의 자료는 삭제로 세지 않는다"
//    → 닿지 않는 등록 경로를 다른 표기로 적어도 그 아래 열쇠를 삭제로 세지 않는다
//  - reference-sync 허용 "변경·삭제된 자료를 근거 목록에 적은 개념을 영향 개념으로 골라내는 것"
//    → 이미 읽어 둔 경로 확인·개념 목록·기준점을 넘기면 그것으로 견준다(다시 읽지 않는다)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalBase, enumerateReference } from '../../src/reference/enumerate.js';
import { diffReference } from '../../src/reference/diff.js';
import {
  snapshotReference,
  writeReferenceLock,
  readReferenceLock,
} from '../../src/reference/lock.js';
import { checkReferencePaths } from '../../src/init/referencePaths.js';
import { listReferenceFiles } from '../../src/init/reference.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { cpPaths } from '../../src/paths.js';

const AT = '2026-09-14T00:00:00.000Z';

describe('canonicalBase', () => {
  const home = '/Users/me';
  const root = '/work/repo';
  it('홈 아래는 ~/… 로, 홈 자체는 ~ 로', () => {
    expect(canonicalBase(root, '/Users/me/docs', home)).toBe('~/docs');
    expect(canonicalBase(root, '/Users/me/docs/', home)).toBe('~/docs');
    expect(canonicalBase(root, '/Users/me', home)).toBe('~');
  });
  it('저장소 안은 저장소 상대, 그 밖은 절대, 끝 슬래시는 뗀다', () => {
    expect(canonicalBase(root, '/work/repo/specs/', home)).toBe('specs');
    expect(canonicalBase(root, '/Volumes/share/x/', home)).toBe('/Volumes/share/x');
  });
  it('이름이 앞부분만 겹치는 형제 폴더는 홈·저장소 아래로 보지 않는다', () => {
    expect(canonicalBase(root, '/Users/meeting/a', home)).toBe('/Users/meeting/a');
    expect(canonicalBase(root, '/work/repo-old/a', home)).toBe('/work/repo-old/a');
  });
});

describe('등록 표기가 달라도 같은 자료', () => {
  let root: string;
  let refDir: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-canon-'));
    await scaffoldInit(root, {});
    refDir = cpPaths(root).reference;
    await mkdir(join(root, 'ext'), { recursive: true });
    await writeFile(join(root, 'ext', 'x.pdf'), 'pdf');
  });

  async function register(line: string): Promise<void> {
    await writeFile(join(refDir, 'paths.md'), `- ${line}\n`, 'utf8');
  }

  it('상대 경로와 절대 경로 등록이 같은 열쇠를 낸다', async () => {
    await register('ext/');
    const rel = await enumerateReference(root);
    await register(join(root, 'ext'));
    const abs = await enumerateReference(root);
    expect(rel.targets.map((t) => t.key)).toEqual(['ext/x.pdf']);
    expect(abs.targets.map((t) => t.key)).toEqual(['ext/x.pdf']);
  });

  it('기준점을 찍은 뒤 표기만 바꿔 적으면 추가·삭제가 없다', async () => {
    await register('ext/');
    await snapshotReference(root, AT);
    await register(`${join(root, 'ext')}/`);
    const d = await diffReference(root);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('옛 기준점에 절대 표기로 남은 열쇠도 같은 자료로 본다', async () => {
    await register('ext/');
    await snapshotReference(root, AT);
    const lock = (await readReferenceLock(root))!;
    const legacy = Object.fromEntries(
      Object.entries(lock.files).map(([k, v]) => [join(root, k), v])
    );
    await writeReferenceLock(root, { ...lock, files: legacy });
    await writeConcept(root, {
      slug: 'cite-x',
      category: ['behavior'],
      status: 'green',
      title: 'cite-x',
      description: { definition: '정의' },
      purpose: { reason: '이유' },
      actions: {},
      principle: {},
      sources: [{ kind: 'reference', path: 'x.pdf', locator: 'p.1', supports: '규칙' }],
    });
    const d = await diffReference(root);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.affected).toEqual([]);
  });

  it('닿지 않는 등록 경로를 다른 표기로 적어도 삭제로 세지 않는다', async () => {
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: { 'gone/y.pdf': { hash: 'abc', size: 1, mtime: AT } },
      truncated: [],
    });
    await register(`${join(root, 'gone')}/`);
    const d = await diffReference(root);
    expect(d.removed).toEqual([]);
    expect(d.unreachable).toEqual([`${join(root, 'gone')}/`]);
  });
});

describe('이미 읽어 둔 재료로 견주기', () => {
  it('넘겨받은 경로 확인·파일 목록·개념 목록·기준점을 그대로 쓴다', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cp-canon-deps-'));
    await scaffoldInit(root, {});
    const refDir = cpPaths(root).reference;
    await writeFile(join(refDir, 'a.md'), '자료');
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
    await snapshotReference(root, AT);
    await writeFile(join(refDir, 'a.md'), '자료 — 고침');

    const checks = await checkReferencePaths(root);
    const repoFiles = await listReferenceFiles(root);
    const lock = await readReferenceLock(root);
    const fromDisk = await diffReference(root, 'quick');
    const injected = await diffReference(root, 'quick', { checks, repoFiles, lock, concepts: [] });

    expect(fromDisk.affected.map((a) => a.slug)).toEqual(['cite-a']);
    expect(injected.changed).toEqual(fromDisk.changed);
    // 넘겨받은 개념 목록(빈 목록)으로 견줬으므로 영향 개념이 없다 — 디스크를 다시 읽지 않았다는 뜻
    expect(injected.affected).toEqual([]);
  });
});
