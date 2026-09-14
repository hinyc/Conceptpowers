// @concept:reference-sync
// tests/reference/canonicalFinal.test.ts
// 링크를 한쪽에서만 풀지 않는지(절대 이름 링크가 저장소를 가리키는 경우), 시스템 앞부분 별칭,
// 객체 속성 이름과 겹치는 파일, 공용 폴더를 개인 홈으로 오인하지 않는지를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 허용 "현재 자료를 기준점과 견줘 추가·변경·삭제를 가려내는 것"
//    → 절대 이름 링크가 저장소를 가리켜도 열쇠는 적힌 이름 — 1.14.0 기준점과 어긋나지 않는다
//    → /private 앞부분이 붙은 저장소 경로와 붙지 않은 이름은 같은 저장소다
//    → __proto__ 이름의 파일도 기준점을 찍은 뒤에는 추가로 잡히지 않는다
//  - reference-sync 불변 "영향 개념은 개념의 근거 목록에 적힌 참고자료 좌표와 맞춰서만 고르며, 다른 추측으로 넓히지 않는다"
//    → 절대 이름 링크 아래 파일을 적힌 이름으로 인용한 개념이 영향 개념으로 잡힌다
//    → 인용 판정은 경계(/) 뒤의 뒷부분 경로로만 맞는다
//  - reference-sync 불변 "닿지 않는 위치의 자료는 삭제로 세지 않는다"
//    → 절대 이름 링크가 사라지거나 대상 폴더를 읽을 수 없어도 그 아래 열쇠를 삭제로 세지 않는다
//    → 공용 폴더(/Users/Shared, C:/Users/Public)는 다른 기기의 개인 홈으로 보지 않는다
//    → 다른 기기에서 저장소 안을 절대 경로로 등록한 기준점을, 같은 홈 위치에 클론한 기기가 받아도 삭제로 세지 않는다
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, realpath, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffReference } from '../../src/reference/diff.js';
import { citedMatcher } from '../../src/reference/affected.js';
import { loadAliases, portableHomeForm } from '../../src/reference/canonical.js';
import { hashFile } from '../../src/reference/fingerprint.js';
import {
  snapshotReference,
  writeReferenceLock,
  readReferenceLock,
} from '../../src/reference/lock.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { cpPaths } from '../../src/paths.js';
import type { Concept } from '../../src/schema/concept.js';

const AT = '2026-09-14T00:00:00.000Z';

describe('portableHomeForm — 공용 폴더는 개인 홈이 아니다', () => {
  it('/Users/Shared, C:/Users/Public 은 ~/… 로 바꾸지 않는다', () => {
    expect(portableHomeForm('/Users/Shared/docs')).toBeNull();
    expect(portableHomeForm('C:\\Users\\Public\\x')).toBeNull();
    expect(portableHomeForm('/Users/sharedname/docs')).toBe('~/docs');
  });
});

describe('loadAliases — 시스템 앞부분 별칭', () => {
  it('/private/… 경로는 /private 을 뗀 이름도 같은 위치로 본다', async () => {
    const a = await loadAliases('/private/tmp/cp-final-nonexistent', '/private/var/cp-final-home');
    expect(a.roots).toContain('/tmp/cp-final-nonexistent');
    expect(a.homes).toContain('/var/cp-final-home');
  });
});

describe('citedMatcher — 경계 뒤 뒷부분으로만 맞는다', () => {
  const concept = (paths: string[]): Concept =>
    ({
      slug: 'c',
      status: 'green',
      sources: paths.map((path) => ({ kind: 'reference', path, locator: '', supports: 's' })),
    }) as unknown as Concept;
  it('전체·파일 이름·뒷부분 경로는 맞고, 경계 없는 부분 일치는 아니다', () => {
    const k = '/Volumes/x/a.pdf';
    expect(citedMatcher([concept(['x/a.pdf'])])(k)).toBe(true);
    expect(citedMatcher([concept(['a.pdf'])])(k)).toBe(true);
    expect(citedMatcher([concept(['Volumes/x/a.pdf'])])(k)).toBe(true);
    expect(citedMatcher([concept(['olumes/x/a.pdf'])])(k)).toBe(false);
    expect(citedMatcher([concept(['b.pdf'])])(k)).toBe(false);
  });
});

describe('절대 이름 링크가 저장소를 가리키는 등록', () => {
  let root: string;
  let refDir: string;
  let realRoot: string;
  let alias: string;
  let named: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-final-root-'));
    await scaffoldInit(root, {});
    refDir = cpPaths(root).reference;
    realRoot = await realpath(root);
    await mkdir(join(realRoot, 'ext'), { recursive: true });
    await writeFile(join(realRoot, 'ext', 'x.pdf'), 'v1');
    alias = `${realRoot}-alias`;
    await symlink(realRoot, alias, 'dir');
    named = `${alias}/ext`;
    await writeFile(join(refDir, 'paths.md'), `- ${named}\n`, 'utf8');
    await writeConcept(root, {
      slug: 'cite-alias',
      category: ['behavior'],
      status: 'green',
      title: 'cite-alias',
      description: { definition: '정의' },
      purpose: { reason: '이유' },
      actions: {},
      principle: {},
      sources: [{ kind: 'reference', path: `${named}/x.pdf`, locator: 'p.1', supports: '규칙' }],
    });
  });

  afterEach(async () => {
    await chmod(join(realRoot, 'ext'), 0o755).catch(() => undefined);
  });

  it('1.14.0 형식 기준점(적힌 이름)과 어긋나지 않고, 바뀌면 인용 개념이 영향 개념이다', async () => {
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: {
        [`${named}/x.pdf`]: {
          hash: await hashFile(join(realRoot, 'ext', 'x.pdf')),
          size: 2,
          mtime: AT,
        },
      },
      truncated: [],
    });
    const same = await diffReference(root);
    expect(same.added).toEqual([]);
    expect(same.removed).toEqual([]);

    await writeFile(join(realRoot, 'ext', 'x.pdf'), 'v2 — 개정');
    const d = await diffReference(root);
    expect(d.changed).toEqual([`${named}/x.pdf`]);
    expect(d.affected.map((a) => a.slug)).toEqual(['cite-alias']);
  });

  it('링크가 사라져 닿지 않으면 그 아래 열쇠를 삭제로 세지 않는다', async () => {
    await snapshotReference(root, AT);
    await rm(alias);
    const d = await diffReference(root);
    expect(d.removed).toEqual([]);
    expect(d.unreachable).toEqual([named]);
  });

  it('대상 폴더를 읽을 수 없어도 삭제로 세지 않는다', async () => {
    await snapshotReference(root, AT);
    await chmod(join(realRoot, 'ext'), 0o000);
    const d = await diffReference(root);
    expect(d.removed).toEqual([]);
  });
});

describe('/private 앞부분이 다른 저장소 이름', () => {
  it('실제 경로로 연 저장소에 /private 을 뗀 이름으로 등록해도 저장소 상대 열쇠다', async () => {
    const real = await realpath(await mkdtemp(join(tmpdir(), 'cp-final-private-')));
    await scaffoldInit(real, {});
    await mkdir(join(real, 'ext'), { recursive: true });
    await writeFile(join(real, 'ext', 'x.pdf'), 'x');
    const stripped = real.startsWith('/private/') ? real.slice('/private'.length) : real;
    await writeFile(join(cpPaths(real).reference, 'paths.md'), `- ${stripped}/ext\n`, 'utf8');
    await snapshotReference(real, AT);
    const lock = await readReferenceLock(real);
    expect(Object.keys(lock!.files)).toContain('ext/x.pdf');
  });
});

describe('객체 속성 이름과 겹치는 파일', () => {
  it('__proto__ 파일도 기준점을 찍은 뒤에는 추가로 잡히지 않는다(맨 이름 열쇠 포함)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cp-final-proto-'));
    await scaffoldInit(root, {});
    await writeFile(join(root, '__proto__'), 'p');
    await writeFile(join(cpPaths(root).reference, 'paths.md'), '- .\n', 'utf8');
    await snapshotReference(root, AT);
    const lock = await readReferenceLock(root);
    expect(Object.prototype.hasOwnProperty.call(lock!.files, '__proto__')).toBe(true);
    const d = await diffReference(root);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
  });
});

describe('다른 기기가 저장소 안을 절대 경로로 등록한 기준점', () => {
  const savedHome = process.env.HOME;
  afterEach(() => {
    process.env.HOME = savedHome;
  });

  it('같은 홈 위치에 클론한 기기에서는 닿지 않는 등록 아래 열쇠를 삭제로 세지 않는다', async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), 'cp-final-home-'));
    process.env.HOME = fakeHome;
    const root = join(fakeHome, 'code', 'repo');
    await mkdir(root, { recursive: true });
    await scaffoldInit(root, {});
    await mkdir(join(root, 'ext'), { recursive: true });
    await writeFile(join(root, 'ext', 'x.pdf'), 'x');
    await writeFile(
      join(cpPaths(root).reference, 'paths.md'),
      '- /Users/cp-final-other-user/code/repo/ext\n',
      'utf8'
    );
    for (const key of ['ext/x.pdf', '~/code/repo/ext/x.pdf']) {
      await writeReferenceLock(root, {
        version: 1,
        at: AT,
        files: { [key]: { hash: 'abc', size: 1, mtime: AT } },
        truncated: [],
      });
      const d = await diffReference(root);
      expect(d.removed, key).toEqual([]);
    }
  });
});
