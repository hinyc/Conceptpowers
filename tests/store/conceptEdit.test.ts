// @concept:human-owns-contract @concept:concept-inline-edit
// tests/store/conceptEdit.test.ts
// 명령(edit-concept)이 쓰는 개념 본문 편집 흐름 editConceptWithNote를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - human-owns-contract 불변 "명령으로 개념 내용을 고칠 때는 왜 고치는지 사유가 함께 있어야 한다 —
//    사유가 비어 있으면 고치지 않는다" → 사유가 비면 아무것도 바꾸지 않는다
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
  it('확정된 개념을 고치면 검토 중으로 내려간다 [규칙: 확정된 개념을 고치면 검토 중으로]', async () => {
    await writeConcept(root, { ...base, status: 'green' });
    const r = await editConceptWithNote(root, 'admin-role', { title: 'New' }, '용어 정리');
    expect(r.downgradedToPending).toBe(true);
    expect(r.concept.status).toBe('pending');
    expect(r.concept.title).toBe('New');
  });

  it('검토 중 개념은 내려가지 않았다고 알린다 [규칙: 확정된 개념을 고치면 검토 중으로]', async () => {
    await writeConcept(root, { ...base, status: 'pending' });
    const r = await editConceptWithNote(root, 'admin-role', { title: 'New' }, '수정');
    expect(r.downgradedToPending).toBe(false);
  });

  it('사유가 비면 아무것도 바꾸지 않는다 [규칙: 명령으로 고칠 때 사유가 비면 고치지 않는다]', async () => {
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
