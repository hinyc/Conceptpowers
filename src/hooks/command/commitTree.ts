// @concept:governance-mode @concept:drift-reconcile
// src/hooks/command/commitTree.ts
// 커밋될 트리를 실제로 커밋하지 않고 git으로 미리 만든다. 임시 색인에 커밋 범위(index·all·include·only)대로
// 담은 뒤 write-tree로 트리를 얻으면, 커밋에 들어갈 파일 목록(추가·수정·삭제)과 파일마다 커밋될 내용을 git이
// 직접 알려준다. 디스크와 색인 가운데 어느 쪽이 커밋될지 추측하지 않으므로 경로 지정·include 범위·clean filter·
// diff.relative 같은 설정에 흔들리지 않는다. 계산에 쓴 blob·tree 객체는 저장소에 남는다(참조되지 않는 객체라
// git gc가 정리한다). 계산하지 못하면 던진다 — "검사할 파일 없음 = 통과"가 되지 않도록(fail-closed).
import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { normalizeRel } from '../../drift/safe.js';
import type { CommitPlan } from './commitPlan.js';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 64 * 1024 * 1024;
// 목록 출력을 바꾸는 사용자 설정을 무력화한다(비ASCII 경로 따옴표, 하위 폴더 기준 상대 경로).
const SAFE_CONFIG = ['-c', 'core.quotePath=false', '-c', 'diff.relative=false'];

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

async function git(args: string[], cwd: string, env?: Record<string, string>): Promise<string> {
  const { stdout } = await execFileAsync('git', [...SAFE_CONFIG, '--no-pager', ...args], {
    cwd,
    maxBuffer: MAX_BUFFER,
    env: env ? { ...process.env, ...env } : process.env,
  });
  return stdout;
}

// 경로가 많아도 인자 길이 한도(E2BIG)에 걸리지 않게 목록을 stdin으로 넘기는 호출.
function gitWithInput(
  args: string[],
  cwd: string,
  env: Record<string, string>,
  input: string
): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = execFile(
      'git',
      [...SAFE_CONFIG, '--no-pager', ...args],
      { cwd, maxBuffer: MAX_BUFFER, env: { ...process.env, ...env } },
      (error, stdout) => (error ? reject(error) : resolveOutput(stdout))
    );
    child.stdin?.end(input);
  });
}

async function tryGit(args: string[], cwd: string): Promise<string | null> {
  try {
    return await git(args, cwd);
  } catch {
    return null;
  }
}

const names = (out: string): string[] => out.split('\0').filter(Boolean);

// treeish:경로로 내용을 읽는다. treeish가 ''이면 색인(:경로), 'HEAD'면 마지막 커밋, tree id면 그 트리.
function treeContent(root: string, treeish: string): CommitContent {
  const blobId = async (path: string): Promise<string> =>
    ((await tryGit(['rev-parse', '-q', '--verify', `${treeish}:${path}`], root)) ?? '').trim();
  return {
    blobId,
    read: async (path) => {
      const id = await blobId(path);
      return id ? tryGit(['cat-file', 'blob', id], root) : null;
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
      ((await tryGit(['hash-object', '--no-filters', '--', path], root)) ?? '').trim(),
    read: (path) => readFile(join(root, path), 'utf8').catch(() => null),
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
  return names(await git(['ls-files', '-z', '--', ...pathspecs], cwd));
}

async function prepareIndex(
  plan: CommitTarget,
  cwd: string,
  env: Record<string, string>,
  hasHead: boolean
): Promise<void> {
  const known = await knownPaths(cwd, plan.pathspecs);
  if (plan.scope === 'only') {
    await git(hasHead ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], cwd, env);
  } else {
    const realIndex = resolve(cwd, (await git(['rev-parse', '--git-path', 'index'], cwd)).trim());
    try {
      await copyFile(realIndex, env.GIT_INDEX_FILE);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await git(['read-tree', '--empty'], cwd, env); // 아직 색인이 없는 새 저장소
    }
  }
  if (plan.scope === 'all') await git(['add', '-u'], cwd, env);
  if ((plan.scope === 'include' || plan.scope === 'only') && known.length > 0) {
    // 목록은 실제 파일 이름이므로 글자 그대로(--literal-pathspecs) 읽게 한다.
    await gitWithInput(
      ['--literal-pathspecs', 'add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'],
      cwd,
      env,
      known.join('\0')
    );
  }
}

async function emptyTreeId(cwd: string, dir: string): Promise<string> {
  const env = { GIT_INDEX_FILE: join(dir, 'empty-index') };
  await git(['read-tree', '--empty'], cwd, env);
  return (await git(['write-tree'], cwd, env)).trim();
}

export async function snapshotCommit(root: string, plan: CommitTarget): Promise<CommitSnapshot> {
  const cwd = plan.cwd ? resolve(root, plan.cwd) : root;
  const dir = await mkdtemp(join(tmpdir(), 'cp-commit-'));
  try {
    const env = { GIT_INDEX_FILE: join(dir, 'index') };
    const hasHead = (await tryGit(['rev-parse', '-q', '--verify', 'HEAD^{commit}'], cwd)) !== null;
    await prepareIndex(plan, cwd, env, hasHead);
    const tree = (await git(['write-tree'], cwd, env)).trim();
    const base = hasHead ? 'HEAD' : await emptyTreeId(cwd, dir);
    const diff = async (filter: string): Promise<string[]> =>
      names(
        await git(
          [
            'diff-tree',
            '-r',
            '-z',
            '--name-only',
            '--no-renames',
            `--diff-filter=${filter}`,
            base,
            tree,
          ],
          cwd
        )
      );
    return { files: await diff('ACMR'), deleted: await diff('D'), content: treeContent(cwd, tree) };
  } catch (error) {
    throw new Error(`커밋될 내용을 계산하지 못했습니다 — ${(error as Error).message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
