// @concept:concept-code-mapping
// tests/mapping/scan.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  scanTags,
  buildMapping,
  writeMappingCache,
  readMappingCache,
  updateMappingCache,
} from '../../src/mapping/scan.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\nexport const a = 1\n');
  writeFileSync(join(root, 'src/b.ts'), '/* @concept:user-role @concept:admin-role */\n');
});

describe('mapping scan', () => {
  it('파일에서 @concept 태그를 추출한다', async () => {
    const tags = await scanTags(root, ['src/a.ts', 'src/b.ts']);
    expect(tags).toEqual({
      'src/a.ts': ['admin-role'],
      'src/b.ts': ['user-role', 'admin-role'],
    });
  });
  it('slug → 파일 매핑을 만든다', async () => {
    const m = await buildMapping(root, ['src/a.ts', 'src/b.ts']);
    expect(m['admin-role'].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(m['user-role']).toEqual(['src/b.ts']);
  });
  it('@concept:none(예약 마커)은 개념으로 취급하지 않는다(스캔·매핑 제외)', async () => {
    writeFileSync(join(root, 'src/n.ts'), '// @concept:none\nexport const n = 1\n');
    expect(await scanTags(root, ['src/n.ts'])).toEqual({}); // none만 있는 파일은 잡히지 않음
    const m = await buildMapping(root, ['src/n.ts']);
    expect(m).toEqual({});
    expect(m['none']).toBeUndefined();
  });
  it('실제 개념과 none이 함께 있으면 none만 빼고 매핑한다', async () => {
    writeFileSync(join(root, 'src/m.ts'), '// @concept:admin-role @concept:none\n');
    expect(await scanTags(root, ['src/m.ts'])).toEqual({ 'src/m.ts': ['admin-role'] });
  });
  it('readMappingCache는 쓰고 다시 읽으면 동일하다', async () => {
    await writeMappingCache(root, { 'admin-role': ['src/a.ts'] });
    expect(await readMappingCache(root)).toEqual({ 'admin-role': ['src/a.ts'] });
  });
  it('readMappingCache는 형식이 깨진 캐시면 빈 객체로 폴백한다 (M3/zod)', async () => {
    const cache = join(root, 'docs/conceptpowers/.cache');
    mkdirSync(cache, { recursive: true });
    writeFileSync(join(cache, 'mapping.json'), '{"admin-role": "not-an-array"}');
    expect(await readMappingCache(root)).toEqual({});
  });
});

describe('선행 주석 블록 스캔 (Task 5b)', () => {
  it('1행 표식은 인식된다 [규칙: 첫머리 표식 인정]', async () => {
    writeFileSync(join(root, 'src/p1.ts'), '// @concept:foo\nexport const p1 = 1\n');
    expect(await scanTags(root, ['src/p1.ts'])).toEqual({ 'src/p1.ts': ['foo'] });
  });
  it('1행 일반 주석 뒤 2행 표식도 인식된다 (선행 블록 내 복수 줄)', async () => {
    writeFileSync(
      root + '/src/p2.ts',
      '// src/p2.ts\n// @concept:foo\nexport const p2 = 1\n'
    );
    expect(await scanTags(root, ['src/p2.ts'])).toEqual({ 'src/p2.ts': ['foo'] });
  });
  it('코드 줄 뒤에 오는 표식은 인식되지 않는다 [규칙: 첫머리에서만]', async () => {
    writeFileSync(
      root + '/src/p3.ts',
      'export const p3 = 1\n// @concept:foo\n'
    );
    expect(await scanTags(root, ['src/p3.ts'])).toEqual({});
  });
  it('본문 문자열 리터럴 안의 표식 모양 글자는 인식되지 않는다 [규칙: 본문 속 표식은 표식 아님]', async () => {
    writeFileSync(
      root + '/src/p4.ts',
      "// @concept:concept-code-mapping\nexport const s = '// @concept:ghost\\n'\n"
    );
    expect(await scanTags(root, ['src/p4.ts'])).toEqual({ 'src/p4.ts': ['concept-code-mapping'] });
  });
  it('shebang 뒤 2행 표식은 인식된다 (shebang 허용)', async () => {
    writeFileSync(
      root + '/src/p5.mjs',
      '#!/usr/bin/env node\n// @concept:foo\nconsole.log(1)\n'
    );
    expect(await scanTags(root, ['src/p5.mjs'])).toEqual({ 'src/p5.mjs': ['foo'] });
  });
});

describe('선행 블록 주석 상태 추적 (Task 5b-2, audit-gap-detection: 주석 블록도 첫머리다)', () => {
  it('별표 접두 없는 여러 줄 /* … */ 블록 안의 표식은 인식된다 [규칙: 첫머리 주석 블록 표식 인정]', async () => {
    writeFileSync(
      root + '/src/q1.ts',
      '/*\n설명 문장 (별표 접두 없음)\n@concept:foo\n*/\nexport const q1 = 1\n'
    );
    expect(await scanTags(root, ['src/q1.ts'])).toEqual({ 'src/q1.ts': ['foo'] });
  });
  it('<!-- … --> 여러 줄 블록 안의 표식은 인식된다 [규칙: 첫머리 주석 블록 표식 인정]', async () => {
    writeFileSync(
      root + '/src/q2.md',
      '<!--\n설명 문장\n@concept:foo\n-->\n# heading\n'
    );
    expect(await scanTags(root, ['src/q2.md'])).toEqual({ 'src/q2.md': ['foo'] });
  });
  it('블록 주석이 닫힌 뒤에 오는 코드 줄 다음의 표식은 인식되지 않는다 [규칙: 첫머리에서만]', async () => {
    writeFileSync(
      root + '/src/q3.ts',
      '/*\n설명\n*/\nexport const q3 = 1\n// @concept:foo\n'
    );
    expect(await scanTags(root, ['src/q3.ts'])).toEqual({});
  });
  it('닫히지 않은 블록 주석은 파일 끝까지 선행 블록으로 본다 [규칙: 첫머리 주석 블록 표식 인정]', async () => {
    writeFileSync(
      root + '/src/q4.ts',
      '/*\n설명 문장\n@concept:foo\n계속 이어지는 설명, 닫히지 않음\n'
    );
    expect(await scanTags(root, ['src/q4.ts'])).toEqual({ 'src/q4.ts': ['foo'] });
  });
  it('회귀: 한 줄 // 표식은 여전히 인식된다 [규칙: 첫머리 표식 인정]', async () => {
    writeFileSync(root + '/src/q5.ts', '// @concept:foo\nexport const q5 = 1\n');
    expect(await scanTags(root, ['src/q5.ts'])).toEqual({ 'src/q5.ts': ['foo'] });
  });
  it('회귀: 본문 문자열 속 표식 모양 글자는 여전히 제외된다 [규칙: 본문 속 표식은 표식 아님]', async () => {
    writeFileSync(
      root + '/src/q6.ts',
      "// @concept:concept-code-mapping\nexport const s = '// @concept:ghost\\n'\n"
    );
    expect(await scanTags(root, ['src/q6.ts'])).toEqual({ 'src/q6.ts': ['concept-code-mapping'] });
  });
  it('회귀: shebang 뒤 표식은 여전히 허용된다 [규칙: 첫머리 주석 블록 표식 인정]', async () => {
    writeFileSync(
      root + '/src/q7.mjs',
      '#!/usr/bin/env node\n// @concept:foo\nconsole.log(1)\n'
    );
    expect(await scanTags(root, ['src/q7.mjs'])).toEqual({ 'src/q7.mjs': ['foo'] });
  });
});

describe('블록 주석 종료 이후 같은 줄 코드 배제 (Task 5b-2 리뷰 후속, audit-gap-detection: 첫머리에서만)', () => {
  it('*/ 뒤 같은 줄에 이어지는 코드 속 표식은 인식되지 않는다 [규칙: 첫머리에서만]', async () => {
    writeFileSync(
      root + '/src/r1.ts',
      '/*\ncomment\n*/ export const y = 1; // @concept:ghost-in-code\n'
    );
    expect(await scanTags(root, ['src/r1.ts'])).toEqual({});
  });
  it('*/ 단독 줄 뒤에 오는 별도 코드 줄의 표식도 인식되지 않는다 [규칙: 첫머리에서만]', async () => {
    writeFileSync(
      root + '/src/r2.ts',
      '/*\ncomment\n*/\nexport const y = 1;\n// @concept:x\n'
    );
    expect(await scanTags(root, ['src/r2.ts'])).toEqual({});
  });
  it('한 줄에서 열고 닫힌 블록 안의 표식은 인식된다 [규칙: 첫머리 주석 블록 표식 인정]', async () => {
    writeFileSync(root + '/src/r3.ts', '/* @concept:foo */\n');
    expect(await scanTags(root, ['src/r3.ts'])).toEqual({ 'src/r3.ts': ['foo'] });
  });
  it('한 줄에서 닫힌 블록 뒤 코드 줄에는 표식이 없고, 그 코드 속 문자열 표식도 인식되지 않는다 [규칙: 첫머리에서만 · 본문 속 표식은 표식 아님]', async () => {
    writeFileSync(root + '/src/r4a.ts', "/* note */ doSomething('@concept:ghost')\n");
    expect(await scanTags(root, ['src/r4a.ts'])).toEqual({});
  });
});

describe('updateMappingCache (증분 병합)', () => {
  it('전달되지 않은 파일의 기존 캐시 항목을 보존한다', async () => {
    await writeMappingCache(root, { 'other-concept': ['src/other.ts'] });
    const merged = await updateMappingCache(root, ['src/a.ts']);
    expect(merged).toEqual({
      'other-concept': ['src/other.ts'],
      'admin-role': ['src/a.ts'],
    });
    expect(await readMappingCache(root)).toEqual(merged);
  });
  it('전달된 파일의 낡은 항목을 새 스캔 결과로 교체한다', async () => {
    await writeMappingCache(root, {
      'admin-role': ['src/a.ts'],
      'user-role': ['src/a.ts'],
    });
    const merged = await updateMappingCache(root, ['src/a.ts']);
    expect(merged).toEqual({ 'admin-role': ['src/a.ts'] }); // user-role은 빈 목록 → 제거
  });
  it('전달된 파일이 삭제된 경우 그 파일 항목만 캐시에서 제거한다', async () => {
    await writeMappingCache(root, { 'admin-role': ['src/gone.ts', 'src/a.ts'] });
    const merged = await updateMappingCache(root, ['src/gone.ts']);
    expect(merged).toEqual({ 'admin-role': ['src/a.ts'] });
  });
});
