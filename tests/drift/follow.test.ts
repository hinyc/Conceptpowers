// @concept:drift-reconcile
// 따라옴 판정의 단일 잣대(isFollowed·missingRelatedPaths·pruneMissingPaths)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 구성요소 "따라옴: 개념과 연결된 코드 가운데 하나라도 커밋에 함께 들어온 경우 —
//    어느 파일을 고쳐야 하는지는 사람만 알 수 있으므로 전부를 요구하지 않는다"
//    → 하나라도 들어오면 따라옴 / 하나도 안 들어오면 무시함 / 연결 코드가 없으면 따라옴
//  - drift-reconcile 허용 "이제 존재하지 않는 파일 경로는 연결된 코드에서 빼고 판정하는 것"
//    → pruneMissingPaths 6개: 없는 경로·디렉터리·루트 밖·절대 경로를 빼고, 전부 사라지면 빈 목록
//  - drift-reconcile 불변 "커밋 전 문지기(governance-mode)의 어긋남 경고와 커밋 뒤 결산은 같은
//    잣대로 따라옴을 판정한다" → 문지기·결산 동일 잣대
//  - concept-code-mapping "태그가 진실의 원천, mapping은 캐시" → 캐시가 낡아 연결 목록에 없어도
//    첫머리에 @concept:<slug>를 단 파일이 들어오면 따라옴이다(문지기·결산 동일).
//    생성물(ignoreGlobs)의 태그와 본문 중간의 태그는 세지 않는다.
//  - 경로 표기 정규화(./ 접두·역슬래시)는 개념 규칙이 아니라 같은 파일을 다르게 세지 않기 위한 구현 세부다.
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

  // 태그는 진실의 원천, mapping은 캐시(concept-code-mapping) — 캐시가 낡아 연결 목록에
  // 없는 파일이라도 첫머리 태그가 따라옴을 증언한다. 문지기·결산이 같은 판정을 내린다.
  function writeTagged(rel: string, content: string) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  it('연결 목록에 없어도 첫머리에 @concept 태그를 단 파일이 들어오면 따라옴이다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/store.ts', '// @concept:auth-token\nexport const s = 1;\n');
    const gate = await checkDrift({ root, files: ['src/store.ts'] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['src/store.ts'], 't2');
    expect(r.aligned).toContain('auth-token');
    expect(r.ignored).toEqual([]);
  });
  it('다른 개념의 태그는 이 개념의 따라옴이 아니다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/store.ts', '// @concept:other-concept\nexport const s = 1;\n');
    const gate = await checkDrift({ root, files: ['src/store.ts'] } as never);
    expect(gate).not.toBeNull();
    const r = await reconcileAfterCommit(root, ['src/store.ts'], 't2');
    expect(r.ignored).toContain('auth-token');
  });
  it('ignoreGlobs에 걸리는 생성물의 태그는 세지 않는다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('dist/copy.js', '// @concept:auth-token\nvar s = 1;\n');
    const gate = await checkDrift({ root, files: ['dist/copy.js'] } as never);
    expect(gate).not.toBeNull();
    const r = await reconcileAfterCommit(root, ['dist/copy.js'], 't2');
    expect(r.ignored).toContain('auth-token');
  });
  it('본문 중간의 태그는 세지 않는다 — 첫머리 주석 블록만 본다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/late.ts', 'export const s = 1;\n// @concept:auth-token\n');
    const gate = await checkDrift({ root, files: ['src/late.ts'] } as never);
    expect(gate).not.toBeNull();
    const r = await reconcileAfterCommit(root, ['src/late.ts'], 't2');
    expect(r.ignored).toContain('auth-token');
  });
});
