// @concept:governance-mode
// src/hooks/command/stagingReach.ts
// 커밋될 파일을 실행 전에 확정할 수 없는 명령이 디스크에만 있는 거버넌스 변경을 스테이징할 수 있는지 가늠한다 — 명령을
// 한 번 훑어 함께 낸다: 설정·판단 기록·개념 문서를 담을 수 있는가, 참고자료를 담을 수 있는가, 강제 추가(add -f)가 닿는
// 참고자료 경로, 설정 파일을 직접 담는가. 넓게 담을 수 있으면(git add -A·add .·commit -a·그 경로를 가리키는 add·무엇을
// 할지 모르는 다른 명령) 참이다. 좁게 경로를 지정한 스테이징뿐이면 거짓 — 디스크에만 있는 변경은 그 커밋에 들어가지
// 않으므로 묻지 않는다.
// 위치는 훅이 알려 준 작업 폴더에서 출발해(cd·pushd·git -C·서브셸 반영 — cd가 뒤 명령에 남는 방식은 커밋 판정과 같은
// dirEffects 규칙: 조건부 cd는 && 사슬이 끝나면 위치 불명, 파이프·백그라운드 cd는 위치 그대로) 절대경로로 따라가고, 경로는 저장소 루트 기준으로
// 정규화해 견준다. 작업 폴더를 모르면 루트에서 출발한다. 커밋 판정과 같은 원리로, git이 읽는 위치가 다른 저장소면 이
// 프로젝트를 스테이징하지 않고, 위치를 확정할 수 없거나 git이 답하지 못한 루트 밖이면 넓게 본다. 위치·경로·스테이징 범위를
// 판단할 수 없으면 담을 수 있는 쪽(묻는 쪽)으로 기운다. 다만 무시된 참고자료는 강제 추가로만 담기므로, 강제 추가 흔적(-f
// 옵션, 또는 그 자리에 올 수 있는 셸 확장)이 없으면 forcedReference는 비운다 — 커밋에 실제로 들어갈 파일 기준(governance-mode).
import { isAbsolute, resolve } from 'node:path';
import { parseShellCommand, type ShellSegment } from './shellWords.js';
import {
  ASSIGNMENT,
  CONTROL_WORDS,
  GIT_BUILTINS,
  SAME_SHELL_RUNNERS,
  gitGlobalEffects,
} from './commandKinds.js';
import {
  cdTarget,
  commandName,
  isDirMove,
  isGitName,
  unwrap,
  type Unwrapped,
} from './commitPlan.js';
import { expandGitAlias } from './gitAlias.js';
import { dirEffects, type DirEffect } from './dirFlow.js';
import type { PendingOptions } from '../gates/governanceFilesGate.js';
import { fallbackRelation, type RepoLocator, type RepoRelation } from './commitLocation.js';
import {
  NONE,
  gitReach,
  hasForceTrace,
  isBroadAddFlag,
  isForceFlag,
  mayNameConfig,
  merge,
  wide,
  type GitCall,
  type Place,
  type StagingReach,
} from './stagingGit.js';

export type { StagingReach };

const DIR_COMMANDS = new Set(['cd', 'pushd', 'popd']);
/** 셸 alias가 다시 셸 alias를 부를 수 있는 깊이 상한 */
const MAX_ALIAS_DEPTH = 5;

/** 절대 위치의 저장소가 루트의 저장소와 같은가(동기) — 미리 물어 둔 답을 쓴다 */
export type RelationOf = (dir: string) => RepoRelation;

interface Ctx {
  root: string;
  forceVars: boolean;
  relationOf: RelationOf;
  depth: number;
}

/** 명령 없는 변수 지정(GIT_DIR=…; 등)으로 바뀐 셸 변수 — 이미 내보낸 변수면 뒤 git에 닿는다(커밋 판정과 같게) */
interface GitEnv {
  repo: boolean;
  config: boolean;
  pathspec: boolean;
}

interface Walk {
  reach: StagingReach;
  /** 서브셸 깊이마다의 위치 — 마지막이 지금 위치 */
  places: Place[];
  /** 조건부 cd의 위치가 확정되는 마지막 구간과 그 깊이 */
  expiries: { until: number; depth: number }[];
  env: GitEnv;
}

// 무엇을 하는지 모르는 명령(감싼 명령·sh -c·xargs 등)은 무엇이든 담을 수 있다. 다만 무시된 참고자료는 강제 추가로만
// 담기므로, 그 안에 git add 흔적과 강제 추가(또는 셸 확장) 흔적이 함께 보일 때만 참고자료 폴더 전체를 강제 추가로 본다.
// git add 흔적과 넓은 스테이징 옵션(-A·-u 등)이나 설정 경로 글자가 함께 보이면 설정 파일을 직접 담는 것으로 본다.
function unknownReach(texts: string[], dynamic: boolean): StagingReach {
  const tokens = texts.flatMap((t) => t.split(/[\s'"`;&|()]+/)).filter(Boolean);
  const hasGit = tokens.some((t) => t === 'git' || t.endsWith('/git'));
  const hasAdd = tokens.some((t) => t === 'add' || t === 'stage');
  const force = tokens.some(isForceFlag) || dynamic;
  const explicit = tokens.some((t) => isBroadAddFlag(t) || (!t.startsWith('-') && namesConfig(t)));
  return wide(hasGit && hasAdd && force, hasGit && hasAdd && explicit);
}

// 낱말 글자에 설정 경로(docs/conceptpowers/init.json 또는 그 상위 폴더)가 보이는가 — 넓은 지정(.)은 빼고 본다.
const namesConfig = (token: string): boolean =>
  mayNameConfig(token) && /docs|conceptpowers|init\.json/i.test(token);

// 위치에서 폴더 글자로 옮긴 위치. 절대경로면 출발 위치를 몰라도 다시 정해진다.
function joinPlace(place: Place, to: string): Place {
  if (isAbsolute(to)) return resolve(to);
  return place === null ? null : resolve(place, to);
}

// cd·pushd 하나를 dirEffects 규칙대로 반영한다: 다른 프로세스면 그대로, 셸마다 다르면 위치 불명.
function movePlace(place: Place, name: string, cmd: Unwrapped, effect: DirEffect): Place {
  if (name === 'popd') return null;
  if (effect.kind === 'none') return place;
  const target = cdTarget(cmd.words.slice(1), cmd.dynamic.slice(1));
  return target === null || effect.kind === 'unknown' ? null : joinPlace(place, target);
}

// git이 읽는 위치를 저장소 관계에 맞춘다: 다른 저장소면 undefined(이 프로젝트를 스테이징하지 않음), git이 답하지 못한
// 루트 밖이면 위치 불명(null).
function placeFor(place: Place, ctx: Ctx): Place | undefined {
  if (place === null) return null;
  const relation = ctx.relationOf(place);
  if (relation === 'other') return undefined;
  return relation === 'unknown' ? null : place;
}

// git 전역 옵션(-C·--git-dir·-c core.worktree …)을 커밋 판정과 같은 풀이(gitGlobalEffects)로 반영한 git 호출의
// 담는 범위. 셸 확장 전역 옵션·하위 명령이면 null(판단 불가).
function gitStep(
  seg: ShellSegment,
  cmd: Unwrapped,
  place: Place,
  ctx: Ctx,
  env: GitEnv
): StagingReach | null {
  const args = cmd.words.slice(1);
  const dyn = cmd.dynamic.slice(1);
  const e = gitGlobalEffects(args, dyn);
  if (e.dynamic || e.at >= args.length || dyn[e.at]) return null;
  const located = cmd.repoEnv || env.repo || e.repo || e.unknownLocation || cmd.relocated;
  const moved = located ? null : placeFor(e.dirs.reduce<Place>(joinPlace, place), ctx);
  if (moved === undefined) return NONE;
  const sub = args[e.at];
  const value = GIT_BUILTINS.has(sub) ? undefined : new Map(e.aliases).get(sub);
  // 값을 알 수 없는 alias(줄바꿈이 든 값·--config-env)는 무엇이든 담을 수 있다 — 강제 추가 흔적은 옵션 글자에서 찾는다.
  if (value === undefined && (e.configInjected || env.config) && !GIT_BUILTINS.has(sub)) {
    return wide(args.some(hasForceTrace));
  }
  const icase = cmd.pathspecEnv || env.pathspec || e.icase;
  const at = { seg, place: moved, icase, ctx };
  const rest = args.slice(e.at + 1);
  const restDyn = dyn.slice(e.at + 1);
  if (value === undefined) return gitReach(ctx.root, callOf(at, sub, rest, restDyn));
  return aliasStep(at, value, rest, restDyn, args);
}

interface CallSite {
  seg: ShellSegment;
  place: Place;
  icase: boolean;
  ctx: Ctx;
}

// 주입된 alias는 커밋 판정과 같은 풀이(expandGitAlias)로 읽는다. 펼친 모양을 확정할 수 없으면 무엇이든 담을 수 있다.
function aliasStep(
  at: CallSite,
  value: string,
  rest: string[],
  restDyn: boolean[],
  args: string[]
): StagingReach | null {
  const expanded = expandGitAlias(value, rest, restDyn);
  if (expanded.kind === 'undecidable') return wide(args.some(hasForceTrace));
  // 셸 alias는 다른 셸에서 저장소 최상위를 출발점으로 실행된다 — 본문을 위치 불명에서 출발해 같은 방식으로 훑는다.
  if (expanded.kind === 'shell') return aliasShellReach(expanded.command, at.ctx);
  const [head, ...extra] = expanded.words;
  if (head === undefined) return NONE;
  const wordsDyn = [...expanded.dynamic.slice(1), ...restDyn];
  return gitReach(at.ctx.root, callOf(at, head, [...extra, ...rest], wordsDyn));
}

function aliasShellReach(command: string, ctx: Ctx): StagingReach | null {
  if (ctx.depth >= MAX_ALIAS_DEPTH) return null;
  return walkCommand(command, { ...ctx, depth: ctx.depth + 1 }, null);
}

function callOf(at: CallSite, sub: string, args: string[], dynamic: boolean[]): GitCall {
  return {
    sub,
    args,
    dynamic,
    place: at.place,
    icase: at.icase,
    uncertain: at.seg.substitutions.length > 0 || at.seg.dynamicWords.some(Boolean),
    substitutions: at.seg.substitutions,
    forceVars: at.ctx.forceVars,
  };
}

interface StepAt {
  place: Place;
  effect: DirEffect;
  env: GitEnv;
}

const withEnv = (env: GitEnv, cmd: Unwrapped): GitEnv => ({
  repo: env.repo || cmd.repoEnv,
  config: env.config || cmd.configEnv,
  pathspec: env.pathspec || cmd.pathspecEnv,
});

function segmentStep(
  seg: ShellSegment,
  ctx: Ctx,
  at: StepAt
): { reach: StagingReach; place: Place; env: GitEnv } {
  const { place, env } = at;
  const texts = [...seg.words, ...seg.substitutions];
  const uncertain = seg.substitutions.length > 0 || seg.dynamicWords.some(Boolean);
  const cmd = unwrap(seg);
  if (cmd.words.length === 0) {
    return { reach: uncertain ? unknownReach(texts, true) : NONE, place, env: withEnv(env, cmd) };
  }
  const name = cmd.dynamic[0] ? '' : commandName(cmd.words[0]);
  if (DIR_COMMANDS.has(name)) {
    const reach = seg.substitutions.length > 0 ? unknownReach(texts, true) : NONE;
    return { reach, place: movePlace(place, name, cmd, at.effect), env };
  }
  const reach = isGitName(name) ? gitStep(seg, cmd, place, ctx, env) : null;
  if (reach) return { reach, place, env };
  return {
    reach: unknownReach(texts, uncertain),
    place: SAME_SHELL_RUNNERS.has(name) || cmd.dynamic[0] ? null : place,
    env,
  };
}

// 이 구간 깊이에 맞춘 위치 목록: 깊어지면 바깥 위치를 이어받고, 얕아지면 서브셸 위치를 버린다.
function placesAt(places: Place[], depth: number): Place[] {
  const kept = places.slice(0, depth + 1);
  const top = kept[kept.length - 1] ?? null;
  return [...kept, ...Array<Place>(depth + 1 - kept.length).fill(top)];
}

// 구간 하나를 반영한다. 조건부 cd의 && 사슬이 끝나면 그 깊이의 위치는 모르고, 서브셸을 닫는 구간 뒤에는 그 안에서
// 바꾼 위치가 남지 않는다.
function walkSegment(acc: Walk, seg: ShellSegment, k: number, effect: DirEffect, ctx: Ctx): Walk {
  const places = placesAt(acc.places, seg.depth);
  const step = segmentStep(seg, ctx, { place: places[places.length - 1], effect, env: acc.env });
  const updated = [...places.slice(0, -1), step.place];
  const expiries =
    effect.kind === 'conditional' && isDirMove(seg)
      ? [...acc.expiries, { until: effect.until, depth: seg.depth }]
      : acc.expiries;
  const ends = new Set(expiries.filter((e) => e.until === k).map((e) => e.depth));
  const expired = updated.map((p, i) => (ends.has(i) ? null : p));
  const closed = seg.connector === ')' && expired.length > 1 ? expired.slice(0, -1) : expired;
  return { reach: merge(acc.reach, step.reach), places: closed, expiries, env: step.env };
}

const segmentText = (seg: ShellSegment): string[] => [...seg.words, ...seg.substitutions];

// 반복문 변수가 강제 추가 옵션을 품을 수 있는가 — 반복 목록(for·select)이나, 파이프로 읽어 들이는 앞 명령
// (… | while read)에 -f 흔적이 보일 때만. 목록 값이 보통 파일 이름이면 옵션 자리에 오지 않는다.
function loopFeedsForce(segments: ShellSegment[], i: number): boolean {
  const seg = segments[i];
  const k = seg.words.findIndex((w, j) => !seg.dynamicWords[j] && CONTROL_WORDS.has(w));
  if (k === -1 || seg.words[k] === 'case') return false;
  const own = [...seg.words.slice(k + 1), ...seg.substitutions];
  if (own.some(hasForceTrace)) return true;
  if (seg.words[k] === 'for' || seg.words[k] === 'select') return false;
  let from = i;
  while (from > 0 && segments[from - 1].connector === '|') from -= 1;
  return segments.slice(from, i).flatMap(segmentText).some(hasForceTrace);
}

// 같은 명령에서 변수가 강제 추가 옵션을 품을 수 있는가 — -f를 담는 대입, 또는 -f가 보이는 반복 목록·파이프 입력.
function forceVariables(segments: ShellSegment[]): boolean {
  return segments.some(
    (seg, i) =>
      seg.words.some((w) => ASSIGNMENT.test(w) && hasForceTrace(w.slice(w.indexOf('=') + 1))) ||
      loopFeedsForce(segments, i)
  );
}

function walkCommand(command: string, base: Omit<Ctx, 'forceVars'>, start: Place): StagingReach {
  const parsed = parseShellCommand(command);
  if (parsed.incomplete || parsed.functionDefined || parsed.ambiguous) {
    return unknownReach([command], true);
  }
  const ctx: Ctx = { ...base, forceVars: forceVariables(parsed.segments) };
  const effects = dirEffects(parsed.segments);
  const init: Walk = {
    reach: NONE,
    places: [start],
    expiries: [],
    env: { repo: false, config: false, pathspec: false },
  };
  return parsed.segments.reduce((acc, seg, k) => walkSegment(acc, seg, k, effects[k], ctx), init)
    .reach;
}

// 미리 물어 보지 않았을 때의 저장소 관계 — 커밋 판정의 무응답 갈래와 같은 규칙(fallbackRelation).
const insideRoot =
  (root: string): RelationOf =>
  (dir) =>
    fallbackRelation(root, dir);

// 훅이 알려 준 작업 폴더(절대경로). 주지 않았거나 모르면(undefined·null) 루트에서 출발한다.
const startPlace = (root: string, cwd: string | null | undefined): string =>
  resolve(root, cwd ?? '.');

export function stagingReach(
  command: string,
  root: string,
  cwd?: string | null,
  relationOf: RelationOf = insideRoot(root)
): StagingReach {
  return walkCommand(command, { root, relationOf, depth: 0 }, startPlace(root, cwd));
}

const toOptions = (reach: StagingReach): PendingOptions => ({
  includeWorktree: reach.mayStageGovernance,
  referenceWorktree: reach.mayStageReference,
  forcedReference: reach.forcedReference,
  configExplicit: reach.configExplicit,
});

/** 확정할 수 없는 커밋 명령에서 문지기(checkPendingGovernance)가 모아 물을 범위 — stagingReach 결과를 옮긴다 */
export function pendingOptionsFor(
  command: string,
  root: string,
  cwd?: string | null,
  relationOf?: RelationOf
): PendingOptions {
  return toOptions(stagingReach(command, root, cwd, relationOf));
}

/**
 * 문지기용: git이 읽는 위치마다 저장소 관계를 실제로 물어(locator, 위치별 한 번) 모아 물을 범위를 낸다 — 다른 저장소의
 * 스테이징은 이 프로젝트의 디스크 변경을 담지 않는다.
 */
export async function pendingOptionsAt(
  command: string,
  root: string,
  cwd: string | null | undefined,
  locator: RepoLocator
): Promise<PendingOptions> {
  const places = new Set<string>();
  const fallback = insideRoot(root);
  stagingReach(command, root, cwd, (dir) => {
    places.add(dir);
    return fallback(dir);
  });
  const answers = await Promise.all(
    [...places].map(async (dir) => [dir, await locator.relationOf(dir)] as const)
  );
  const known = new Map(answers);
  return pendingOptionsFor(command, root, cwd, (dir) => known.get(dir) ?? fallback(dir));
}
