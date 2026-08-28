// @concept:settled-status @concept:globally-unique-slug @concept:human-owns-contract @concept:concept-inline-edit @concept:viewer-readability
// tests/store/conceptStore.test.ts
// 개념 본문의 저장·읽기와 상태 전이 가드를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - globally-unique-slug 불변 "개념 이름표는 개념들 사이에서 유일하다 — 묶음이 달라도 같은 벌 안에서는
//    두 번 쓸 수 없다" → slug 존재 여부를 전역으로 판단 / 다른 그룹에 동일 slug 쓰기 거부 / 동일 경로 덮어쓰기 허용
//  - settled-status 불변 "한 번 확정된 초록·빨강은 시스템 경로로는 되돌리지 않는다"
//    → settled green은 다른 상태로 전이할 수 없다 / settled red는 pending으로 되돌릴 수 없다
//  - settled-status 구성요소 "노랑(pending): 사람이 쓴 초안 — 검토가 끝나면 초록이 된다"
//    → pending은 green/red로 정착할 수 있다 / 동일 상태 전이는 idempotent
//  - human-owns-contract 불변 "개념 문서의 내용 변경은 반드시 사람의 확인을 거친다" +
//    concept-inline-edit 불변 "확정된 개념을 고치면 예외 없이 검토 중 상태로 내려간다"
//    → editConceptContent: green을 편집하면 pending으로 내려간다 / pending·red는 상태를 유지한다
//  - concept-inline-edit 구성요소 "고칠 수 없는 것: 이름표와 묶음(주소가 되는 값), 승인 상태" +
//    제한 "고칠 수 없는 것으로 정해진 값을 저장에 끼워 넣는 것"
//    → slug/group/status 변경 시도는 무시한다 / 런타임 임의 키는 무시한다
//  - concept-inline-edit 불변 "분류·정의·존재 이유 중 하나라도 비어 있으면 저장하지 않는다"
//    → 스키마 위반(빈 definition)은 거부한다
//  - 상위 기준 문서 "갈아 끼우기 방식"의 불변 "대상 기록은 갈아 끼우기 방식으로만 저장한다" + "임시 파일 이름이 이미
//    있으면 그것을 따라가지 않고 실패시킨다" → 임시파일+rename 경로를 쓰고 심볼릭 링크를 따라가지 않는다
//  - viewer-readability 불변 "항목의 이름은 은유적 부제 없이 그 자체로 무엇인지 알 수 있는 평이한
//    이름 하나로 적는다 — 부제를 담을 자리 자체를 두지 않는다" → 부제를 patch에 실어도 저장 결과에 남지 않는다
//  - "없는 개념은 에러를 던진다"는 대응하는 개념 규칙이 없다 — 방어적 처리다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, lstatSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  writeConcept,
  listConcepts,
  readConcept,
  slugExists,
  setConceptStatus,
  editConceptContent,
} from '../../src/store/conceptStore.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

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
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('conceptStore', () => {
  it('개념을 그룹 폴더에 쓰고 다시 읽는다', async () => {
    await writeConcept(root, base as any);
    const read = await readConcept(root, 'admin-role');
    expect(read?.title).toBe('Admin Role');
  });
  it('모든 개념을 그룹 하위까지 재귀로 나열한다', async () => {
    await writeConcept(root, base as any);
    await writeConcept(root, { ...base, slug: 'user-role', group: 'auth' } as any);
    await writeConcept(root, { ...base, slug: 'token-meter', group: 'billing' } as any);
    const all = await listConcepts(root);
    expect(all.map((c) => c.slug).sort()).toEqual(['admin-role', 'token-meter', 'user-role']);
  });
  it('slug 존재 여부를 전역으로 판단한다 (그룹 무관)', async () => {
    await writeConcept(root, base as any);
    expect(await slugExists(root, 'admin-role')).toBe(true);
    expect(await slugExists(root, 'nope')).toBe(false);
  });
  it('다른 그룹에 동일 slug 쓰기를 거부한다 (I1)', async () => {
    await writeConcept(root, { ...base, slug: 'admin-role', group: 'auth' } as any);
    await expect(
      writeConcept(root, { ...base, slug: 'admin-role', group: 'billing' } as any)
    ).rejects.toThrow('Duplicate slug');
  });
  it('동일 경로에 동일 slug 덮어쓰기는 허용한다 (I1)', async () => {
    await writeConcept(root, { ...base, slug: 'admin-role', group: 'auth', title: 'v1' } as any);
    await expect(
      writeConcept(root, { ...base, slug: 'admin-role', group: 'auth', title: 'v2' } as any)
    ).resolves.not.toThrow();
    const updated = await readConcept(root, 'admin-role');
    expect(updated?.title).toBe('v2');
  });
  it('setConceptStatus가 status를 불변으로 갱신한다', async () => {
    const qualified = {
      ...base,
      state: { managed: ['이 개념이 관리하는 대상'] },
      principle: { immutableRules: ['이 개념의 규칙은 열 글자 이상이다'], operationalPrinciple: '조건이 갖춰지면 그대로 판정된다' },
    };
    await writeConcept(root, qualified as any);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('red');
    await recordAttest(root, parseConcept(qualified), 'pass');
    const updated = await setConceptStatus(root, 'admin-role', 'green');
    expect(updated.status).toBe('green');
    expect(updated.title).toBe('Admin Role'); // 나머지 보존
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green');
  });
  it('setConceptStatus는 없는 개념에 대해 에러를 던진다', async () => {
    await expect(setConceptStatus(root, 'ghost', 'green')).rejects.toThrow('not found');
  });
  it('settled green은 다른 상태로 전이할 수 없다(가드)', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any);
    await expect(setConceptStatus(root, 'admin-role', 'red')).rejects.toThrow(/transition/i);
    await expect(setConceptStatus(root, 'admin-role', 'pending')).rejects.toThrow(/transition/i);
  });
  it('settled red는 pending으로 되돌릴 수 없다(red→green만 허용)', async () => {
    await writeConcept(root, base as any); // 기본 red
    await expect(setConceptStatus(root, 'admin-role', 'pending')).rejects.toThrow(/transition/i);
  });
  it('pending은 green/red로 정착할 수 있다', async () => {
    await writeConcept(root, { ...base, status: 'pending' } as any);
    await expect(setConceptStatus(root, 'admin-role', 'red')).resolves.toBeTruthy();
    const qualified = {
      ...base,
      status: 'pending',
      state: { managed: ['이 개념이 관리하는 대상'] },
      principle: { immutableRules: ['이 개념의 규칙은 열 글자 이상이다'], operationalPrinciple: '조건이 갖춰지면 그대로 판정된다' },
    };
    await writeConcept(root, qualified as any);
    await recordAttest(root, parseConcept(qualified), 'pass');
    expect((await setConceptStatus(root, 'admin-role', 'green')).status).toBe('green');
  });
  it('동일 상태로의 전이는 허용한다(idempotent)', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any);
    expect((await setConceptStatus(root, 'admin-role', 'green')).status).toBe('green');
  });
});

describe('writeConcept 원자적 저장 (상위 기준 문서: 갈아 끼우기 방식)', () => {
  it('덮어쓸 때 임시파일+rename 경로를 쓴다 — 심볼릭 링크를 따라가 다른 파일을 오염시키지 않는다', async () => {
    await writeConcept(root, { ...base, title: 'v1' } as any);
    const target = join(
      root,
      'docs',
      'conceptpowers',
      'concepts',
      'data',
      'auth',
      'admin-role.json'
    );
    // 대상 파일을 미끼 파일로 향하는 심볼릭 링크로 바꿔치기한다.
    // (미끼는 유효한 v1 내용 — 덮어쓰기 전 중복 검사가 읽어도 죽지 않아야 한다.)
    const v1 = readFileSync(target, 'utf8');
    const decoy = join(root, 'decoy.json');
    writeFileSync(decoy, v1);
    rmSync(target);
    symlinkSync(decoy, target);

    await writeConcept(root, { ...base, title: 'v2' } as any);

    // rename 기반 저장은 링크 자체를 새 일반 파일로 교체한다 — 미끼는 그대로여야 한다.
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(readFileSync(decoy, 'utf8')).toBe(v1);
    expect((await readConcept(root, 'admin-role'))?.title).toBe('v2');
    // 임시파일 잔여물도 없어야 한다.
    expect(readdirSync(dirname(target)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('editConceptContent', () => {
  it('본문 필드를 불변으로 교체한다', async () => {
    await writeConcept(root, { ...base, status: 'pending' } as any);
    const updated = await editConceptContent(root, 'admin-role', {
      title: 'New Title',
      actions: { allow: ['x'], restrict: ['y'], interaction: '' },
    });
    expect(updated.title).toBe('New Title');
    expect(updated.actions.allow).toEqual(['x']);
    expect((await readConcept(root, 'admin-role'))?.title).toBe('New Title');
  });
  it('green 개념을 편집하면 pending으로 내려간다(재검증 유도)', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any);
    const updated = await editConceptContent(root, 'admin-role', { title: 'Edited' });
    expect(updated.status).toBe('pending');
  });
  it('pending/red 개념은 편집해도 상태를 유지한다', async () => {
    await writeConcept(root, { ...base, status: 'pending' } as any);
    expect((await editConceptContent(root, 'admin-role', { title: 'a' })).status).toBe('pending');
    await writeConcept(root, { ...base, status: 'red' } as any);
    expect((await editConceptContent(root, 'admin-role', { title: 'b' })).status).toBe('red');
  });
  it('slug/group/status 변경 시도는 무시한다', async () => {
    await writeConcept(root, { ...base, status: 'green' } as any);
    const updated = await editConceptContent(root, 'admin-role', {
      // @ts-expect-error — 화이트리스트 밖 필드는 타입상으로도 막힌다
      slug: 'hacked',
      group: 'evil',
      status: 'green',
      title: 'ok',
    });
    expect(updated.slug).toBe('admin-role');
    expect(updated.group).toBe('auth');
    expect(updated.status).toBe('pending'); // green→pending (status 패치는 무시)
    expect(updated.title).toBe('ok');
  });
  it('스키마 위반(빈 definition)은 거부한다', async () => {
    await writeConcept(root, base as any);
    await expect(
      editConceptContent(root, 'admin-role', {
        description: { definition: '', analogy: '', components: [], example: '' },
      })
    ).rejects.toThrow();
  });
  it('런타임 임의 키(타입 우회)는 무시한다', async () => {
    await writeConcept(root, base as any);
    const updated = await editConceptContent(root, 'admin-role', {
      hacked: 'x',
      title: 'ok',
    } as any);
    expect(updated.title).toBe('ok');
    expect((updated as any).hacked).toBeUndefined();
  });
  it('부제는 고칠 수 있는 항목이 아니라 저장 결과에 남지 않는다', async () => {
    await writeConcept(root, base as any);
    const updated = await editConceptContent(root, 'admin-role', {
      eyebrow: '되살아나면 안 되는 부제',
      title: 'ok',
    } as any);
    expect(updated.title).toBe('ok');
    expect((updated as any).eyebrow).toBeUndefined();
  });
  it('없는 개념은 에러를 던진다', async () => {
    await expect(editConceptContent(root, 'ghost', { title: 'x' })).rejects.toThrow('not found');
  });
});
