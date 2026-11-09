// @concept:plugin-version-sync @concept:init-gate @concept:generated-not-hand-edited @concept:reference-privacy
// tests/init/syncGenerated.test.ts
// 생성물 동기화(syncGenerated)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - plugin-version-sync 구성요소 "맞추는 대상: 뷰어 화면 파일, 실행 스크립트 같은 생성물"
//    → 뷰어 에셋과 manifest를 (재)생성한다 / 옛 concepts:view 스크립트를 표준 명령으로 교체한다
//  - plugin-version-sync 불변 "이미 존재하는 파일의 내용은 지우거나 바꾸지 않는다 — … 설정 파일은
//    빠진 항목만 기본값으로 채워 넣는다" → 구버전 init.json의 빠진 설정 항목만 보충한다
//  - plugin-version-sync 불변 "채울 항목이 하나도 없으면 설정 파일을 다시 쓰지 않는다"
//    → 보충할 항목이 없으면 configFieldsAdded가 비어 있다
//  - generated-not-hand-edited 불변 "생성물은 직접 고치지 않고 원본을 고쳐 다시 만드는 방식으로만
//    바꾼다" → 옛 포맷 고아 *.html은 정리하고 index.html은 보존한다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncGenerated } from '../../src/init/syncGenerated.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { VIEWER_SCRIPT_NAME, VIEWER_COMMAND } from '../../src/init/packageScript.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});
const viewer = (rel: string) => join(root, 'docs/conceptpowers/concepts/viewer', rel);

describe('syncGenerated', () => {
  it('뷰어 에셋과 manifest를 (재)생성한다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const r = await syncGenerated(root);
    expect(existsSync(viewer('index.html'))).toBe(true);
    expect(existsSync(viewer('assets/viewer.js'))).toBe(true);
    expect(existsSync(viewer('serve.mjs'))).toBe(true);
    expect(existsSync(viewer('manifest.json'))).toBe(true);
    expect(r.scriptStatus).toBe('no-package'); // package.json 없음
    // reference 폴더 + 안내 README + paths.md 템플릿 보장
    expect(existsSync(join(root, 'docs/conceptpowers/reference/README.md'))).toBe(true);
    expect(existsSync(join(root, 'docs/conceptpowers/reference/paths.md'))).toBe(true);
    expect(r.referenceReadmeCreated).toBe(false); // scaffoldInit가 이미 생성
    expect(r.referencePathsCreated).toBe(false); // scaffoldInit가 이미 생성
  });

  // 규칙 검증: "설정 파일에 아직 없는 설정 항목만 기본값으로 추가하는 것" (plugin-version-sync allow)
  it('구버전 init.json의 빠진 설정 항목을 기본값으로 보충한다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const initPath = join(root, 'docs/conceptpowers/init.json');
    // 구버전 프로젝트를 재현: 새 항목이 아직 없는 설정 파일
    const old = JSON.parse(readFileSync(initPath, 'utf8'));
    delete old.conceptDrivenTests;
    old.versionCheck = false; // 사람이 꺼둔 값
    writeFileSync(initPath, JSON.stringify(old, null, 2) + '\n');

    const r = await syncGenerated(root);

    expect(r.configFieldsAdded).toContain('conceptDrivenTests');
    const cfg = JSON.parse(readFileSync(initPath, 'utf8'));
    expect(cfg.conceptDrivenTests).toBe(true); // 빠진 항목은 기본값으로 채워지고
    expect(cfg.versionCheck).toBe(false); // 사람이 정한 값은 그대로 보존된다
  });

  it('보충할 설정 항목이 없으면 configFieldsAdded가 비어 있다', async () => {
    await scaffoldInit(root, { locale: 'ko' }); // scaffold가 이미 전 항목을 기록
    expect((await syncGenerated(root)).configFieldsAdded).toEqual([]);
  });

  // reference-privacy 허용 "프로젝트 설정으로 공유를 택했을 때만 참고자료 기준점을 저장소에 함께 올리는 것"
  it('참고자료 기준점 공유 설정에 맞춰 .alignment/.gitignore를 맞춘다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const gi = join(root, 'docs/conceptpowers/concepts/.alignment/.gitignore');
    expect((await syncGenerated(root)).referenceLockMode).toBe('shared');
    expect(readFileSync(gi, 'utf8')).not.toContain('reference.lock.json');
    const initPath = join(root, 'docs/conceptpowers/init.json');
    const cfg = JSON.parse(readFileSync(initPath, 'utf8'));
    writeFileSync(initPath, JSON.stringify({ ...cfg, referenceLock: 'local' }, null, 2) + '\n');
    const r = await syncGenerated(root);
    expect(r.referenceLockMode).toBe('local');
    expect(r.referenceLockIgnore).toBe('added');
    expect(readFileSync(gi, 'utf8')).toContain('reference.lock.json');
  });

  it('옛 포맷 고아 *.html을 정리하고 index.html은 보존한다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    // 옛 포맷 잔재를 인위적으로 만든다
    mkdirSync(viewer('auth'), { recursive: true });
    mkdirSync(viewer('features'), { recursive: true });
    writeFileSync(viewer('graph.html'), '<old/>');
    writeFileSync(viewer('auth/admin-role.html'), '<old/>');
    writeFileSync(viewer('features/login.html'), '<old/>');

    const r = await syncGenerated(root);
    expect(r.orphansRemoved).toBe(3);
    expect(existsSync(viewer('graph.html'))).toBe(false);
    expect(existsSync(viewer('auth/admin-role.html'))).toBe(false);
    expect(existsSync(viewer('auth'))).toBe(false); // 비워진 디렉터리 정리
    expect(existsSync(viewer('features'))).toBe(false);
    expect(existsSync(viewer('index.html'))).toBe(true); // 보존
    expect(existsSync(viewer('assets/viewer.js'))).toBe(true); // assets 보존
  });

  it('옛 concepts:view(open …) 스크립트를 표준 명령으로 교체한다', async () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'demo',
        scripts: { [VIEWER_SCRIPT_NAME]: 'open docs/conceptpowers/concepts/viewer/index.html' },
      })
    );
    await scaffoldInit(root, { locale: 'ko' });
    const r = await syncGenerated(root);
    expect(r.scriptStatus).toBe('unchanged'); // scaffoldInit가 이미 표준으로 맞춤
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts[VIEWER_SCRIPT_NAME]).toBe(VIEWER_COMMAND);
  });
});

// reference-privacy 불변 "파일 이름과 지문의 목록(기준점)은 프로젝트 설정으로 공유를 택했을 때만 함께 올린다" —
// 설정을 읽지 못하면 공유를 택했다고 볼 수 없으므로 .alignment/.gitignore에 손대지 않는다.
describe('syncGenerated — 설정을 읽지 못할 때', () => {
  it('init.json이 깨졌으면 기준점 제외 줄을 빼지 않는다(unchanged)', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const gi = join(root, 'docs/conceptpowers/concepts/.alignment/.gitignore');
    writeFileSync(gi, 'last-commit\nreference.lock.json\n');
    writeFileSync(join(root, 'docs/conceptpowers/init.json'), '{ broken');
    const r = await syncGenerated(root);
    expect(r.referenceLockMode).toBeNull();
    expect(r.referenceLockIgnore).toBe('unchanged');
    expect(readFileSync(gi, 'utf8')).toBe('last-commit\nreference.lock.json\n');
  });
});

// reference-privacy "참고자료 폴더의 파일은 기본적으로 저장소 추적에서 제외" +
// plugin-version-sync 허용 "생성물에 찍힌 버전 도장이 깔린 도구와 다를 때만 생성물을 다시 만드는 것" —
// 한 단계가 실패해도 나머지(특히 참고자료 추적 제외)는 맞추고, 도장은 모두 성공했을 때만 새로 찍어 다음에 다시 시도하게 한다.
describe('syncGenerated — 단계별 실패 격리', () => {
  const manifest = () => JSON.parse(readFileSync(viewer('manifest.json'), 'utf8'));
  const refGitignore = () => join(root, 'docs/conceptpowers/reference/.gitignore');

  async function brokenPackageSetup(): Promise<void> {
    await scaffoldInit(root, { locale: 'ko' });
    const m = manifest();
    writeFileSync(viewer('manifest.json'), JSON.stringify({ ...m, generatorVersion: '0.0.1' }));
    rmSync(refGitignore());
    writeFileSync(join(root, 'package.json'), '{ not json');
  }

  it('package.json이 깨져도 참고자료 .gitignore를 만들고 실패 단계를 드러낸다', async () => {
    await brokenPackageSetup();
    const r = await syncGenerated(root, { stampVersion: '9.9.9' });
    expect(existsSync(refGitignore())).toBe(true);
    expect(r.referenceGitignoreCreated).toBe(true);
    expect(r.failedSteps.map((f) => f.step)).toContain('packageScript');
  });

  it('실패한 단계가 있으면 버전 도장을 새로 찍지 않는다', async () => {
    await brokenPackageSetup();
    await syncGenerated(root, { stampVersion: '9.9.9' });
    expect(manifest().generatorVersion).toBe('0.0.1');
  });

  // plugin-version-sync 목적 "도구를 올렸는데 화면이 옛 버전"을 막는다 — 앞 단계가 실패해도 뷰어는 새로 쓰고
  // 도장만 보류한다(옛 도장 유지 → 다음 동기화가 다시 시도).
  it('앞 단계가 실패해도 뷰어는 새로 쓰고 도장만 옛것으로 둔다', async () => {
    await brokenPackageSetup();
    writeFileSync(viewer('index.html'), 'stale viewer');
    const r = await syncGenerated(root, { stampVersion: '9.9.9' });
    expect(readFileSync(viewer('index.html'), 'utf8')).not.toBe('stale viewer');
    expect(manifest().generatorVersion).toBe('0.0.1');
    expect(r.failedSteps.map((f) => f.step)).not.toContain('viewer');
  });

  it('도장이 아직 없던 프로젝트에서 앞 단계가 실패해도 뷰어는 만들고 도장은 비워 둔다', async () => {
    writeFileSync(join(root, 'package.json'), '{ not json');
    await scaffoldInit(root, { locale: 'ko' });
    expect(existsSync(viewer('index.html'))).toBe(true);
    expect(manifest().generatorVersion).toBeNull();
  });

  it('뷰어 단계 자체가 실패하면 실패 목록에 viewer가 오르고 도장은 옛것 그대로다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    writeFileSync(
      viewer('manifest.json'),
      JSON.stringify({ ...manifest(), generatorVersion: '0.0.1' })
    );
    rmSync(viewer('assets'), { recursive: true, force: true });
    writeFileSync(viewer('assets'), 'not a directory');
    const r = await syncGenerated(root, { stampVersion: '9.9.9' });
    expect(r.failedSteps.map((f) => f.step)).toContain('viewer');
    expect(manifest().generatorVersion).toBe('0.0.1');
  });

  it('모든 단계가 성공하면 실패 목록이 비고 도장을 찍는다', async () => {
    await scaffoldInit(root, { locale: 'ko' });
    const r = await syncGenerated(root, { stampVersion: '9.9.9' });
    expect(r.failedSteps).toEqual([]);
    expect(manifest().generatorVersion).toBe('9.9.9');
  });
});
