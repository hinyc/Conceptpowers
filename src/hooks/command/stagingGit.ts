// @concept:governance-mode
// src/hooks/command/stagingGit.ts
// stagingReach의 git 한 호출 판정: add·stage·rm·mv·commit 등이 디스크에만 있는 거버넌스 변경을 담을 수 있는지
// 가늠한다. 경로는 그 git이 읽는 위치(저장소 루트 기준 상대 폴더) 기준으로 정규화해 견주고, 대소문자 무시
// 파일시스템이면 접어서 견준다. 강제 추가(-f)는 글자 그대로의 옵션(긴 옵션 줄임 포함)이거나, 셸 확장이 그 옵션
// 자리에 올 수 있을 때만 추정한다 — 강제 추가 없이는 무시된 참고자료가 커밋에 들어가지 않는다.
import { isAbsolute, posix, resolve } from 'node:path';
import { CP_REL, REFERENCE_REL, foldCase, repoRelative } from '../../paths.js';
import { analyzeCommitArgs } from './commitArgs.js';
import { GIT_BUILTINS } from './commandKinds.js';

export interface StagingReach {
  /** 디스크에만 있는 설정·판단 기록·개념 문서 변경까지 스테이징할 수 있는가 */
  mayStageGovernance: boolean;
  /** 디스크에만 있는 참고자료 변경(추적 중 수정·무시되지 않은 새 파일)까지 스테이징할 수 있는가 */
  mayStageReference: boolean;
  /** 강제 추가(add -f)가 닿는 참고자료 경로 — 그 경로의 무시된 새 파일도 담길 수 있다 */
  forcedReference: string[];
  /** 디스크의 설정 파일(init.json)을 직접 담는가 — 그 경로·상위 폴더 지정, 넓은 스테이징(add -A·add .·commit -a) */
  configExplicit: boolean;
}

/** git이 경로를 읽는 위치(절대경로 — 루트 밖일 수 있다). null이면 위치를 확정할 수 없다 */
export type Place = string | null;

export interface GitCall {
  sub: string;
  args: string[];
  dynamic: boolean[];
  /** 이 git이 경로를 읽는 위치 */
  place: Place;
  /** 경로를 대소문자 무시로 읽는가(--icase-pathspecs 등) */
  icase: boolean;
  /** 이 구간에 셸 확장(변수·명령 치환)이 있다 */
  uncertain: boolean;
  /** 이 구간의 명령 치환 본문 */
  substitutions: string[];
  /** 같은 명령에서 변수가 강제 추가 옵션을 품을 수 있다(-f 대입·반복문 변수) */
  forceVars: boolean;
}

const INIT_REL = `${CP_REL}/init.json`;
const GOVERNANCE_PATHS = [INIT_REL, `${CP_REL}/concepts/.alignment`, `${CP_REL}/concepts/data`];
const READ_ONLY_GIT = new Set(['status', 'diff', 'log', 'show']);
const GLOB = /[*?[]/;
const BRACE = /\{[^}]*(,|\.\.)[^}]*\}/;
/** 명령 치환($(…))이 아닌 변수 확장($X·${X}·$1) */
const VAR_EXPANSION = /\$(?!\()/;

export const NONE: StagingReach = {
  mayStageGovernance: false,
  mayStageReference: false,
  forcedReference: [],
  configExplicit: false,
};
export const wide = (force: boolean, explicit = false): StagingReach => ({
  mayStageGovernance: true,
  mayStageReference: true,
  forcedReference: force ? [REFERENCE_REL] : [],
  configExplicit: explicit,
});

export function merge(a: StagingReach, b: StagingReach): StagingReach {
  return {
    mayStageGovernance: a.mayStageGovernance || b.mayStageGovernance,
    mayStageReference: a.mayStageReference || b.mayStageReference,
    forcedReference: [...new Set([...a.forcedReference, ...b.forcedReference])],
    configExplicit: a.configExplicit || b.configExplicit,
  };
}

// git은 모호하지 않은 긴 옵션 줄임을 받아들인다 — min은 다른 옵션과 갈리는 최소 길이.
const abbrevOf = (arg: string, full: string, min: number): boolean =>
  arg.length >= min && full.startsWith(arg);
export const isForceFlag = (arg: string): boolean =>
  abbrevOf(arg, '--force', 3) || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(arg);
export const isBroadAddFlag = (arg: string): boolean =>
  abbrevOf(arg, '--all', 3) ||
  abbrevOf(arg, '--update', 3) ||
  abbrevOf(arg, '--no-ignore-removal', '--no-ignore-r'.length) ||
  /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(arg);
const isPathspecFile = (arg: string): boolean =>
  abbrevOf(arg.split('=')[0], '--pathspec-from-file', '--pathspec-fr'.length);
export const hasForceTrace = (text: string): boolean =>
  text.split(/[\s'"`;&|()=]+/).some(isForceFlag);

const overlaps = (g: string, path: string): boolean =>
  g === path || g.startsWith(`${path}/`) || path.startsWith(`${g}/`);
const trimRel = (p: string): string => p.replace(/\/+$/, '').replace(/^\.$/, '');

/**
 * 위치(place, 절대경로)에서 본 경로 글자의 루트 기준 상대경로. 루트를 품는 위(조상) 폴더면 '..'(넓은 지정),
 * 루트와 겹치지 않는 밖이면 null.
 */
export function placeRelative(root: string, place: string, arg: string): string | null {
  const abs = isAbsolute(arg) ? arg : resolve(place, arg);
  const rel = repoRelative(root, abs);
  if (rel !== null) return trimRel(rel);
  return repoRelative(abs, root) !== null ? '..' : null;
}
const escapes = (rel: string): boolean => rel === '..' || rel.startsWith('../');

const INIT_PARTS = INIT_REL.split('/');
/**
 * 어느 위치에서 읽힐지 모르는 경로 글자가 설정 파일(init.json)을 담을 수 있는가 — 루트일 수 있는 넓은 지정(. ·
 * .. · pathspec 마법)이거나, 끝부분이 설정 경로(docs/conceptpowers/init.json)나 그 상위 폴더의 이어진 조각과 같다.
 */
export function mayNameConfig(arg: string): boolean {
  if (arg.startsWith(':')) return true;
  const rel = trimRel(posix.normalize(arg));
  if (rel === '' || escapes(rel)) return true;
  const parts = foldCase(rel).split('/');
  const at = INIT_PARTS.indexOf(parts[parts.length - 1]);
  if (at === -1) return false;
  const tail = parts.slice(Math.max(0, parts.length - 1 - at));
  return tail.every((p, k) => p === INIT_PARTS[at - (tail.length - 1) + k]);
}

// 글롭·중괄호 낱말은 넓게 담는다. 설정을 직접 담는지는 글롭 앞의 고정된 폴더로 가늠한다.
function patternReach(root: string, call: GitCall, arg: string, force: boolean): StagingReach {
  const fixed = arg.slice(0, arg.search(/[*?[{]/)).replace(/[^/]*$/, '');
  const rel = placeRelative(root, call.place ?? root, fixed || '.');
  const explicit =
    rel === null || rel === '' || escapes(rel) || overlaps(fold(call, INIT_REL), fold(call, rel));
  return wide(force, explicit);
}

const fold = (call: GitCall, p: string): string => (call.icase ? p.toLowerCase() : foldCase(p));

// 경로 낱말 하나가 담을 수 있는 것. 넓은 지정(루트 전체·밖으로 나가는 상대경로·글롭·pathspec 마법)은 모두를 담는다.
function pathReach(root: string, call: GitCall, arg: string, force: boolean): StagingReach {
  if (arg.startsWith(':')) return wide(force, true);
  if (GLOB.test(arg) || BRACE.test(arg)) return patternReach(root, call, arg, force);
  const rel = placeRelative(root, call.place ?? root, arg);
  if (rel === null) return NONE;
  if (rel === '' || escapes(rel)) return wide(force, true);
  const f = fold(call, rel);
  const ref = overlaps(fold(call, REFERENCE_REL), f);
  // 대소문자가 다른 표기의 강제 추가는 그 글자로 무시된 파일을 찾을 수 없으니 폴더 전체로 본다.
  const exact = rel.startsWith(`${REFERENCE_REL}/`);
  return {
    mayStageGovernance: GOVERNANCE_PATHS.some((g) => overlaps(fold(call, g), f)),
    mayStageReference: ref,
    forcedReference: force && ref ? [exact ? rel : REFERENCE_REL] : [],
    configExplicit: overlaps(fold(call, INIT_REL), f),
  };
}

const pathsReach = (root: string, call: GitCall, paths: string[], force: boolean): StagingReach =>
  paths.map((p) => pathReach(root, call, p, force)).reduce(merge, NONE);

function splitPaths(args: string[]): { flags: string[]; paths: string[] } {
  const dash = args.indexOf('--');
  const head = dash === -1 ? args : args.slice(0, dash);
  const tail = dash === -1 ? [] : args.slice(dash + 1);
  return {
    flags: head.filter((a) => a.startsWith('-')),
    paths: [...head.filter((a) => !a.startsWith('-')), ...tail],
  };
}

// add 구간이 강제 추가일 수 있는가. 셸 확장은 그 자리에 강제 추가 옵션이 올 수 있을 때만 그렇게 본다: 명령 치환은
// 안에 -f 흔적이 보일 때, 변수는 같은 명령에서 -f를 담을 수 있거나(-f 대입·-f가 보이는 반복 목록) 뒤에 다른 낱말이
// 와 옵션 자리일 때. 참고자료 경로 글자만으로는 강제 추가로 보지 않는다 — 추적·비무시 참고자료는 mayStageReference가 잡는다.
function addForce(call: GitCall): boolean {
  if (call.args.some(isForceFlag)) return true;
  if (call.substitutions.some(hasForceTrace)) return true;
  const varAt = call.args.findIndex((a, i) => call.dynamic[i] && VAR_EXPANSION.test(a));
  if (varAt === -1) return false;
  return call.forceVars || varAt < call.args.length - 1;
}

// 넓은 스테이징 옵션(-A·-u·--no-ignore-removal)은 담을 수 있는 범위를 넓게 본다. 설정 파일을 직접 담는지는 경로가
// 없거나 위치·경로를 확정할 수 없을 때만 그렇다고 보고, 경로가 있으면 그 경로가 설정을 가리키는지로 좁힌다. 위치를
// 모르거나 경로가 셸 확장이면, 설정 경로 글자(또는 루트일 수 있는 넓은 지정)가 보일 때 설정을 담는 쪽으로 본다.
function addReach(root: string, call: GitCall): StagingReach {
  const force = addForce(call);
  const { flags, paths } = splitPaths(call.args);
  const unsure = call.uncertain || call.place === null || call.args.some(isPathspecFile);
  if (flags.some(isBroadAddFlag)) {
    const named =
      paths.length === 0 || unsure || pathsReach(root, call, paths, force).configExplicit;
    return wide(force, named);
  }
  if (unsure) return wide(force, paths.some(mayNameConfig));
  if (paths.length === 0) return force ? { ...NONE, forcedReference: [REFERENCE_REL] } : NONE;
  return pathsReach(root, call, paths, force);
}

// 커밋 인자는 커밋 판정과 같은 해석기로 읽는다(긴 옵션 줄임·값을 받는 옵션·파일에서 읽는 경로).
function commitReach(root: string, call: GitCall): StagingReach {
  if (call.substitutions.length > 0) return wide(false);
  const c = analyzeCommitArgs(call.args, call.dynamic);
  if (c.unresolved) return wide(false);
  if (c.dryRun) return NONE;
  if (c.scope === 'all') return wide(false, true);
  if (c.pathspecs.length === 0) return NONE;
  if (call.place === null) return wide(false, c.pathspecs.some(mayNameConfig));
  return pathsReach(root, call, c.pathspecs, false);
}

export function gitReach(root: string, call: GitCall): StagingReach {
  if (call.sub === 'add' || call.sub === 'stage') return addReach(root, call);
  // 내장이 아닌 하위 명령은 별칭일 수 있다 — 강제 추가 흔적이 있으면 참고자료 폴더 전체로 본다.
  if (!GIT_BUILTINS.has(call.sub)) {
    return wide(call.args.some(isForceFlag) || (call.forceVars && call.uncertain));
  }
  if (call.sub === 'commit') return commitReach(root, call);
  if (call.uncertain) return wide(false);
  if (READ_ONLY_GIT.has(call.sub)) return NONE;
  if (call.sub === 'rm' || call.sub === 'mv') {
    return call.place === null
      ? wide(false)
      : pathsReach(root, call, splitPaths(call.args).paths, false);
  }
  return wide(false);
}
