// @concept:none
// tests/compat/superpowers.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SUPERPOWERS_SKILLS = new Set([
  'brainstorming',
  'writing-plans',
  'executing-plans',
  'subagent-driven-development',
  'test-driven-development',
  'systematic-debugging',
  'using-superpowers',
  'writing-skills',
  'requesting-code-review',
  'receiving-code-review',
  'verification-before-completion',
  'finishing-a-development-branch',
  'using-git-worktrees',
  'dispatching-parallel-agents',
]);

function skillEntries(): Array<{ dir: string; name: string }> {
  const dir = 'skills';
  return readdirSync(dir)
    .filter((d) => existsSync(join(dir, d, 'SKILL.md')))
    .map((d) => {
      const m = readFileSync(join(dir, d, 'SKILL.md'), 'utf8').match(/name:\s*(.+)/);
      return { dir: d, name: m ? m[1].trim() : '' };
    });
}

describe('superpowers 호환', () => {
  // 스킬 이름은 플러그인 네임스페이스(conceptpowers:<name>)가 접두사 역할을 하므로
  // 이름 자체에 conceptpowers- 접두사를 중복해 붙이지 않는다 (표시가 두 배로 길어짐).
  it('스킬 이름에 conceptpowers- 접두사를 중복하지 않는다', () => {
    for (const { name } of skillEntries()) expect(name.startsWith('conceptpowers-')).toBe(false);
  });
  it('스킬 이름은 디렉터리 이름과 일치한다', () => {
    for (const { dir, name } of skillEntries()) expect(name).toBe(dir);
  });
  // 충돌 방지는 네임스페이스가 담당하지만, 혼동을 줄이기 위해
  // superpowers 스킬과 같은 이름은 여전히 피한다.
  it('superpowers 스킬 이름과 겹치지 않는다', () => {
    for (const { name } of skillEntries()) expect(SUPERPOWERS_SKILLS.has(name)).toBe(false);
  });
});
