// @concept:redteam-review
// tests/compat/redteamSkill.test.ts
// redteam 스킬 문서가 개념 redteam-review의 약속을 절차로 담고 있는지 확인한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - 불변 "점검 전에 개념이 최신인지 확인하고, 대상에 닿는 낡음이 있으면 묻기 전에는 진행하지 않는다"
//    → SKILL.md 0단계가 auto의 Stage 0 진단을 가리킨다
//  - 불변 "점검의 목적과 지적 범위를 점검할 때마다 사람에게 확인받는다"
//    → SKILL.md가 일반 품질 범위를 항상 묻는다, 모드를 말하지 않으면 묻는다
//  - 불변 "규칙 위반 판정은 개념 규칙에만, 나머지는 개선 제안으로만"
//    → SKILL.md 보고가 위반과 개선 제안을 나눈다
//  - 제한 "반박 검증을 견디지 못한 지적을 보고하는 것"
//    → axes.md에 반박 상한과 미검증 표시가 있다, 서브에이전트가 없어도 반박을 따로 한다
//  - 제한 "개념 없음으로 밝힌 코드를 개념 부재만으로 과잉으로 모는 것"
//    → axes.md에 @concept:none 기준이 있다
//  - 제한 "점검하는 동안 참고자료를 읽거나 개념을 고치는 것"
//    → SKILL.md 금지 절에 reference/가 있다, 개념 수정은 update-concepts로 넘긴다
//  - 허용 "개념과 작업 목적에 비추어 지적하는 것" — 대상이 없거나 기준점이 없을 때도 빈 점검을 하지 않는다
//    → modes.md에 빈 대상·태그 없음 처리가 있다
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join('skills', 'redteam');
const read = (rel: string) => readFileSync(join(DIR, rel), 'utf8');
const skill = () => read('SKILL.md');

describe('redteam 스킬 문서', () => {
  it('스킬 파일과 절차 문서가 있다', () => {
    for (const rel of ['SKILL.md', 'references/axes.md', 'references/modes.md']) {
      expect(existsSync(join(DIR, rel)), rel).toBe(true);
    }
  });

  it('설명문에 사용자가 부르는 말이 있다', () => {
    const desc = skill().match(/^description:(.*)$/m)?.[1] ?? '';
    expect(desc).toContain('레드팀');
    expect(desc).toContain('redteam');
  });

  it('세 모드를 두고, 모드를 말하지 않으면 묻는다', () => {
    const s = skill();
    for (const mode of ['변경분', '개념 하나', '전체']) expect(s).toContain(mode);
    expect(s).toContain('모드를 말하지 않');
  });

  it('0단계가 auto의 Stage 0 진단을 가리킨다', () => {
    const s = skill();
    expect(s).toContain('conceptpowers:auto');
    expect(s).toContain('Stage 0');
  });

  it('일반 품질 범위를 매번 묻는다', () => {
    const s = skill();
    expect(s).toContain('일반 품질');
    expect(s).toContain('항상 묻는다');
  });

  it('보고가 위반과 개선 제안을 나눈다', () => {
    const s = skill();
    expect(s).toContain('위반');
    expect(s).toContain('개선 제안');
  });

  it('금지 절에 참고자료 읽기가 있다', () => {
    const prohibited = skill().split('## Prohibited')[1] ?? '';
    expect(prohibited).toContain('reference/');
  });

  it('겹치는 일은 기존 스킬로 넘긴다', () => {
    const s = skill();
    for (const ref of ['conceptpowers:review', 'conceptpowers:scan', 'conceptpowers:update-concepts']) {
      expect(s).toContain(ref);
    }
  });

  it('서브에이전트가 없을 때의 순차 절차가 있다', () => {
    expect(skill()).toContain('서브에이전트');
  });

  it('변경분 대상이 비거나 태그가 없을 때를 다룬다', () => {
    const m = read('references/modes.md');
    expect(m).toContain('대상이 비');
    expect(m).toContain('태그가 없');
  });

  it('다섯 축과 개념 없음 기준이 있다', () => {
    const a = read('references/axes.md');
    for (const axis of ['개념 준수', '레드팀 비판', '중복', '과잉·목적 이탈', '부작용']) {
      expect(a, axis).toContain(axis);
    }
    expect(a).toContain('@concept:none');
  });

  it('반박 검증에 상한과 미검증 표시가 있다', () => {
    const a = read('references/axes.md');
    expect(a).toContain('10');
    expect(a).toContain('미검증');
  });
});
