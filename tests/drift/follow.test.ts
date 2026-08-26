// @concept:drift-reconcile
// 맞물림·따라옴 판정의 단일 잣대(isFollowed·hasFollowedCode·isEngagedWithTags·
// missingRelatedPaths·pruneMissingPaths)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile 구성요소 "맞물림: 어긋난 개념의 문서나 연결된 코드 가운데 하나라도 이번 커밋에
//    들어온 경우 — 맞물린 개념만 판정과 결산의 대상이다" → isEngagedWithTags / 무관 커밋은 판정 제외
//  - drift-reconcile 구성요소 "따라옴: 개념과 연결된 코드 가운데 하나라도 커밋에 함께 들어온 경우 —
//    어느 파일을 고쳐야 하는지는 사람만 알 수 있으므로 전부를 요구하지 않는다"
//    → 하나라도 들어오면 따라옴 / 맞물렸는데 하나도 안 들어오면 무시함
//  - drift-reconcile 불변 "고쳐진 개념과 연결된 코드를 커밋할 때는 고쳐진 개념 문서가 함께 들어와야
//    한다" → 코드만 스테이징하면 문지기가 잡는다
//  - drift-reconcile 불변 "맞물리지 않은 커밋은 막지 않는다" → 무관 커밋에서 문지기 통과·결산 안 함
//  - drift-reconcile 허용 "이제 존재하지 않는 파일 경로는 연결된 코드에서 빼고 판정하는 것"
//    → pruneMissingPaths 6개: 없는 경로·디렉터리·루트 밖·절대 경로를 빼고, 전부 사라지면 빈 목록
//  - drift-reconcile 불변 "커밋 전 문지기(governance-mode)의 판정과 커밋 뒤 결산은 같은 잣대로
//    맞물림과 따라옴을 판정한다" → 문지기·결산 동일 잣대
//  - concept-code-mapping "태그가 진실의 원천, mapping은 캐시" → 캐시가 낡아 연결 목록에 없어도
//    첫머리에 @concept:<slug>를 단 파일이 들어오면 따라옴이다(문지기·결산 동일).
//    생성물(ignoreGlobs)의 태그와 본문 중간의 태그는 세지 않는다(= 맞물림 아님).
//  - 경로 표기 정규화(./ 접두·역슬래시)는 개념 규칙이 아니라 같은 파일을 다르게 세지 않기 위한 구현 세부다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  isFollowed,
  hasFollowedCode,
  isEngagedWithTags,
  isRelatedFile,
  missingRelatedPaths,
  pruneMissingPaths,
} from '../../src/drift/follow.js';
import { reconcileAfterCommit } from '../../src/drift/reconcile.js';
import { checkDrift } from '../../src/hooks/gates/driftGate.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { writeFeature } from '../../src/store/featureStore.js';
import { writeLock, readLock } from '../../src/drift/lock.js';
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

describe('hasFollowedCode · isEngagedWithTags — 맞물림 판정(문지기·결산 공용 잣대)', () => {
  const d = {
    slug: 'auth-token',
    relatedPaths: ['src/a.ts', 'src/b.ts'],
    docPath: 'docs/conceptpowers/concepts/data/auth-token.json',
  };
  it('연결 코드가 하나라도 들어오면 코드 따라옴이다', () => {
    expect(hasFollowedCode(d, new Set(['src/b.ts']), new Set())).toBe(true);
  });
  it('연결 코드가 하나도 안 들어오면 코드 따라옴이 아니다', () => {
    expect(hasFollowedCode(d, new Set(['README.md']), new Set())).toBe(false);
  });
  it('연결 코드 목록이 비어 있으면 코드 따라옴이 아니다 — 맞물림은 실제로 들어온 것만 센다', () => {
    expect(hasFollowedCode({ ...d, relatedPaths: [] }, new Set(['src/x.ts']), new Set())).toBe(
      false
    );
  });
  it('첫머리 태그가 이 개념을 가리키는 파일이 들어오면 코드 따라옴이다', () => {
    expect(hasFollowedCode(d, new Set(['src/new.ts']), new Set(['auth-token']))).toBe(true);
  });
  it('개념 문서가 들어오면 맞물림이다 (규칙: 맞물림 = 문서나 연결 코드 가운데 하나라도)', () => {
    expect(isEngagedWithTags(d, new Set([d.docPath]), new Set())).toBe(true);
  });
  it('연결 코드가 들어와도 맞물림이다', () => {
    expect(isEngagedWithTags(d, new Set(['src/a.ts']), new Set())).toBe(true);
  });
  it('문서도 코드도 안 들어오면 맞물림이 아니다', () => {
    expect(isEngagedWithTags(d, new Set(['README.md']), new Set())).toBe(false);
  });
  it('문서 경로 표기가 달라도(./ 접두) 정규화해 맞물림으로 본다', () => {
    expect(isEngagedWithTags({ ...d, docPath: `./${d.docPath}` }, new Set([d.docPath]), new Set())).toBe(
      true
    );
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
// 문지기 통과 조건: 맞물리지 않았거나, 맞물렸다면 개념 문서와 코드가 서로를 동반한 경우.
// 결산: 맞물린 개념만 aligned/ignored로 분류하고, 무관한 커밋은 어긋난 채 남겨 둔다.
describe('문지기·결산 동일 잣대 (맞물림·따라옴)', () => {
  const DOC = 'docs/conceptpowers/concepts/data/auth-token.json';
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
  it('코드와 개념 문서가 함께 들어오면 문지기 통과, 결산은 aligned (규칙: 서로 동반)', async () => {
    await makeDrift(['src/a.ts', 'src/b.ts']);
    const gate = await checkDrift({ root, files: ['src/b.ts', DOC] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['src/b.ts', DOC], 't2');
    expect(r.aligned).toContain('auth-token');
    expect(r.ignored).toEqual([]);
  });
  it('연결 코드만 들어오고 개념 문서가 빠지면 문지기가 잡는다 (규칙: 개념 문서 동반 필수)', async () => {
    await makeDrift(['src/a.ts', 'src/b.ts']);
    const gate = await checkDrift({ root, files: ['src/b.ts'] } as never);
    expect(gate).not.toBeNull();
    expect(gate!.reason).toContain('개념 문서');
    // git 정보가 없는 환경의 후퇴 동작: 결산은 코드 따라옴을 인정한다. git 저장소에서는
    // 문서가 정착할 때까지 결산이 미뤄진다 — 아래 '문서 정착과 결산 유예' 시나리오 참조.
    const r = await reconcileAfterCommit(root, ['src/b.ts'], 't2');
    expect(r.aligned).toContain('auth-token');
  });
  it('개념 문서만 들어오고 연결 코드가 하나도 없으면 문지기가 잡고, 강행 시 결산은 ignored', async () => {
    await makeDrift(['src/a.ts']);
    const gate = await checkDrift({ root, files: [DOC] } as never);
    expect(gate).not.toBeNull();
    const r = await reconcileAfterCommit(root, [DOC], 't2');
    expect(r.ignored).toContain('auth-token');
    expect(r.aligned).toEqual([]);
  });
  it('무관한 커밋은 문지기가 막지 않고, 결산도 하지 않는다 (규칙: 맞물리지 않은 커밋은 막지 않는다)', async () => {
    await makeDrift(['src/a.ts']);
    const gate = await checkDrift({ root, files: ['README.md'] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['README.md'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
  });
  it('빈 커밋(파일 없음)도 맞물리지 않으므로 막지 않고 결산하지 않는다', async () => {
    await makeDrift(['src/a.ts']);
    const gate = await checkDrift({ root, files: [] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, [], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
  });
  it('문서 미동반과 코드 미동반이 함께 있으면 한 판정에 둘 다 담는다', async () => {
    await makeDrift(['src/a.ts']); // auth-token: 코드는 스테이징, 문서는 빠짐
    touch('src/s.ts');
    const other = {
      slug: 'session-rule',
      category: ['behavior'],
      title: 'S',
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
    };
    await writeConcept(root, { ...other, description: { definition: 'v1' } } as never);
    const o1 = await readConcept(root, 'session-rule');
    await writeLock(root, {
      'auth-token': (await readLock(root))['auth-token'],
      'session-rule': { hash: contractHash(o1!), at: 't' },
    });
    await writeFeature(root, {
      slug: 'session',
      title: 'S',
      concepts: ['session-rule'],
      codePaths: ['src/s.ts'],
    } as never);
    await writeConcept(root, { ...other, description: { definition: 'v2' } } as never);
    const gate = await checkDrift({
      root,
      files: ['src/a.ts', 'docs/conceptpowers/concepts/data/session-rule.json'],
    } as never);
    expect(gate).not.toBeNull();
    expect(gate!.reason).toContain('개념 문서'); // auth-token: 문서 미동반
    expect(gate!.reason).toContain('related code (none staged)'); // session-rule: 코드 미동반
    expect(gate!.reason).toContain('auth-token');
    expect(gate!.reason).toContain('session-rule');
  });
  it('연결 코드가 없는 개념은 문서만 커밋해도 통과하고 aligned로 결산한다 (따라올 것이 없다)', async () => {
    await makeDrift([]);
    const gate = await checkDrift({ root, files: [DOC] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, [DOC], 't2');
    expect(r.aligned).toContain('auth-token');
  });

  // 태그는 진실의 원천, mapping은 캐시(concept-code-mapping) — 캐시가 낡아 연결 목록에
  // 없는 파일이라도 첫머리 태그가 따라옴을 증언한다. 문지기·결산이 같은 판정을 내린다.
  function writeTagged(rel: string, content: string) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  it('연결 목록에 없어도 첫머리에 @concept 태그를 단 파일이 개념 문서와 함께 들어오면 따라옴이다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/store.ts', '// @concept:auth-token\nexport const s = 1;\n');
    const gate = await checkDrift({ root, files: ['src/store.ts', DOC] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['src/store.ts', DOC], 't2');
    expect(r.aligned).toContain('auth-token');
    expect(r.ignored).toEqual([]);
  });
  it('태그 파일만 들어오고 개념 문서가 빠지면 문지기가 잡는다 (맞물림인데 문서 미동반)', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/store.ts', '// @concept:auth-token\nexport const s = 1;\n');
    const gate = await checkDrift({ root, files: ['src/store.ts'] } as never);
    expect(gate).not.toBeNull();
    expect(gate!.reason).toContain('개념 문서');
  });
  it('다른 개념의 태그는 이 개념의 맞물림이 아니다 — 막지 않고 결산하지 않는다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/store.ts', '// @concept:other-concept\nexport const s = 1;\n');
    const gate = await checkDrift({ root, files: ['src/store.ts'] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['src/store.ts'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
  });
  it('ignoreGlobs에 걸리는 생성물의 태그는 세지 않는다 — 맞물림 아님', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('dist/copy.js', '// @concept:auth-token\nvar s = 1;\n');
    const gate = await checkDrift({ root, files: ['dist/copy.js'] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['dist/copy.js'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
  });
  it('본문 중간의 태그는 세지 않는다 — 첫머리 주석 블록만 본다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/late.ts', 'export const s = 1;\n// @concept:auth-token\n');
    const gate = await checkDrift({ root, files: ['src/late.ts'] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['src/late.ts'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
  });
  it('비코드 파일(.md)의 첫머리 텍스트는 태그로 세지 않는다 — 문서만 고친 커밋은 맞물림이 아니다', async () => {
    await makeDrift(['src/a.ts']);
    // 마크다운 헤딩(#)은 leadingCommentBlock에서 주석으로 오인될 수 있는 형태다.
    writeTagged('docs/note.md', '# 개념 노트: @concept:auth-token\n## 배경\n');
    const gate = await checkDrift({ root, files: ['docs/note.md'] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['docs/note.md'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
  });
  it('@concept:none 예약 마커는 어떤 개념의 맞물림도 아니다', async () => {
    await makeDrift(['src/a.ts']);
    writeTagged('src/unrelated.ts', '// @concept:none\nexport const u = 1;\n');
    const gate = await checkDrift({ root, files: ['src/unrelated.ts'] } as never);
    expect(gate).toBeNull();
    const r = await reconcileAfterCommit(root, ['src/unrelated.ts'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
  });
});

// git 저장소에서만 성립하는 규칙(drift-reconcile 불변):
//  - "고쳐진 개념 문서가 이미 지난 커밋에 정착해 있어 담을 변경이 없으면 (동반을) 요구하지 않는다"
//  - "기준선은 커밋에 정착한 개념 내용의 지문으로만 옮긴다 — 미커밋 변경이 남아 있으면 결산을 미룬다"
describe('문서 정착과 결산 유예 (git 저장소)', () => {
  const DOC = 'docs/conceptpowers/concepts/data/auth-token.json';
  function git(...args: string[]) {
    execFileSync('git', ['-c', 'user.email=t@t.t', '-c', 'user.name=t', ...args], { cwd: root });
  }
  const base = {
    slug: 'auth-token',
    category: ['behavior'],
    title: 'A',
    purpose: { reason: 'r' },
    actions: {},
    principle: {},
  };
  // v1을 커밋해 두고 lock을 v1로 맞춘 뒤, 문서를 v2로 고친다(아직 미커밋 = 미정착).
  async function makeGitDrift() {
    touch('src/a.ts');
    await writeConcept(root, { ...base, description: { definition: 'v1' } } as never);
    const c1 = await readConcept(root, 'auth-token');
    await writeLock(root, { 'auth-token': { hash: contractHash(c1!), at: 't' } });
    await writeFeature(root, {
      slug: 'login',
      title: 'L',
      concepts: ['auth-token'],
      codePaths: ['src/a.ts'],
    } as never);
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'v1');
    await writeConcept(root, { ...base, description: { definition: 'v2' } } as never);
  }
  it('문서가 미정착이면 코드만 커밋된 결산을 미룬다 — 기준선·이력을 건드리지 않는다', async () => {
    await makeGitDrift();
    const before = (await readLock(root))['auth-token'].hash;
    const r = await reconcileAfterCommit(root, ['src/a.ts'], 't2');
    expect(r.aligned).toEqual([]);
    expect(r.ignored).toEqual([]);
    expect((await readLock(root))['auth-token'].hash).toBe(before); // 어긋남 유지
  });
  it('문서가 이미 지난 커밋에 정착해 있으면(담을 변경 없음) 코드만 스테이징해도 문지기가 요구하지 않는다', async () => {
    await makeGitDrift();
    git('add', DOC);
    git('commit', '-q', '-m', 'v2 doc'); // 문서 정착 — 단 lock은 여전히 v1(머지 유입과 같은 상태)
    const gate = await checkDrift({ root, files: ['src/a.ts'] } as never);
    expect(gate).toBeNull();
    // 결산은 정착한 문서의 지문으로 기준선을 닫는다.
    const c2 = await readConcept(root, 'auth-token');
    const r = await reconcileAfterCommit(root, ['src/a.ts'], 't3');
    expect(r.aligned).toContain('auth-token');
    expect((await readLock(root))['auth-token'].hash).toBe(contractHash(c2!));
  });
});
