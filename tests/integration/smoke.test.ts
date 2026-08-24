// @concept:init-gate @concept:settled-status @concept:atomic-baseline-write @concept:governance-mode @concept:audit-gap-detection @concept:feature-spec-bridge @concept:concept-code-mapping @concept:generated-not-hand-edited
// tests/integration/smoke.test.ts
// init부터 커밋 게이트까지 한 줄로 훑는 통합 시나리오다.
// 검증 대상 규칙 ↔ 시나리오:
//  - init-gate 불변 "시작 명령과 상태 확인을 뺀 모든 명령은 실행 전에 초기화 여부를 확인한다"
//    → 두 시나리오 모두 init으로 시작한다
//  - audit-gap-detection 정의 "사람이 손으로 쓴 코드 파일은 예외 없이 자기가 따르는 개념을 첫머리에
//    밝혀야 한다" → 태그를 붙인 코드가 커밋 게이트를 통과한다
//  - feature-spec-bridge 불변 "개념과 코드의 연결은 기능 기록 한 곳에만 적고, 반대 방향은 그것에서
//    파생시킨다" + concept-code-mapping 허용 "코드의 표식을 훑어 지도를 만들고 보관본으로 저장하는 것"
//    + generated-not-hand-edited 허용 "다시 만들었을 때 결과가 달라지는지 확인하는 것"
//    → feature 작성 → concept 정의 → map → render 뒤 그래프가 기능→개념→파일로 이어진다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
  mkdirSync(join(root, 'src'), { recursive: true });
});

describe('end-to-end', () => {
  it('init → 개념 작성 → render → 태그 커밋 게이트 통과', async () => {
    expect(await runCli(['init', '--root', root])).toBe(0);
    await writeConcept(root, {
      slug: 'admin-role',
      group: 'auth',
      category: ['role'],
      title: 'Admin',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
      status: 'green', // 승인된 개념 → 커밋 게이트 통과
    });
    expect(await runCli(['render', '--root', root])).toBe(0);
    // 개념은 개별 HTML이 아니라 manifest.json에 등록되고 단일 뷰어가 렌더한다.
    expect(existsSync(join(root, 'docs/conceptpowers/concepts/viewer/index.html'))).toBe(true);
    const manifest = JSON.parse(
      readFileSync(join(root, 'docs/conceptpowers/concepts/viewer/manifest.json'), 'utf8')
    );
    expect(manifest.concepts[0].url).toBe('../data/auth/admin-role.json');

    writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\n');
    const ok = await decidePreToolUse(root, {
      tool: 'Bash',
      input: { command: 'git commit -m x' },
      changedFiles: ['src/a.ts'],
    });
    expect(ok!.hookSpecificOutput.permissionDecision).toBe('allow');

    writeFileSync(join(root, 'src/b.ts'), '// @concept:ghost\n');
    const blocked = await decidePreToolUse(root, {
      tool: 'Bash',
      input: { command: 'git commit -m x' },
      changedFiles: ['src/b.ts'],
    });
    // 미정의 태그는 막되 override 허용(ask) — 강제된 내비게이션
    expect(blocked!.hookSpecificOutput.permissionDecision).toBe('ask');
  });

  it('init → feature 작성 → concept 정의 → map → render: 그래프가 기능→개념→파일로 이어진다', async () => {
    expect(await runCli(['init', '--root', root])).toBe(0);

    // 개념(개념→코드는 @concept 태그 + map으로 배선)
    await writeConcept(root, {
      slug: 'auth-session',
      group: 'auth',
      category: ['feature'],
      title: '세션',
      description: { definition: 'd' },
      purpose: { reason: 'r' },
      actions: {},
      principle: {},
      status: 'green',
    });

    // 기능(기능→개념: concepts, 기능→코드: codePaths)
    const spec = join(root, 'feat.json');
    writeFileSync(
      spec,
      JSON.stringify({
        slug: 'login',
        group: 'auth',
        title: '로그인',
        concepts: ['auth-session'],
        codePaths: ['src/login.ts'],
      })
    );
    expect(await runCli(['feature', '--root', root, '--file', spec])).toBe(0);

    // @concept 태그 → mapping.json (개념→코드)
    writeFileSync(join(root, 'src/login.ts'), '// @concept:auth-session\n');
    expect(await runCli(['map', '--root', root, 'src/login.ts'])).toBe(0);

    expect(await runCli(['render', '--root', root])).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(root, 'docs/conceptpowers/concepts/viewer/manifest.json'), 'utf8')
    );
    // 그래프는 기능을 기준으로 잇는다 — 기능→개념, 개념→파일(knowledge-graph-view)
    const kinds = new Set(manifest.graph.edges.map((e: { kind: string }) => e.kind));
    expect(kinds).toEqual(new Set(['feature-concept', 'concept-file']));
    expect(manifest.graph.nodes.some((n: { type: string }) => n.type === 'feature')).toBe(true);
    expect(manifest.graph.edges).toContainEqual({
      source: 'f:login',
      target: 'c:auth-session',
      kind: 'feature-concept',
    });
    // 기능은 매니페스트의 색인 줄에 따르는 개념과 함께 남는다
    expect(manifest.features[0]).toMatchObject({ slug: 'login', concepts: ['auth-session'] });
    // 같은 파일(src/login.ts)은 여러 곳에서 가리켜도 파일 노드가 하나로 합쳐진다
    expect(
      manifest.graph.nodes.filter((n: { id: string }) => n.id === 'p:src/login.ts').length
    ).toBe(1);
  });
});
