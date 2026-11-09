// @concept:output-locale @concept:generated-not-hand-edited
// tests/viewer/i18n.test.ts
// 뷰어 UI 문구가 프로젝트 locale(init.json)을 따라 ko/en으로 나오는지 검증한다.
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다"
//    → manifest에 프로젝트 locale이 실리고(init 없으면 기존 프로젝트 기본 ko), 뷰어는 그 locale의 문구표를 쓴다
//    → en 문구표·서버 안내·정적 셸에는 한글이 없다 / ko 문구표는 기존 한국어 문구 그대로다
//    → 두 문구표의 키는 서로 같다(한쪽에만 있는 문구가 없다)
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { renderViewerToDisk } from '../../src/viewer/render.js';
import { SERVER_MESSAGES } from '../../src/viewer/i18n.js';
import { cpPaths } from '../../src/paths.js';

const here = dirname(fileURLToPath(import.meta.url));
const assets = (name: string) => readFileSync(join(here, '../../assets', name), 'utf8');
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

async function project(locale?: 'ko' | 'en'): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), 'cp-i18n-'));
  const init = { version: '1.0.0', enabled: true, ...(locale ? { locale } : {}) };
  await mkdir(dirname(cpPaths(root).initFile), { recursive: true });
  await writeFile(cpPaths(root).initFile, JSON.stringify(init), 'utf8');
  return root;
}

const manifestOf = (root: string) =>
  JSON.parse(readFileSync(join(cpPaths(root).conceptsViewer, 'manifest.json'), 'utf8')) as {
    locale: string;
  };

// viewer.js를 최소 스텁 위에서 부팅해 선택된 문구표(state.t)와 문서 언어를 돌려준다.
async function bootWith(manifest: unknown) {
  const doc = { documentElement: { lang: '' }, getElementById: () => null };
  const ctx = vm.createContext({
    document: doc,
    window: { addEventListener: () => {} },
    fetch: async () => ({ ok: true, json: async () => manifest }),
    console,
  });
  vm.runInContext(assets('viewer.js').replace(/\nboot\(\);?\s*$/, '\n'), ctx);
  vm.runInContext('route = function () {};', ctx);
  vm.runInContext('boot();', ctx);
  await new Promise((r) => setTimeout(r, 20));
  return {
    t: vm.runInContext('state.t', ctx) as Record<string, string>,
    lang: doc.documentElement.lang,
    all: vm.runInContext('I18N', ctx) as Record<string, Record<string, string>>,
  };
}

describe('뷰어 UI 문구표', () => {
  it('ko·en 문구표는 키가 같다', async () => {
    const { all } = await bootWith({ locale: 'en' });
    expect(Object.keys(all.en).sort()).toEqual(Object.keys(all.ko).sort());
  });

  it('en 문구표의 사람용 문자열에는 한글이 없다', async () => {
    const { all } = await bootWith({ locale: 'en' });
    for (const [k, v] of Object.entries(all.en)) expect(v, k).not.toMatch(HANGUL);
  });

  it('ko 문구표는 기존 한국어 문구 그대로다', async () => {
    const { all } = await bootWith({ locale: 'ko' });
    expect(all.ko.conceptList).toBe('개념 목록');
    expect(all.ko.noResults).toBe('검색 결과가 없습니다.');
    expect(all.ko.save).toBe('저장');
  });

  it('manifest.locale이 en이면 영어 문구와 lang=en', async () => {
    const r = await bootWith({ locale: 'en' });
    expect(r.t.conceptList).toBe('Concepts');
    expect(r.lang).toBe('en');
  });

  it('manifest.locale이 ko이면 한국어 문구와 lang=ko', async () => {
    const r = await bootWith({ locale: 'ko' });
    expect(r.t.conceptList).toBe('개념 목록');
    expect(r.lang).toBe('ko');
  });

  it('locale이 없는 옛 manifest는 기존 프로젝트 기본(ko)을 따른다', async () => {
    const r = await bootWith({});
    expect(r.t.conceptList).toBe('개념 목록');
  });
});

describe('프로젝트 locale이 manifest로 전달된다', () => {
  it('init locale=en → manifest.locale=en', async () => {
    const root = await project('en');
    await renderViewerToDisk(root);
    expect(manifestOf(root).locale).toBe('en');
  });

  it('init locale=ko → manifest.locale=ko', async () => {
    const root = await project('ko');
    await renderViewerToDisk(root);
    expect(manifestOf(root).locale).toBe('ko');
  });

  it('init에 locale 키가 없으면 기존 프로젝트 기본 ko', async () => {
    const root = await project();
    await renderViewerToDisk(root);
    expect(manifestOf(root).locale).toBe('ko');
  });
});

describe('en에서 사람에게 보이는 정적 문구에 한글이 없다', () => {
  it('정적 셸(index.html)', () => {
    expect(assets('index.html')).not.toMatch(HANGUL);
  });

  it('서버 터미널 안내(en)', () => {
    const m = SERVER_MESSAGES.en;
    expect(m.started('http://localhost:1')).not.toMatch(HANGUL);
    expect(m.startFailed).not.toMatch(HANGUL);
  });

  it('서버 터미널 안내(ko)는 한국어', () => {
    expect(SERVER_MESSAGES.ko.startFailed).toMatch(HANGUL);
  });

  it('뷰어가 쓰는 JS 문자열 리터럴 중 한글은 ko 문구표 밖에 없다', () => {
    for (const file of ['viewer.js', 'sidebar.js', 'topnav.js']) {
      const lines = assets(file).split('\n');
      const start = lines.findIndex((l) => /^\s{2}ko: \{/.test(l));
      const end = lines.findIndex((l, i) => i > start && /^\s{2}\},/.test(l));
      lines.forEach((line, i) => {
        if (start >= 0 && i >= start && i <= end) return;
        const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        if (/^\s*\*/.test(line)) return;
        expect(code, `${file}:${i + 1}`).not.toMatch(HANGUL);
      });
    }
  });
});
