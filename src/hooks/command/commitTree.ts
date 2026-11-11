// @concept:governance-mode @concept:drift-reconcile
// src/hooks/command/commitTree.ts
// 커밋될 트리를 실제로 커밋하지 않고 git으로 미리 만든다. 임시 색인에 커밋 범위(index·all·include·only)대로
// 담은 뒤 write-tree로 트리를 얻으면, 커밋에 들어갈 파일 목록(추가·수정·삭제)과 파일마다 커밋될 내용을 git이
// 직접 알려준다. 디스크와 색인 가운데 어느 쪽이 커밋될지 추측하지 않으므로 경로 지정·include 범위·clean filter·
// diff.relative 같은 설정에 흔들리지 않는다. 계산에 쓴 blob·tree 객체는 저장소에 남는다(참조되지 않는 객체라
// git gc가 정리한다). 계산하지 못하면 던진다 — "검사할 파일 없음 = 통과"가 되지 않도록(fail-closed).
import { copyFile, mkdtemp, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizeRel } from '../../drift/safe.js';
import { diskReader, type ReadContent } from '../../audit/gaps.js';
import { git, tryGit } from '../../util/git.js';
import type { CommitPlan } from './commitPlan.js';

export type CommitTarget = Extract<CommitPlan, { kind: 'commit' }>;

export interface CommitContent {
  /** 이 쪽에서 본 파일 내용의 blob id — 없으면 '' */
  blobId(path: string): Promise<string>;
  /** 이 쪽에서 본 파일 내용 — 없으면 null */
  read(path: string): Promise<string | null>;
}

export interface CommitSnapshot {
  /** 커밋으로 추가·수정되는 파일(저장소 루트 기준) */
  files: string[];
  /** 커밋으로 삭제되는 파일(이름 바꾸기의 옛 경로 포함) */
  deleted: string[];
  /** 파일마다 커밋될 내용 */
  content: CommitContent;
}

// 목록 출력을 바꾸는 사용자 설정(비ASCII 경로 따옴표, 하위 폴더 기준 상대 경로)은 공용 래퍼(util/git)가 무력화한다.

// 문지기가 쓰는 판독기: 커밋될 내용이 있으면 그것으로, 없으면 undefined(호출 쪽 기본값 — 디스크)로 둔다.
export const commitReader = (commit?: CommitContent): ReadContent | undefined =>
  commit ? (rel) => commit.read(rel) : undefined;

const names = (out: string): string[] => out.split('\0').filter(Boolean);

// treeish:경로로 내용을 읽는다. treeish가 ''이면 색인(:경로), 'HEAD'면 마지막 커밋, tree id면 그 트리.
function treeContent(root: string, treeish: string): CommitContent {
  const blobId = async (path: string): Promise<string> =>
    ((await tryGit(root, ['rev-parse', '-q', '--verify', `${treeish}:${path}`])) ?? '').trim();
  return {
    blobId,
    read: async (path) => {
      const id = await blobId(path);
      return id ? tryGit(root, ['cat-file', 'blob', id]) : null;
    },
  };
}

export const headContent = (root: string): CommitContent => treeContent(root, 'HEAD');
export const indexContent = (root: string): CommitContent => treeContent(root, '');

// 디스크 내용. blob id는 필터(clean·줄끝 변환)를 거치지 않은 바이트로 계산한다 — 필터가 커밋될 내용을 바꿔 끼워도
// 디스크와 다르다는 사실이 드러나게 한다.
export function diskContent(root: string): CommitContent {
  return {
    blobId: async (path) =>
      ((await tryGit(root, ['hash-object', '--no-filters', '--', path])) ?? '').trim(),
    read: diskReader(root),
  };
}

// 호출자가 파일 목록을 직접 준 경우(테스트·외부 호출): 목록에 든 파일은 디스크 내용, 나머지는 마지막 커밋 내용이
// 커밋된다고 본다.
export function injectedContent(root: string, files: readonly string[]): CommitContent {
  const included = new Set(files.map(normalizeRel));
  const pick = (path: string): CommitContent =>
    included.has(normalizeRel(path)) ? diskContent(root) : headContent(root);
  return { blobId: (path) => pick(path).blobId(path), read: (path) => pick(path).read(path) };
}

// 경로를 받는 범위(include·only)에서 git은 색인이 아는 파일만 담는다 — 같은 규칙으로 고른다.
async function knownPaths(cwd: string, pathspecs: string[]): Promise<string[]> {
  if (pathspecs.length === 0) return [];
  return names(await git(cwd, ['ls-files', '-z', '--', ...pathspecs]));
}

async function prepareIndex(
  plan: CommitTarget,
  cwd: string,
  env: Record<string, string>,
  hasHead: boolean
): Promise<void> {
  const known = await knownPaths(cwd, plan.pathspecs);
  if (plan.scope === 'only') {
    await git(cwd, hasHead ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], { env });
  } else {
    const realIndex = resolve(cwd, (await git(cwd, ['rev-parse', '--git-path', 'index'])).trim());
    try {
      await copyFile(realIndex, env.GIT_INDEX_FILE);
      // 색인 파일의 시각을 원본과 같게 둔다. git은 색인 파일보다 늦게(같은 시각 포함) 기록된 항목을 다시 해시해
      // 같은 초 안에 고친 파일도 잡는데(racy git), 복사로 색인 시각이 새로워지면 그 파일을 바뀌지 않은 것으로
      // 믿어 커밋될 파일에서 빠뜨린다. 밀리초로 잘린 시각은 원본보다 이르거나 같으므로 더 많이 다시 해시하는 쪽이다.
      const { atime, mtime } = await stat(realIndex);
      await utimes(env.GIT_INDEX_FILE, atime, mtime);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await git(cwd, ['read-tree', '--empty'], { env }); // 아직 색인이 없는 새 저장소
    }
  }
  if (plan.scope === 'all') await git(cwd, ['add', '-u'], { env });
  if ((plan.scope === 'include' || plan.scope === 'only') && known.length > 0) {
    // 목록은 실제 파일 이름이므로 글자 그대로(--literal-pathspecs) 읽게 한다.
    // 경로가 많아도 인자 길이 한도(E2BIG)에 걸리지 않게 목록을 stdin으로 넘긴다.
    await git(
      cwd,
      ['--literal-pathspecs', 'add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'],
      { env, input: known.join('\0') }
    );
  }
}

async function emptyTreeId(cwd: string, dir: string): Promise<string> {
  const env = { GIT_INDEX_FILE: join(dir, 'empty-index') };
  await git(cwd, ['read-tree', '--empty'], { env });
  return (await git(cwd, ['write-tree'], { env })).trim();
}

export async function snapshotCommit(root: string, plan: CommitTarget): Promise<CommitSnapshot> {
  const cwd = plan.cwd ? resolve(root, plan.cwd) : root;
  const dir = await mkdtemp(join(tmpdir(), 'cp-commit-'));
  try {
    const env = { GIT_INDEX_FILE: join(dir, 'index') };
    const hasHead = (await tryGit(cwd, ['rev-parse', '-q', '--verify', 'HEAD^{commit}'])) !== null;
    await prepareIndex(plan, cwd, env, hasHead);
    const tree = (await git(cwd, ['write-tree'], { env })).trim();
    const base = hasHead ? 'HEAD' : await emptyTreeId(cwd, dir);
    const diff = async (filter: string): Promise<string[]> =>
      names(
        await git(cwd, [
          'diff-tree',
          '-r',
          '-z',
          '--name-only',
          '--no-renames',
          `--diff-filter=${filter}`,
          base,
          tree,
        ])
      );
    return { files: await diff('ACMR'), deleted: await diff('D'), content: treeContent(cwd, tree) };
  } catch (error) {
    throw new Error(`Could not compute the content to be committed — ${(error as Error).message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
