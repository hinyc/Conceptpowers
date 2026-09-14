// @concept:governance-mode
// src/hooks/command/commandKinds.ts
// 커밋 게이트의 명령 분류표. 셸 전체를 이해하려 하지 않고 확실히 안전하다고 아는 것만 목록으로 두며, 목록에 없는
// 명령은 "커밋될 파일을 바꾸거나 다른 명령을 실행할 수 있음"으로 본다 — 모르면 확정 불가 쪽으로 기운다.

/** 명령 단위 앞에 붙어도 실행될 명령을 바꾸지 않는 셸 예약어 */
export const RESERVED_WORDS = new Set([
  '!',
  '{',
  '}',
  'if',
  'then',
  'elif',
  'else',
  'fi',
  'do',
  'done',
  'while',
  'until',
]);

/** 반복·분기문을 여는 예약어 — 그 안의 커밋은 몇 번, 어떤 순서로 실행될지 알 수 없다 */
export const CONTROL_WORDS = new Set(['while', 'until', 'for', 'select', 'case']);

/** 뒤따르는 값을 코드로 실행하는 흔한 옵션(인터프리터 -c/-e, env -S, rebase -x 등) */
export const CODE_FLAGS = new Set([
  '-c',
  '-e',
  '-S',
  '-x',
  '--command',
  '--eval',
  '--exec',
  '--split-string',
]);

/** 파일을 쓰지도 다른 명령을 실행하지도 않는 명령 — 커밋 앞에 와도 커밋될 파일을 바꾸지 못한다 */
export const PURE_COMMANDS = new Set(
  'echo printf pwd true false : test [ [[ ]] sleep date which type ls cat head tail wc grep rg basename dirname realpath readlink stat du df whoami id uname hostname printenv'.split(
    ' '
  )
);

/** 파일은 바꿀 수 있지만 인자를 명령으로 실행하지는 않는 명령 */
export const FILE_COMMANDS = new Set(
  'cp mv rm rmdir mkdir touch ln chmod chown tee sort uniq cut tr diff jq truncate'.split(' ')
);

/** 변수를 선언·내보내는 셸 내장 명령 */
export const DECLARE_COMMANDS = new Set([
  'export',
  'declare',
  'typeset',
  'local',
  'readonly',
  'unset',
]);

export const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);

/** 뒤따르는 명령을 인자 그대로 실행하는 래퍼와, 값을 하나 받는 그 옵션들 */
export const WRAPPERS: Record<string, ReadonlySet<string>> = {
  command: new Set(),
  builtin: new Set(),
  exec: new Set(['-a']),
  nohup: new Set(),
  noglob: new Set(),
  nocorrect: new Set(),
  time: new Set(['-f', '-o']),
  nice: new Set(['-n']),
  env: new Set(['-u']),
  sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-U', '-r', '-t', '-T']),
  doas: new Set(['-u', '-C']),
};

export const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** 저장소·색인 위치를 바꾸는 git 환경 변수 */
export const GIT_REPO_ENV =
  /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|NAMESPACE|COMMON_DIR)(=|$)/;
/** 명령 줄에서 git 설정을 주입하는 환경 변수 */
export const GIT_CONFIG_ENV =
  /^GIT_CONFIG(_COUNT|_KEY_\d+|_VALUE_\d+|_PARAMETERS|_GLOBAL|_SYSTEM)?(=|$)/;
/** 저장소 위치를 바꾸거나 다른 설정 파일을 끌어오는 -c 설정 키 */
export const GIT_REPO_CONFIG = /^(core\.(worktree|bare)|include\.|includeif\.)/i;

export const GIT_GLOBAL_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--config-env',
  '--super-prefix',
  '--attr-source',
]);
export const GIT_GLOBAL_REPO = new Set(['--git-dir', '--work-tree', '--namespace', '--bare']);
/** 경로 지정 해석 방식을 바꾸는 전역 옵션·환경 변수 — 경로 지정 커밋의 파일 계산이 달라진다 */
export const GIT_PATHSPEC_OPTIONS = new Set([
  '--icase-pathspecs',
  '--glob-pathspecs',
  '--noglob-pathspecs',
  '--literal-pathspecs',
]);
export const GIT_PATHSPEC_ENV = /^GIT_(ICASE|GLOB|NOGLOB|LITERAL)_PATHSPECS(=|$)/;

/**
 * git 내장 하위 명령 이름(git 2.50 `git --list-cmds=main,nohelpers`). git은 내장 이름을 alias로 덮어쓰지 못하므로
 * 이 이름들은 설정이 주입돼도 alias로 풀릴 수 없다. 읽기·변경 분류에 없는 내장 명령은 무엇을 바꿀지 모르는
 * 명령으로 본다(뒤따르는 커밋의 파일을 확정할 수 없다).
 */
export const GIT_BUILTINS = new Set(
  'add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap check-ref-format checkout checkout-index cherry cherry-pick clean clone column commit commit-graph commit-tree config count-objects credential credential-cache credential-store daemon describe diagnose diff diff-files diff-index diff-pairs diff-tree difftool fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch fsck fsck-objects gc get-tar-commit-id grep hash-object help hook http-backend http-fetch http-push imap-send index-pack init init-db interpret-trailers log ls-files ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-octopus merge-one-file merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs merge-resolve merge-subtree merge-tree mergetool mktag mktree multi-pack-index mv name-rev notes p4 pack-objects pack-redundant pack-refs patch-id pickaxe prune prune-packed pull push quiltimport range-diff read-tree rebase receive-pack reflog refs remote remote-ext remote-fd remote-ftp remote-ftps remote-http remote-https repack replace replay request-pull rerere reset restore rev-list rev-parse revert rm send-email send-pack shell shortlog show show-branch show-index show-ref sparse-checkout stage stash status stripspace submodule subtree switch symbolic-ref tag unpack-file unpack-objects update-index update-ref update-server-info upload-archive upload-pack var verify-commit verify-pack verify-tag version whatchanged worktree write-tree'.split(
    ' '
  )
);

export type GitCallKind =
  'commit' | 'read' | 'writeFiles' | 'mutateIndex' | 'mutateConfig' | 'execute' | 'unknown';

/** 다른 명령을 실행할 수 있는 하위 명령(rebase -x, bisect run, submodule foreach 등) */
const GIT_EXECUTE = new Set([
  'rebase',
  'bisect',
  'filter-branch',
  'difftool',
  'mergetool',
  'submodule',
]);
/** 색인(스테이징)이나 HEAD를 바꿀 수 있는 하위 명령 */
const GIT_MUTATE_INDEX = new Set(
  'add stage rm mv reset restore checkout switch stash apply am merge pull cherry-pick revert read-tree update-index sparse-checkout update-ref symbolic-ref'.split(
    ' '
  )
);
/** 색인·설정을 바꾸지 않고 명령도 실행하지 않는 하위 명령 */
const GIT_READ = new Set(
  'diff-tree diff-index diff-files show-ref check-ref-format check-mailmap verify-pack show-index patch-id column stripspace get-tar-commit-id status diff log show fetch push branch tag remote blame grep ls-files ls-tree rev-parse rev-list cat-file describe shortlog reflog help version archive bundle format-patch range-diff whatchanged show-branch for-each-ref commit-tree hash-object write-tree mktree merge-base name-rev count-objects verify-commit verify-tag var annotate cherry request-pull check-ignore check-attr ls-remote interpret-trailers credential clone init gc prune repack fsck maintenance replace notes worktree clean'.split(
    ' '
  )
);
/** 읽기 명령이지만 --output/-o로 파일을 쓸 수 있는 하위 명령 */
const OUTPUT_CAPABLE = new Set(['diff', 'log', 'show', 'format-patch', 'archive']);
const CONFIG_READ_FLAGS = new Set([
  '--get',
  '--get-all',
  '--get-regexp',
  '--get-urlmatch',
  '--list',
  '-l',
]);

export function classifyGitCall(sub: string, args: string[]): GitCallKind {
  if (sub === 'commit') return 'commit';
  if (sub === 'stash') return args[0] === 'list' || args[0] === 'show' ? 'read' : 'mutateIndex';
  if ((sub === 'checkout' || sub === 'switch') && args.length === 2) {
    if (['-b', '-B', '-c', '-C'].includes(args[0])) return 'read'; // 새 브랜치만 만든다 — 색인 그대로
  }
  if (sub === 'submodule' && (args[0] === 'status' || args[0] === 'summary')) return 'read';
  if (sub === 'config') {
    const plain = args.filter((a) => !a.startsWith('-'));
    return args.some((a) => CONFIG_READ_FLAGS.has(a)) || plain.length <= 1
      ? 'read'
      : 'mutateConfig';
  }
  if (OUTPUT_CAPABLE.has(sub) && args.some((a) => /^--output(=|$)/.test(a) || /^-o/.test(a))) {
    return 'writeFiles';
  }
  if (GIT_EXECUTE.has(sub)) return 'execute';
  if (GIT_MUTATE_INDEX.has(sub)) return 'mutateIndex';
  if (GIT_READ.has(sub)) return 'read';
  return 'unknown';
}
