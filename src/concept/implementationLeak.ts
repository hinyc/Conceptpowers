// @concept:concept-scope
// src/concept/implementationLeak.ts
// 개념 본문에 남은 코드 표기(파일 경로·폴더 경로·함수 호출·붙여쓴 식별자)를 찾아낸다.
// 사람이 판단할 후보를 모으는 것이 목적이므로 결격이 아니라 경고로만 쓰인다 —
// 품질 최소치(quality.ts)의 통과 여부는 이 결과에 영향받지 않는다.
import type { Concept } from '../schema/concept.js';

export interface LeakFinding {
  /** 어느 본문 칸에서 나왔는지 (예: principle.immutableRules[0]) */
  field: string;
  /** 코드 표기로 보이는 조각 */
  token: string;
}

const CODE_EXTENSIONS =
  'ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|py|go|rs|java|kt|rb|php|sql|ya?ml|sh|toml';

// 앞선 패턴이 먼저 걸러내도록 "더 긴 표기"부터 나열한다.
const PATTERNS: readonly RegExp[] = [
  // 파일 경로 — 확장자로 끝난다 (앞에 폴더가 붙어도 통째로 잡는다)
  new RegExp(`(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+\\.(?:${CODE_EXTENSIONS})\\b`, 'g'),
  // 폴더 경로 — 확장자가 없으므로 슬래시 두 개 이상일 때만 경로로 본다
  // ("허용/금지"처럼 슬래시 하나로 짝을 이루는 우리말 표기를 잘못 잡지 않기 위해서다)
  /[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+){2,}/g,
  // 함수 호출 표기 — 여는 괄호 바로 앞이 영문 이름이고, 괄호 안이 영문일 때만
  // ("신호등(settled-status)"처럼 우리말 뒤에 붙은 괄호 설명은 호출 표기가 아니다)
  /[A-Za-z_$][A-Za-z0-9_$]*\([A-Za-z0-9_$,.'"\s-]*\)/g,
  // 붙여쓴 영문 이름 — 대문자 마디가 섞인 표기
  /[a-z][a-z0-9]*(?:[A-Z][A-Za-z0-9]*)+|[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+/g,
];

// 코드 이름이 아니라 일상적으로 쓰는 고유명사는 후보에서 뺀다.
const NOT_CODE = new Set(['JavaScript', 'TypeScript', 'GitHub', 'GitLab', 'YouTube', 'iPhone']);

interface Span {
  readonly start: number;
  readonly end: number;
  readonly token: string;
}

function overlaps(spans: readonly Span[], start: number, end: number): boolean {
  return spans.some((s) => start < s.end && end > s.start);
}

function scanText(text: string): readonly string[] {
  const spans = PATTERNS.reduce<readonly Span[]>((claimed, pattern) => {
    const found = [...text.matchAll(pattern)].reduce<readonly Span[]>((acc, m) => {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      const taken = [...claimed, ...acc];
      if (NOT_CODE.has(m[0]) || overlaps(taken, start, end)) return acc;
      return [...acc, { start, end, token: m[0] }];
    }, []);
    return [...claimed, ...found];
  }, []);

  return [...spans].sort((a, b) => a.start - b.start).map((s) => s.token);
}

/** 본문 칸 하나를 훑어 코드 표기 후보를 만든다. */
function scanField(field: string, text: string): readonly LeakFinding[] {
  return scanText(text).map((token) => ({ field, token }));
}

/** 여러 줄짜리 칸은 줄마다 자리 이름에 번호를 붙인다. */
function scanList(field: string, items: readonly string[]): readonly LeakFinding[] {
  return items.flatMap((text, i) => scanField(`${field}[${i}]`, text));
}

/**
 * 개념 본문(설명·목적·행동·원칙)에서 코드 표기를 찾아낸다.
 * 코드 연결 목록·이름표·제목·별칭·관계는 코드를 가리키라고 있는 자리이므로 검사하지 않는다.
 */
export function findImplementationLeaks(concept: Concept): readonly LeakFinding[] {
  const { description: d, purpose: p, actions: a, principle: r, state: s } = concept;
  return [
    ...scanField('description.definition', d.definition),
    ...scanField('description.analogy', d.analogy),
    ...scanList('description.components', d.components),
    ...scanField('description.example', d.example),
    ...scanList('state.managed', s.managed),
    ...scanField('purpose.reason', p.reason),
    ...scanList('purpose.benefits', p.benefits),
    ...scanField('purpose.vision', p.vision),
    ...scanList('purpose.painPoints', p.painPoints),
    ...scanList('actions.allow', a.allow),
    ...scanList('actions.restrict', a.restrict),
    ...scanField('actions.interaction', a.interaction),
    ...scanList('principle.immutableRules', r.immutableRules),
    ...scanField('principle.operationalPrinciple', r.operationalPrinciple),
    ...scanField('principle.tradeoffs', r.tradeoffs),
    ...scanList('principle.lifecycle', r.lifecycle),
  ];
}

/** 경고 문구로 옮긴다 — 사람이 판단할 후보라는 점을 문구에 남긴다. */
export function describeLeak(leak: LeakFinding): string {
  return `개념 본문에 코드 표기로 보이는 말이 있습니다 — ${leak.field}: "${leak.token}" (괄호 안 참고 표기라 문장이 그대로 성립한다면 그대로 두어도 됩니다)`;
}
