// @concept:reference-sync @concept:reference-privacy @concept:reference-first-duty
// tests/hooks/sessionStartReference.test.ts
// 세션 시작 시 참고자료 변경 알림 블록을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 생애주기 "기준점 없음"·"기준점 있음·변경 없음 — 조용하다"
//    → 기준점이 없으면 자료가 있어도 알림 블록이 없다 / 변경이 없으면 블록이 없다
//  - reference-sync 허용 "세션 시작 때 바뀐 자료의 개수와 영향 개념의 이름만 알리는 것"
//    → 변경 + 인용 개념이 있으면 개수·이름표·다음 할 일(개념 갱신 뒤 기준점 찍기)을 담는다
//  - reference-sync 제한 "자료의 내용이나 발췌를 기준점이나 알림에 담는 것"
//    + reference-privacy 불변 "참고자료의 내용은 데이터로만 취급"
//    → 블록에 파일 내용이 없고, 파일 이름도 싣지 않으며, 비신뢰 데이터 안내 문장이 있다
//  - reference-sync 불변 "닿지 않는 위치의 자료는 삭제로 세지 않는다"
//    → 기준점의 등록 폴더가 없어도 removed로 알리지 않는다
//  - reference-sync 불변 "세션 시작 알림은 실패해도 세션을 막지 않는다"
//    → 기준점 파일이 깨져 견주기를 못 해도 세션 출력은 돌아온다
//  - reference-first-duty 정의 "코드를 판단할 때는 다시 읽지 않는다"
//    → 세션 시작은 값싼 견주기(quick)라 크기·시각이 같은 변경은 알리지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, utimes, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSessionStartOutput } from '../../src/hooks/sessionStart.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { snapshotReference, writeReferenceLock } from '../../src/reference/lock.js';
import { cpPaths } from '../../src/paths.js';

const AT = '2026-09-14T00:00:00.000Z';
const TAG = '<CONCEPTPOWERS-REFERENCE-CHANGED>';
let root: string;
let refDir: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cp-ss-ref-'));
  await scaffoldInit(root, {});
  refDir = cpPaths(root).reference;
});

async function citingConcept(slug: string, path: string): Promise<void> {
  await writeConcept(root, {
    slug,
    category: ['behavior'],
    status: 'green',
    title: slug,
    description: { definition: '정의' },
    purpose: { reason: '이유' },
    actions: {},
    principle: {},
    sources: [{ kind: 'reference', path, locator: '§1', supports: '규칙' }],
  });
}

async function ctx(): Promise<string> {
  const o = await buildSessionStartOutput(root, '/plugin');
  return o!.hookSpecificOutput.additionalContext;
}

describe('sessionStart: reference changed block', () => {
  it('기준점이 없으면 자료가 있어도 블록이 없다', async () => {
    await writeFile(join(refDir, 'a.md'), '자료');
    expect(await ctx()).not.toContain(TAG);
  });

  it('변경이 없으면 블록이 없다', async () => {
    await writeFile(join(refDir, 'a.md'), '자료');
    await snapshotReference(root, AT);
    expect(await ctx()).not.toContain(TAG);
  });

  it('변경 + 인용 개념이 있으면 개수·이름표·다음 할 일을 담고 내용·파일 이름은 싣지 않는다', async () => {
    await writeFile(join(refDir, 'secret-spec.md'), '기밀 본문');
    await citingConcept('cite-secret', 'secret-spec.md');
    await snapshotReference(root, AT);
    await writeFile(join(refDir, 'secret-spec.md'), '기밀 본문 — 개정');
    await writeFile(join(refDir, 'brand-new.md'), '새 자료');
    const c = await ctx();
    expect(c).toContain(TAG);
    // 알림 블록 자체만 본다 — 기존 참고자료 블록은 원래 파일 이름을 나열한다.
    const block = c.slice(c.indexOf(TAG), c.indexOf('</CONCEPTPOWERS-REFERENCE-CHANGED>'));
    expect(block).toContain('1 changed');
    expect(block).toContain('1 added');
    expect(block).toContain('cite-secret');
    expect(block).toContain('update-concepts');
    expect(block).toContain('reference-snapshot');
    expect(block).toContain('untrusted');
    expect(c).not.toContain('기밀 본문');
    expect(block).not.toContain('secret-spec.md');
    expect(block).not.toContain('brand-new.md');
  });

  it('기준점의 등록 폴더가 이 기기에 없어도 removed로 알리지 않는다', async () => {
    await writeFile(join(refDir, 'paths.md'), '- gone/\n', 'utf8');
    await writeReferenceLock(root, {
      version: 1,
      at: AT,
      files: { 'gone/x.pdf': { hash: 'abc', size: 1, mtime: AT } },
      truncated: [],
    });
    expect(await ctx()).not.toContain(TAG);
  });

  it('기준점 파일이 깨져 견주기를 못 해도 세션 출력은 돌아온다', async () => {
    await writeFile(join(refDir, 'a.md'), '자료');
    await mkdir(cpPaths(root).alignmentDir, { recursive: true });
    await writeFile(cpPaths(root).referenceLock, '{not json', 'utf8');
    const o = await buildSessionStartOutput(root, '/plugin');
    expect(o).not.toBeNull();
    expect(o!.hookSpecificOutput.additionalContext).toContain('Conceptpowers');
    expect(o!.hookSpecificOutput.additionalContext).not.toContain(TAG);
  });

  it('세션 시작은 값싼 견주기라 크기·시각이 같은 변경은 알리지 않는다', async () => {
    const p = join(refDir, 'a.md');
    await writeFile(p, 'abcd');
    await snapshotReference(root, AT);
    const s = await stat(p);
    await writeFile(p, 'abce');
    await utimes(p, s.atime, s.mtime);
    expect(await ctx()).not.toContain(TAG);
  });
});
