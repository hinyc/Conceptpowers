// @concept:governance-mode
// src/hooks/command/commitPlan.ts
// Bash 명령이 커밋을 만드는지, 만든다면 무엇이 어디서 커밋되는지를 실행 전에 가려낸다. 명령 글자가 아니라 실제로
// 실행될 `git … commit` 호출을 찾되(예약어·래퍼·셸 -c·alias 경유 포함) 확실히 안전하다고 아는 것만 받아들인다:
// 커밋 앞에 파일·색인·설정을 바꾸거나 다른 명령을 실행할 수 있는 명령이 있거나, 커밋 인자·위치·저장소가 셸 확장으로
// 정해지거나, 반복문·함수·셸마다 다른 구문처럼 실행 순서를 알 수 없으면 unresolved — 게이트가 "검사한 척
// 통과"하지 않게 한다(governance-mode 불변).
import { parseShellCommand, type ShellSegment } from './shellWords.js';
import { analyzeCommitArgs, type CommitScope } from './commitArgs.js';
type CommitArgs = ReturnType<typeof analyzeCommitArgs>;
import {
  ASSIGNMENT,
  CODE_FLAGS,
  CONTROL_WORDS,
  DECLARE_COMMANDS,
  FILE_COMMANDS,
  GIT_CONFIG_ENV,
  gitGlobalEffects,
  GIT_PATHSPEC_ENV,
  GIT_REPO_ENV,
  PURE_COMMANDS,
  RELOCATING_FLAGS,
  RESERVED_WORDS,
  SAME_SHELL_RUNNERS,
  SHELLS,
  WRAPPERS,
  classifyGitCall,
  GIT_BUILTINS,
} from './commandKinds.js';
import { expandGitAlias } from './gitAlias.js';
import { dirEffects, type DirEffect } from './dirFlow.js';

export type { CommitScope };
/**
 * 커밋 하나가 실행될 위치. known이면 cwd는 출발 위치(훅 작업 폴더) 기준 폴더 글자(절대·상대 그대로, 없으면 출발 위치).
 * top이면 그 폴더가 아니라 그 폴더의 저장소 최상위다(셸 alias 본문은 git이 최상위에서 실행한다).
 * repoMayChange: 커밋 앞의 git 아닌 명령이 저장소 자체를 바꿀 수 있다 — 실행 전 디스크로 본 저장소 비교를 믿을 수 없다.
 * 위치를 확정할 수 없으면(source·셸 확장·~·저장소를 바꾸는 옵션·환경 변수·조건부 cd 등) known=false.
 */
export type CommitLocation =
  { known: true; cwd?: string; top?: true; repoMayChange?: true } | { known: false };
type KnownLocation = Extract<CommitLocation, { known: true }>;
export type CommitPlan =
  | { kind: 'none' }
  | { kind: 'commit'; scope: CommitScope; pathspecs: string[]; cwd?: string; top?: true }
  /** locations: 파일은 확정 못 했지만 위치를 아는 커밋들 — 없으면 위치 불명 */
  | { kind: 'unresolved'; reason: string; locations?: CommitLocation[] };
type Unresolved = Extract<CommitPlan, { kind: 'unresolved' }>;

export interface PlanDeps {
  resolveAlias?: (name: string) => Promise<string | null>;
}

const MAX_DEPTH = 5;

interface WalkState {
  command: string;
  found: CommitPlan | null;
  /** 지금까지 나온, 커밋될 파일을 바꿀 수 있는 명령(첫 사유) */
  impure: string | null;
  /** 지금까지 나온, 저장소 자체(.git)를 바꿀 수 있는 명령(첫 사유) — 색인만 바꾸는 git 명령은 빼고 */
  repoChange: string | null;
  /** 해석하지 못한 자리(다른 명령에 넘긴 코드 등)에서 커밋을 실행할 수 있다는 흔적 */
  netHit: string | null;
  /** 커밋 흔적이 있으면 확정 불가로 만드는 구조(반복문·함수 정의·셸마다 다른 구문·닫히지 않은 구문) */
  risky: string | null;
  cwd: string | undefined;
  cwdUnknown: boolean;
  /** 위치가 cwd 자체가 아니라 cwd의 저장소 최상위다(셸 alias 본문) */
  atTop: boolean;
  repoEnv: boolean;
  configChanged: boolean;
  pathspecEnv: boolean;
  /** 지금까지 찾은 커밋들의 위치 */
  locations: CommitLocation[];
  /** 위치는 알지만 파일을 확정하지 못한 커밋의 첫 사유 — 뒤의 커밋 위치도 마저 모은다 */
  pending: string | null;
}

interface Ctx {
  state: WalkState;
  deps: PlanDeps;
  depth: number;
  /** 셸 확장(eval·명령 치환) 안에서 실행되는가 */
  dynamic: boolean;
  /** 지금 구간의 위치 이동(cd·pushd)이 뒤 명령의 위치에 남는 방식(dirEffects) */
  dir?: DirEffect;
}

/** 서브셸 깊이마다 되돌릴 위치 */
type Frame = Pick<WalkState, 'cwd' | 'cwdUnknown' | 'atTop'>;
/** 조건부 cd의 위치가 확정되는 마지막 구간 — 그 뒤는 그 깊이의 위치 불명 */
interface Expiry {
  until: number;
  depth: number;
}

export interface Unwrapped {
  words: string[];
  dynamic: boolean[];
  repoEnv: boolean;
  configEnv: boolean;
  pathspecEnv: boolean;
  /** 감싼 래퍼가 실행 위치를 바꾼다(sudo -D 등) */
  relocated: boolean;
}

const unresolved = (reason: string): Unresolved => ({ kind: 'unresolved', reason });
export const commandName = (word: string) => word.replace(/^=/, '').split('/').pop() ?? word;
export const isGitName = (word: string) => ['git', 'git.exe'].includes(commandName(word));
const joinPath = (base: string | undefined, next: string) =>
  next.startsWith('/') || !base ? next : `${base}/${next}`;
const deeper = (ctx: Ctx, dynamic = ctx.dynamic): Ctx => ({
  ...ctx,
  depth: ctx.depth + 1,
  dynamic,
});

// 글 안에 git 다음 commit이 나오는가(따옴표·역슬래시를 지운 뒤, 선형 시간).
function looksLikeCommit(text: string): boolean {
  const plain = text.replace(/["'\\]/g, '');
  const at = plain.search(/\bgit\b/);
  return at >= 0 && /\bcommit\b/.test(plain.slice(at));
}

// repoSafe: 색인만 바꾸고 저장소 자체(.git)는 바꾸지 못하는 명령(git add 등).
function markImpure(state: WalkState, why: string, repoSafe = false): void {
  state.impure ??= why;
  if (!repoSafe) state.repoChange ??= why;
}

export async function planCommit(command: string, deps: PlanDeps = {}): Promise<CommitPlan> {
  const state: WalkState = {
    command,
    found: null,
    impure: null,
    repoChange: null,
    netHit: null,
    risky: null,
    cwd: undefined,
    cwdUnknown: false,
    atTop: false,
    repoEnv: false,
    configChanged: false,
    pathspecEnv: false,
    locations: [],
    pending: null,
  };
  const early = await walk(command, { state, deps, depth: 0, dynamic: false });
  if (early) return early;
  const committed = state.found || state.pending;
  if (state.risky && (committed || looksLikeCommit(command))) return unresolved(state.risky);
  // 다른 명령이 실행하는 커밋 흔적이 있으면 그 커밋의 위치는 모른다 — 위치 목록을 싣지 않는다.
  if (state.pending) {
    return state.netHit
      ? unresolved(state.pending)
      : { kind: 'unresolved', reason: state.pending, locations: state.locations };
  }
  if (state.found) return state.found;
  if (state.netHit) return unresolved(state.netHit);
  return { kind: 'none' };
}

const frameOf = (s: WalkState): Frame => ({ cwd: s.cwd, cwdUnknown: s.cwdUnknown, atTop: s.atTop });

function restore(state: WalkState, f: Frame): void {
  state.cwd = f.cwd;
  state.cwdUnknown = f.cwdUnknown;
  state.atTop = f.atTop;
}

// 다른 프로세스(셸 -c·명령 치환·셸 alias)에서 실행되는 코드 — 그 안의 cd는 뒤 명령의 위치에 남지 않는다.
async function walkChild(text: string, ctx: Ctx): Promise<Unresolved | null> {
  const saved = frameOf(ctx.state);
  const r = await walk(text, ctx);
  restore(ctx.state, saved);
  return r;
}

// 구간의 괄호 깊이에 맞춘다: 깊어지면 바깥 위치를 쌓고, 얕아지면 그 깊이의 위치로 되돌린다.
function syncDepth(state: WalkState, frames: Frame[], depth: number): Frame[] {
  if (frames.length < depth) {
    return [...frames, ...Array<Frame>(depth - frames.length).fill(frameOf(state))];
  }
  if (frames.length > depth) {
    restore(state, frames[depth]);
    return frames.slice(0, depth);
  }
  return frames;
}

// 조건부 cd의 && 사슬이 끝났다 — 그 깊이의 위치는 이제 모른다.
function expire(state: WalkState, frames: Frame[], depth: number): Frame[] {
  if (depth === frames.length) state.cwdUnknown = true;
  return frames.map((f, i) => (i === depth ? { ...f, cwdUnknown: true } : f));
}

/** 위치를 옮기는 구간(cd·pushd)인가 — 조건부 cd의 사슬 끝을 챙길 때 쓴다(스테이징 가늠과 같은 판정) */
export function isDirMove(seg: ShellSegment): boolean {
  const cmd = unwrap(seg);
  return !cmd.dynamic[0] && ['cd', 'pushd'].includes(commandName(cmd.words[0] ?? ''));
}

function markParseRisk(state: WalkState, parsed: ReturnType<typeof parseShellCommand>): void {
  if (parsed.incomplete) state.risky ??= '셸마다 다르게 읽힐 수 있는 닫히지 않은 따옴표·치환';
  if (parsed.functionDefined) state.risky ??= '함수 정의가 있는 명령';
  if (parsed.ambiguous) state.risky ??= '셸마다 다르게 읽히는 구문(명령 자리의 산술식)';
}

// 괄호 서브셸 안의 cd는 따라가고 괄호가 닫히면 되돌린다. cd가 뒤 명령의 위치에 남는 방식은 dirEffects 규칙 하나로
// 정한다(조건부 cd는 && 사슬이 끝나면 위치 불명).
async function walk(command: string, ctx: Ctx): Promise<Unresolved | null> {
  const { state } = ctx;
  if (ctx.depth > MAX_DEPTH) {
    return looksLikeCommit(command) ? unresolved('명령 중첩이 너무 깊어 해석할 수 없음') : null;
  }
  const parsed = parseShellCommand(command);
  markParseRisk(state, parsed);
  const segs = parsed.segments;
  const effects = dirEffects(segs);
  let frames: Frame[] = [];
  let expiries: Expiry[] = [];
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    const effect = effects[k];
    frames = syncDepth(state, frames, seg.depth);
    const r = await visitWhole(segs, k, { ...ctx, dir: effect });
    if (r) return r;
    if (effect.kind === 'conditional' && isDirMove(seg)) {
      expiries = [...expiries, { until: effect.until, depth: seg.depth }];
    }
    for (const e of expiries.filter((x) => x.until === k)) frames = expire(state, frames, e.depth);
    if (seg.connector === ')') frames = syncDepth(state, frames, Math.max(0, frames.length - 1));
  }
  return null;
}

// 구간 하나: 명령 치환을 먼저 훑고 명령을 본다. 새로 찾은 확정 커밋은 동시에 도는 명령이 없어야 한다.
async function visitWhole(segs: ShellSegment[], k: number, ctx: Ctx): Promise<Unresolved | null> {
  const { state } = ctx;
  const seg = segs[k];
  for (const inner of seg.substitutions) {
    const r = await walkChild(inner, deeper(ctx, true));
    if (r) return r;
  }
  const foundBefore = state.found;
  const r = await visitSegment(seg, ctx);
  if (seg.writes) markImpure(state, '파일에 쓰는 리다이렉션');
  if (r) return r;
  if (!foundBefore && state.found) {
    const clash = concurrentClash(segs, k);
    if (clash) return unresolved(clash);
  }
  return null;
}

const CLASH = '파이프·백그라운드로 커밋과 동시에 실행되는 명령';
const isConcurrent = (c: string | undefined) => c === '|' || c === '&';
// j 구간 앞의 구분자 — 괄호를 닫은 뒤면 닫은 다음의 구분자.
const connectorBefore = (segs: ShellSegment[], j: number) =>
  segs[j - 1].connector === ')' ? segs[j].joinedBy : segs[j - 1].connector;

// 커밋과 파이프·백그라운드로 동시에 실행되는 뒤쪽 명령이 순수하지 않으면 경합으로 커밋 파일이 달라질 수 있다.
// 서브셸 안 커밋은 그 서브셸이 통째로 파이프·백그라운드일 수 있으므로, 뒤에서 처음 동시 실행이 시작되는 곳부터 본다.
function concurrentClash(segs: ShellSegment[], k: number): string | null {
  if (segs[k].depth > 0) {
    const from = segs.findIndex((_, j) => j > k && isConcurrent(connectorBefore(segs, j)));
    return from >= 0 && segs.slice(from).some((s) => !isPureSegment(s)) ? CLASH : null;
  }
  for (let j = k; segs[j] && isConcurrent(segs[j].connector); j++) {
    const next = segs[j + 1];
    if (next && !isPureSegment(next)) return CLASH;
  }
  return null;
}

function isPureSegment(seg: ShellSegment): boolean {
  const { words, dynamic } = unwrap(seg);
  if (words.length === 0) return seg.substitutions.length === 0;
  return (
    !dynamic[0] &&
    PURE_COMMANDS.has(commandName(words[0])) &&
    !seg.writes &&
    seg.substitutions.length === 0
  );
}

// 앞쪽의 예약어·환경 변수 지정·래퍼를 걷어내 실제로 실행될 명령을 드러낸다.
export function unwrap(seg: ShellSegment): Unwrapped {
  const words = [...seg.words];
  const dynamic = [...seg.dynamicWords];
  const env = { repoEnv: false, configEnv: false, pathspecEnv: false, relocated: false };
  const shift = () => {
    words.shift();
    dynamic.shift();
  };
  while (words.length > 0) {
    const w = words[0];
    if (ASSIGNMENT.test(w)) {
      env.repoEnv ||= GIT_REPO_ENV.test(w);
      env.configEnv ||= GIT_CONFIG_ENV.test(w);
      env.pathspecEnv ||= GIT_PATHSPEC_ENV.test(w);
      shift();
      continue;
    }
    if (dynamic[0]) break;
    if (RESERVED_WORDS.has(w)) {
      shift();
      continue;
    }
    const name = commandName(w);
    const flags = WRAPPERS[name];
    const envRunsElsewhere =
      name === 'env' && words.some((x) => /^(-S|-C|--split-string|--chdir)/.test(x));
    if (!flags || envRunsElsewhere) break;
    shift();
    while (words.length > 0 && words[0].startsWith('-')) {
      const flag = words[0];
      env.relocated ||= RELOCATING_FLAGS[name]?.(flag) ?? false;
      shift();
      if (flags.has(flag)) shift();
    }
  }
  return { words, dynamic, ...env };
}

async function visitSegment(seg: ShellSegment, ctx: Ctx): Promise<Unresolved | null> {
  const { state } = ctx;
  if (seg.words.some((w, k) => !seg.dynamicWords[k] && CONTROL_WORDS.has(w))) {
    state.risky ??= '반복문·분기문 안에서 실행되는 명령';
  }
  const cmd = unwrap(seg);
  if (cmd.words.length === 0) {
    // 명령 없는 변수 지정도 셸 변수를 바꾼다 — 이미 내보낸 변수면 뒤 git에 닿는다(서브셸 안이어도 그 안의 git에 닿는다).
    markGitEnv(state, cmd);
    return null;
  }
  if (cmd.dynamic[0]) {
    markImpure(state, '셸 확장으로 정해지는 명령');
    state.cwdUnknown = true; // 무엇이든(cd 포함) 될 수 있다 — 서브셸 안이면 괄호가 닫힐 때 되돌린다
    return cmd.words.includes('commit') ? unresolved('셸 확장으로 정해지는 명령 속 커밋') : null;
  }
  const name = commandName(cmd.words[0]);
  // 현재 셸에서 읽어 실행하는 스크립트(source·.)는 실행 위치를 바꿀 수 있다.
  if (SAME_SHELL_RUNNERS.has(name) && name !== 'eval') state.cwdUnknown = true;
  const args = cmd.words.slice(1);
  const argsDyn = cmd.dynamic.slice(1);

  if (name === 'cd' || name === 'pushd') {
    moveDirectory(state, args, argsDyn, ctx.dir);
    return null;
  }
  if (name === 'popd') {
    state.cwdUnknown = true;
    return null;
  }
  if (DECLARE_COMMANDS.has(name)) {
    state.repoEnv ||= args.some((a) => GIT_REPO_ENV.test(a));
    state.configChanged ||= args.some((a) => GIT_CONFIG_ENV.test(a));
    state.pathspecEnv ||= args.some((a) => GIT_PATHSPEC_ENV.test(a));
    return null;
  }
  if (name === 'eval') {
    markImpure(state, '셸 확장(eval)');
    return walk(args.join(' '), deeper(ctx, true));
  }
  if (SHELLS.has(name)) return visitShell(seg, args, argsDyn, ctx);
  if (isGitName(name)) {
    return visitGit(args, argsDyn, cmd, ctx, new Map());
  }
  if (PURE_COMMANDS.has(name)) return null;
  markImpure(state, '커밋될 파일을 바꾸거나 다른 명령을 실행할 수 있는 명령');
  if (!FILE_COMMANDS.has(name)) scanExecutor(seg, cmd, state);
  return null;
}

// 인자를 명령으로 실행할 수 있는 명령(xargs·find -exec·timeout·인터프리터 …) 속의 커밋 흔적.
// 단어 단위로 git 다음 commit(또는 셸 확장)이 오는지, 코드 문자열 자리(-c/-e/-S 값, heredoc 본문)에 git commit이
// 있는지만 본다 — 인자로 넘긴 설명 글(gh --body, grep 패턴) 속 글자는 커밋이 아니다.
function scanExecutor(seg: ShellSegment, cmd: Unwrapped, state: WalkState): void {
  const { words, dynamic } = cmd;
  const gitAt = words.findIndex((w, k) => k > 0 && !dynamic[k] && isGitName(w));
  if (
    gitAt > 0 &&
    words.slice(gitAt + 1).some((w, k) => w === 'commit' || dynamic[gitAt + 1 + k])
  ) {
    state.netHit ??= '다른 명령을 실행하는 명령 안의 git commit';
    return;
  }
  const codeTexts = [
    ...seg.heredocs,
    ...words.filter((_, k) => k > 0 && CODE_FLAGS.has(words[k - 1])),
  ];
  if (codeTexts.some(looksLikeCommit)) state.netHit ??= '다른 명령에 넘긴 코드 속 git commit';
}

function markGitEnv(state: WalkState, cmd: Unwrapped): void {
  state.repoEnv ||= cmd.repoEnv;
  state.configChanged ||= cmd.configEnv;
  state.pathspecEnv ||= cmd.pathspecEnv;
}

// cd·pushd 하나를 dirEffects 규칙대로 반영한다: 다른 프로세스면 그대로, 셸마다 다르면 위치 불명, 아니면 옮긴다(조건부의
// 사슬 끝은 walk가 처리). 저장소 최상위에서 출발한 셸 alias 본문의 상대 이동은 최상위를 몰라 위치 불명이다.
function moveDirectory(
  state: WalkState,
  args: string[],
  argsDyn: boolean[],
  effect: DirEffect = { kind: 'apply' }
): void {
  if (effect.kind === 'none') return;
  const target = cdTarget(args, argsDyn);
  if (effect.kind === 'unknown' || target === null || (state.atTop && !target.startsWith('/'))) {
    state.cwdUnknown = true;
    return;
  }
  state.cwd = joinPath(state.cwd, target);
  state.atTop = false;
}

/** cd·pushd 인자에서 옮겨 갈 폴더 글자. 확정할 수 없으면(인자 없음·-·~·셸 확장) null */
export function cdTarget(args: readonly string[], argsDyn: readonly boolean[]): string | null {
  const at = args.findIndex((a) => !a.startsWith('-') || a === '-');
  const target = at >= 0 ? args[at] : undefined;
  if (target === undefined || argsDyn[at] || target === '-' || target.startsWith('~')) return null;
  return target;
}

async function visitShell(
  seg: ShellSegment,
  args: string[],
  argsDyn: boolean[],
  ctx: Ctx
): Promise<Unresolved | null> {
  const flagAt = args.findIndex((w) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w));
  if (flagAt >= 0 && args[flagAt + 1] !== undefined) {
    return walkChild(args[flagAt + 1], deeper(ctx, ctx.dynamic || argsDyn[flagAt + 1]));
  }
  if (seg.heredocs.length > 0 && args.every((a) => a.startsWith('-'))) {
    for (const body of seg.heredocs) {
      const r = await walkChild(body, deeper(ctx));
      if (r) return r;
    }
    return null;
  }
  markImpure(ctx.state, '셸이 읽어 실행하는 스크립트');
  if (looksLikeCommit(ctx.state.command)) {
    ctx.state.netHit ??= '셸이 읽어 실행하는 입력 속 git commit';
  }
  return null;
}

interface GitGlobals {
  cwd: string | undefined;
  /** cwd의 저장소 최상위가 위치다(셸 alias 본문) */
  atTop: boolean;
  unknownLocation: boolean;
  repo: boolean;
  configInjected: boolean;
  pathspecMode: boolean;
  aliases: Map<string, string>;
  /** 하위 명령의 위치 */
  at: number;
}

function readGitGlobals(
  args: string[],
  dyn: boolean[],
  cmd: Unwrapped,
  state: WalkState,
  aliases: Map<string, string>
): GitGlobals {
  // 전역 옵션의 뜻 풀이는 스테이징 가늠(stagingReach)과 같은 함수 하나로 한다.
  const e = gitGlobalEffects(args, dyn);
  const at = gitDirs(state, e.dirs);
  return {
    ...at,
    unknownLocation: e.unknownLocation || cmd.relocated || at.unknownLocation,
    repo: cmd.repoEnv || state.repoEnv || e.repo,
    configInjected: cmd.configEnv || state.configChanged || e.configInjected,
    pathspecMode: cmd.pathspecEnv || state.pathspecEnv || e.pathspecMode,
    aliases: new Map([...aliases, ...e.aliases]),
    at: e.at,
  };
}

// -C로 옮긴 위치. 최상위를 모르는 셸 alias 본문에서는 상대 -C를 따라갈 수 없고, 절대 -C면 거기서 다시 정해진다.
function gitDirs(
  state: WalkState,
  dirs: string[]
): { cwd: string | undefined; atTop: boolean; unknownLocation: boolean } {
  const join = (base: string | undefined, list: string[]) =>
    list.reduce<string | undefined>((b, dir) => joinPath(b, dir), base);
  if (!state.atTop || dirs.length === 0) {
    return { cwd: join(state.cwd, dirs), atTop: state.atTop, unknownLocation: false };
  }
  const lastAbs = dirs.map((d) => d.startsWith('/')).lastIndexOf(true);
  if (lastAbs < 0) return { cwd: state.cwd, atTop: true, unknownLocation: true };
  return { cwd: join(undefined, dirs.slice(lastAbs)), atTop: false, unknownLocation: false };
}

async function visitGit(
  args: string[],
  dyn: boolean[],
  cmd: Unwrapped,
  ctx: Ctx,
  aliases: Map<string, string>
): Promise<Unresolved | null> {
  const { state } = ctx;
  const g = readGitGlobals(args, dyn, cmd, state, aliases);
  const sub = args[g.at];
  if (sub === undefined) return null;
  const rest = args.slice(g.at + 1);
  const restDyn = dyn.slice(g.at + 1);
  if (dyn[g.at]) {
    markImpure(state, '셸 확장으로 정해지는 git 명령');
    return unresolved('셸 확장으로 정해지는 git 하위 명령');
  }

  const kind = classifyGitCall(sub, rest);
  if (kind === 'unknown') return visitGitAlias(sub, args, dyn, cmd, ctx, g);
  if (kind === 'read') return null;
  if (kind === 'otherCommit') {
    return deferCommit(ctx, g, `git commit이 아닌 명령(git ${sub})이 만드는 커밋`);
  }
  if (kind === 'writeFiles') {
    markImpure(state, '파일을 쓰는 git 명령');
    return null;
  }
  if (kind === 'mutateConfig') {
    state.configChanged = true;
    markImpure(state, 'git 설정을 바꾸는 명령');
    return null;
  }
  if (kind === 'mutateIndex') {
    markImpure(state, '스테이징(색인)을 바꾸는 git 명령', true);
    return null;
  }
  if (kind === 'execute') {
    markImpure(state, '다른 명령을 실행할 수 있는 git 명령');
    if (rest.some(looksLikeCommit)) state.netHit ??= 'git이 실행하는 명령 속 git commit';
    return null;
  }
  return visitCommit(rest, restDyn, g, ctx);
}

// 커밋이 실행될 위치. 확정할 수 없으면 그 사유(셸 확장 안·저장소를 바꾸는 옵션·환경 변수·모르는 곳으로 옮김). 앞선
// git 아닌 명령이 저장소 자체를 바꿀 수 있으면 위치에 표시한다 — 실행 전 디스크로 본 저장소 비교를 믿지 않게.
function commitLocation(ctx: Ctx, g: GitGlobals): KnownLocation | string {
  if (ctx.dynamic) return '셸 확장(eval·명령 치환) 안에서 실행되는 커밋';
  if (g.repo) return '다른 저장소·색인을 가리키는 git 옵션·환경 변수';
  if (ctx.state.cwdUnknown || g.unknownLocation) return '알 수 없는 위치로 옮긴 뒤의 커밋';
  return {
    known: true,
    ...(g.cwd ? { cwd: g.cwd } : {}),
    ...(g.atTop ? { top: true as const } : {}),
    ...(ctx.state.repoChange ? { repoMayChange: true as const } : {}),
  };
}

// 위치는 알지만 커밋될 파일을 확정할 수 없는 사유.
function commitDoubt(commit: CommitArgs, g: GitGlobals, state: WalkState): string | null {
  if (commit.unresolved) return commit.unresolved;
  if (g.pathspecMode && (commit.scope === 'only' || commit.scope === 'include')) {
    return '경로 해석 방식을 바꾸는 git 옵션·환경 변수와 함께 쓴 경로 지정 커밋';
  }
  if (state.found || state.pending) return '한 명령에서 여러 번 커밋';
  if (state.impure) return `커밋 앞의 명령이 커밋될 파일을 바꿀 수 있음(${state.impure})`;
  return null;
}

// 파일을 확정할 수 없는 커밋: 위치를 알면 모아 두고 사유를 남긴 채 뒤를 마저 훑는다.
function deferCommit(ctx: Ctx, g: GitGlobals, why: string): Unresolved | null {
  const at = commitLocation(ctx, g);
  if (typeof at === 'string') return unresolved(why);
  ctx.state.locations.push(at);
  ctx.state.pending ??= why;
  return null;
}

// git commit 호출 하나: 위치를 모르면 곧바로 확정 불가, 위치를 알면 모아 두고 파일 확정 여부를 가린다 — 확정하지
// 못해도 뒤의 커밋 위치를 마저 모은다(커밋이 여럿이면 하나라도 이 프로젝트 커밋인지 봐야 한다).
function visitCommit(
  rest: string[],
  restDyn: boolean[],
  g: GitGlobals,
  ctx: Ctx
): Unresolved | null {
  const { state } = ctx;
  const commit = analyzeCommitArgs(rest, restDyn);
  if (commit.dryRun) return null;
  const at = commitLocation(ctx, g);
  if (typeof at === 'string') return unresolved(at);
  state.locations.push(at);
  const doubt = commitDoubt(commit, g, state);
  if (doubt) {
    state.pending ??= doubt;
    return null;
  }
  state.found = {
    kind: 'commit',
    scope: commit.scope,
    pathspecs: commit.pathspecs,
    ...(at.cwd ? { cwd: at.cwd } : {}),
    ...(at.top ? { top: true } : {}),
  };
  return null;
}

async function visitGitAlias(
  sub: string,
  args: string[],
  dyn: boolean[],
  cmd: Unwrapped,
  ctx: Ctx,
  g: GitGlobals
): Promise<Unresolved | null> {
  const { state } = ctx;
  const rest = args.slice(g.at + 1);
  const restDyn = dyn.slice(g.at + 1);
  const alias =
    g.aliases.get(sub) ?? (ctx.deps.resolveAlias ? await ctx.deps.resolveAlias(sub) : null);
  if (!alias) {
    // 내장 명령은 alias로 덮어쓸 수 없다 — 설정이 주입돼도 커밋으로 풀리지 않는다. 다만 읽기·변경 분류에
    // 없는 내장 명령은 무엇을 바꿀지 모르므로, 뒤따르는 커밋의 파일을 확정할 수 없게 표시한다.
    if (GIT_BUILTINS.has(sub)) {
      markImpure(ctx.state, '분류되지 않은 git 내장 명령');
      return null;
    }
    return g.configInjected
      ? unresolved('같은 명령에서 주입·변경된 설정으로 정해질 수 있는 git 명령')
      : null;
  }
  if (ctx.depth >= MAX_DEPTH) return unresolved('git alias가 너무 깊게 이어져 해석할 수 없음');
  // alias 풀이는 스테이징 가늠(stagingReach)과 같은 함수 하나로 한다.
  const expanded = expandGitAlias(alias, rest, restDyn);
  if (expanded.kind === 'undecidable') return unresolved(expanded.reason);
  if (expanded.kind === 'shell') {
    const r = await walkAliasBody(expanded.command, deeper(ctx), g);
    markImpure(state, '셸 명령으로 풀리는 git alias');
    return r;
  }
  if (expanded.words.length === 0) return null;
  return visitGit(
    [...args.slice(0, g.at), ...expanded.words, ...rest],
    [...dyn.slice(0, g.at), ...expanded.dynamic, ...restDyn],
    cmd,
    deeper(ctx),
    g.aliases
  );
}

// 셸 alias 본문: git이 부른 위치(-C 반영)의 저장소 최상위에서, 전역 옵션(-c·--git-dir·경로 해석)을 환경으로 물려준 채
// 다른 셸로 실행한다 — 본문의 cd는 뒤 명령의 위치에 남지 않는다. 물려준 저장소·설정은 보수적으로 뒤에도 남긴다.
async function walkAliasBody(text: string, ctx: Ctx, g: GitGlobals): Promise<Unresolved | null> {
  const { state } = ctx;
  const saved = frameOf(state);
  state.repoEnv ||= g.repo;
  state.configChanged ||= g.configInjected;
  state.pathspecEnv ||= g.pathspecMode;
  restore(state, { cwd: g.cwd, cwdUnknown: state.cwdUnknown || g.unknownLocation, atTop: true });
  const r = await walk(text, ctx);
  restore(state, saved);
  return r;
}
