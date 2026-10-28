// @concept:governance-mode
// src/hooks/command/dirFlow.ts
// 위치를 바꾸는 명령(cd·pushd)이 뒤 명령의 위치에 언제 남는지 가리는 규칙 하나 — 커밋 판정(commitPlan)과 스테이징
// 가늠(stagingReach)이 함께 쓴다. 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사하므로(governance-mode), 실행될지
// 확실하지 않은 위치 이동을 확실한 것처럼 따라가지 않는다:
//  - 조건 없이 현재 셸에서 실행되는 cd(`cd X && …`·`cd X; …`)만 뒤 명령의 위치를 확정한다.
//  - && / || 뒤·if·반복문 블록 안·백그라운드 목록 안의 cd는 같은 && 사슬 안에서만 확정하고, 사슬이 끝나면 위치 불명이다.
//  - 파이프 앞쪽·백그라운드의 cd는 다른 프로세스에서 실행돼 위치를 바꾸지 않는다. 파이프 마지막은 셸마다 달라(zsh는
//    현재 셸) 위치 불명이다.
//  - 괄호 서브셸 안의 cd는 그 서브셸 안에서만 따라가고, 괄호가 닫히면 호출 측이 되돌린다.
import type { Connector, ShellSegment } from './shellWords.js';
import { RESERVED_WORDS } from './commandKinds.js';

export type DirEffect =
  /** 현재 셸에서 조건 없이 실행 — 뒤 명령의 위치가 바뀐다 */
  | { kind: 'apply' }
  /** 조건부 — until 구간까지(같은 && 사슬)만 확정, 그 뒤는 위치 불명 */
  | { kind: 'conditional'; until: number }
  /** 다른 프로세스에서 실행 — 위치 그대로 */
  | { kind: 'none' }
  /** 셸마다 다름 — 위치 불명 */
  | { kind: 'unknown' };

const APPLY: DirEffect = { kind: 'apply' };
const NONE: DirEffect = { kind: 'none' };
const UNKNOWN: DirEffect = { kind: 'unknown' };
const BLOCK_OPEN = new Set(['if', 'while', 'until', 'for', 'select', 'case']);
const BLOCK_CLOSE = new Set(['fi', 'done', 'esac']);
const AND_OR = new Set<Connector | undefined>(['&&', '||']);

// 구간 앞머리의 예약어가 여닫는 블록(if·반복문) 깊이 변화.
function blockDelta(seg: ShellSegment): number {
  let delta = 0;
  for (let k = 0; k < seg.words.length && !seg.dynamicWords[k]; k++) {
    const w = seg.words[k];
    if (BLOCK_OPEN.has(w)) delta += 1;
    else if (BLOCK_CLOSE.has(w)) delta -= 1;
    else if (!RESERVED_WORDS.has(w)) break;
  }
  return delta;
}

// j 구간 앞에서 깊이 d의 구분자 — 안쪽 서브셸에서 돌아오거나 새 서브셸을 열 때만 낸다(그 밖은 앞 구간의 connector).
function levelJoin(segs: ShellSegment[], j: number, d: number): Connector | undefined {
  const s = segs[j];
  if (segs[j - 1].depth <= d) return undefined;
  return s.depth === d || (s.depth === d + 1 && s.opened) ? s.joinedBy : undefined;
}

// 같은 괄호 깊이에서 k 구간이 속한 목록을 따라가, && 사슬이 끝나는 구간(andEnd)과 목록을 끝내는 구분자를 낸다.
// 안쪽 서브셸은 건너뛰고, 그 앞뒤의 구분자는 joinedBy로 읽는다.
function scanList(segs: ShellSegment[], k: number): { andEnd: number; end: Connector } {
  const d = segs[k].depth;
  let andEnd = -1;
  const mark = (j: number) => {
    if (andEnd < 0) andEnd = j;
  };
  for (let j = k; j < segs.length; j++) {
    const s = segs[j];
    if (j > k && s.depth < d) {
      mark(j - 1);
      return { andEnd, end: ')' };
    }
    const back = j > k ? levelJoin(segs, j, d) : undefined;
    if (back !== undefined && back !== '&&') mark(j - 1);
    if (back !== undefined && !AND_OR.has(back)) return { andEnd, end: back };
    if (s.depth !== d) continue;
    if (s.connector !== '&&') mark(j);
    if (!AND_OR.has(s.connector)) return { andEnd, end: s.connector };
  }
  mark(segs.length - 1);
  return { andEnd, end: 'end' };
}

function effectAt(segs: ShellSegment[], k: number, inBlock: boolean): DirEffect {
  const seg = segs[k];
  if (seg.connector === '|' || seg.connector === '&') return NONE;
  const join = seg.opened ? '(' : seg.joinedBy;
  if (join === '|') return UNKNOWN;
  const { andEnd, end } = scanList(segs, k);
  if (inBlock || AND_OR.has(join) || end === '&') return { kind: 'conditional', until: andEnd };
  return APPLY;
}

/** 구간마다, 그 구간의 위치 이동(cd·pushd)이 뒤 명령의 위치에 남는 방식 */
export function dirEffects(segs: ShellSegment[]): DirEffect[] {
  return segs.reduce<{ depth: number; out: DirEffect[] }>(
    (acc, seg, k) => {
      const depth = Math.max(0, acc.depth + blockDelta(seg));
      return { depth, out: [...acc.out, effectAt(segs, k, depth > 0)] };
    },
    { depth: 0, out: [] }
  ).out;
}
