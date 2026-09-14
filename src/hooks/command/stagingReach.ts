// @concept:governance-mode
// src/hooks/command/stagingReach.ts
// 커밋될 파일을 실행 전에 확정할 수 없는 명령이 디스크에만 있는 거버넌스 변경(설정·판단 기록·개념 문서)까지
// 스테이징할 수 있는지 가늠한다. 넓게 담을 수 있으면(git add -A·add .·commit -a·그 경로를 가리키는 add·
// 무엇을 할지 모르는 다른 명령) 참이다. 좁게 경로를 지정한 스테이징뿐이면 거짓 — 디스크에만 있는 변경은 그 커밋에
// 들어가지 않으므로 묻지 않는다. 판단할 수 없으면 언제나 참(묻는 쪽)으로 기운다.
import { parseShellCommand } from './shellWords.js';

const GOVERNANCE_PATHS = [
  'docs/conceptpowers/init.json',
  'docs/conceptpowers/concepts/.alignment',
  'docs/conceptpowers/concepts/data',
];
const READ_ONLY_GIT = new Set(['status', 'diff', 'log', 'show']);
const COMMIT_VALUE_OPTIONS = new Set([
  '-m',
  '-F',
  '-c',
  '-C',
  '-t',
  '--message',
  '--file',
  '--author',
  '--date',
  '--template',
  '--trailer',
  '--reuse-message',
  '--reedit-message',
]);

function coversGovernance(arg: string): boolean {
  if (arg.startsWith('-')) return false;
  const path = arg.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (path === '' || path === '.' || path.startsWith('..') || path.startsWith(':')) return true;
  if (/[*?[]/.test(path)) return true;
  return GOVERNANCE_PATHS.some(
    (g) => g === path || g.startsWith(`${path}/`) || path.startsWith(`${g}/`)
  );
}

const isBroadAddFlag = (arg: string): boolean =>
  arg === '--all' || arg === '--update' || /^-[a-zA-Z]*[Au][a-zA-Z]*$/.test(arg);

function commitStagesBroadly(args: string[]): boolean {
  let skipValue = false;
  for (const arg of args) {
    if (skipValue) {
      skipValue = false;
      continue;
    }
    if (COMMIT_VALUE_OPTIONS.has(arg)) {
      skipValue = true;
      continue;
    }
    if (arg === '--all' || /^-[b-zA-Z]*a[a-zA-Z]*$/.test(arg)) return true;
    if (!arg.startsWith('-') && coversGovernance(arg)) return true;
  }
  return false;
}

export function mayStageGovernance(command: string): boolean {
  const parsed = parseShellCommand(command);
  if (parsed.incomplete || parsed.functionDefined || parsed.ambiguous) return true;
  for (const seg of parsed.segments) {
    if (seg.words.length === 0) continue;
    if (seg.substitutions.length > 0 || seg.dynamicWords.some(Boolean)) return true;
    const [head, sub, ...args] = seg.words;
    if (head !== 'git' || !sub || sub.startsWith('-')) return true; // 다른 명령·전역 옵션은 무엇을 담을지 모른다
    if (READ_ONLY_GIT.has(sub)) continue;
    if (sub === 'add' || sub === 'stage') {
      if (args.some((a) => isBroadAddFlag(a) || coversGovernance(a))) return true;
      continue;
    }
    if (sub === 'rm' || sub === 'mv') {
      if (args.some(coversGovernance)) return true;
      continue;
    }
    if (sub === 'commit') {
      if (commitStagesBroadly(args)) return true;
      continue;
    }
    return true;
  }
  return false;
}
