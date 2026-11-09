// @concept:output-locale @concept:governance-mode
// tests/hooks/gateLocale.test.ts
// 커밋 게이트·훅이 사람에게 보이는 사유(permissionDecisionReason)의 언어를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다" + 적용 대상 "사용자에게 보이는 안내
//    (커밋을 막거나 진행 여부를 물을 때 사람에게 보이는 사유 포함)"
//    → en 프로젝트: 질문·차단·확정 불가·기록 명령·설정 직접 수정 사유에 한글이 없다
//    → ko 프로젝트: 같은 상황의 사유가 한국어로 나온다
//    → init.json에 locale 키가 없는 기존 프로젝트도 ko로 나온다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUse, decidePreToolUseSafe } from '../../src/hooks/preToolUse.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

const HANGUL = /[가-힣]/;
let root: string;
const initFile = () => join(root, 'docs/conceptpowers/init.json');

async function project(
  locale: 'ko' | 'en' | 'absent',
  enforcement: 'strict' | 'standard' | 'light'
): Promise<void> {
  await scaffoldInit(root, { locale: locale === 'absent' ? 'ko' : locale, enforcement });
  const cfg = JSON.parse(readFileSync(initFile(), 'utf8'));
  if (locale === 'absent') delete cfg.locale;
  writeFileSync(initFile(), JSON.stringify(cfg, null, 2));
  execSync('git add -A && git -c user.email=t@t -c user.name=T commit -q -m base', { cwd: root });
}

function write(rel: string, text: string): void {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-loc-'));
  execSync('git init -q', { cwd: root });
});

const reasonOf = (r: Awaited<ReturnType<typeof decidePreToolUse>>): string =>
  r?.hookSpecificOutput.permissionDecisionReason ?? '';

async function commitReason(files: string[], command = 'git commit -m x'): Promise<string> {
  return reasonOf(
    await decidePreToolUse(root, { tool: 'Bash', input: { command }, changedFiles: files })
  );
}

describe('게이트 사유의 언어 (en)', () => {
  it('standard: 개념 없는 코드 질문이 영어다', async () => {
    await project('en', 'standard');
    write('src/a.ts', 'export const a = 1;\n');
    const reason = await commitReason(['src/a.ts']);
    expect(reason).toContain('Code without a concept');
    expect(reason).toContain('Commit anyway?');
    expect(reason).not.toMatch(HANGUL);
  });
  it('strict: 차단 사유가 영어다', async () => {
    await project('en', 'strict');
    write('src/a.ts', '// @concept:ghost\nexport const a = 1;\n');
    const r = await decidePreToolUse(root, {
      tool: 'Bash',
      input: { command: 'git commit -m x' },
      changedFiles: ['src/a.ts'],
    });
    expect(r?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(reasonOf(r)).toContain('[GOVERNANCE DENY]');
    expect(reasonOf(r)).not.toMatch(HANGUL);
  });
  it('거버넌스 설정이 커밋에 들어오면 영어로 묻는다', async () => {
    await project('en', 'light');
    const reason = await commitReason(['docs/conceptpowers/init.json']);
    expect(reason).toContain('governance settings');
    expect(reason).not.toMatch(HANGUL);
  });
  it('커밋될 파일을 확정할 수 없는 명령의 사유가 영어다 (해석기 사유 포함)', async () => {
    await project('en', 'standard');
    for (const command of [
      'git add -A && git commit -m x',
      'eval "git commit -m x"',
      'for i in 1 2; do git commit -m x; done',
      'git commit -p',
    ]) {
      const r = await decidePreToolUse(root, { tool: 'Bash', input: { command } });
      const reason = reasonOf(r);
      expect(reason, command).toContain('[COMMIT UNRESOLVED]');
      expect(reason, command).not.toMatch(HANGUL);
    }
  });
  it('판단 기록 명령 질문과 설정 직접 수정 질문이 영어다', async () => {
    await project('en', 'standard');
    const record = reasonOf(
      await decidePreToolUse(root, {
        tool: 'Bash',
        input: { command: 'node dist/cli.js attest-no-code my-concept --note x' },
      })
    );
    expect(record).toContain('[HUMAN RECORD]');
    expect(record).toContain('Proceed anyway?');
    expect(record).not.toMatch(HANGUL);
    const edit = reasonOf(
      await decidePreToolUse(root, { tool: 'Edit', input: { file_path: initFile() } })
    );
    expect(edit).toContain('[GOVERNANCE CONFIG]');
    expect(edit).not.toMatch(HANGUL);
  });
  it('게이트 자체가 무너졌을 때(안전 판정) 사유가 영어다', async () => {
    await project('en', 'strict');
    // 저장소가 아닌 곳에서 커밋하면 커밋될 트리를 만들지 못한다
    const bare = mkdtempSync(join(tmpdir(), 'cp-loc-bare-'));
    await scaffoldInit(bare, { locale: 'en', enforcement: 'strict' });
    const r = await decidePreToolUseSafe(bare, {
      tool: 'Bash',
      input: { command: 'git commit -m x' },
    });
    expect(r?.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(reasonOf(r)).toContain('[GATE FAILURE]');
    expect(reasonOf(r)).not.toMatch(HANGUL);
  });
});

describe('게이트 사유의 언어 (ko)', () => {
  it('ko 프로젝트는 지금과 같은 뜻의 한국어로 묻고 막는다', async () => {
    await project('ko', 'standard');
    write('src/a.ts', 'export const a = 1;\n');
    const reason = await commitReason(['src/a.ts']);
    expect(reason).toContain('개념 없는 코드');
    expect(reason).toContain('그래도 커밋하시겠습니까?');
  });
  it('ko strict: 차단 사유가 한국어다', async () => {
    await project('ko', 'strict');
    write('src/a.ts', '// @concept:ghost\nexport const a = 1;\n');
    const reason = await commitReason(['src/a.ts']);
    expect(reason).toContain('[GOVERNANCE DENY]');
    expect(reason).toContain('strict 모드에서는');
  });
  it('ko: 확정 불가·기록 명령·설정 수정 사유도 한국어다', async () => {
    await project('ko', 'standard');
    const unresolved = reasonOf(
      await decidePreToolUse(root, {
        tool: 'Bash',
        input: { command: 'git add -A && git commit -m x' },
      })
    );
    expect(unresolved).toContain('실행 전에 커밋될 파일을 확정할 수 없습니다');
    const record = reasonOf(
      await decidePreToolUse(root, {
        tool: 'Bash',
        input: { command: 'node dist/cli.js attest-no-code my-concept --note x' },
      })
    );
    expect(record).toContain('사람의 확인을 거쳐');
    expect(record).toContain('그래도 진행하시겠습니까?');
    const edit = reasonOf(
      await decidePreToolUse(root, { tool: 'Edit', input: { file_path: initFile() } })
    );
    expect(edit).toContain('거버넌스 설정 파일');
  });
  it('locale 키가 없는 기존 프로젝트는 한국어로 나온다', async () => {
    await project('absent', 'standard');
    write('src/a.ts', 'export const a = 1;\n');
    const reason = await commitReason(['src/a.ts']);
    expect(reason).toContain('개념 없는 코드');
  });
});
