// @concept:reference-sync @concept:reference-privacy
// tests/reference/fingerprint.test.ts
// 참고자료 파일의 지문(내용 해시·크기·시각) 계산을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - reference-sync 불변 "기준점에는 자료의 지문·크기·시각만 남기고 내용은 남기지 않는다"
//    → 같은 내용이면 같은 지문, 한 글자만 달라도 다른 지문 / 지문 항목에 내용 칸이 없다
//  - reference-privacy 불변 "도구는 사람이 넣은 참고자료를 읽기만 하고 그 내용을 고치지 않는다"
//    → 지문을 계산해도 파일의 크기·수정 시각이 그대로다
//  - reference-sync 허용 "현재 자료를 기준점과 견줘 추가·변경·삭제를 가려내는 것"
//    → 없는 파일의 stat·지문은 null이다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statFile, hashFile, fingerprintFile } from '../../src/reference/fingerprint.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cp-fp-'));
});

describe('hashFile', () => {
  it('같은 내용이면 같은 지문, 한 글자만 달라도 다른 지문', async () => {
    await writeFile(join(dir, 'a'), '참고자료 본문');
    await writeFile(join(dir, 'b'), '참고자료 본문');
    await writeFile(join(dir, 'c'), '참고자료 본문!');
    const [a, b, c] = await Promise.all(['a', 'b', 'c'].map((n) => hashFile(join(dir, n))));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('statFile / fingerprintFile', () => {
  it('없는 파일은 null', async () => {
    expect(await statFile(join(dir, 'missing'))).toBeNull();
    expect(await fingerprintFile(join(dir, 'missing'))).toBeNull();
  });

  it('지문 항목은 해시·크기·시각만 담고 내용 칸이 없다', async () => {
    await writeFile(join(dir, 'a.md'), '비밀 본문');
    const entry = await fingerprintFile(join(dir, 'a.md'));
    expect(entry).not.toBeNull();
    expect(Object.keys(entry!).sort()).toEqual(['hash', 'mtime', 'size']);
    expect(entry!.size).toBe(Buffer.byteLength('비밀 본문'));
    expect(JSON.stringify(entry)).not.toContain('비밀 본문');
  });

  it('지문을 계산해도 파일은 그대로다', async () => {
    const p = join(dir, 'a.md');
    await writeFile(p, '자료');
    const before = await stat(p);
    await fingerprintFile(p);
    const after = await stat(p);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
