// @concept:output-locale @concept:governance-mode
// src/i18n/commitReasons.ts
// 커밋 명령 해석기(src/hooks/command)가 "커밋될 파일을 실행 전에 확정할 수 없다"고 판정한 사유를 ko/en 두 벌로 관리한다.
// 해석기는 로캘을 모르므로 사유를 (locale) => string 함수(Reason)로 들고 다니다가, 사람에게 보이는 지점
// (preToolUse)에서 프로젝트 로캘로 풀어 쓴다.
import type { Locale } from '../schema/initConfig.js';

export type Reason = (locale: Locale) => string;

const pair =
  (ko: string, en: string): Reason =>
  (locale) =>
    TEXTS[locale](ko, en);

// 문구표와 같은 방식 — Record<Locale, …>라 locale이 늘면 여기서 타입 오류가 난다.
const TEXTS: Record<Locale, (ko: string, en: string) => string> = {
  ko: (ko) => ko,
  en: (_ko, en) => en,
};

export const R = {
  incompleteQuote: pair(
    '셸마다 다르게 읽힐 수 있는 닫히지 않은 따옴표·치환',
    'unclosed quote or substitution that different shells may read differently'
  ),
  functionDefined: pair('함수 정의가 있는 명령', 'a command that defines a function'),
  ambiguousSyntax: pair(
    '셸마다 다르게 읽히는 구문(명령 자리의 산술식)',
    'syntax that different shells read differently (an arithmetic expression in command position)'
  ),
  deepNesting: pair(
    '명령 중첩이 너무 깊어 해석할 수 없음',
    'commands are nested too deeply to interpret'
  ),
  redirectWrites: pair('파일에 쓰는 리다이렉션', 'a redirection that writes to a file'),
  clash: pair(
    '파이프·백그라운드로 커밋과 동시에 실행되는 명령',
    'a command that runs concurrently with the commit through a pipe or in the background'
  ),
  loopBranch: pair(
    '반복문·분기문 안에서 실행되는 명령',
    'a command run inside a loop or conditional'
  ),
  expansionCommand: pair('셸 확장으로 정해지는 명령', 'a command determined by shell expansion'),
  expansionCommit: pair(
    '셸 확장으로 정해지는 명령 속 커밋',
    'a commit inside a command determined by shell expansion'
  ),
  evalExpansion: pair('셸 확장(eval)', 'shell expansion (eval)'),
  mayChangeOrRun: pair(
    '커밋될 파일을 바꾸거나 다른 명령을 실행할 수 있는 명령',
    'a command that can change the files to be committed or run other commands'
  ),
  netExec: pair(
    '다른 명령을 실행하는 명령 안의 git commit',
    'a git commit inside a command that runs other commands'
  ),
  netCode: pair(
    '다른 명령에 넘긴 코드 속 git commit',
    'a git commit inside code passed to another command'
  ),
  shellScript: pair('셸이 읽어 실행하는 스크립트', 'a script the shell reads and runs'),
  shellInput: pair(
    '셸이 읽어 실행하는 입력 속 git commit',
    'a git commit inside input the shell reads and runs'
  ),
  expansionGit: pair(
    '셸 확장으로 정해지는 git 명령',
    'a git command determined by shell expansion'
  ),
  expansionGitSub: pair(
    '셸 확장으로 정해지는 git 하위 명령',
    'a git subcommand determined by shell expansion'
  ),
  gitWritesFiles: pair('파일을 쓰는 git 명령', 'a git command that writes files'),
  gitMutatesConfig: pair('git 설정을 바꾸는 명령', 'a command that changes git configuration'),
  gitMutatesIndex: pair(
    '스테이징(색인)을 바꾸는 git 명령',
    'a git command that changes the staging area (index)'
  ),
  gitExecutes: pair(
    '다른 명령을 실행할 수 있는 git 명령',
    'a git command that can run other commands'
  ),
  gitExecutesCommit: pair(
    'git이 실행하는 명령 속 git commit',
    'a git commit inside a command that git runs'
  ),
  commitDynamic: pair(
    '셸 확장(eval·명령 치환) 안에서 실행되는 커밋',
    'a commit run inside shell expansion (eval or command substitution)'
  ),
  commitOtherRepo: pair(
    '다른 저장소·색인을 가리키는 git 옵션·환경 변수',
    'git options or environment variables that point at another repository or index'
  ),
  commitUnknownPlace: pair(
    '알 수 없는 위치로 옮긴 뒤의 커밋',
    'a commit after moving to an unknown location'
  ),
  pathspecMode: pair(
    '경로 해석 방식을 바꾸는 git 옵션·환경 변수와 함께 쓴 경로 지정 커밋',
    'a path-limited commit used together with git options or environment variables that change how paths are interpreted'
  ),
  multipleCommits: pair('한 명령에서 여러 번 커밋', 'several commits in one command'),
  unclassifiedGitBuiltin: pair(
    '분류되지 않은 git 내장 명령',
    'an unclassified git built-in command'
  ),
  aliasInjected: pair(
    '같은 명령에서 주입·변경된 설정으로 정해질 수 있는 git 명령',
    'a git command that may be determined by configuration injected or changed in the same command'
  ),
  aliasTooDeep: pair(
    'git alias가 너무 깊게 이어져 해석할 수 없음',
    'git aliases chain too deeply to interpret'
  ),
  shellAlias: pair('셸 명령으로 풀리는 git alias', 'a git alias that expands to a shell command'),
  interactive: pair(
    '대화형으로 고르는 커밋(-p·--interactive)',
    'an interactively selected commit (-p, --interactive)'
  ),
  dynPathOpt: pair(
    '셸 확장으로 정해지는 커밋 경로·옵션',
    'a commit path or option determined by shell expansion'
  ),
  dynOpt: pair('셸 확장으로 정해지는 커밋 옵션', 'a commit option determined by shell expansion'),
  unknownOpt: pair('알 수 없거나 모호한 커밋 옵션', 'an unknown or ambiguous commit option'),
  pathFromFile: pair('파일에서 읽는 커밋 경로', 'commit paths read from a file'),
  unknownShortOpt: pair('알 수 없는 커밋 옵션', 'an unknown commit option'),
  outsideRel: pair(
    '프로젝트 밖(같은 저장소)의 위치에서 루트 기준으로 풀 수 없는 경로를 지정한 커밋',
    'a commit run from outside the project (same repository) with a path that cannot be resolved relative to the root'
  ),
  aliasTop: pair(
    '저장소 최상위를 확인할 수 없는 셸 alias 속 커밋',
    'a commit inside a shell alias whose repository top level cannot be determined'
  ),
  unknownRepo: pair(
    'git 저장소인지 확인할 수 없는 프로젝트 밖의 위치에서 실행되는 커밋',
    'a commit run from a location outside the project that cannot be confirmed as a git repository'
  ),
  aliasNewline: pair('줄바꿈이 든 git alias', 'a git alias containing a newline'),
  shellAliasDyn: pair(
    '셸 확장 인자를 받는 셸 alias',
    'a shell alias given shell-expanded arguments'
  ),
  aliasUnsplittable: pair(
    'git이 나눌 수 없는 git alias(닫히지 않은 따옴표·끝의 역슬래시)',
    'a git alias git cannot split (unclosed quote or trailing backslash)'
  ),
} as const;

/** git commit이 아닌 명령(git <sub>)이 만드는 커밋 */
export const otherCommit =
  (sub: string): Reason =>
  (locale) =>
    locale === 'ko'
      ? `git commit이 아닌 명령(git ${sub})이 만드는 커밋`
      : `a commit made by a command other than git commit (git ${sub})`;

/** 커밋 앞의 명령이 커밋될 파일을 바꿀 수 있음 */
export const impureBefore =
  (impure: Reason): Reason =>
  (locale) =>
    locale === 'ko'
      ? `커밋 앞의 명령이 커밋될 파일을 바꿀 수 있음(${impure(locale)})`
      : `a command before the commit may change the files to be committed (${impure(locale)})`;
