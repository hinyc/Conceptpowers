// @concept:governance-mode
// src/hooks/command/commitPlan.ts
// Bash 명령이 커밋을 만드는지, 만든다면 무엇이 어디서 커밋되는지를 실행 전에 가려낸다. 명령 글자가 아니라 실제로
// 실행될 `git … commit` 호출을 찾되(예약어·래퍼·셸 -c·alias 경유 포함) 확실히 안전하다고 아는 것만 받아들인다:
// 커밋 앞에 파일·색인·설정을 바꾸거나 다른 명령을 실행할 수 있는 명령이 있거나, 커밋 인자·위치·저장소가 셸 확장으로
// 정해지거나, 반복문·함수·셸마다 다른 구문처럼 실행 순서를 알 수 없으면 unresolved — 게이트가 "검사한 척
// 통과"하지 않게 한다(governance-mode 불변).
import { parseShellCommand, type ShellSegment } from './shellWords.js';
import { analyzeCommitArgs, type CommitScope } from './commitArgs.js';
import {
  ASSIGNMENT,
  CODE_FLAGS,
  CONTROL_WORDS,
  DECLARE_COMMANDS,
  FILE_COMMANDS,
  GIT_CONFIG_ENV,
  GIT_GLOBAL_REPO,
  GIT_GLOBAL_WITH_VALUE,
  GIT_PATHSPEC_ENV,
  GIT_PATHSPEC_OPTIONS,
  GIT_REPO_CONFIG,
  GIT_REPO_ENV,
  PURE_COMMANDS,
  RESERVED_WORDS,
  SHELLS,
  WRAPPERS,
  classifyGitCall,
  GIT_BUILTINS,
} from './commandKinds.js';

export type { CommitScope };
export type CommitPlan =
  | { kind: 'none' }
  | { kind: 'commit'; scope: CommitScope; pathspecs: string[]; cwd?: string }
  | { kind: 'unresolved'; reason: string };
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
  /** 해석하지 못한 자리(다른 명령에 넘긴 코드 등)에서 커밋을 실행할 수 있다는 흔적 */
  netHit: string | null;
  /** 커밋 흔적이 있으면 확정 불가로 만드는 구조(반복문·함수 정의·셸마다 다른 구문·닫히지 않은 구문) */
  risky: string | null;
  cwd: string | undefined;
  cwdUnknown: boolean;
  repoEnv: boolean;
  configChanged: boolean;
  pathspecEnv: boolean;
}

interface Ctx {
  state: WalkState;
  deps: PlanDeps;
  depth: number;
  /** 셸 확장(eval·명령 치환) 안에서 실행되는가 */
  dynamic: boolean;
}

interface Unwrapped {
  words: string[];
  dynamic: boolean[];
  repoEnv: boolean;
  configEnv: boolean;
  pathspecEnv: boolean;
}

const unresolved = (reason: string): Unresolved => ({ kind: 'unresolved', reason });
const commandName = (word: string) => word.replace(/^=/, '').split('/').pop() ?? word;
const isGitName = (word: string) => ['git', 'git.exe'].includes(commandName(word));
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

function markImpure(state: WalkState, why: string): void {
  state.impure ??= why;
}

export async function planCommit(command: string, deps: PlanDeps = {}): Promise<CommitPlan> {
  const state: WalkState = {
    command,
    found: null,
    impure: null,
    netHit: null,
    risky: null,
    cwd: undefined,
    cwdUnknown: false,
    repoEnv: false,
    configChanged: false,
    pathspecEnv: false,
  };
  const early = await walk(command, { state, deps, depth: 0, dynamic: false });
  if (early) return early;
  if (state.risky && (state.found || looksLikeCommit(command))) return unresolved(state.risky);
  if (state.found) return state.found;
  if (state.netHit) return unresolved(state.netHit);
  return { kind: 'none' };
}

async function walk(command: string, ctx: Ctx): Promise<Unresolved | null> {
  const { state } = ctx;
  if (ctx.depth > MAX_DEPTH) {
    return looksLikeCommit(command) ? unresolved('명령 중첩이 너무 깊어 해석할 수 없음') : null;
  }
  const parsed = parseShellCommand(command);
  if (parsed.incomplete) state.risky ??= '셸마다 다르게 읽힐 수 있는 닫히지 않은 따옴표·치환';
  if (parsed.functionDefined) state.risky ??= '함수 정의가 있는 명령';
  if (parsed.ambiguous) state.risky ??= '셸마다 다르게 읽히는 구문(명령 자리의 산술식)';
  const segs = parsed.segments;
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k];
    for (const inner of seg.substitutions) {
      const r = await walk(inner, deeper(ctx, true));
      if (r) return r;
    }
    const foundBefore = state.found;
    const r = await visitSegment(seg, ctx);
    if (seg.writes) markImpure(state, '파일에 쓰는 리다이렉션');
    if (r) return r;
    if (!foundBefore && state.found) {
      if (seg.depth > 0) return unresolved('서브셸(괄호) 안에서 실행되는 커밋');
      const clash = concurrentClash(segs, k);
      if (clash) return unresolved(clash);
    }
  }
  return null;
}

// 커밋과 파이프·백그라운드로 동시에 실행되는 뒤쪽 명령이 순수하지 않으면 경합으로 커밋 파일이 달라질 수 있다.
function concurrentClash(segs: ShellSegment[], k: number): string | null {
  for (let j = k; segs[j] && (segs[j].connector === '|' || segs[j].connector === '&'); j++) {
    const next = segs[j + 1];
    if (next && !isPureSegment(next)) return '파이프·백그라운드로 커밋과 동시에 실행되는 명령';
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
function unwrap(seg: ShellSegment): Unwrapped {
  const words = [...seg.words];
  const dynamic = [...seg.dynamicWords];
  const env = { repoEnv: false, configEnv: false, pathspecEnv: false };
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
  if (cmd.words.length === 0) return null;
  if (cmd.dynamic[0]) {
    markImpure(state, '셸 확장으로 정해지는 명령');
    return cmd.words.includes('commit') ? unresolved('셸 확장으로 정해지는 명령 속 커밋') : null;
  }
  const name = commandName(cmd.words[0]);
  const args = cmd.words.slice(1);
  const argsDyn = cmd.dynamic.slice(1);

  if (name === 'cd' || name === 'pushd') {
    if (seg.depth === 0) changeDirectory(state, args, argsDyn); // 서브셸 안의 cd는 밖에 남지 않는다
    return null;
  }
  if (name === 'popd') {
    if (seg.depth === 0) state.cwdUnknown = true;
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
  if (isGitName(name)) return visitGit(args, argsDyn, cmd, ctx, new Map());
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

function changeDirectory(state: WalkState, args: string[], argsDyn: boolean[]): void {
  const at = args.findIndex((a) => !a.startsWith('-') || a === '-');
  const target = at >= 0 ? args[at] : undefined;
  if (target === undefined || argsDyn[at] || target === '-' || target.startsWith('~')) {
    state.cwdUnknown = true;
    return;
  }
  state.cwd = joinPath(state.cwd, target);
}

async function visitShell(
  seg: ShellSegment,
  args: string[],
  argsDyn: boolean[],
  ctx: Ctx
): Promise<Unresolved | null> {
  const flagAt = args.findIndex((w) => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w));
  if (flagAt >= 0 && args[flagAt + 1] !== undefined) {
    return walk(args[flagAt + 1], deeper(ctx, ctx.dynamic || argsDyn[flagAt + 1]));
  }
  if (seg.heredocs.length > 0 && args.every((a) => a.startsWith('-'))) {
    for (const body of seg.heredocs) {
      const r = await walk(body, deeper(ctx));
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
  const g: GitGlobals = {
    cwd: state.cwd,
    unknownLocation: false,
    repo: cmd.repoEnv || state.repoEnv,
    configInjected: cmd.configEnv || state.configChanged,
    pathspecMode: cmd.pathspecEnv || state.pathspecEnv,
    aliases: new Map(aliases),
    at: 0,
  };
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const arg = args[i];
    const value = args[i + 1];
    if (dyn[i]) {
      g.repo = true; // 셸 확장으로 정해지는 전역 옵션은 무엇이든 될 수 있다
      g.configInjected = true;
      g.pathspecMode = true;
      i++;
      continue;
    }
    if (GIT_GLOBAL_REPO.has(arg.split('=')[0])) g.repo = true;
    if (GIT_PATHSPEC_OPTIONS.has(arg)) g.pathspecMode = true;
    if (arg === '-C') {
      if (value === undefined || dyn[i + 1] || value.startsWith('~')) g.unknownLocation = true;
      else g.cwd = joinPath(g.cwd, value);
    }
    if (arg === '-c' || arg.startsWith('--config-env')) {
      const kv = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : (value ?? '');
      if ((arg === '-c' && dyn[i + 1]) || GIT_REPO_CONFIG.test(kv)) g.repo = true;
      const alias = /^alias\.([^=]+)=(.*)$/i.exec(kv);
      if (arg === '-c' && alias) g.aliases.set(alias[1], alias[2]);
      else if (/^alias\./i.test(kv)) g.configInjected = true;
    }
    i += GIT_GLOBAL_WITH_VALUE.has(arg) ? 2 : 1;
  }
  g.at = i;
  return g;
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
    markImpure(state, '스테이징(색인)을 바꾸는 git 명령');
    return null;
  }
  if (kind === 'execute') {
    markImpure(state, '다른 명령을 실행할 수 있는 git 명령');
    if (rest.some(looksLikeCommit)) state.netHit ??= 'git이 실행하는 명령 속 git commit';
    return null;
  }

  const commit = analyzeCommitArgs(rest, restDyn);
  if (commit.dryRun) return null;
  if (ctx.dynamic) return unresolved('셸 확장(eval·명령 치환) 안에서 실행되는 커밋');
  if (g.repo) return unresolved('다른 저장소·색인을 가리키는 git 옵션·환경 변수');
  if (commit.unresolved) return unresolved(commit.unresolved);
  if (g.pathspecMode && (commit.scope === 'only' || commit.scope === 'include')) {
    return unresolved('경로 해석 방식을 바꾸는 git 옵션·환경 변수와 함께 쓴 경로 지정 커밋');
  }
  if (state.found) return unresolved('한 명령에서 여러 번 커밋');
  if (state.impure) {
    return unresolved(`커밋 앞의 명령이 커밋될 파일을 바꿀 수 있음(${state.impure})`);
  }
  if (state.cwdUnknown || g.unknownLocation) return unresolved('알 수 없는 위치로 옮긴 뒤의 커밋');
  state.found = {
    kind: 'commit',
    scope: commit.scope,
    pathspecs: commit.pathspecs,
    ...(g.cwd ? { cwd: g.cwd } : {}),
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
  if (alias.startsWith('!')) {
    if (restDyn.some(Boolean)) return unresolved('셸 확장 인자를 받는 셸 alias');
    const quoted = rest.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
    const r = await walk(`${alias.slice(1)} ${quoted}`, deeper(ctx));
    markImpure(state, '셸 명령으로 풀리는 git alias');
    return r;
  }
  const expanded = parseShellCommand(alias).segments[0];
  if (!expanded) return null;
  return visitGit(
    [...args.slice(0, g.at), ...expanded.words, ...rest],
    [...dyn.slice(0, g.at), ...expanded.dynamicWords, ...restDyn],
    cmd,
    deeper(ctx),
    g.aliases
  );
}
