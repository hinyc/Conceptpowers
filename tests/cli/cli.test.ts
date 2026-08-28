// @concept:init-gate @concept:settled-status @concept:atomic-baseline-write @concept:drift-reconcile @concept:governance-mode @concept:human-owns-contract @concept:pending-conflict-tracking @concept:concept-code-mapping @concept:plugin-version-sync @concept:output-locale
// tests/cli/cli.test.ts
// CLI 서브커맨드 전반을 검증한다. 명령마다 다스리는 개념이 달라 아래에 갈라 적는다.
// 검증 대상 규칙 ↔ 시나리오:
//  - init-gate 불변 "시작 명령과 상태 확인을 뺀 모든 명령은 실행 전에 초기화 여부를 확인한다"
//    → version-sync는 초기화되지 않은 프로젝트에서 에러를 반환한다
//  - init-gate 불변 "초기화되지 않았으면 실행하지 않고, 무엇을 먼저 해야 하는지 알린다"
//    → init 스캐폴드 생성 / init 완료 후 안내 문구 (package.json 유무에 따라 다른 안내)
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다"
//    → --lang en이면 영어 안내를 출력한다
//  - settled-status 불변 "빨강을 초록으로 올리는 것은 사람이 명시적으로 요청했을 때만 한다"
//    → approve가 red 개념을 green으로 승인한다
//  - human-owns-contract 불변 "개념 문서의 내용 변경은 반드시 사람의 확인을 거친다"
//    → edit-concept는 green 개념을 수정하면 pending으로 내린다 / red·pending의 상태는 유지한다
//  - contract-hash 허용 "지문을 마지막으로 맞춰둔 지문과 견주어 어긋남을 판정하는 것"
//    → status가 drift 개수를 포함한다 / drift가 JSON 배열을 출력한다
//  - drift-reconcile 불변 "무시하고 넘어간 개념은 예외 없이 무시했다는 기록을 남긴다"
//    → note-change는 history에 이유를 기록한다
//  - pending-conflict-tracking 불변 "충돌로 확정을 미룰 때는 반드시 그 사유를 함께 기록한다" /
//    "확정되는 순간 남아 있던 충돌 사유 기록을 지운다" → note-conflict/resolve-conflict
//  - concept-code-mapping 불변 "코드의 표식을 고쳤으면 같은 작업에서 보관본도 함께 갱신한다"
//    → map은 증분 실행 시 전달되지 않은 파일의 캐시를 보존한다 / map --full은 전달된 파일만으로 재생성
//  - plugin-version-sync 허용 "생성물에 찍힌 버전 도장이 깔린 도구와 다를 때만 생성물을 다시 만드는 것"
//    → sync 서브커맨드가 --force로 생성물을 패치한다
//  - generated-not-hand-edited 허용 "다시 만들었을 때 결과가 달라지는지 확인하는 것"
//    → render 서브커맨드가 뷰어 경로 안내를 JSON으로 출력한다
//  - governance-mode 구성요소 "엄격 / 표준(기본값) / 가벼움" + 불변 "강도 설정이 없거나 깨졌으면
//    표준(standard)으로 동작한다"
//    → init --enforcement light가 기록된다 / init 기본값은 standard / status가 enforcement를 보여준다
//  - "edit-concept는 없는 개념에 에러+exit 1"은 대응하는 개념 규칙이 없다 — 방어적 처리다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { readHistory } from '../../src/drift/history.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
});

describe('runCli', () => {
  it('init 서브커맨드가 스캐폴드를 만든다', async () => {
    const code = await runCli(['init', '--root', root, '--mode', 'incremental']);
    expect(code).toBe(0);
    expect(existsSync(join(root, 'docs/conceptpowers/init.json'))).toBe(true);
  });
  // init 직후는 도장 == 설치 버전이라, 개념 plugin-version-sync에 따라 그냥 실행하면
  // 건너뛴다("버전이 같은데도 생성물을 다시 만드는 것"은 restrict). 패치 결과 보고는
  // 사람이 명시적으로 우회했을 때(--force)만 나온다. 가드 자체는 tests/version/autoSync.test.ts.
  it('sync 서브커맨드가 --force로 생성물을 패치한다 (초기화된 프로젝트)', async () => {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'demo',
        scripts: { 'concepts:view': 'open docs/conceptpowers/concepts/viewer/index.html' },
      })
    );
    await runCli(['init', '--root', root]);
    let captured = '';
    const code = await runCli(['version-sync', '--root', root, '--force'], (s) => (captured += s));
    expect(code).toBe(0);
    const r = JSON.parse(captured);
    expect(r.ok).toBe(true);
    expect(r).toHaveProperty('scriptStatus');
    expect(r).toHaveProperty('orphansRemoved');
  });
  it('version-sync(구명령 sync 별칭)는 초기화되지 않은 프로젝트에서 에러를 반환한다', async () => {
    let captured = '';
    const code = await runCli(['sync', '--root', root], (s) => (captured += s));
    expect(code).toBe(1);
    expect(JSON.parse(captured).error).toContain('not initialized');
  });
  it('init 완료 후 안내 문구를 출력한다 (package.json 있으면 뷰어 스크립트 안내)', async () => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'demo' }));
    let captured = '';
    const code = await runCli(['init', '--root', root, '--lang', 'ko'], (s) => (captured += s));
    expect(code).toBe(0);
    expect(captured).toContain('초기화 완료');
    expect(captured).toContain('npm run concepts:view');
    expect(captured).toContain('reference/'); // 참고자료 폴더 안내
  });
  it('package.json이 없으면 안내가 뷰어 파일 경로를 가리킨다', async () => {
    let captured = '';
    await runCli(['init', '--root', root, '--lang', 'ko'], (s) => (captured += s));
    expect(captured).toContain('docs/conceptpowers/concepts/viewer/index.html');
    expect(captured).not.toContain('npm run concepts:view');
  });
  it('--lang en이면 영어 안내를 출력한다', async () => {
    let captured = '';
    await runCli(['init', '--root', root, '--lang', 'en'], (s) => (captured += s));
    expect(captured).toContain('Conceptpowers initialized');
  });
  it('status가 초기화 여부를 JSON으로 출력한다', async () => {
    const out: string[] = [];
    const code = await runCli(['status', '--root', root], (s) => out.push(s));
    expect(code).toBe(0);
    expect(JSON.parse(out.join('')).initialized).toBe(false);
  });
  it('approve가 red 개념을 green으로 승인한다', async () => {
    await runCli(['init', '--root', root]);
    const concept = {
      slug: 'admin-role',
      group: 'auth',
      category: ['role'],
      title: 'Admin',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      state: { managed: ['이 개념이 관리하는 대상'] },
      principle: { immutableRules: ['이 개념의 규칙은 열 글자 이상이다'], operationalPrinciple: '조건이 갖춰지면 그대로 판정된다' },
      status: 'red',
    };
    await writeConcept(root, concept);
    await recordAttest(root, parseConcept(concept), 'pass');
    let captured = '';
    const code = await runCli(['approve', '--root', root, 'admin-role'], (s) => (captured += s));
    expect(code).toBe(0);
    const c = await readConcept(root, 'admin-role');
    expect(c?.status).toBe('green');
    const r = JSON.parse(captured);
    expect(r.ok).toBe(true);
    expect(r.slug).toBe('admin-role');
    expect(r.viewer).toContain('concepts/viewer/index.html');
    expect(r.serve).toContain('concepts:view');
  });
  it('edit-concept는 green 개념을 수정하면 pending으로 내린다 (사람 재승인 필요)', async () => {
    await runCli(['init', '--root', root]);
    const concept = {
      slug: 'admin-role',
      group: 'auth',
      category: ['role'],
      title: 'Admin',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      state: { managed: ['이 개념이 관리하는 대상'] },
      principle: { immutableRules: ['이 개념의 규칙은 열 글자 이상이다'], operationalPrinciple: '조건이 갖춰지면 그대로 판정된다' },
      status: 'green',
    };
    await writeConcept(root, concept);
    const patchFile = join(root, 'patch.json');
    writeFileSync(patchFile, JSON.stringify({ title: '관리자 역할' }));
    let captured = '';
    const code = await runCli(
      ['edit-concept', 'admin-role', '--file', patchFile, '--reason', '표현 정리', '--root', root],
      (s) => (captured += s)
    );
    expect(code).toBe(0);
    const editResult = JSON.parse(captured);
    expect(editResult).toMatchObject({
      ok: true,
      slug: 'admin-role',
      status: 'pending',
      downgradedToPending: true,
    });
    expect(editResult.viewer).toContain('concepts/viewer/index.html');
    expect(editResult.serve).toContain('concepts:view');
    const c = await readConcept(root, 'admin-role');
    expect(c?.title).toBe('관리자 역할');
    expect(c?.status).toBe('pending');
    const h = await readHistory(root);
    expect(h.some((e) => e.slug === 'admin-role' && e.reason === '표현 정리')).toBe(true);
  });
  it('edit-concept는 red/pending 개념의 상태는 유지한다', async () => {
    await runCli(['init', '--root', root]);
    await writeConcept(root, {
      slug: 'draft-role',
      category: ['role'],
      title: 'Draft',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
      status: 'red',
    } as any);
    const patchFile = join(root, 'patch2.json');
    writeFileSync(patchFile, JSON.stringify({ title: 'Draft2' }));
    let captured = '';
    const code = await runCli(
      ['edit-concept', 'draft-role', '--file', patchFile, '--root', root],
      (s) => (captured += s)
    );
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toMatchObject({ status: 'red', downgradedToPending: false });
    expect((await readConcept(root, 'draft-role'))?.title).toBe('Draft2');
  });
  it('edit-concept는 없는 개념에 에러+exit 1', async () => {
    await runCli(['init', '--root', root]);
    const patchFile = join(root, 'patch3.json');
    writeFileSync(patchFile, JSON.stringify({ title: 'x' }));
    let captured = '';
    const code = await runCli(
      ['edit-concept', 'ghost', '--file', patchFile, '--root', root],
      (s) => (captured += s)
    );
    expect(code).toBe(1);
    expect(JSON.parse(captured).error).toMatch(/not found/i);
  });
  it('status는 drift 개수를 포함한다', async () => {
    let captured = '';
    await runCli(['init', '--root', root], () => {});
    const code = await runCli(['status', '--root', root], (s) => (captured += s));
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toMatchObject({ initialized: true, drift: 0 });
  });
  it('note-change는 history에 이유를 기록한다', async () => {
    await runCli(['init', '--root', root], () => {});
    await writeConcept(root, {
      slug: 'auth-token',
      category: ['behavior'],
      title: 'A',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
    } as any);
    await runCli(['note-change', 'auth-token', '--reason', '만료 30분', '--root', root], () => {});
    const h = await readHistory(root);
    expect(h.some((e) => e.slug === 'auth-token' && e.reason === '만료 30분')).toBe(true);
  });
  it('drift는 JSON 배열을 출력한다', async () => {
    let captured = '';
    await runCli(['init', '--root', root], () => {});
    await runCli(['drift', '--root', root], (s) => (captured += s));
    expect(JSON.parse(captured)).toEqual([]);
  });
  it('note-conflict/resolve-conflict가 사유를 기록·해소한다', async () => {
    await runCli(['init', '--root', root]);
    expect(await runCli(['note-conflict', 'p', '--reason', 'x', '--root', root])).toBe(0);
    const { readPendingConflicts } = await import('../../src/concept/pendingConflicts.js');
    expect(await readPendingConflicts(root)).toEqual({ p: 'x' });
    await runCli(['resolve-conflict', 'p', '--root', root]);
    expect(await readPendingConflicts(root)).toEqual({});
  });
  it('map은 증분 실행 시 전달되지 않은 파일의 캐시 항목을 보존한다(병합)', async () => {
    await runCli(['init', '--root', root]);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.ts'), '// @concept:alpha\n');
    writeFileSync(join(root, 'src/b.ts'), '// @concept:beta\n');
    await runCli(['map', '--root', root, 'src/a.ts']);
    await runCli(['map', '--root', root, 'src/b.ts']);
    const { readMappingCache } = await import('../../src/mapping/scan.js');
    expect(await readMappingCache(root)).toEqual({
      alpha: ['src/a.ts'],
      beta: ['src/b.ts'],
    });
  });
  it('map --full은 전달된 파일만으로 캐시를 재생성한다', async () => {
    await runCli(['init', '--root', root]);
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.ts'), '// @concept:alpha\n');
    writeFileSync(join(root, 'src/b.ts'), '// @concept:beta\n');
    await runCli(['map', '--root', root, 'src/a.ts']);
    await runCli(['map', '--full', '--root', root, 'src/b.ts']);
    const { readMappingCache } = await import('../../src/mapping/scan.js');
    expect(await readMappingCache(root)).toEqual({ beta: ['src/b.ts'] });
  });
  it('render 서브커맨드가 뷰어 경로 안내를 JSON으로 출력한다', async () => {
    await runCli(['init', '--root', root, '--mode', 'incremental']);
    let captured = '';
    const code = await runCli(['render', '--root', root], (s) => (captured += s));
    expect(code).toBe(0);
    const r = JSON.parse(captured);
    expect(r.ok).toBe(true);
    expect(r.viewer).toContain('concepts/viewer/index.html');
    expect(r.serve).toContain('concepts:view');
  });
  it('init --enforcement light가 init.json에 기록된다', async () => {
    const code = await runCli(['init', '--root', root, '--enforcement', 'light']);
    expect(code).toBe(0);
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'));
    expect(cfg.enforcement).toBe('light');
  });
  it('init 기본값은 standard다 [규칙: 설정이 없으면 표준]', async () => {
    await runCli(['init', '--root', root]);
    const cfg = JSON.parse(readFileSync(join(root, 'docs/conceptpowers/init.json'), 'utf8'));
    expect(cfg.enforcement).toBe('standard');
  });
  it('status가 enforcement를 보여준다', async () => {
    await runCli(['init', '--root', root, '--enforcement', 'strict']);
    let captured = '';
    await runCli(['status', '--root', root], (s) => (captured += s));
    expect(JSON.parse(captured).enforcement).toBe('strict');
  });
});
