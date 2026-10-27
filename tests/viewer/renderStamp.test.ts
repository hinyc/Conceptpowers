// @concept:plugin-version-sync
// tests/viewer/renderStamp.test.ts
// 뷰어 생성물을 다시 만들 때 버전 도장(manifest.json의 generatorVersion)을 찍는 순서를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - plugin-version-sync 허용 "생성물에 찍힌 버전 도장이 깔린 도구와 다를 때만 생성물을 다시 만드는 것"
//    → 도장은 생성물을 다 만든 뒤에만 찍는다: 에셋 복사가 도중에 실패하면 도장은 옛 값 그대로 남아
//      다음 동기화가 다시 시도한다 / 모두 성공하면 새 도장이 찍힌다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderViewerToDisk } from '../../src/viewer/render.js';

let root: string;
const viewer = (rel: string) => join(root, 'docs/conceptpowers/concepts/viewer', rel);
const stampOnDisk = () =>
  JSON.parse(readFileSync(viewer('manifest.json'), 'utf8')).generatorVersion as string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-stamp-'));
  mkdirSync(viewer('assets'), { recursive: true });
  writeFileSync(viewer('manifest.json'), JSON.stringify({ generatorVersion: '1.0.0-old' }));
});

describe('renderViewerToDisk — 버전 도장은 마지막에', () => {
  it('에셋 복사가 실패하면 도장을 새 버전으로 바꾸지 않는다', async () => {
    // 마지막 에셋(css) 자리를 폴더로 막아 쓰기를 실패시킨다.
    mkdirSync(viewer('assets/concept.css'), { recursive: true });
    await expect(renderViewerToDisk(root, '9.9.9-new')).rejects.toThrow();
    expect(stampOnDisk()).toBe('1.0.0-old');
  });

  it('에셋을 모두 쓰면 새 도장이 찍힌다', async () => {
    await renderViewerToDisk(root, '9.9.9-new');
    expect(stampOnDisk()).toBe('9.9.9-new');
  });
});
