// @concept:governance-mode
// src/hooks/command/commitArgs.ts
// `git commit` 인자를 git과 같게 읽어 무엇이 커밋되는지(범위·경로)를 정한다. git이 받아들이는 긴 옵션 약어를
// 풀고, 모르는·모호한 옵션이나 셸 확장으로 정해지는 옵션·경로는 확정 불가로 돌린다. 옵션 값(-m 메시지 등)은
// 범위를 바꾸지 않으므로 셸 확장이어도 괜찮다.

export type CommitScope = 'index' | 'all' | 'only' | 'include';

export interface CommitArgs {
  dryRun: boolean;
  scope: CommitScope;
  pathspecs: string[];
  unresolved?: string;
}

type OptionKind = 'flag' | 'value' | 'optional';

const LONG_OPTIONS: Record<string, OptionKind> = {
  all: 'flag',
  include: 'flag',
  only: 'flag',
  interactive: 'flag',
  patch: 'flag',
  'dry-run': 'flag',
  'no-dry-run': 'flag',
  message: 'value',
  file: 'value',
  'reuse-message': 'value',
  'reedit-message': 'value',
  fixup: 'value',
  squash: 'value',
  'reset-author': 'flag',
  short: 'flag',
  branch: 'flag',
  porcelain: 'flag',
  long: 'flag',
  null: 'flag',
  template: 'value',
  signoff: 'flag',
  'no-signoff': 'flag',
  trailer: 'value',
  verify: 'flag',
  'no-verify': 'flag',
  'allow-empty': 'flag',
  'allow-empty-message': 'flag',
  cleanup: 'value',
  edit: 'flag',
  'no-edit': 'flag',
  amend: 'flag',
  'no-post-rewrite': 'flag',
  'untracked-files': 'optional',
  verbose: 'flag',
  quiet: 'flag',
  status: 'flag',
  'no-status': 'flag',
  'gpg-sign': 'optional',
  'no-gpg-sign': 'flag',
  'pathspec-from-file': 'value',
  'pathspec-file-nul': 'flag',
  author: 'value',
  date: 'value',
};
const SHORT_VALUE = new Set(['m', 'F', 'C', 'c', 't']);
const SHORT_OPTIONAL_ATTACHED = new Set(['S', 'u']);
const SHORT_FLAGS = new Set(['a', 'i', 'o', 'e', 'n', 'q', 's', 'v', 'z', 'h']);
const INTERACTIVE = '대화형으로 고르는 커밋(-p·--interactive)';

// git처럼 정확히 같은 이름이 없으면 유일한 접두사로 푼다. 없거나 모호하면 null.
function resolveLong(name: string): string | null {
  if (name in LONG_OPTIONS) return name;
  const hits = Object.keys(LONG_OPTIONS).filter((o) => o.startsWith(name));
  return hits.length === 1 ? hits[0] : null;
}

export function analyzeCommitArgs(words: string[], dynamic: boolean[]): CommitArgs {
  const pathspecs: string[] = [];
  const flags = { all: false, include: false, only: false };
  let afterDashDash = false;
  let dryRun = false; // git처럼 뒤에 나온 --dry-run / --no-dry-run이 이긴다
  const stop = (unresolved: string): CommitArgs => ({
    dryRun: false,
    scope: 'index',
    pathspecs,
    unresolved,
  });

  for (let i = 0; i < words.length; i++) {
    const arg = words[i];
    if (afterDashDash || !arg.startsWith('-') || arg === '-') {
      if (dynamic[i]) return stop('셸 확장으로 정해지는 커밋 경로·옵션');
      pathspecs.push(arg);
      continue;
    }
    if (arg === '--') {
      afterDashDash = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const rawName = arg.slice(2).split('=')[0];
      if (dynamic[i] && /[$`]/.test(rawName)) return stop('셸 확장으로 정해지는 커밋 옵션');
      const name = resolveLong(rawName);
      if (!name) return stop('알 수 없거나 모호한 커밋 옵션');
      // 값이 붙은 옵션(--message="$MSG")의 값은 범위를 바꾸지 않는다 — 그 밖의 셸 확장 옵션은 알 수 없다.
      if (dynamic[i] && !(arg.includes('=') && LONG_OPTIONS[name] !== 'flag')) {
        return stop('셸 확장으로 정해지는 커밋 옵션');
      }
      if (name === 'dry-run' || name === 'no-dry-run') {
        dryRun = name === 'dry-run';
        continue;
      }
      if (name === 'interactive' || name === 'patch') return stop(INTERACTIVE);
      if (name === 'pathspec-from-file') return stop('파일에서 읽는 커밋 경로');
      if (name === 'all' || name === 'include' || name === 'only') flags[name] = true;
      if (LONG_OPTIONS[name] === 'value' && !arg.includes('=')) i++;
      continue;
    }
    for (let k = 1; k < arg.length; k++) {
      const ch = arg[k];
      if (ch === '$' || ch === '`') return stop('셸 확장으로 정해지는 커밋 옵션');
      if (ch === 'p') return stop(INTERACTIVE);
      if (SHORT_VALUE.has(ch)) {
        if (k === arg.length - 1) i++;
        break;
      }
      if (SHORT_OPTIONAL_ATTACHED.has(ch)) break; // -S<key>, -u<mode>
      if (!SHORT_FLAGS.has(ch)) return stop('알 수 없는 커밋 옵션');
      if (ch === 'a') flags.all = true;
      if (ch === 'i') flags.include = true;
      if (ch === 'o') flags.only = true;
    }
  }
  const scope: CommitScope = flags.all
    ? 'all'
    : flags.include
      ? 'include'
      : flags.only || pathspecs.length > 0
        ? 'only'
        : 'index';
  return { dryRun, scope, pathspecs };
}
