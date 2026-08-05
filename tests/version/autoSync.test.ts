// @concept:plugin-version-sync
// tests/version/autoSync.test.ts
// 개념 규칙 검증 대상: plugin-version-sync
// - "생성물에 찍힌 버전과 깔린 도구의 버전이 다를 때 생성물만 다시 만드는 것" (allow)
// - "버전이 같은데도 생성물을 다시 만드는 것" (restrict)
// - "이 과정은 어떤 경우에도 개념 문서와 상위 기준 문서를 바꾸지 않는다" (immutableRule)
// - 실패가 다음 단계를 막지 않는다 (best-effort)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { syncIfStale, findPluginRoot } from '../../src/version/autoSync.js';
import { cpPaths } from '../../src/paths.js';

let root: string;
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makePluginRoot(version: string): string {
  const dir = makeTempDir('cp-plugin-');
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ version }));
  return dir;
}

function manifestPath(root: string): string {
  return join(cpPaths(root).conceptsViewer, 'manifest.json');
}

function stampGenerator(root: string, version: string): void {
  const manifest = JSON.parse(readFileSync(manifestPath(root), 'utf8'));
  writeFileSync(manifestPath(root), JSON.stringify({ ...manifest, generatorVersion: version }));
}

beforeEach(async () => {
  root = makeTempDir('cp-');
  await runCli(['init', '--root', root], () => {});
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('syncIfStale', () => {
  it('산출물 도장이 설치 버전보다 옛것이면 sync하고 설치 버전으로 재도장한다', async () => {
    stampGenerator(root, '0.0.1');
    const r = await syncIfStale(root, makePluginRoot('9.9.9'));
    expect(r).toEqual({ synced: true, installed: '9.9.9', generator: '0.0.1' });
    // 판단에 쓴 설치 버전이 그대로 도장으로 찍힌다 — 수렴 보장의 핵심.
    const manifest = JSON.parse(readFileSync(manifestPath(root), 'utf8'));
    expect(manifest.generatorVersion).toBe('9.9.9');
  });

  it('한 번 sync하면 수렴한다 — 두 번째 호출은 아무것도 하지 않는다', async () => {
    stampGenerator(root, '0.0.1');
    const pluginRoot = makePluginRoot('9.9.9');
    expect((await syncIfStale(root, pluginRoot)).synced).toBe(true);
    const second = await syncIfStale(root, pluginRoot);
    expect(second).toEqual({ synced: false, installed: '9.9.9', generator: '9.9.9' });
  });

  it('도장이 없으면(unstamped) sync를 실행한다', async () => {
    const manifest = JSON.parse(readFileSync(manifestPath(root), 'utf8'));
    delete manifest.generatorVersion;
    writeFileSync(manifestPath(root), JSON.stringify(manifest));
    const r = await syncIfStale(root, makePluginRoot('9.9.9'));
    expect(r.synced).toBe(true);
    expect(r.generator).toBeNull();
  });

  it('버전이 같으면 아무것도 하지 않는다 (생성물 보존)', async () => {
    stampGenerator(root, '9.9.9');
    const indexHtml = join(cpPaths(root).conceptsViewer, 'index.html');
    writeFileSync(indexHtml, 'SENTINEL');
    const r = await syncIfStale(root, makePluginRoot('9.9.9'));
    expect(r.synced).toBe(false);
    expect(readFileSync(indexHtml, 'utf8')).toBe('SENTINEL'); // 재생성 안 됨
  });

  it('설치 버전이 산출물보다 낮으면(다운그레이드) sync하지 않는다', async () => {
    stampGenerator(root, '9.9.9');
    const r = await syncIfStale(root, makePluginRoot('1.0.0'));
    expect(r.synced).toBe(false);
  });

  it('sync는 baseline(개념·기준 문서·참고자료)을 절대 건드리지 않는다', async () => {
    const cp = cpPaths(root);
    // .json은 뷰어 렌더가 스키마 파싱하는 대상이라 임의 내용을 못 넣는다 — "파일을 건드리지
    // 않는다"는 불변 규칙 검증에는 확장자와 무관하게 baseline 디렉터리의 파일이면 충분하다.
    const baselineFiles = [
      join(cp.conceptsData, 'governance', 'notes.txt'),
      join(cp.architecture, 'architecture.md'),
      join(cp.infra, 'infra.md'),
      join(cp.features, 'core', 'notes.md'),
      join(cp.reference, 'notes.md'),
    ];
    for (const file of baselineFiles) {
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, 'BASELINE-SENTINEL');
    }
    stampGenerator(root, '0.0.1');
    const r = await syncIfStale(root, makePluginRoot('9.9.9'));
    expect(r.synced).toBe(true);
    for (const file of baselineFiles) {
      expect(readFileSync(file, 'utf8')).toBe('BASELINE-SENTINEL');
    }
  });

  it('plugin.json을 못 읽으면 조용히 건너뛴다 (best-effort)', async () => {
    const r = await syncIfStale(root, makeTempDir('cp-empty-'));
    expect(r).toEqual({ synced: false, installed: null, generator: null });
  });

  it('root가 엉망이어도 throw하지 않는다', async () => {
    await expect(
      syncIfStale(join(tmpdir(), 'no-such-dir-xyz'), makePluginRoot('9.9.9'))
    ).resolves.toBeDefined();
  });
});

describe('findPluginRoot', () => {
  it('상위 탐색으로 .claude-plugin/plugin.json이 있는 디렉터리를 찾는다', () => {
    const pluginRoot = makePluginRoot('1.0.0');
    const nested = join(pluginRoot, 'dist', 'deep');
    mkdirSync(nested, { recursive: true });
    expect(findPluginRoot(nested)).toBe(pluginRoot);
  });

  it('없으면 null', () => {
    expect(findPluginRoot(makeTempDir('cp-none-'))).toBeNull();
  });
});

describe('CLI 사용 시 자동 version sync', () => {
  // 결정론을 위해 플러그인 루트를 명시한다(리포지토리 루트 = 실제 .claude-plugin 보유).
  let prevEnv: string | undefined;
  beforeEach(() => {
    prevEnv = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.CLAUDE_PLUGIN_ROOT = process.cwd();
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = prevEnv;
  });

  it('stale이면 명령 전에 자동 sync — stdout은 순수 JSON, 알림은 stderr 한 줄', async () => {
    stampGenerator(root, '0.0.1');
    let captured = '';
    let notice = '';
    const code = await runCli(
      ['drift', '--root', root],
      (s) => (captured += s),
      (s) => (notice += s)
    );
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toEqual([]); // 명령 자체는 정상 진행, stdout 오염 없음
    expect(notice).toMatch(/^\[conceptpowers\] auto version-sync: .*\n$/); // 알림 한 줄
    const manifest = JSON.parse(readFileSync(manifestPath(root), 'utf8'));
    expect(manifest.generatorVersion).not.toBe('0.0.1'); // 자동 재도장 확인
    expect(existsSync(join(cpPaths(root).conceptsViewer, 'index.html'))).toBe(true);
  });

  it('버전이 같으면 자동 sync하지 않고 알림도 없다', async () => {
    const indexHtml = join(cpPaths(root).conceptsViewer, 'index.html');
    writeFileSync(indexHtml, 'SENTINEL'); // init이 방금 현재 버전으로 도장 → same-version
    let notice = '';
    const code = await runCli(
      ['drift', '--root', root],
      () => {},
      (s) => (notice += s)
    );
    expect(code).toBe(0);
    expect(notice).toBe('');
    expect(readFileSync(indexHtml, 'utf8')).toBe('SENTINEL');
  });

  it('version-sync 명령(alias sync 포함)은 자동 sync 경로를 타지 않는다', async () => {
    stampGenerator(root, '0.0.1');
    let notice = '';
    const code = await runCli(
      ['sync', '--root', root],
      () => {},
      (s) => (notice += s)
    );
    expect(code).toBe(0);
    expect(notice).toBe(''); // 명령 자신이 패치하므로 preAction 알림은 없어야 한다
  });

  it('status 명령은 자동 sync 경로를 타지 않는다', async () => {
    stampGenerator(root, '0.0.1');
    await runCli(['status', '--root', root], () => {});
    const manifest = JSON.parse(readFileSync(manifestPath(root), 'utf8'));
    expect(manifest.generatorVersion).toBe('0.0.1'); // status는 그대로 둔다
  });

  it('자동 sync 실패(플러그인 루트에 plugin.json 없음)해도 명령은 계속 실행된다', async () => {
    stampGenerator(root, '0.0.1');
    process.env.CLAUDE_PLUGIN_ROOT = makeTempDir('cp-broken-');
    let captured = '';
    const code = await runCli(['drift', '--root', root], (s) => (captured += s));
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toEqual([]);
    const manifest = JSON.parse(readFileSync(manifestPath(root), 'utf8'));
    expect(manifest.generatorVersion).toBe('0.0.1'); // sync 못 했지만 막지도 않음
  });

  it('stderr 알림 콜백이 throw해도 명령은 계속 실행된다', async () => {
    stampGenerator(root, '0.0.1');
    let captured = '';
    const code = await runCli(
      ['drift', '--root', root],
      (s) => (captured += s),
      () => {
        throw new Error('EPIPE');
      }
    );
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toEqual([]);
  });
});
