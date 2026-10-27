// @concept:redteam-review
// tests/compat/redteamSkill.test.ts
// redteam 스킬 문서가 개념 redteam-review의 약속을 절차로 담고 있는지, 해당 절 안에서 확인한다.
// 시나리오마다 확인하는 규칙을 it 이름 앞 꼬리표로 밝힌다:
//  [불변1] "점검 전에 개념이 최신인지 확인하고, 점검 대상에 닿는 낡음이 있으면 사람에게 묻기 전에는 진행하지 않는다"
//  [불변2] "점검의 목적과 지적 범위를 점검할 때마다 사람에게 확인받는다"
//  [불변3] "고친 뒤에는 그 수정이 새 과잉·목적 이탈·중복을 만들지 않았는지 다시 확인한다"
//  [불변4] "규칙 위반이라는 판정은 개념에 적힌 규칙에 근거할 때만 내리고, … 개선 제안으로만 내놓는다"
//  [허용3/제한2] "사람이 고른 지적에 한해 고치는 것" / "사람이 고르지 않은 지적을 고치는 것"
//  [제한1] 반박 검증에서 기각된 지적을 보고하지 않고, 반박을 거치지 않은 지적은 미검증으로 밝혀서만 보인다
//  [제한3] "개념 없음으로 밝힌 코드를 어느 개념도 요구하지 않는다는 이유만으로 과잉으로 모는 것"
//  [제한4] "점검하는 동안 참고자료를 읽거나 개념을 고치는 것"
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join('skills', 'redteam');
const read = (rel: string) => readFileSync(join(DIR, rel), 'utf8');

// 제목에 `title`이 든 절을, 같은 깊이 이상의 다음 제목 전까지 잘라 낸다.
function section(text: string, title: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^#+ /.test(l) && l.includes(title));
  expect(start, `절 "${title}"이 없다`).toBeGreaterThanOrEqual(0);
  const depth = lines[start].match(/^#+/)![0].length;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => {
    const m = l.match(/^(#+) /);
    return m !== null && m[1].length <= depth;
  });
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

const skill = (title: string) => section(read('SKILL.md'), title);
const axes = (title: string) => section(read('references/axes.md'), title);

describe('redteam 스킬 문서', () => {
  it('[불변1] 0단계는 auto Stage 0 진단을 가리킨다', () => {
    const s = skill('0단계');
    expect(s).toContain('conceptpowers:auto');
    expect(s).toContain('Stage 0');
  });

  it('[불변1] 0단계는 기준점 없음(unlocked)을 최신으로 치지 않고 묻는다', () => {
    const s = skill('0단계');
    expect(s).toContain('unlocked');
    expect(s).toMatch(/unlocked[^\n]*묻/);
  });

  it('[불변2] 1단계는 목적과 함께 일반 품질 범위를 항상 묻는다', () => {
    const s = skill('1단계');
    expect(s).toContain('일반 품질');
    expect(s).toContain('항상 묻는다');
  });

  it('[불변4] 보고는 위반과 개선 제안을 나눈다', () => {
    const s = skill('5단계');
    expect(s).toContain('위반');
    expect(s).toContain('개선 제안');
  });

  it('[불변4] 리뷰어 결과 종류에 판단 불가 자리가 있다', () => {
    expect(axes('결과 형식')).toMatch(/종류:[^\n]*판단 불가/);
  });

  it('[허용3/제한2] 수정은 사람이 고른 항목만 한다', () => {
    expect(skill('6단계')).toContain('고른 항목만');
  });

  it('[불변3] 고친 뒤 과잉·목적 이탈·중복을 다시 본다', () => {
    const s = skill('6단계');
    for (const axis of ['과잉', '목적 이탈', '중복']) expect(s, axis).toContain(axis);
    expect(s).toContain('다시 본다');
  });

  it('[제한4] 개념 수정을 고르면 이번 점검은 거기서 끝낸다', () => {
    expect(skill('6단계')).toContain('이번 점검은 여기서 끝낸다');
  });

  it('[제한1] 반박자는 판정을 근거와 함께 돌려주고 기각된 지적은 버린다', () => {
    const a = axes('반박 검증 (4단계)');
    expect(a).toMatch(/판정:[^\n]*견딤[^\n]*기각/);
    expect(a).toContain('근거:');
  });

  it('[제한1] 반박을 거치지 않은 지적은 미검증으로 밝혀서만 보인다', () => {
    expect(axes('반박 검증 (4단계)')).toContain('미검증');
    expect(skill('5단계')).toContain('미검증');
  });

  it('[제한1] 서브에이전트가 없어도 반박은 축 리뷰를 마친 뒤 따로 한다', () => {
    expect(skill('서브에이전트가 없을 때')).toContain('따로');
  });

  it('[제한3] 개념 없음 코드는 개념 부재만으로 과잉이 아니다', () => {
    const a = axes('코드 분류표');
    expect(a).toContain('@concept:none');
    expect(a).toContain('과잉');
  });

  it('[제한4] 금지 절과 반박자 지시에 참고자료 읽기 금지가 있다', () => {
    expect(skill('Prohibited')).toContain('reference/');
    expect(axes('반박 검증 (4단계)')).toContain('reference/');
  });
});
