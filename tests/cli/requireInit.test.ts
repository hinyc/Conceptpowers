// @concept:init-gate
// 검증 대상 규칙 ↔ 시나리오:
//  - init-gate 불변 "시작 명령과 상태 확인을 뺀 모든 명령은 실행 전에 초기화 여부를 확인한다"
//    → status는 init 없이도 진단용으로 동작한다 (관문 밖 명령 두 가지 중 하나)
// init 안 된 프로젝트에서는 init 외의 CLI 명령이 거부되는지 검증한다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';

const GUARDED: string[][] = [
  ['render'],
  ['audit', 'src/a.ts'],
  ['drift'],
  ['map', 'src/a.ts'],
  ['approve', 'some-slug'],
  ['quality', 'some-slug'],
  ['attest-consistency', 'some-slug', '--result', 'pass', '--compared', 'some-slug'],
  ['note-change', 'some-slug', '--reason', 'r'],
  ['note-conflict', 'some-slug', '--reason', 'r'],
  ['resolve-conflict', 'some-slug'],
];

describe('init 전 CLI 가드', () => {
  let root: string;
  let output: string;
  const out = (s: string) => {
    output += s;
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cp-noinit-'));
    output = '';
  });

  it.each(GUARDED)('init 없이 %s 실행 시 exit 1 + init 안내', async (...argv) => {
    const code = await runCli([...argv, '--root', root], out);
    expect(code).toBe(1);
    expect(JSON.parse(output).error).toMatch(/not initialized.*init/i);
  });

  it('status는 init 없이도 진단용으로 동작한다', async () => {
    const code = await runCli(['status', '--root', root], out);
    expect(code).toBe(0);
    expect(JSON.parse(output).initialized).toBe(false);
  });
});
