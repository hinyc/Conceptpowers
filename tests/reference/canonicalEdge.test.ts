// @concept:reference-sync
// tests/reference/canonicalEdge.test.ts
// 경로 표기 정규화의 경계 사례를 검증한다 — 파일 열쇠·옛 기준점 열쇠·근거 경로가 한 함수로 모인다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 허용 "현재 자료를 기준점과 견줘 추가·변경·삭제를 가려내는 것"
//    → 저장소가 홈 아래여도 저장소 상대가 먼저 / 저장소가 곧 홈이어도 저장소 상대
//    → ./ ../ // 역슬래시·드라이브 문자 대소문자·NFD 한글을 같은 표기로 모은다
//    → 저장소 루트(.)를 등록하거나 옛 기준점이 ./ ·절대 표기로 남아도 같은 파일은 추가·삭제로 잡히지 않는다
//    → ../형제 폴더를 절대 경로로 고쳐 적어도 추가·삭제가 없다 / 심볼릭 링크로 다른 이름이 된 저장소 경로도 같다
//    → 옛 절대 표기 기준점에서도 실제로 바뀐 파일은 changed로 잡힌다
//  - reference-sync 불변 "닿지 않는 위치의 자료는 삭제로 세지 않는다"
//    → 다른 기기의 홈 절대 경로로 적힌 닿지 않는 등록은 ~/… 표기의 기준점 열쇠를 삭제로 세지 않는다
//    → 다만 이 기기에서 닿는 등록 경로 아래의 열쇠는 계속 삭제로 센다
//  - reference-sync 불변 "영향 개념은 개념의 근거 목록에 적힌 참고자료 좌표와 맞춰서만 고르며, 다른 추측으로 넓히지 않는다"
//    → 근거 경로가 절대·~ 표기여도 같은 정규화로 견줘 영향 개념으로 고른다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  canonicalPath,
  canonicalKeyOf,
  portableHomeForm,
  type PathAliases,
} from '../../src/reference/canonical.js';
import { externalKey } from '../../src/reference/enumerate.js';
import { diffReference, countsAsRemoved } from '../../src/reference/diff.js';
import { sourceMatchesKey } from '../../src/reference/affected.js';
import {
  snapshotReference,
  writeReferenceLock,
  readReferenceLock,
} from '../../src/reference/lock.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { cpPaths } from '../../src/paths.js';

const AT = '2026-09-14T00:00:00.000Z';

describe('canonicalPath', () => {
  it('저장소가 홈 아래여도 저장소 상대가 먼저이고, 저장소가 곧 홈이어도 저장소 상대다', () => {
    const underHome: PathAliases = { roots: ['/Users/me/repo'], homes: ['/Users/me'] };
    expect(canonicalPath('/Users/me/repo/ext', underHome)).toBe('ext');
    expect(canonicalPath('/Users/me/other', underHome)).toBe('~/other');
    const rootIsHome: PathAliases = { roots: ['/Users/me'], homes: ['/Users/me'] };
    expect(canonicalPath('/Users/me/docs', rootIsHome)).toBe('docs');
  });

  it('./ ../ // 역슬래시·드라이브 문자·NFD 한글을 같은 표기로 모은다', () => {
    const a: PathAliases = { roots: ['/work/repo'], homes: ['/Users/me'] };
    expect(canonicalPath('/work/repo/./ext//sub/../x.pdf', a)).toBe('ext/x.pdf');
    expect(canonicalPath('/work/repo', a)).toBe('.');
    const win: PathAliases = { roots: ['c:/Repo'], homes: [] };
    expect(canonicalPath('C:\\Repo\\ext\\x.pdf', win)).toBe('ext/x.pdf');
    const nfc = '/work/repo/세미나/a.pdf';
    const nfd = nfc.normalize('NFD');
    expect(canonicalPath(nfd, a)).toBe(canonicalPath(nfc, a));
  });

  it('루트(/) 아래 파일 열쇠에 슬래시가 겹치지 않는다', () => {
    expect(externalKey('/', 'a.pdf')).toBe('/a.pdf');
  });
});

describe('portableHomeForm / canonicalKeyOf', () => {
  it('홈처럼 생긴 절대 경로를 기기와 무관한 ~/… 로 바꾼다', () => {
    expect(portableHomeForm('/Users/other/docs')).toBe('~/docs');
    expect(portableHomeForm('/home/u/x/')).toBe('~/x');
    expect(portableHomeForm('C:\\Users\\u\\x')).toBe('~/x');
    expect(portableHomeForm('/Volumes/share/x')).toBeNull();
  });

  it('옛 기준점 열쇠를 지금의 정규 표기로 바꾼다', () => {
    const a: PathAliases = { roots: ['/work/repo'], homes: ['/Users/me'] };
    expect(canonicalKeyOf('/work/repo', './ext/x.pdf', a)).toBe('ext/x.pdf');
    expect(canonicalKeyOf('/work/repo', '/work/repo/ext/x.pdf', a)).toBe('ext/x.pdf');
    expect(canonicalKeyOf('/work/repo', '../sib/x.pdf', a)).toBe('/work/sib/x.pdf');
    expect(canonicalKeyOf('/work/repo', '~/d/a.pdf', a)).toBe('~/d/a.pdf');
    expect(canonicalKeyOf('/work/repo', '/Users/me/d/a.pdf', a)).toBe('~/d/a.pdf');
  });
});

describe('countsAsRemoved', () => {
  it('닿지 않는 위치 아래는 삭제로 세지 않지만, 닿는 위치 아래는 센다', () => {
    expect(countsAsRemoved('~/docs/a.pdf', ['~/docs'], [])).toBe(false);
    expect(countsAsRemoved('~/docs/sub/b.pdf', ['~/docs'], ['~/docs/sub'])).toBe(true);
    expect(countsAsRemoved('ext/x.pdf', [], ['ext'])).toBe(true);
  });
});

describe('sourceMatchesKey with canonical sources', () => {
  it('근거 경로가 절대·~ 표기여도 같은 정규화로 견준다', () => {
    const a: PathAliases = { roots: ['/abs/repo'], homes: ['/Users/me'] };
    const canon = (p: string) => canonicalKeyOf('/abs/repo', p, a);
    expect(sourceMatchesKey('/abs/repo/ext/x.pdf', 'ext/x.pdf', canon)).toBe(true);
    expect(sourceMatchesKey('/Users/me/d/a.pdf', '~/d/a.pdf', canon)).toBe(true);
    expect(sourceMatchesKey('x.pdf', 'ext/x.pdf', canon)).toBe(true);
    expect(sourceMatchesKey('/abs/other/x2.pdf', 'ext/x.pdf', canon)).toBe(false);
  });
});

describe('integration', () => {
  let root: string;
  let refDir: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-edge-'));
    await scaffoldInit(root, {});
    refDir = cpPaths(root).reference;
    await mkdir(join(root, 'ext'), { recursive: true });
    await writeFile(join(root, 'ext', 'x.pdf'), 'pdf v1');
  });

  const register = (...lines: string[]) =>
    writeFile(join(refDir, 'paths.md'), lines.map((l) => `- ${l}`).join('\n') + '\n', 'utf8');

  async function rekeyLock(fn: (k: string) => string): Promise<void> {
    const lock = (await readReferenceLock(root))!;
    const files = Object.fromEntries(Object.entries(lock.files).map(([k, v]) => [fn(k), v]));
    await writeReferenceLock(root, { ...lock, files });
  }

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

  it('다른 기기의 홈 절대 경로로 적힌 닿지 않는 등록은 ~/… 열쇠를 삭제로 세지 않는다', async () => {
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: { '~/cp-edge-nouser-docs/a.pdf': { hash: 'abc', size: 1, mtime: AT } },
      truncated: [],
    });
    await register('/Users/cp-edge-nouser/cp-edge-nouser-docs');
    const d = await diffReference(root);
    expect(d.removed).toEqual([]);
    expect(d.unreachable).toEqual(['/Users/cp-edge-nouser/cp-edge-nouser-docs']);
  });

  it('옛 기준점이 ./ 표기로 남아도 같은 파일은 추가·삭제가 아니다', async () => {
    await register('ext/');
    await snapshotReference(root, AT);
    await rekeyLock((k) => `./${k}`);
    const d = await diffReference(root);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('저장소 루트(.)를 등록하고 옛 기준점이 절대 표기여도 추가·삭제가 없다', async () => {
    await register('.');
    await snapshotReference(root, AT);
    await rekeyLock((k) => (k.startsWith('~') || k.startsWith('/') ? k : join(root, k)));
    const d = await diffReference(root);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('../형제 폴더를 절대 경로로 고쳐 적어도 추가·삭제가 없다', async () => {
    const sib = await mkdtemp(join(tmpdir(), 'cp-edge-sib-'));
    await writeFile(join(sib, 'y.pdf'), 'y');
    await register(`../${basename(sib)}/`);
    await snapshotReference(root, AT);
    await register(sib);
    const d = await diffReference(root);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('심볼릭 링크로 다른 이름이 된 저장소 경로도 같은 열쇠다', async () => {
    await register('ext/');
    await snapshotReference(root, AT);
    await register(join(await realpath(root), 'ext'));
    const d = await diffReference(root);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });

  it('옛 절대 표기 기준점에서도 실제로 바뀐 파일은 changed·영향 개념으로 잡힌다', async () => {
    await register('ext/');
    await cite('cite-x', 'x.pdf');
    await snapshotReference(root, AT);
    await rekeyLock((k) => join(root, k));
    await writeFile(join(root, 'ext', 'x.pdf'), 'pdf v2 — 개정');
    const d = await diffReference(root);
    expect(d.changed).toEqual(['ext/x.pdf']);
    expect(d.affected.map((a) => a.slug)).toEqual(['cite-x']);
  });

  it('근거 경로를 절대 경로로 적은 개념도 영향 개념으로 고른다', async () => {
    await register('ext/');
    await cite('cite-abs', join(root, 'ext', 'x.pdf'));
    await snapshotReference(root, AT);
    await writeFile(join(root, 'ext', 'x.pdf'), 'pdf v2 — 개정');
    const d = await diffReference(root);
    expect(d.affected.map((a) => a.slug)).toEqual(['cite-abs']);
  });
});
