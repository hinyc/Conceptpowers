// @concept:drift-reconcile @concept:concept-inline-edit
// tests/store/conceptEdit.test.ts
// 개념 본문 편집 + 변경 이력 남기기를 한 흐름으로 묶은 editConceptWithNote를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - drift-reconcile: 개념 정의를 바꾸면 "왜 바꿨는지"를 그때의 계약과 함께 이력에 남긴다
//    → 편집 뒤 이력에 사유 한 줄이 남는다 / 사유가 비면 아무것도 바꾸지 않는다
//  - concept-inline-edit 불변 "확정된 개념을 고치면 예외 없이 검토 중 상태로 내려간다"
//    → green을 고치면 downgradedToPending=true, pending은 false
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { editConceptWithNote } from '../../src/store/conceptEdit.js';
import { readHistory } from '../../src/drift/history.js';

const base = {
  slug: 'admin-role',
  group: 'auth',
  category: ['role'],
  title: 'Admin Role',
  description: { definition: 'd' },
  purpose: { reason: 'r' },
  actions: {},
  principle: {},
};
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-edit-'));
});

describe('editConceptWithNote', () => {
  it('본문을 고치고 사유를 이력에 남긴다', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    const r = await editConceptWithNote(root, 'admin-role', { title: 'New' }, '  용어 정리 ');
    expect(r.downgradedToPending).toBe(true);
    expect(r.concept.status).toBe('pending');
    const history = await readHistory(root);
    expect(history.map((h) => h.reason)).toEqual(['용어 정리']);
  });

  it('검토 중 개념은 내려가지 않았다고 알린다', async () => {
    await writeConcept(root, { ...base, status: 'pending' });
    const r = await editConceptWithNote(root, 'admin-role', { title: 'New' }, '수정');
    expect(r.downgradedToPending).toBe(false);
  });

  it('사유가 비면 아무것도 바꾸지 않는다', async () => {
    await writeConcept(root, base);
    await expect(editConceptWithNote(root, 'admin-role', { title: 'New' }, '  ')).rejects.toThrow(
      /reason/
    );
    expect((await readConcept(root, 'admin-role'))?.title).toBe('Admin Role');
    expect(await readHistory(root)).toEqual([]);
  });

  it('없는 개념은 에러를 던진다', async () => {
    await expect(editConceptWithNote(root, 'ghost', { title: 'x' }, '사유')).rejects.toThrow(
      /not found/
    );
  });
});
