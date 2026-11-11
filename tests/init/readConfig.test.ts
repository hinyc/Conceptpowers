// @concept:output-locale @concept:init-gate
// tests/init/readConfig.test.ts
// 시작 설정(init.json) 읽기를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - init-gate 구성요소 "초기화 표시: 프로젝트에 개념 관리를 시작했음을 나타내는 표시"
//    → init.json을 읽어 파싱한다 / 없으면 null (표시 없음을 표시 있음으로 꾸미지 않는다)
//  - output-locale 구성요소 "적용 대상" → 파싱된 설정이 locale을 담아 이후 산출물 언어의 근거가 된다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readInitConfig, readProjectLocale } from '../../src/init/readConfig.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('readInitConfig', () => {
  it('init.json을 읽어 파싱한다', async () => {
    await scaffoldInit(root, { locale: 'en' });
    const cfg = await readInitConfig(root);
    expect(cfg?.locale).toBe('en');
    expect(cfg?.enabled).toBe(true);
  });
  it('init.json이 없으면 null', async () => {
    expect(await readInitConfig(root)).toBeNull();
  });
});

describe('readProjectLocale (출력 언어를 정하는 유일한 곳)', () => {
  const file = () => join(root, 'docs/conceptpowers/init.json');
  const edit = (f: (c: Record<string, unknown>) => Record<string, unknown>) =>
    writeFileSync(file(), JSON.stringify(f(JSON.parse(readFileSync(file(), 'utf8')))));

  it('다른 키가 무효여도 적힌 locale을 따른다', async () => {
    await scaffoldInit(root, { locale: 'en' });
    edit((c) => ({ ...c, enforcement: 'Strict' }));
    expect(await readInitConfig(root)).toBeNull();
    expect(await readProjectLocale(root)).toBe('en');
  });
  it('locale 키가 없는 기존 설정은 ko', async () => {
    await scaffoldInit(root, { locale: 'en' });
    edit(({ locale: _l, ...rest }) => rest);
    expect(await readProjectLocale(root)).toBe('ko');
  });
  it('파일이 없거나 JSON이 깨졌거나 locale 값이 무효이면 ko', async () => {
    expect(await readProjectLocale(root)).toBe('ko');
    await scaffoldInit(root, { locale: 'en' });
    edit((c) => ({ ...c, locale: 'fr' }));
    expect(await readProjectLocale(root)).toBe('ko');
    writeFileSync(file(), '{ nope');
    expect(await readProjectLocale(root)).toBe('ko');
  });
});
