// @concept:governance-mode
// src/hooks/command/commitLocation.ts
// 커밋이 실행될 위치가 이 프로젝트의 저장소인지 가린다. 위치는 명령을 파싱해 얻은 것(planCommit이 따라간 cd·git -C,
// 훅이 알려 준 작업 폴더에서 출발 — 알려 주지 않았으면 루트)만 쓰고, 그 위치의 git 작업 트리 최상위(worktree마다
// 다르다)를 루트 쪽 값과 견준다. 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사하므로(governance-mode):
//  - 같은 저장소면 이 프로젝트 커밋이다(루트 밖 위치 — 모노레포 형제 폴더 — 여도). 경로 지정 커밋은 루트 기준 상대
//    경로(`../pkgB/b.txt`, 루트를 품는 위 폴더면 `..`)로 풀어 루트 안에서 친 커밋과 같게 넘긴다. 최상위 기준 경로(`:/x`)는
//    위치와 무관해 그대로 넘기고, 그 밖의 magic처럼 풀 수 없으면 확정 불가.
//  - 셸 alias 본문의 커밋은 부른 위치의 저장소 최상위에서 실행된다 — 최상위를 git이 답하지 못하면 확정 불가.
//  - 다른 저장소(프로젝트 밖·루트 안의 중첩 클론·서브모듈·다른 worktree)면 이 프로젝트 파일을 담지 않는다(foreign).
//    단 저장소 비교는 실행 전 디스크로 하므로, 커밋 앞의 git 아닌 명령이 저장소 자체를 바꿀 수 있으면(repoMayChange)
//    다른 저장소로 단정하지 않는다(확정 불가).
//  - 위치를 확정할 수 없거나, 위치는 알지만 git이 답하지 못하면(저장소 아님·시간 초과) 확정 불가 — 루트 안이면
//    예전처럼 이 프로젝트 저장소로 본다.
//  - 커밋이 여럿이면 전부 다른 저장소일 때만 foreign.
import { resolve } from 'node:path';
import { R, type Reason } from '../../i18n/commitReasons.js';
import { canonicalPath, foldCase, repoRelative, rootRelative } from '../../paths.js';
import { tryGit } from '../../util/git.js';
import type { CommitLocation, CommitPlan } from './commitPlan.js';

type Planned = Exclude<CommitPlan, { kind: 'none' }>;
type Resolved = Extract<Planned, { kind: 'commit' }>;
export type LocatedCommit = Planned | { kind: 'foreign' };

/** 위치의 저장소가 루트의 저장소와 같은가. unknown: git이 답하지 못한 루트 밖 위치 */
export type RepoRelation = 'same' | 'other' | 'unknown';

export interface RepoLocator {
  relationOf(dir: string): Promise<RepoRelation>;
  /** 위치의 git 작업 트리 최상위(바로가기를 푼 실제 위치). git이 답하지 못하면 null */
  topOf(dir: string): Promise<string | null>;
}

/**
 * git에게 묻지 못했거나 답을 못 받은 위치의 저장소 관계: 루트 안이면 이 프로젝트 저장소, 밖이면 모른다 — 커밋 판정과
 * 스테이징 가늠(stagingReach)이 같은 규칙 하나를 쓴다.
 */
export const fallbackRelation = (root: string, dir: string): RepoRelation =>
  repoRelative(root, dir) === null ? 'unknown' : 'same';

const FOREIGN: LocatedCommit = { kind: 'foreign' };
/** 저장소 최상위 폴더를 묻는 git 호출의 시간 상한 — 넘으면 답하지 못한 것으로 본다 */
const TOPLEVEL_TIMEOUT_MS = 5000;
/** 위치와 무관하게 저장소 최상위 기준인 경로 지정(`:/x`·`:/!x`·`:(top)x`) */
const TOP_MAGIC = /^:(?:[!^]*\/|\([^)]*\btop\b)/;
const GLOB = /[*?[]/;

/** 훅 한 번 실행 동안 쓰는 저장소 판별기 — 위치마다 git을 한 번만 부른다(루트 쪽 값 포함). */
export function createRepoLocator(root: string): RepoLocator {
  const tops = new Map<string, Promise<string | null>>();
  const topOf = (dir: string): Promise<string | null> => {
    const key = canonicalPath(dir);
    const cached = tops.get(key);
    if (cached) return cached;
    const asked = tryGit(dir, ['rev-parse', '--show-toplevel'], {
      timeout: TOPLEVEL_TIMEOUT_MS,
    }).then((out) => (out?.trim() ? canonicalPath(out.trim()) : null));
    tops.set(key, asked);
    return asked;
  };
  return {
    topOf,
    async relationOf(dir) {
      const [mine, theirs] = await Promise.all([topOf(root), topOf(dir)]);
      if (mine === null || theirs === null) return fallbackRelation(root, dir);
      return foldCase(mine) === foldCase(theirs) ? 'same' : 'other';
    },
  };
}

const unresolved = (reason: Reason): Planned => ({ kind: 'unresolved', reason });

// 같은 저장소의 루트 밖 위치에서 친 확정 커밋: 경로 지정을 루트 기준 상대 경로로 풀어 루트 안에서 친 커밋과 같게
// 넘긴다(루트를 품는 위 폴더의 `.`은 `..` — 그만큼 넓다). 최상위 기준 경로는 그대로, 위치 기준 magic이나 위치 글자에
// 와일드카드가 섞여 루트에서 같은 뜻으로 쓸 수 없으면 확정 불가.
function fromOutside(root: string, plan: Omit<Resolved, 'cwd' | 'top'>, dir: string): Planned {
  const base = rootRelative(root, dir);
  const specs = plan.pathspecs.map((p) => {
    if (TOP_MAGIC.test(p)) return p;
    if (p.startsWith(':') || GLOB.test(base)) return null;
    const rel = rootRelative(root, resolve(dir, p));
    return rel === '' ? '.' : rel;
  });
  if (specs.some((s) => s === null)) {
    return unresolved(R.outsideRel);
  }
  return { ...plan, pathspecs: specs as string[] };
}

// 위치 글자가 가리키는 폴더 — 셸 alias 본문이면 그 폴더의 저장소 최상위(git이 답하지 못하면 null).
function placeOf(
  l: { cwd?: string; top?: true },
  start: string,
  locator: RepoLocator
): Promise<string | null> {
  const dir = resolve(start, l.cwd ?? '.');
  return l.top ? locator.topOf(dir) : Promise.resolve(dir);
}

async function locateResolved(
  root: string,
  plan: Resolved,
  start: string,
  locator: RepoLocator
): Promise<LocatedCommit> {
  const dir = await placeOf(plan, start, locator);
  if (dir === null) return unresolved(R.aliasTop);
  const relation = await locator.relationOf(dir);
  if (relation === 'other') return FOREIGN;
  if (relation === 'unknown') {
    return unresolved(R.unknownRepo);
  }
  const { cwd: _moved, top: _top, ...rest } = plan;
  const rel = repoRelative(root, dir);
  if (rel === null) return fromOutside(root, rest, dir);
  return rel === '' ? rest : { ...rest, cwd: rel };
}

// 확정하지 못한 커밋 위치의 저장소 관계 — 앞선 명령이 저장소를 바꿀 수 있으면 다른 저장소로 단정하지 않는다.
async function relationAt(
  l: CommitLocation,
  start: string,
  locator: RepoLocator
): Promise<RepoRelation> {
  if (!l.known) return 'unknown';
  const dir = await placeOf(l, start, locator);
  if (dir === null) return 'unknown';
  const relation = await locator.relationOf(dir);
  return relation === 'other' && l.repoMayChange ? 'unknown' : relation;
}

/**
 * 커밋 계획을 실행 위치에 맞춘다. hookCwd는 훅 입력의 작업 폴더 — 없거나 모르면(undefined·null) 루트에서 출발한다.
 * 확정하지 못한 계획은 실린 위치가 전부 다른 저장소일 때만 foreign이다(위치 목록이 없으면 위치 불명).
 */
export async function locateCommit(
  root: string,
  plan: Planned,
  hookCwd?: string | null,
  locator: RepoLocator = createRepoLocator(root)
): Promise<LocatedCommit> {
  const start = resolve(root, hookCwd ?? '.');
  if (plan.kind === 'commit') return locateResolved(root, plan, start, locator);
  const locations = plan.locations ?? [];
  if (locations.length === 0) return plan;
  const relations = await Promise.all(locations.map((l) => relationAt(l, start, locator)));
  return relations.every((r) => r === 'other') ? FOREIGN : plan;
}
