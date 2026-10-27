// @concept:governance-mode
// src/hooks/command/headWatch.ts
// 커밋 명령으로 보이지 않던 명령(패키지 스크립트·스크립트 파일 등)이 실행 중에 커밋을 만들었는지 사후에 알아낸다.
// 실행 직전에 HEAD reflog 맨 위 항목을 git 폴더에 적어 두고, 실행 뒤 그 위에 새로 쌓인 커밋 항목을 찾는다.
// 기록은 저장소 작업 트리가 아니라 git 폴더 안에 두므로 커밋 대상이 되지 않는다.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '../../util/atomicWrite.js';

const execFileAsync = promisify(execFile);
const RECORD_DIR = join('conceptpowers', 'head-before');
/** 결과가 오지 않아 남은 기록(실패한 명령 등)을 치우는 기준 */
const STALE_MS = 24 * 60 * 60 * 1000;
/** 한 명령 동안 쌓였다고 볼 reflog 항목의 상한 — 넘치면 그만큼만 본다 */
const MAX_ENTRIES = 50;
/** 묵은 기록 청소를 다시 할 간격 — 매 명령마다 폴더를 훑지 않는다 */
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const SWEEP_MARK = '.last-sweep';
/**
 * 새 내용을 담은 커밋을 만든 reflog 항목(commit·commit (amend)·cherry-pick·revert·am·rebase (continue)).
 * 그대로 옮겨 심는 rebase (pick)은 이미 있던 커밋의 재배치라 세지 않는다.
 */
const COMMIT_ENTRY = /^(commit( \([a-z]+\))?|cherry-pick|revert|am|rebase \(continue\)):/;

export interface UngatedCommit {
  sha: string;
  subject: string;
}

async function git(root: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['--no-pager', ...args], {
      cwd: root,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
}

async function recordDir(root: string): Promise<string | null> {
  const gitDir = await git(root, ['rev-parse', '--absolute-git-dir']);
  return gitDir ? join(gitDir.trim(), RECORD_DIR) : null;
}

// 도구 호출 id를 파일 이름으로 쓸 수 있는 글자만 남긴다.
function recordName(toolUseId: string): string | null {
  const safe = toolUseId.replace(/[^A-Za-z0-9_-]/g, '');
  return safe ? safe.slice(0, 128) : null;
}

async function reflogLines(root: string, count: number): Promise<string[]> {
  const out = await git(root, [
    'reflog',
    `-${count}`,
    '--format=%H%x09%gd%x09%gs',
    '--date=unix',
    'HEAD',
  ]);
  return out ? out.split('\n').filter(Boolean) : [];
}

// 마지막 청소가 SWEEP_EVERY_MS보다 오래됐을 때만 폴더를 훑는다.
async function removeStaleRecords(dir: string): Promise<void> {
  const now = Date.now();
  const mark = join(dir, SWEEP_MARK);
  const last = await stat(mark).catch(() => null);
  if (last && now - last.mtimeMs < SWEEP_EVERY_MS) return;
  await writeFileAtomic(mark, '');
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (name === SWEEP_MARK) continue;
    const p = join(dir, name);
    const info = await stat(p).catch(() => null);
    if (info && now - info.mtimeMs > STALE_MS) await rm(p, { force: true });
  }
}

/** 명령 실행 직전: HEAD reflog 맨 위 항목(없으면 빈 줄)을 이 도구 호출 id로 적어 둔다. */
export async function recordHeadBefore(root: string, toolUseId: string): Promise<void> {
  const name = recordName(toolUseId);
  const dir = name ? await recordDir(root) : null;
  if (!name || !dir) return;
  try {
    await mkdir(dir, { recursive: true });
    await removeStaleRecords(dir);
    const [top] = await reflogLines(root, 1);
    await writeFileAtomic(join(dir, name), (top ?? '') + '\n');
  } catch {
    /* best-effort: 기록이 없으면 사후 확인을 건너뛸 뿐이다 */
  }
}

/** 명령 실행 직후: 적어 둔 항목 위에 새로 생긴 커밋을 돌려주고 기록은 지운다. 기록이 없으면 빈 목록. */
export async function takeUngatedCommits(
  root: string,
  toolUseId: string
): Promise<UngatedCommit[]> {
  const name = recordName(toolUseId);
  const dir = name ? await recordDir(root) : null;
  if (!name || !dir) return [];
  const path = join(dir, name);
  let before: string;
  try {
    before = (await readFile(path, 'utf8')).replace(/\n$/, '');
  } catch {
    return [];
  }
  await rm(path, { force: true }).catch(() => undefined);
  // 대부분의 명령은 HEAD를 건드리지 않는다 — 맨 위 한 줄이 그대로면 더 읽지 않는다.
  const [top] = await reflogLines(root, 1);
  if ((top ?? '') === before) return [];
  const lines = await reflogLines(root, MAX_ENTRIES);
  const fresh = newEntries(lines, before).map((line) => {
    const [sha, , subject = ''] = line.split('\t');
    return { sha, subject };
  });
  return fresh.filter((c) => COMMIT_ENTRY.test(c.subject));
}

// reflog 줄의 시각(--date=unix의 HEAD@{초}). 읽을 수 없으면 null.
function entryTime(line: string): number | null {
  const m = /@\{(\d+)\}/.exec(line.split('\t')[1] ?? '');
  return m ? Number(m[1]) : null;
}

// 기준 항목 위에 쌓인 줄. 기준 항목이 지워졌으면(reflog expire·delete) 기준보다 늦은 시각의 줄만 본다 —
// 그대로 다 세면 예전 커밋을 이번 명령의 커밋으로 잘못 알린다.
function newEntries(lines: string[], before: string): string[] {
  const at = lines.indexOf(before);
  if (at >= 0) return lines.slice(0, at);
  if (!before) return lines; // 기록 당시 reflog가 비어 있었다 — 전부 새 항목
  const since = entryTime(before);
  if (since === null) return [];
  return lines.filter((line) => (entryTime(line) ?? 0) > since);
}

/** 문지기를 거치지 않은 커밋을 알리는 안내 — 이미 커밋된 뒤라 막을 수는 없다. */
export function ungatedCommitNotice(commits: UngatedCommit[]): string {
  const list = commits
    .slice(0, 5)
    .map((c) => `- ${c.sha.slice(0, 7)} ${c.subject}`)
    .join('\n');
  const more = commits.length > 5 ? `\n- …외 ${commits.length - 5}개` : '';
  return [
    '<CONCEPTPOWERS-UNGATED-COMMIT>',
    `방금 실행한 명령은 커밋 명령으로 보이지 않았지만 실행 중에 커밋 ${commits.length}개가 생겼습니다 — ` +
      '스크립트나 다른 프로그램 안에서 만들어진 커밋은 커밋 전 문지기의 검사를 거치지 않았습니다.',
    list + more,
    '같은 때 따로 실행한 커밋이 섞였을 수 있습니다. 커밋 결산은 이미 했으니 `audit`와 conceptpowers:review로 ' +
      '이 커밋들을 확인하고, 문제가 있으면 사용자에게 알리세요. 커밋을 임의로 되돌리지는 마세요.',
    '</CONCEPTPOWERS-UNGATED-COMMIT>',
  ].join('\n');
}
