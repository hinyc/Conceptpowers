// @concept:generated-not-hand-edited @concept:plugin-version-sync
// 릴리스 절차를 한 번에 강제한다: 검증(타입 검사·커버리지 기준 테스트) → 버전 4곳 동기화 → 재빌드 →
// 생성물 전부를 담은 커밋 + 태그. Claude Code·Codex 자동 업데이트는 plugin.json의 version 문자열이 바뀔 때만
// 사용자에게 반영되므로, "버전만 올리고 빌드를 안 담거나" "검증 없이 올리는" 실수를 구조적으로 막는다.
// 무엇을 담고 무엇에서 멈추는지는 releaseSteps.mjs가 정한다.
//
// 사용법: pnpm release <patch|minor|major|x.y.z>
// 예) pnpm release patch   pnpm release minor   pnpm release 1.2.0
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MANIFESTS,
  RELEASE_PATHS,
  RENDER_COMMAND,
  VERIFY_COMMANDS,
  changesOutsideRelease,
  nextVersion,
} from './releaseSteps.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseBumpArg(argv) {
  const arg = argv[2];
  if (!arg) {
    throw new Error('버전 인자가 필요합니다: pnpm release <patch|minor|major|x.y.z>');
  }
  return arg;
}

// 매니페스트에서 현재 버전을 읽고, 모두 일치하는지 검증한다.
async function readCurrentVersion() {
  const versions = await Promise.all(
    MANIFESTS.map(async (rel) => {
      const text = await readFile(join(root, rel), 'utf8');
      const found = /"version"\s*:\s*"([^"]+)"/.exec(text);
      if (!found) {
        throw new Error(`${rel}에서 version 필드를 찾지 못했습니다`);
      }
      return { rel, version: found[1] };
    })
  );
  const unique = [...new Set(versions.map((v) => v.version))];
  if (unique.length !== 1) {
    const detail = versions.map((v) => `${v.rel}=${v.version}`).join(', ');
    throw new Error(`매니페스트 버전이 불일치합니다(${detail}). 수동으로 맞춘 뒤 다시 실행하세요.`);
  }
  return unique[0];
}

// version 필드만 치환해 기존 포맷을 보존한다(전체 재직렬화 없이 불변 교체).
async function syncVersion(current, next) {
  await Promise.all(
    MANIFESTS.map(async (rel) => {
      const path = join(root, rel);
      const text = await readFile(path, 'utf8');
      const updated = text.replace(
        new RegExp(`("version"\\s*:\\s*")${escapeRegExp(current)}(")`),
        `$1${next}$2`
      );
      if (updated === text) {
        throw new Error(`${rel}의 version을 치환하지 못했습니다(현재 값 "${current}" 불일치)`);
      }
      await writeFile(path, updated);
    })
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 출력 앞뒤 공백을 지우지 않는 원본 호출 — porcelain 출력은 첫 글자가 공백일 수 있다.
function gitRaw(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function git(args) {
  return gitRaw(args).trim();
}

// 릴리스 커밋이 "버전 + 생성물"만 담도록, 시작 시점의 워킹 트리는 깨끗해야 한다.
function assertCleanTree() {
  const status = git(['status', '--porcelain']);
  if (status) {
    throw new Error('워킹 트리가 깨끗하지 않습니다. 먼저 커밋/스태시 후 릴리스하세요.\n' + status);
  }
}

function assertTagAbsent(tag) {
  const existing = git(['tag', '--list', tag]);
  if (existing) {
    throw new Error(`태그 ${tag}가 이미 존재합니다.`);
  }
}

// 검증은 버전을 올리기 전에 한다 — 실패하면 아무 파일도 바뀌지 않은 채 멈춘다.
function verify() {
  for (const [command, args] of VERIFY_COMMANDS) {
    console.log(`검증: ${command} ${args.join(' ')}`);
    execFileSync(command, args, { cwd: root, stdio: 'inherit' });
  }
}

// 빌드 뒤 릴리스 경로 밖에 변경이 남았으면 커밋하지 않는다.
function assertOnlyReleaseChanges() {
  const outside = changesOutsideRelease(
    gitRaw(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  );
  if (outside.length > 0) {
    throw new Error(
      `릴리스 경로 밖의 파일이 바뀌었습니다(생성물 목록이나 빌드를 확인하세요): ${outside.join(', ')}`
    );
  }
}

async function run() {
  try {
    const bump = parseBumpArg(process.argv);
    assertCleanTree();

    const current = await readCurrentVersion();
    const next = nextVersion(current, bump);
    if (next === current) {
      throw new Error(`버전이 동일합니다(${current}). 더 높은 버전을 지정하세요.`);
    }
    const tag = `v${next}`;
    assertTagAbsent(tag);

    verify();
    console.log(`릴리스: ${current} → ${next}`);

    await syncVersion(current, next);
    console.log('버전 동기화 완료 (package.json / plugin.json / marketplace.json)');

    // 훅은 dist/*.js를, 뷰어는 assets/serve.mjs를 직접 실행하므로 배포본에는 최신 빌드가 반드시 포함돼야 한다.
    console.log('재빌드 중...');
    execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
    // 이 저장소의 뷰어 사본을 새 버전 도장으로 다시 렌더한다(빌드는 사본을 만들지 않는다).
    const [renderCommand, renderArgs] = RENDER_COMMAND;
    execFileSync(renderCommand, renderArgs, { cwd: root, stdio: 'inherit' });
    assertOnlyReleaseChanges();

    git(['add', ...RELEASE_PATHS]);
    git(['commit', '-m', `chore(release): ${tag}`]);
    // annotated 태그로 만든다: `git push --follow-tags`는 annotated 태그만 밀기 때문에,
    // lightweight 태그로 두면 안내대로 푸시해도 태그가 조용히 누락된다.
    git(['tag', '-a', tag, '-m', `Release ${tag}`]);

    console.log(`\n완료: 커밋 + 태그 ${tag} 생성.`);
    console.log(`푸시하려면: git push --follow-tags`);
  } catch (error) {
    console.error('릴리스 실패:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

run();
