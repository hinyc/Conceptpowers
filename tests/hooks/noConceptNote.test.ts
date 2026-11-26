// @concept:concept-code-mapping @concept:governance-mode
// tests/hooks/noConceptNote.test.ts
// 커밋에 들어온 코드 파일 가운데 '해당 개념 없음' 표식이 다수일 때 건네는 검토 안내를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-code-mapping 허용 "커밋에 들어온 코드 파일 가운데 '해당 개념 없음' 표식이 다수이면 정말 무관한지
//    살펴보라는 안내를 건네는 것"
//    → 표식 없음 파일이 둘 이상이고 절반 이상이면 안내를 붙인다 / 하나뿐이거나 소수면 붙이지 않는다
//    → 안내는 막거나 묻지 않는다 — 통과 응답에 덧붙는 글일 뿐이다(막는 것은 표식 없음의 뜻과 어긋난다)
//  - concept-code-mapping 표시 생략 허용(사람이 켠 프로젝트만) → 표시 없는 파일은 안내 집계(none·total)에서 빠지고,
//    명시한 @concept:none 파일은 기존대로 센다
//  - governance-mode 불변 "문지기는 검사를 통과한 명령을 사람의 권한 확인 없이 대신 승인하지 않는다"
//    → 안내가 붙어도 permissionDecision은 실리지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';
import { findNoConceptFiles } from '../../src/audit/gaps.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { writeConcept } from '../../src/store/conceptStore.js';

let root: string;
function write(rel: string, body: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
}
const NONE = '// @concept:none\nexport const x = 1;\n';
const commit = (files: string[]) =>
  decidePreToolUse(root, {
    tool: 'Bash',
    input: { command: 'git commit -m x' },
    changedFiles: files,
  });

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-none-'));
  await scaffoldInit(root, { locale: 'ko' });
  await writeConcept(root, {
    slug: 'auth-token',
    category: ['behavior'],
    title: 'A',
    status: 'green',
    description: { definition: 'v1' },
    purpose: { reason: 'r' },
    actions: {},
    principle: { immutableRules: ['결제 완료 후 price 변경 불가'] },
  } as never);
});

describe('findNoConceptFiles', () => {
  it("첫머리에 '해당 개념 없음' 표식이 있는 코드 파일만 골라낸다", async () => {
    write('src/a.ts', NONE);
    write('src/b.ts', '// @concept:auth-token\nexport const b = 1;\n');
    write('src/c.ts', 'export const c = 1;\n');
    write('README.md', '@concept:none\n');
    write('dist/d.js', NONE);
    const r = await findNoConceptFiles(
      root,
      ['src/a.ts', 'src/b.ts', 'src/c.ts', 'README.md', 'dist/d.js'],
      ['dist/**']
    );
    expect(r).toEqual({ none: ['src/a.ts'], total: 3 });
  });
});

describe('[NO-CONCEPT REVIEW] 안내', () => {
  it('둘 이상이고 절반 이상이면 통과 응답에 안내를 붙이되 묻거나 승인하지 않는다', async () => {
    write('src/a.ts', NONE);
    write('src/b.ts', NONE);
    write('src/c.ts', '// @concept:auth-token\nexport const c = 1;\n');
    const r = await commit(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
    const ctx = r!.hookSpecificOutput.additionalContext ?? '';
    expect(ctx).toContain('[NO-CONCEPT REVIEW]');
    expect(ctx).toContain('src/a.ts');
    expect(ctx).toContain('src/b.ts');
    expect(ctx).not.toContain('src/c.ts');
  });
  it('하나뿐이면 안내하지 않는다', async () => {
    write('src/a.ts', NONE);
    const r = await commit(['src/a.ts']);
    expect(r!.hookSpecificOutput.additionalContext ?? '').not.toContain('[NO-CONCEPT REVIEW]');
  });
  it('소수(절반 미만)면 안내하지 않는다', async () => {
    write('src/a.ts', NONE);
    write('src/b.ts', NONE);
    for (const f of ['c', 'd', 'e'])
      write(`src/${f}.ts`, '// @concept:auth-token\nexport const v = 1;\n');
    const r = await commit(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts']);
    expect(r!.hookSpecificOutput.additionalContext ?? '').not.toContain('[NO-CONCEPT REVIEW]');
  });
});

describe('[NO-CONCEPT REVIEW] 표시 생략 허용 [규칙: 사람이 켠 프로젝트는 표시 없는 파일을 "없음"으로 친다]', () => {
  beforeEach(() => {
    const p = join(root, 'docs/conceptpowers/init.json');
    write(
      'docs/conceptpowers/init.json',
      JSON.stringify({ ...JSON.parse(readFileSync(p, 'utf8')), allowUntagged: true })
    );
  });
  const note = async (files: string[]) =>
    (await commit(files))?.hookSpecificOutput.additionalContext ?? '';
  const plain = ['src/p1.ts', 'src/p2.ts', 'src/p3.ts'];

  it('표시 없는 파일만 있으면 안내하지 않는다', async () => {
    for (const f of plain) write(f, 'export const x = 1;\n');
    expect(await note(plain)).not.toContain('[NO-CONCEPT REVIEW]');
  });
  it('명시한 none 파일은 기존대로 세고, 표시 없는 파일은 분모에서도 빠진다', async () => {
    for (const f of plain) write(f, 'export const x = 1;\n');
    write('src/a.ts', NONE);
    write('src/b.ts', NONE);
    const ctx = await note([...plain, 'src/a.ts', 'src/b.ts']);
    expect(ctx).toContain('[NO-CONCEPT REVIEW] 2 of 2 ');
    expect(ctx).not.toContain('src/p1.ts');
  });
});
