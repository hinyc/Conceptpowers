// @concept:concept-code-mapping
// tests/audit/unlinked.test.ts
// 연결된 코드가 하나도 없는 확정 개념을 감사가 격차로 알리는지 임시 디렉터리 위에서 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - 구성요소 "격차: … 확정된 개념 가운데 표식으로도 기능 명세로도 연결된 코드가 하나도 없는 것"
//    + 허용 "확정된 개념 가운데 연결된 코드가 하나도 없는 것을 감사에서 격차로 알리는 것"
//    → 표식도 기능 명세도 없는 green 개념은 보고 / 표식이 있으면 보고 안 함 / 기능 명세 codePaths가 있으면 보고 안 함
//    → 확정되지 않은(red·pending) 개념은 대상이 아니다
//  - 불변 "읽을 수 없거나 이미 사라진 파일은 격차로 판정하지 않고 건너뛴다"의 역방향 적용
//    → 이미 사라진 경로만 가리키는 개념은 연결 코드가 없는 것으로 본다
//  - drift-reconcile 불변 "첫머리 표식만 있고 코드가 없는 파일은 따라온 코드로 세지 않는다"(같은 잣대)
//    → 표식만 있는 빈 파일은 연결로 세지 않는다
//  - 제한 "보관본이 낡았는지 확인하지 않고 최신 상태라고 단정하는 것"
//    → 보관본 없이 지금 파일의 표식을 읽어 판정한다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findUnlinkedConcepts } from '../../src/audit/unlinked.js';
import type { Concept } from '../../src/schema/concept.js';
import type { Feature } from '../../src/schema/feature.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-unlinked-'));
  mkdirSync(join(root, 'src'), { recursive: true });
});

const concept = (slug: string, status: Concept['status'] = 'green') =>
  ({ slug, status }) as Concept;
const feature = (concepts: string[], codePaths: string[]) =>
  ({ slug: 'f', group: '', title: 'F', description: '', concepts, codePaths }) as Feature;

describe('findUnlinkedConcepts', () => {
  it('표식도 기능 명세도 없는 green 개념을 보고한다 [허용: 연결 코드 없는 확정 개념을 격차로 알린다]', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:linked\nexport const a = 1\n');
    const r = await findUnlinkedConcepts(
      root,
      [concept('linked'), concept('lonely')],
      [],
      ['src/a.ts'],
      []
    );
    expect(r).toEqual(['lonely']);
  });
  it('기능 명세의 코드 경로로 연결된 개념은 보고하지 않는다 [구성요소: 표식으로도 기능 명세로도]', async () => {
    writeFileSync(join(root, 'src/b.ts'), '// @concept:none\nexport const b = 1\n');
    const r = await findUnlinkedConcepts(
      root,
      [concept('via-feature')],
      [feature(['via-feature'], ['src/b.ts'])],
      ['src/b.ts'],
      []
    );
    expect(r).toEqual([]);
  });
  it('확정되지 않은 개념(red·pending)은 대상이 아니다 [구성요소: 확정된 개념]', async () => {
    const r = await findUnlinkedConcepts(
      root,
      [concept('draft', 'red'), concept('editing', 'pending')],
      [],
      [],
      []
    );
    expect(r).toEqual([]);
  });
  it('이미 사라진 경로만 가리키면 연결 코드가 없는 것으로 본다 [불변: 사라진 파일은 건너뛴다]', async () => {
    const r = await findUnlinkedConcepts(
      root,
      [concept('ghost-linked')],
      [feature(['ghost-linked'], ['src/gone.ts'])],
      [],
      []
    );
    expect(r).toEqual(['ghost-linked']);
  });
  it('표식만 있고 코드가 없는 파일은 연결로 세지 않는다 [drift-reconcile 같은 잣대]', async () => {
    writeFileSync(join(root, 'src/empty.ts'), '// @concept:tag-only\n');
    const r = await findUnlinkedConcepts(root, [concept('tag-only')], [], ['src/empty.ts'], []);
    expect(r).toEqual(['tag-only']);
  });
  it('보관본 없이 지금 파일의 표식을 읽어 판정한다 [제한: 보관본을 최신으로 단정하지 않는다]', async () => {
    writeFileSync(join(root, 'src/fresh.ts'), '// @concept:fresh\nexport const f = 1\n');
    const r = await findUnlinkedConcepts(root, [concept('fresh')], [], ['src/fresh.ts'], []);
    expect(r).toEqual([]);
  });
});
