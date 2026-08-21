// @concept:plugin-version-sync @concept:atomic-baseline-write
// tests/init/ensureConfigDefaults.test.ts
// 설정 보충(ensureInitConfigDefaults)을 검증한다 — 자동 갱신이 어디까지 손대는지를 가르는 자리다.
// 검증 대상 규칙 ↔ 시나리오:
//  - plugin-version-sync 불변 "이미 존재하는 파일의 내용은 지우거나 바꾸지 않는다 — … 설정 파일은 빠진
//    항목만 기본값으로 채워 넣는다" → 빠진 항목을 채우고 채운 이름을 돌려준다
//  - plugin-version-sync 불변 "설정 파일에 이미 적힌 값은 무엇이든 그대로 보존한다 — 도구가 모르는
//    항목도 지우지 않는다" → 사람이 꺼둔 값을 되돌리지 않는다 / 모르는 항목을 지우지 않는다
//  - plugin-version-sync 불변 "채울 항목이 하나도 없으면 설정 파일을 다시 쓰지 않는다"
//    → 채울 항목이 없으면 파일을 한 글자도 건드리지 않는다
//    → init.json이 없으면 아무것도 만들지 않는다 / JSON이 깨졌거나 검증을 통과 못 하면 손대지 않는다
//  - atomic-baseline-write 불변 "저장 도중 실패하면 남은 임시 파일을 정리한다" → 임시파일 잔여물을 남기지 않는다
// 시나리오는 plugin-version-sync 개념의 규칙에서 도출했다(conceptDrivenTests).
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureInitConfigDefaults } from '../../src/init/ensureConfigDefaults.js';

let root: string;
let initPath: string;

function writeConfig(raw: unknown, indent = 2): void {
  mkdirSync(join(root, 'docs/conceptpowers'), { recursive: true });
  writeFileSync(initPath, JSON.stringify(raw, null, indent) + '\n');
}
function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(initPath, 'utf8'));
}

const minimal = { version: '0.1.0', enabled: true } as const;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
  initPath = join(root, 'docs/conceptpowers/init.json');
});

describe('ensureInitConfigDefaults', () => {
  // 규칙 검증: "설정 파일에 아직 없는 설정 항목만 기본값으로 추가하는 것" (allow)
  it('빠진 설정 항목을 기본값으로 채우고 채운 항목 이름을 돌려준다', async () => {
    writeConfig(minimal);
    const added = await ensureInitConfigDefaults(root);
    expect(added).toContain('conceptDrivenTests');
    expect(added).toContain('locale');
    const cfg = readConfig();
    expect(cfg.conceptDrivenTests).toBe(true);
    expect(cfg.locale).toBe('ko');
    expect(cfg.versionCheck).toBe(true);
    expect(cfg.backfillMode).toBe('incremental');
  });

  // 규칙 검증: "설정 파일에 이미 적힌 값을 바꾸거나 지우는 것" 금지 (restrict)
  it('사람이 꺼둔 값을 기본값으로 되돌리지 않는다', async () => {
    writeConfig({ ...minimal, conceptDrivenTests: false, versionCheck: false, locale: 'en' });
    const added = await ensureInitConfigDefaults(root);
    expect(added).not.toContain('conceptDrivenTests');
    const cfg = readConfig();
    expect(cfg.conceptDrivenTests).toBe(false);
    expect(cfg.versionCheck).toBe(false);
    expect(cfg.locale).toBe('en');
  });

  // 규칙 검증: "도구가 모르는 항목도 지우지 않는다" (immutableRule)
  it('도구가 모르는 항목을 지우지 않는다', async () => {
    writeConfig({ ...minimal, myCustomField: { keep: 'me' } });
    await ensureInitConfigDefaults(root);
    expect(readConfig().myCustomField).toEqual({ keep: 'me' });
  });

  // 규칙 검증: "채울 항목이 하나도 없으면 설정 파일을 다시 쓰지 않는다" (immutableRule)
  it('채울 항목이 없으면 파일을 한 글자도 건드리지 않는다', async () => {
    writeConfig(minimal);
    await ensureInitConfigDefaults(root); // 1회차: 전부 채운다
    const before = readFileSync(initPath, 'utf8');
    const added = await ensureInitConfigDefaults(root); // 2회차: 채울 것 없음
    expect(added).toEqual([]);
    expect(readFileSync(initPath, 'utf8')).toBe(before);
  });

  // 규칙 검증: 원자적 저장으로 깨진 설정이 남지 않는다 (atomic-baseline-write 연계)
  it('임시파일 잔여물을 남기지 않는다', async () => {
    writeConfig(minimal);
    await ensureInitConfigDefaults(root);
    const leftovers = readdirSync(join(root, 'docs/conceptpowers')).filter((f) =>
      f.endsWith('.tmp')
    );
    expect(leftovers).toEqual([]);
  });

  it('init.json이 없으면 아무것도 만들지 않는다', async () => {
    expect(await ensureInitConfigDefaults(root)).toEqual([]);
  });

  it('JSON이 깨져 있으면 손대지 않는다', async () => {
    mkdirSync(join(root, 'docs/conceptpowers'), { recursive: true });
    writeFileSync(initPath, '{ broken');
    expect(await ensureInitConfigDefaults(root)).toEqual([]);
    expect(readFileSync(initPath, 'utf8')).toBe('{ broken');
  });

  it('검증을 통과하지 못하는 설정은 손대지 않는다', async () => {
    writeConfig({ version: '0.1.0', enabled: true, locale: 'fr' });
    expect(await ensureInitConfigDefaults(root)).toEqual([]);
    expect(readConfig().conceptDrivenTests).toBeUndefined();
  });
});
