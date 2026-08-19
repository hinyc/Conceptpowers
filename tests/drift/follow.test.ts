// @concept:drift-reconcile
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  isFollowed,
  isRelatedFile,
  missingRelatedPaths,
  pruneMissingPaths,
} from '../../src/drift/follow.js';
import { reconcileAfterCommit } from '../../src/drift/reconcile.js';
import { checkDrift } from '../../src/hooks/gates/driftGate.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { writeFeature } from '../../src/store/featureStore.js';
import { writeLock } from '../../src/drift/lock.js';
import { contractHash } from '../../src/drift/hash.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

function touch(rel: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, '');
}

describe('isFollowed — 따라옴 판정(문지기·결산 공용 잣대)', () => {
  it('연결된 코드 가운데 하나라도 들어오면 따라옴이다 (규칙: 따라옴 = 하나라도 함께 들어온 경우)', () => {
    const present = new Set(['src/a.ts']);
    expect(isFollowed(['src/a.ts', 'src/b.ts', 'tests/a.test.ts'], present)).toBe(true);
  });
  it('연결된 코드가 하나도 안 들어오면 무시함이다 (규칙: 무시함 = 하나도 안 들어온 경우)', () => {
    const present = new Set(['README.md']);
    expect(isFollowed(['src/a.ts', 'src/b.ts'], present)).toBe(false);
  });
  it('연결된 코드가 없으면 따라올 것이 없으므로 따라옴으로 본다', () => {
    expect(isFollowed([], new Set())).toBe(true);
  });
  it('경로 표기(./ 접두, 역슬래시)가 달라도 정규화해 비교한다', () => {
    const present = new Set(['src/a.ts']);
    expect(isFollowed(['./src/a.ts'], present)).toBe(true);
    expect(isFollowed(['src\\a.ts'], present)).toBe(true);
  });
});

describe('missingRelatedPaths — 안 들어온 연결 코드 목록', () => {
  it('들어오지 않은 경로만 정규화해 돌려준다', () => {
    const present = new Set(['src/a.ts']);
    expect(missingRelatedPaths(['./src/a.ts', 'src/b.ts'], present)).toEqual(['src/b.ts']);
  });
});

describe('pruneMissingPaths — 이제 존재하지 않는 경로 제외 (규칙: 사라진 경로는 연결된 코드에서 뺀다)', () => {
  it('디스크에 없는 경로는 연결된 코드에서 제외한다', async () => {
    touch('src/a.ts');
    expect(await pruneMissingPaths(root, ['src/a.ts', 'src/gone.ts'])).toEqual(['src/a.ts']);
  });
  it('전부 사라졌으면 빈 목록이다 — 영구 차단 대신 따라올 것이 없는 상태가 된다', async () => {
    expect(await pruneMissingPaths(root, ['src/gone.ts'])).toEqual([]);
  });
  it('입력을 정규화해 돌려준다(./ 접두 제거) — 형제 함수와 같은 계약', async () => {
    touch('src/a.ts');
    expect(await pruneMissingPaths(root, ['./src/a.ts'])).toEqual(['src/a.ts']);
  });
  it('디렉터리 경로는 git 목록에 나올 수 없으므로 연결된 코드로 세지 않는다', async () => {
    touch('src/feature/index.ts');
    expect(await pruneMissingPaths(root, ['src/feature', 'src/feature/index.ts'])).toEqual([
      'src/feature/index.ts',
    ]);
  });
  it('루트 밖(..) 경로는 git 목록에 나올 수 없으므로 연결된 코드로 세지 않는다', async () => {
    touch('src/a.ts');
    expect(await pruneMissingPaths(root, ['../outside.ts', 'src/a.ts'])).toEqual(['src/a.ts']);
  });
  it('절대 경로·루트 자신은 판정 대상이 아니다(isRelatedFile 직접 확인)', async () => {
    touch('src/a.ts');
    expect(await isRelatedFile(root, join(root, 'src/a.ts'))).toBe(false);
    expect(await isRelatedFile(root, '')).toBe(false);
    expect(await isRelatedFile(root, 'src/a.ts')).toBe(true);
  });
});

// 문지기(커밋 전)와 결산(커밋 뒤)이 같은 입력에 같은 판정을 내리는지 — 규칙: 동일 잣대.
describe('문지기·결산 동일 잣대', () => {
  async function makeDrift(related: string[]) {
    related.forEach((p) => touch(p));
    const base = {
      slug: 'auth-token',
      category: ['behavior'],
      title: 'A',
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
    };
    await writeConcept(root, { ...base, description: { definition: 'v1' } } as never);
    const c1 = await readConcept(root, 'auth-token');
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } });
    await writeFeature(root, {
      slug: 'login',
      title: 'L',
      concepts: ['auth-token'],
      codePaths: related,
    } as never);
    await writeConcept(root, { ...base, description: { definition: 'v2' } } as never);
  }
  it.each([
    [['src/a.ts', 'src/b.ts'], ['src/b.ts'], true],
    [['src/a.ts', 'src/b.ts'], ['README.md'], false],
    [['src/a.ts'], [], false],
  ])(
    '연결 %j · 파일 %j → 따라옴=%s (문지기 통과 == 결산 aligned)',
    async (related, files, followed) => {
      await makeDrift(related as string[]);
      const gate = await checkDrift({ root, files: files as string[] } as never);
      expect(gate === null).toBe(followed);
      const r = await reconcileAfterCommit(root, files as string[], 't2');
      expect(r.aligned.includes('auth-token')).toBe(followed);
      expect(r.ignored.includes('auth-token')).toBe(!followed);
    }
  );
});
