// @concept:init-gate @concept:governance-mode
// tests/hooks/hookRoot.test.ts
// 훅이 검사할 프로젝트 루트를 찾는 규칙을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - init-gate 불변 "시작 명령과 상태 확인을 뺀 모든 명령은 실행 전에 초기화 여부를 확인한다" — 초기화된 프로젝트의
//    하위 폴더에서 일하더라도 거버넌스가 조용히 꺼지지 않는다
//    → 시작 폴더에서 위로 올라가며 초기화 표시(init.json)가 있는 폴더를 찾는다
//    → 훅 입력의 작업 폴더(cwd)를 먼저, 다음 프로젝트 폴더 환경 변수, 마지막으로 프로세스 작업 폴더를 본다
//    → 어디서도 찾지 못하면 기존 동작(프로세스 작업 폴더)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findHookRoot } from '../../src/hooks/hookRoot.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
let plain: string;
beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'cp-hroot-')));
  plain = realpathSync(mkdtempSync(join(tmpdir(), 'cp-hplain-')));
  await scaffoldInit(root, { locale: 'ko' });
  mkdirSync(join(root, 'src', 'deep'), { recursive: true });
});

describe('findHookRoot', () => {
  it('훅 입력의 작업 폴더가 하위 폴더면 위로 올라가 초기화된 루트를 찾는다', async () => {
    expect(await findHookRoot({ cwd: join(root, 'src', 'deep'), env: {}, processCwd: plain })).toBe(root);
  });

  it('입력 작업 폴더가 없으면 프로젝트 폴더 환경 변수를 쓴다', async () => {
    expect(
      await findHookRoot({ env: { CLAUDE_PROJECT_DIR: root }, processCwd: plain })
    ).toBe(root);
  });

  it('프로세스 작업 폴더의 상위도 찾는다', async () => {
    expect(await findHookRoot({ env: {}, processCwd: join(root, 'src') })).toBe(root);
  });

  it('어디서도 찾지 못하면 프로세스 작업 폴더(기존 동작)', async () => {
    expect(await findHookRoot({ cwd: plain, env: {}, processCwd: plain })).toBe(plain);
  });
});
