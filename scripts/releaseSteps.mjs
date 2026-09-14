// @concept:generated-not-hand-edited @concept:plugin-version-sync
// scripts/releaseSteps.mjs
// 릴리스 절차의 판단부 — 어떤 경로를 릴리스 커밋에 담는지, 빌드 뒤 무엇이 남으면 멈추는지, 무엇으로 먼저 검증하는지,
// 버전을 어떻게 올리는지. release.mjs는 이 판단대로 명령을 실행하기만 한다(테스트가 판단부를 직접 검증한다).

// 버전 문자열을 담은 모든 매니페스트. 모두 항상 동일한 값이어야 한다.
// Codex 마켓플레이스(.agents/plugins/marketplace.json)는 version 필드가 없어 대상이 아니다.
export const MANIFESTS = [
  'package.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
];

// 빌드(scripts/build.mjs)가 다시 만드는 생성물 전부. 원본을 고쳐 다시 만들었으면 같은 릴리스 커밋에 담는다 —
// 하나라도 빠지면 배포본에 낡은 생성물이 실린다(예: 뷰어 서버 번들).
export const BUILD_OUTPUTS = ['dist', 'assets/serve.mjs'];

// 이 저장소가 스스로 쓰는 뷰어 사본(서버 번들 사본·manifest 버전 도장)은 빌드가 아니라 render가 다시 만든다.
// 새 버전으로 다시 렌더해 같은 릴리스 커밋에 담지 않으면, 릴리스 직후 세션 시작의 자동 동기화가 트리를 다시 더럽힌다.
export const RENDERED_OUTPUTS = ['docs/conceptpowers/concepts/viewer'];
export const RENDER_COMMAND = ['node', ['dist/cli.js', 'render', '--root', '.']];

export const RELEASE_PATHS = [...MANIFESTS, ...BUILD_OUTPUTS, ...RENDERED_OUTPUTS];

// 버전을 올리기 전에 반드시 통과해야 하는 검증. 커버리지 기준(vitest.config.ts thresholds)까지 함께 본다.
export const VERIFY_COMMANDS = [
  ['pnpm', ['typecheck']],
  ['pnpm', ['test:coverage']],
];

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(current, bump) {
  const match = SEMVER.exec(current);
  if (!match) {
    throw new Error(`현재 버전이 SemVer 형식이 아닙니다: "${current}"`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      if (!SEMVER.test(bump)) {
        throw new Error(`알 수 없는 버전 인자: "${bump}" (patch|minor|major 또는 x.y.z)`);
      }
      return bump;
  }
}

const insideRelease = (path) =>
  RELEASE_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));

// `git status --porcelain=v1 -z --untracked-files=all` 출력에서 릴리스 경로 밖의 변경을 고른다.
// 빌드가 담지 않을 파일을 바꿨다면(생성물 목록이 낡았거나 빌드가 원본을 건드린 경우) 커밋하지 않고 멈추게 한다.
// 이름 바꾸기·복사 항목은 새 경로 뒤에 옛 경로가 한 항목 더 오므로 둘 다 본다.
export function changesOutsideRelease(porcelainZ) {
  const entries = porcelainZ.split('\0').filter(Boolean);
  const paths = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2)) && i + 1 < entries.length) {
      i += 1;
      paths.push(entries[i]);
    }
  }
  return paths.filter((path) => !insideRelease(path));
}
