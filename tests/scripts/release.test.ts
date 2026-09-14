// @concept:generated-not-hand-edited
// tests/scripts/release.test.ts
// 릴리스 판단부(scripts/releaseSteps.mjs)를 검증한다 — 원본을 고쳐 다시 만든 생성물이 빠짐없이 릴리스 커밋에 담기는가.
// 검증 대상 규칙 ↔ 시나리오:
//  - generated-not-hand-edited 불변 "원본을 고쳤으면 같은 작업 안에서 다시 만들기까지 마쳐 생성물을 맞춰 둔다"
//    → 빌드 스크립트가 쓰는 출력 위치가 전부 릴리스 커밋 경로에 들어 있다(뷰어 서버 번들 포함)
//    → 빌드 뒤 릴리스 경로 밖에 남은 변경을 골라낸다 — 생성물 목록이 낡았으면 커밋 전에 멈춘다
//    → 이름 바꾸기 항목은 새 경로와 옛 경로를 모두 본다
//    → 뷰어 사본(서버 번들 사본·버전 도장)도 새 버전으로 다시 렌더해 같은 릴리스 커밋에 담는다
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BUILD_OUTPUTS,
  RELEASE_PATHS,
  RENDERED_OUTPUTS,
  RENDER_COMMAND,
  changesOutsideRelease,
} from '../../scripts/releaseSteps.mjs';

const repoRoot = resolve(__dirname, '../..');
const z = (...entries: string[]) => entries.join('\0') + '\0';

describe('릴리스 커밋 경로', () => {
  it('빌드 스크립트가 쓰는 출력 위치는 전부 릴리스 커밋에 담긴다 [규칙: 다시 만들기까지 마쳐 생성물을 맞춰 둔다]', () => {
    const build = readFileSync(join(repoRoot, 'scripts/build.mjs'), 'utf8');
    const outputs = [
      ...build.matchAll(/(?:outdir|outfile)\s*[:=]\s*join\(root,\s*'([^']+)'\)/g),
    ].map((m) => m[1]);
    expect(outputs.length).toBeGreaterThan(0);
    for (const out of outputs) {
      expect(BUILD_OUTPUTS, out).toContain(out);
      expect(RELEASE_PATHS, out).toContain(out);
    }
    expect(RELEASE_PATHS).toContain('assets/serve.mjs');
  });

  it('뷰어 사본은 새 버전으로 다시 렌더해 같은 릴리스 커밋에 담는다 [규칙: 다시 만들기까지 마쳐 생성물을 맞춰 둔다]', () => {
    expect(RENDERED_OUTPUTS).toContain('docs/conceptpowers/concepts/viewer');
    for (const out of RENDERED_OUTPUTS) expect(RELEASE_PATHS).toContain(out);
    expect(RENDER_COMMAND[1]).toContain('render');
  });
});

describe('changesOutsideRelease', () => {
  it('릴리스 경로 안의 변경만 있으면 아무것도 고르지 않는다 [규칙: 다시 만들기까지 마쳐 생성물을 맞춰 둔다]', () => {
    expect(
      changesOutsideRelease(
        z(' M package.json', ' M dist/cli.js', '?? dist/hooks/new.js', ' M assets/serve.mjs')
      )
    ).toEqual([]);
  });
  it('릴리스 경로 밖의 변경을 골라낸다 — 생성물 목록이 낡았으면 커밋 전에 멈춘다 [규칙: 생성물을 맞춰 둔다]', () => {
    expect(
      changesOutsideRelease(
        z(' M dist/cli.js', ' M docs/conceptpowers/concepts/data/x.json', '?? assets/other.js')
      )
    ).toEqual(['docs/conceptpowers/concepts/data/x.json', 'assets/other.js']);
  });
  it('이름 바꾸기는 새 경로와 옛 경로를 모두 본다 — 작업 트리 쪽 표시여도 같다', () => {
    expect(changesOutsideRelease(z('R  dist/new.js', 'src/old.ts'))).toEqual(['src/old.ts']);
    expect(changesOutsideRelease(z(' R dist/new.js', 'src/old.ts'))).toEqual(['src/old.ts']);
  });
  it('dist처럼 보이는 다른 경로는 릴리스 경로가 아니다', () => {
    expect(changesOutsideRelease(z(' M distribution/x.js'))).toEqual(['distribution/x.js']);
  });
});
