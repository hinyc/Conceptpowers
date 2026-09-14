// @concept:settled-status @concept:init-gate
// tests/cli/attestScope.test.ts
// attest-consistency의 비교 범위를 검증한다 — 증빙이 자기신고라도 "무엇과 견줬는가"는 헐거워질 수 없다.
// 검증 대상 규칙 ↔ 시나리오:
//  - settled-status 불변 "검사 증빙은 그때 있는 다른 모든 개념과 견준 기록이어야 한다 — 자기 자신과 견준
//    기록이나 일부만 견준 기록으로는 성립하지 않는다"
//    → 자기 자신을 --compared에 넣으면 exit 1
//    → 다른 개념 일부만 견줬으면 exit 1이고 빠진 개념을 알려준다
//    → 다른 개념 전부를 적으면 저장된다 / `all`은 다른 개념 전부로 풀려 저장된다
//    → 다른 개념이 하나도 없을 때는 견줄 것이 없으므로 `all`로 기록할 수 있다
//    → `all`과 함께 적은 자기 자신·없는 개념도 거부한다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';
import { writeConcept } from '../../src/store/conceptStore.js';
import { readAttestLog } from '../../src/concept/attest.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

const concept = (slug: string) => ({
  slug,
  category: ['behavior'],
  title: slug,
  description: { definition: '정의' },
  purpose: { reason: '이유' },
  actions: {},
  principle: { immutableRules: ['결제 완료 후 price 변경 불가'] },
});

describe('cli: attest-consistency 비교 범위', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  const attest = (compared: string) =>
    runCli(
      ['attest-consistency', 'target', '--result', 'pass', '--compared', compared, '--root', root],
      out
    );

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-scope-'));
    await scaffoldInit(root, {});
    await writeConcept(root, concept('target'));
    await writeConcept(root, concept('other-a'));
    await writeConcept(root, concept('other-b'));
    output = '';
  });

  it('자기 자신과 견준 기록은 증빙이 아니다 [규칙: 자기 자신과 견준 기록으로는 성립하지 않는다]', async () => {
    expect(await attest('target,other-a,other-b')).toBe(1);
    expect(JSON.parse(output).error).toContain('자기 자신');
    expect(await readAttestLog(root)).toEqual({});
  });

  it('일부만 견줬으면 거부하고 빠진 개념을 알려준다 [규칙: 일부만 견준 기록으로는 성립하지 않는다]', async () => {
    expect(await attest('other-a')).toBe(1);
    const err = JSON.parse(output).error as string;
    expect(err).toContain('other-b');
    expect(err).not.toContain('other-a,');
    expect(await readAttestLog(root)).toEqual({});
  });

  it('다른 개념 전부를 적으면 저장된다 [규칙: 그때 있는 다른 모든 개념과 견준 기록]', async () => {
    expect(await attest('other-b, other-a')).toBe(0);
    const log = await readAttestLog(root);
    expect(log['target']?.result).toBe('pass');
    expect([...(log['target']?.compared ?? [])].sort()).toEqual(['other-a', 'other-b']);
  });

  it('`all`은 다른 개념 전부로 풀려 저장된다 — 기록은 실제 slug 목록이다', async () => {
    expect(await attest('all')).toBe(0);
    const log = await readAttestLog(root);
    expect([...(log['target']?.compared ?? [])].sort()).toEqual(['other-a', 'other-b']);
    expect(JSON.parse(output).compared).toHaveLength(2);
  });

  it('다른 개념이 하나도 없으면 견줄 것이 없으므로 `all`로 기록할 수 있다', async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-cli-scope-solo-'));
    await scaffoldInit(root, {});
    await writeConcept(root, concept('target'));
    expect(await attest('all')).toBe(0);
    const log = await readAttestLog(root);
    expect(log['target']?.result).toBe('pass');
    expect(log['target']?.compared).toBeUndefined();
  });

  it('`all`과 함께 적은 자기 자신·없는 개념도 거부한다 [규칙: 자기 자신과 견준 기록으로는 성립하지 않는다]', async () => {
    expect(await attest('all,bogus')).toBe(1);
    expect(JSON.parse(output).error).toContain('bogus');
    output = '';
    expect(await attest('all,target')).toBe(1);
    expect(await readAttestLog(root)).toEqual({});
  });
});
