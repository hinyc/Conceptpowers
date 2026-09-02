// @concept:concept-code-mapping @concept:settled-status
// tests/audit/audit.test.ts
// 개념↔코드 연결의 무결성(auditIntegrity)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-code-mapping 구성요소 "표식: 파일 첫머리에 적는 개념 이름표 — 따를 개념이 없다는 뜻의
//    \"없음\"도 표식으로 친다"
//    → 존재하는 개념을 가리키는 태그는 통과 / 없는 개념을 가리키면 unknownTags / @concept:none 은 미지 태그가 아니다
//  - settled-status 구성요소 "빨강(red): AI 추측 또는 미승인 / 노랑(pending): 사람이 쓴 초안"
//    → red는 unapproved로, pending은 pending으로 갈라 보고한다 / 스테이징이 참조하는 red는 unapprovedRefs
//  - concept-code-mapping 구성요소 "대상: … 무시 목록에 등록된 생성물·외부 코드는 대상이 아니다"
//    → ignoreGlobs에 걸리는 생성물의 태그는 미지 태그로 잡지 않는다
//  - concept-code-mapping 제한 "표식이 없다는 이유만으로 커밋을 막는 것"
//    → 미승인(red)을 보고하되 ok는 막지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditIntegrity } from '../../src/audit/audit.js';
import { writeConcept } from '../../src/store/conceptStore.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
  mkdirSync(join(root, 'src'), { recursive: true });
});

describe('auditIntegrity', () => {
  it('존재하는 개념을 가리키는 태그는 통과한다', async () => {
    await writeConcept(root, {
      slug: 'admin-role',
      category: ['role'],
      title: 'A',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
    });
    writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\n');
    const r = await auditIntegrity(root, ['src/a.ts']);
    expect(r.unknownTags).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('없는 개념을 가리키는 태그를 unknownTags로 보고한다', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n');
    const r = await auditIntegrity(root, ['src/a.ts']);
    expect(r.unknownTags).toEqual([{ slug: 'ghost', file: 'src/a.ts' }]);
    expect(r.ok).toBe(false);
  });

  it('무시 목록(ignoreGlobs)에 걸리는 생성물의 태그는 미지 태그로 잡지 않는다', async () => {
    const rel = 'docs/conceptpowers/concepts/viewer/assets/viewer.js';
    mkdirSync(join(root, 'docs/conceptpowers/concepts/viewer/assets'), { recursive: true });
    writeFileSync(join(root, rel), '// @concept:home-search\n');
    const r = await auditIntegrity(root, [rel], ['docs/conceptpowers/**']);
    expect(r.unknownTags).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('무시 경로 생성물과 함께 스테이징돼도 일반 코드의 미지 태그는 그대로 잡는다', async () => {
    const rel = 'docs/conceptpowers/concepts/viewer/assets/viewer.js';
    mkdirSync(join(root, 'docs/conceptpowers/concepts/viewer/assets'), { recursive: true });
    writeFileSync(join(root, rel), '// @concept:home-search\n');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\n');
    const r = await auditIntegrity(root, [rel, 'src/a.ts'], ['docs/conceptpowers/**']);
    expect(r.unknownTags).toEqual([{ slug: 'ghost', file: 'src/a.ts' }]);
  });
  it('@concept:none(예약 마커)은 미지 태그로 보고하지 않는다', async () => {
    writeFileSync(join(root, 'src/n.ts'), '// @concept:none\n');
    const r = await auditIntegrity(root, ['src/n.ts']);
    expect(r.unknownTags).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('미승인(red) 개념을 unapproved로 보고하지만 ok는 막지 않는다', async () => {
    await writeConcept(root, {
      slug: 'red-one',
      category: ['feature'],
      title: 'R',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
      status: 'red',
    });
    await writeConcept(root, {
      slug: 'green-one',
      category: ['feature'],
      title: 'G',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
      status: 'green',
    });
    const r = await auditIntegrity(root, []);
    expect(r.unapproved).toEqual(['red-one']);
    expect(r.ok).toBe(true); // red는 정합성을 막지 않음(경고만)
  });
  it('스테이징 파일이 참조하는 red 개념을 unapprovedRefs로 보고한다', async () => {
    await writeConcept(root, {
      slug: 'red-one',
      category: ['feature'],
      title: 'R',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
      status: 'red',
    });
    writeFileSync(join(root, 'src/a.ts'), '// @concept:red-one\n');
    const r = await auditIntegrity(root, ['src/a.ts']);
    expect(r.unapprovedRefs).toEqual(['red-one']);
  });
  it('pending 개념은 unapproved가 아니라 pending으로 보고한다', async () => {
    await writeConcept(root, {
      slug: 'pend-one',
      category: ['term'],
      title: 'P',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
      status: 'pending',
    });
    const r = await auditIntegrity(root, []);
    expect(r.unapproved).not.toContain('pend-one');
    expect(r.pending).toContain('pend-one');
  });
});
