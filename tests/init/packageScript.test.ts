// @concept:plugin-version-sync @concept:generated-not-hand-edited
// tests/init/packageScript.test.ts
// 뷰어 실행 스크립트 등록(upsertViewerScript)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - plugin-version-sync 구성요소 "맞추는 대상: … 실행 스크립트 같은 생성물"
//    → 스크립트가 없으면 표준 명령을 추가한다 / 이미 표준이면 unchanged
//  - generated-not-hand-edited 불변 "생성물은 직접 고치지 않고 원본을 고쳐 다시 만드는 방식으로만 바꾼다"
//    → 플러그인이 만든 옛 명령(open …index.html)은 표준으로 교체한다
//  - plugin-version-sync 불변 "설정 파일에 이미 적힌 값은 무엇이든 그대로 보존한다"
//    → 사용자 커스텀 값은 보존하고 kept를 반환한다 / 기존 스크립트를 건드리지 않는다
//  - plugin-version-sync 불변 "이미 존재하는 파일의 내용은 지우거나 바꾸지 않는다"
//    → package.json이 없으면 no-package를 반환하고 파일을 만들지 않는다
//  - "잘못된 JSON이면 에러를 던진다"는 상위 기준 문서 "갈아 끼우기 방식"의 불변 "실패를 감추지 않는다"와 같은 태도다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  upsertViewerScript,
  VIEWER_SCRIPT_NAME,
  VIEWER_COMMAND,
} from '../../src/init/packageScript.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});
const pkgPath = () => join(root, 'package.json');
const readPkg = () => JSON.parse(readFileSync(pkgPath(), 'utf8'));

describe('upsertViewerScript', () => {
  it('package.json이 없으면 no-package를 반환하고 파일을 만들지 않는다', async () => {
    expect(await upsertViewerScript(root)).toBe('no-package');
    expect(existsSync(pkgPath())).toBe(false);
  });
  it('스크립트가 없으면 표준 명령을 추가하고 set을 반환한다 (기존 스크립트 보존)', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ name: 'demo', scripts: { build: 'tsc' } }));
    expect(await upsertViewerScript(root)).toBe('set');
    const pkg = readPkg();
    expect(pkg.scripts.build).toBe('tsc');
    expect(pkg.scripts[VIEWER_SCRIPT_NAME]).toBe(VIEWER_COMMAND);
    expect(VIEWER_COMMAND).toBe('node docs/conceptpowers/concepts/viewer/serve.mjs');
  });
  it('이미 표준 명령이면 unchanged', async () => {
    writeFileSync(pkgPath(), JSON.stringify({ scripts: { [VIEWER_SCRIPT_NAME]: VIEWER_COMMAND } }));
    expect(await upsertViewerScript(root)).toBe('unchanged');
  });
  it('플러그인이 만든 옛 명령(open …index.html)은 표준으로 교체한다', async () => {
    writeFileSync(
      pkgPath(),
      JSON.stringify({
        scripts: { [VIEWER_SCRIPT_NAME]: 'open docs/conceptpowers/concepts/viewer/index.html' },
      })
    );
    expect(await upsertViewerScript(root)).toBe('set');
    expect(readPkg().scripts[VIEWER_SCRIPT_NAME]).toBe(VIEWER_COMMAND);
  });
  it('사용자 커스텀 값은 보존하고 kept를 반환한다', async () => {
    writeFileSync(
      pkgPath(),
      JSON.stringify({ scripts: { [VIEWER_SCRIPT_NAME]: 'my-custom-viewer' } })
    );
    expect(await upsertViewerScript(root)).toBe('kept');
    expect(readPkg().scripts[VIEWER_SCRIPT_NAME]).toBe('my-custom-viewer');
  });
  it('잘못된 JSON이면 에러를 던진다', async () => {
    writeFileSync(pkgPath(), '{ not json');
    await expect(upsertViewerScript(root)).rejects.toThrow();
  });
});

// plugin-version-sync 불변 "설정 파일에 이미 적힌 값은 무엇이든 그대로 보존한다" —
// 스크립트 한 줄을 더할 때 사용자의 들여쓰기·끝 줄바꿈 서식까지 바꾸지 않는다.
describe('upsertViewerScript — 서식 보존', () => {
  const expectedWith = (indent: string | number, eol: string) =>
    JSON.stringify(
      { name: 'demo', scripts: { build: 'tsc', [VIEWER_SCRIPT_NAME]: VIEWER_COMMAND } },
      null,
      indent
    ) + eol;
  const source = { name: 'demo', scripts: { build: 'tsc' } };

  it('탭 들여쓰기와 끝 줄바꿈을 보존한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify(source, null, '\t') + '\n');
    expect(await upsertViewerScript(root)).toBe('set');
    expect(readFileSync(pkgPath(), 'utf8')).toBe(expectedWith('\t', '\n'));
  });
  it('4칸 들여쓰기와 끝 줄바꿈 없음을 보존한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify(source, null, 4));
    expect(await upsertViewerScript(root)).toBe('set');
    expect(readFileSync(pkgPath(), 'utf8')).toBe(expectedWith(4, ''));
  });
  it('2칸 들여쓰기를 보존한다', async () => {
    writeFileSync(pkgPath(), JSON.stringify(source, null, 2) + '\n');
    expect(await upsertViewerScript(root)).toBe('set');
    expect(readFileSync(pkgPath(), 'utf8')).toBe(expectedWith(2, '\n'));
  });
  it('쓰고 난 뒤 임시 파일을 남기지 않는다(원자적 교체)', async () => {
    writeFileSync(pkgPath(), JSON.stringify(source, null, 2) + '\n');
    await upsertViewerScript(root);
    expect(readdirSync(root)).toEqual(['package.json']);
  });
});
