// @concept:governance-mode
// tests/util/isMain.test.ts
// 번들(훅·CLI)이 "직접 실행됐는가"를 판정하는 isMainModule을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 운용 원리 "검사에서 문제가 나올 때마다 그 강도에 맞춰 막거나 묻거나 경고한다"
//    → 문지기가 대응하려면 훅 번들이 설치 경로와 무관하게 실제로 실행돼야 한다:
//      공백·한글이 든 경로 / 심링크로 불린 경로에서도 직접 실행으로 판정한다
//    → 다른 파일이 실행된 경우(import로 불린 경우)나 argv가 없으면 직접 실행이 아니다
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainModule } from '../../src/util/isMain.js';

function makeFile(dirName: string, fileName = 'hook.js'): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'cp-main-')), dirName);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, fileName);
  writeFileSync(file, '');
  return file;
}

describe('isMainModule', () => {
  it('일반 경로에서 같은 파일이면 직접 실행이다 [규칙: 문지기는 실제로 실행돼야 대응한다]', () => {
    const file = makeFile('plain');
    expect(isMainModule(pathToFileURL(file).href, file)).toBe(true);
  });

  it('공백이 든 설치 경로에서도 직접 실행으로 판정한다 [규칙: 문지기는 실제로 실행돼야 대응한다]', () => {
    const file = makeFile('John Doe/plugin cache');
    expect(isMainModule(pathToFileURL(file).href, file)).toBe(true);
  });

  it('한글이 든 설치 경로에서도 직접 실행으로 판정한다 [규칙: 문지기는 실제로 실행돼야 대응한다]', () => {
    const file = makeFile('홍길동/플러그인');
    expect(isMainModule(pathToFileURL(file).href, file)).toBe(true);
  });

  it('심링크로 불린 경우에도 직접 실행으로 판정한다 [규칙: 문지기는 실제로 실행돼야 대응한다]', () => {
    const file = makeFile('real');
    const link = join(mkdtempSync(join(tmpdir(), 'cp-link-')), 'hook-link.js');
    symlinkSync(file, link);
    expect(isMainModule(pathToFileURL(file).href, link)).toBe(true);
  });

  it('다른 파일이 실행 중이면(모듈이 import된 경우) 직접 실행이 아니다', () => {
    const file = makeFile('a');
    const other = makeFile('b', 'other.js');
    expect(isMainModule(pathToFileURL(file).href, other)).toBe(false);
  });

  it('argv 경로가 없으면 직접 실행이 아니다', () => {
    const file = makeFile('none');
    expect(isMainModule(pathToFileURL(file).href, undefined)).toBe(false);
  });

  it('경로가 디스크에 없으면 URL 형식으로 맞춰 비교한다 — 같으면 참, 다르면 거짓', () => {
    const missing = join(tmpdir(), 'no such dir', 'gone.js');
    const otherMissing = join(tmpdir(), 'no such dir', 'other.js');
    expect(isMainModule(pathToFileURL(missing).href, missing)).toBe(true);
    expect(isMainModule(pathToFileURL(missing).href, otherMissing)).toBe(false);
  });
});
