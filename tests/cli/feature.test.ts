// @concept:init-gate @concept:feature-spec-bridge @concept:globally-unique-slug
// tests/cli/feature.test.ts
// feature 등록 명령을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - feature-spec-bridge 불변 "개념과 코드의 연결은 기능 기록 한 곳에만 적고, 반대 방향은 그것에서
//    파생시킨다" → 유효한 feature를 검증해 features/에 기록한다
//  - globally-unique-slug 허용 "새 이름표가 같은 벌 안에서 이미 쓰이고 있는지 확인하고, 겹치면 저장을
//    거절하는 것" → 중복 slug feature는 비0 종료코드로 거부한다
//  - globally-unique-slug 불변 "이름표는 소문자·숫자·붙임표만으로 이루어진다"
//    → 스키마 위반 feature는 비0 종료코드로 거부한다
//  - init-gate 불변 "시작 명령과 상태 확인을 뺀 모든 명령은 실행 전에 초기화 여부를 확인한다"
//    → 세 시나리오 모두 초기화된 프로젝트에서만 성립한다(픽스처 전제)
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/cli.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-feat-'));
});

const writeSpec = (name: string, data: unknown): string => {
  const p = join(root, name);
  writeFileSync(p, JSON.stringify(data));
  return p;
};

describe('runCli feature', () => {
  it('유효한 feature를 검증해 features/에 기록한다', async () => {
    await runCli(['init', '--root', root]);
    const file = writeSpec('login.json', {
      slug: 'login',
      group: 'auth',
      title: '로그인',
      concepts: ['auth-session'],
      codePaths: ['src/login.ts'],
    });
    let captured = '';
    const code = await runCli(['feature', '--root', root, '--file', file], (s) => (captured += s));
    expect(code).toBe(0);
    expect(JSON.parse(captured)).toMatchObject({ ok: true, slug: 'login' });
    const target = join(root, 'docs/conceptpowers/features/auth/login.json');
    expect(existsSync(target)).toBe(true);
    const written = JSON.parse(readFileSync(target, 'utf8'));
    expect(written.concepts).toEqual(['auth-session']);
    expect(written.codePaths).toEqual(['src/login.ts']);
  });

  it('스키마 위반 feature는 비0 종료코드로 거부한다', async () => {
    await runCli(['init', '--root', root]);
    const file = writeSpec('bad.json', { slug: 'Bad Slug', title: '' });
    let captured = '';
    const code = await runCli(['feature', '--root', root, '--file', file], (s) => (captured += s));
    expect(code).toBe(1);
    expect(captured).toContain('error');
  });

  it('중복 slug feature는 비0 종료코드로 거부한다', async () => {
    await runCli(['init', '--root', root]);
    const first = writeSpec('a.json', { slug: 'dup', title: 'A' });
    await runCli(['feature', '--root', root, '--file', first]);
    const second = writeSpec('b.json', { slug: 'dup', group: 'other', title: 'B' });
    let captured = '';
    const code = await runCli(
      ['feature', '--root', root, '--file', second],
      (s) => (captured += s)
    );
    expect(code).toBe(1);
    expect(captured).toContain('Duplicate');
  });
});
