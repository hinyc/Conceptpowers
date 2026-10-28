// @concept:governance-mode
// src/hooks/command/stagingReach.ts
// 커밋될 파일을 실행 전에 확정할 수 없는 명령이 디스크에만 있는 거버넌스 변경(설정·판단 기록·개념 문서)까지
// 스테이징할 수 있는지 가늠한다(참고자료 포함). 넓게 담을 수 있으면(git add -A·add .·commit -a·그 경로를 가리키는 add·
// 무엇을 할지 모르는 다른 명령) 참이다. 좁게 경로를 지정한 스테이징뿐이면 거짓 — 디스크에만 있는 변경은 그 커밋에
// 들어가지 않으므로 묻지 않는다. 판단할 수 없으면 언제나 참(묻는 쪽)으로 기운다.
import { parseShellCommand } from './shellWords.js';

const REFERENCE_PATH = 'docs/conceptpowers/reference';
const GOVERNANCE_PATHS = [
  'docs/conceptpowers/init.json',
  REFERENCE_PATH, // 참고자료 기밀 확인은 어느 강도에서나 묻는다

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

const cleanPath = (arg: string): string => arg.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
const isWidePath = (path: string): boolean =>
  path === '' ||
  path === '.' ||
  path.startsWith('..') ||
  path.startsWith(':') ||
  /[*?[]/.test(path);
const overlaps = (g: string, path: string): boolean =>
  g === path || g.startsWith(`${path}/`) || path.startsWith(`${g}/`);

function coversGovernance(arg: string): boolean {
  if (arg.startsWith('-')) return false;
  const path = cleanPath(arg);
  return isWidePath(path) || GOVERNANCE_PATHS.some((g) => overlaps(g, path));
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

const isForceFlag = (arg: string): boolean =>
  arg === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(arg);

// 강제 추가(add -f) 한 구간이 참고자료에서 담을 수 있는 경로 — 참고자료 안을 가리키면 그 경로, 참고자료를 품는
// 경로·넓은 지정·경로 없음·판단할 수 없는 낱말이면 참고자료 폴더 전체.
function forcedSpecsOf(words: string[], dynamic: boolean[]): string[] {
  const paths = words.filter((a, i) => !a.startsWith('-') || dynamic[i]);
  if (paths.length === 0 || dynamic.some(Boolean)) return [REFERENCE_PATH];
  return paths.flatMap((arg) => {
    const path = cleanPath(arg);
    if (path.startsWith(`${REFERENCE_PATH}/`)) return [path];
    return isWidePath(path) || overlaps(REFERENCE_PATH, path) ? [REFERENCE_PATH] : [];
  });
}

// 무시 목록(.gitignore)에 걸린 참고자료는 강제 추가로만 담긴다. 명령 속 강제 추가(git add/stage -f)가 닿는 참고자료
// 경로를 돌려준다(없으면 빈 배열) — 문지기는 이 경로의 무시된 새 파일까지 커밋될 수 있는 참고자료로 본다.
export function forcedReferenceSpecs(command: string): string[] {
  const parsed = parseShellCommand(command);
  const specs = parsed.segments.flatMap((seg) => {
    const [head, sub, ...args] = seg.words;
    if (head !== 'git' || (sub !== 'add' && sub !== 'stage') || !args.some(isForceFlag)) return [];
    return forcedSpecsOf(args, seg.dynamicWords.slice(2));
  });
  return [...new Set(specs)];
}
