// @concept:generated-not-hand-edited @concept:plugin-version-sync
// 릴리스 절차를 한 번에 강제한다: develop·깨끗한 트리 확인 → 검증(타입 검사·커버리지 기준 테스트·포맷) → 버전 4곳 동기화 →
// 재빌드·렌더 → develop에 릴리스 커밋 → main에 허용 목록 파일만 반영한 배포 커밋 + annotated 태그(태그는 main 커밋에).
// Claude Code·Codex 자동 업데이트는 plugin.json의 version 문자열이 바뀔 때만 사용자에게 반영되고 사용자 설치는 main을 따르므로,
// "버전만 올리고 빌드를 안 담거나" "검증 없이 올리는" 실수를 구조적으로 막는다. push는 하지 않는다 — 명령만 출력한다.
// 무엇을 담고 무엇에서 멈추는지는 releaseSteps.mjs가 정한다.
//
// 사용법: pnpm release <patch|minor|major|x.y.z> [--yes]
//        pnpm release --resume [--yes]   (develop 릴리스 커밋 뒤 main 반영·태그가 중단됐을 때 이어서 마무리)
// 예) pnpm release patch   pnpm release minor   pnpm release 1.2.0
// main에서 지울 파일이 많으면(처음 릴리스 등) 목록을 보여 주고 --yes 없이는 멈춘다.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  DEPLOY_BRANCH,
  DEVELOP_BRANCH,
  MANIFESTS,
  RELEASE_PATHS,
  RENDER_COMMAND,
  VERIFY_COMMANDS,
  changesOutsideRelease,
  findDescriptionMismatch,
  judgeMainState,
  needsRemovalConfirmation,
  nextVersion,
  parseLsTree,
  parseReleaseArgs,
  planMainSync,
  pushCommand,
  toIndexInfo,
} from './releaseSteps.mjs';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// 매니페스트에서 현재 버전을 읽고, 모두 일치하는지 검증한다.
async function readCurrentVersion(root) {
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
async function syncVersion(root, current, next) {
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

function makeGit(root) {
  // 출력 앞뒤 공백을 지우지 않는 원본 호출 — porcelain 출력은 첫 글자가 공백일 수 있다.
  const raw = (args, options = {}) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options });
  return { raw, run: (args, options) => raw(args, options).trim() };
}

// 릴리스는 develop에서만, 시작 시점의 트리는 깨끗해야 한다(릴리스 커밋이 "버전 + 생성물"만 담도록).
function assertDevelopAndClean(git) {
  const branch = git.run(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== DEVELOP_BRANCH) {
    throw new Error(`릴리스는 ${DEVELOP_BRANCH} 브랜치에서만 합니다(현재: ${branch}).`);
  }
  const status = git.run(['status', '--porcelain']);
  if (status) {
    throw new Error('워킹 트리가 깨끗하지 않습니다. 먼저 커밋/스태시 후 릴리스하세요.\n' + status);
  }
}

function assertTagAbsent(git, tag) {
  if (git.run(['tag', '--list', tag])) {
    throw new Error(`태그 ${tag}가 이미 존재합니다.`);
  }
}

function branchExists(git, branch) {
  try {
    git.run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

// ref 트리의 파일 항목(ls-tree).
function listTree(git, ref) {
  return parseLsTree(git.raw(['ls-tree', '-r', '-z', ref]));
}

// main에 반영할 계획. 브랜치가 아직 없으면 main 쪽은 빈 목록이다.
function planDeploy(git) {
  const developEntries = listTree(git, DEVELOP_BRANCH);
  const mainEntries = branchExists(git, DEPLOY_BRANCH) ? listTree(git, DEPLOY_BRANCH) : [];
  const plan = planMainSync(
    developEntries.map((e) => e.path),
    mainEntries.map((e) => e.path)
  );
  return { plan, developEntries };
}

function reportPlan(plan, log) {
  log(
    `${DEPLOY_BRANCH} 반영 계획: 유지/갱신 ${plan.keep.length}개, 새로 추가 ${plan.added.length}개, 삭제 ${plan.remove.length}개`
  );
  if (plan.remove.length > 0) {
    log('삭제 예정(앞 15개):');
    plan.remove.slice(0, 15).forEach((p) => log(`  - ${p}`));
    if (plan.remove.length > 15) log(`  ... 외 ${plan.remove.length - 15}개`);
  }
}

// 검증은 버전을 올리기 전에 한다 — 실패하면 아무 파일도 바뀌지 않은 채 멈춘다.
function verify(root, log) {
  for (const [command, args] of VERIFY_COMMANDS) {
    log(`검증: ${command} ${args.join(' ')}`);
    execFileSync(command, args, { cwd: root, stdio: 'inherit' });
  }
}

// 빌드 뒤 릴리스 경로 밖에 변경이 남았으면 커밋하지 않는다.
function assertOnlyReleaseChanges(git) {
  const outside = changesOutsideRelease(
    git.raw(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  );
  if (outside.length > 0) {
    throw new Error(
      `릴리스 경로 밖의 파일이 바뀌었습니다(생성물 목록이나 빌드를 확인하세요): ${outside.join(', ')}`
    );
  }
}

function refExists(git, ref) {
  try {
    git.run(['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

// 로컬 main·원격 추적 ref(origin/main)만 본다 — 네트워크 fetch는 하지 않는다.
// 로컬 main이 없으면 부모 없는 고아 커밋이 생기고, 원격보다 뒤처졌으면 push가 거절되므로 시작 전에 멈춘다.
function assertMainState(git, confirmed) {
  const localMain = branchExists(git, DEPLOY_BRANCH);
  const remoteRef = `refs/remotes/origin/${DEPLOY_BRANCH}`;
  const remoteMain = refExists(git, remoteRef);
  let localContainsRemote = true;
  if (localMain && remoteMain) {
    try {
      git.run(['merge-base', '--is-ancestor', remoteRef, `refs/heads/${DEPLOY_BRANCH}`]);
    } catch {
      localContainsRemote = false;
    }
  }
  const verdict = judgeMainState({ localMain, remoteMain, localContainsRemote });
  if (!verdict.ok) throw new Error(verdict.reason);
  if (verdict.firstDeploy && !confirmed) {
    throw new Error(
      `${DEPLOY_BRANCH} 브랜치도 origin/${DEPLOY_BRANCH}도 없어 부모 없는 첫 배포 커밋을 만듭니다. 처음 배포가 맞으면 --yes를 붙여 다시 실행하세요.`
    );
  }
}

// 매니페스트 4곳의 description이 같은지 검증한다 — 버전을 올리기 전에 한다.
async function assertDescriptionsConsistent(root) {
  const texts = {};
  for (const rel of MANIFESTS) texts[rel] = await readFile(join(root, rel), 'utf8');
  const mismatch = findDescriptionMismatch(texts);
  if (mismatch.length > 0) {
    throw new Error(`매니페스트 description이 서로 다릅니다: ${mismatch.join(' / ')}`);
  }
}

// develop 릴리스 커밋에서 허용 목록 파일만 담은 트리를 임시 index로 만들어 main에 쌓는다.
// 작업 트리·HEAD·체크아웃은 건드리지 않는다(plumbing만 사용) — main은 체크아웃돼 있지 않다.
// 트리와 커밋 객체는 ref를 건드리지 않고 먼저 만들고, ref 갱신(main → 태그)은 마지막에 몰아서 한다.
// 다시 실행해도 안전하다: main이 이미 같은 트리를 가졌으면 커밋을 또 쌓지 않고, 태그가 이미 있으면 건너뛴다.
async function writeDeployCommit(git, tag, log) {
  const { plan, developEntries } = planDeploy(git);
  reportPlan(plan, log);
  const keepSet = new Set(plan.keep);
  const entries = developEntries.filter((e) => keepSet.has(e.path));
  const dir = await mkdtemp(join(tmpdir(), 'cp-release-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
  try {
    git.raw(['read-tree', '--empty'], { env });
    git.raw(['update-index', '-z', '--index-info'], { env, input: toIndexInfo(entries) });
    const tree = git.run(['write-tree'], { env });
    const mainRef = `refs/heads/${DEPLOY_BRANCH}`;
    const hasMain = branchExists(git, DEPLOY_BRANCH);
    if (hasMain && git.run(['rev-parse', `${mainRef}^{tree}`]) === tree) {
      log(`${DEPLOY_BRANCH}가 이미 이 릴리스의 트리를 가졌습니다 — 배포 커밋은 건너뜁니다.`);
    } else {
      const oldMain = hasMain ? git.run(['rev-parse', mainRef]) : '';
      const parentArgs = hasMain ? ['-p', oldMain] : [];
      const commit = git.run(['commit-tree', tree, ...parentArgs, '-m', `chore(release): ${tag}`]);
      // 옛 값을 함께 넘겨, 그 사이 main이 움직였으면 덮어쓰지 않고 실패한다(빈 값은 "없어야 한다").
      git.run(['update-ref', mainRef, commit, oldMain]);
    }
    const mainCommit = git.run(['rev-parse', mainRef]);
    if (refExists(git, `refs/tags/${tag}`)) {
      if (git.run(['rev-parse', `refs/tags/${tag}^{commit}`]) !== mainCommit) {
        throw new Error(
          `태그 ${tag}가 이미 있지만 ${DEPLOY_BRANCH} 커밋을 가리키지 않습니다. 확인 후 지우고 다시 실행하세요.`
        );
      }
      log(`태그 ${tag}가 이미 ${DEPLOY_BRANCH} 커밋에 있습니다.`);
    } else {
      // annotated 태그를 main 커밋에 단다: 사용자 설치는 main을 따르고, lightweight 태그는 `--follow-tags`로 안 밀린다.
      git.run(['tag', '-a', tag, '-m', `Release ${tag}`, mainCommit]);
    }
    return mainCommit;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// main 반영·태그가 중간에 실패했을 때 — develop 릴리스 커밋은 이미 확정돼 있으므로 이어서 마무리하는 방법을 알린다.
function recoveryGuide(tag, error) {
  const cause = error instanceof Error ? error.message : String(error);
  return [
    `릴리스 중단: ${DEVELOP_BRANCH} 릴리스 커밋(${tag})은 만들어졌지만 ${DEPLOY_BRANCH} 반영/태그가 끝나지 않았습니다.`,
    `원인: ${cause}`,
    '복구: 원인(예: .git/refs/heads/main.lock 잔여 파일, 태그 서명 설정)을 해결한 뒤 같은 버전으로 이어서 마무리합니다.',
    '  pnpm release --resume   (main이 이미 같은 트리를 가졌으면 태그만 답니다. 첫 배포였다면 --yes도 붙이세요.)',
    '버전을 다시 올리거나 develop 커밋을 되돌리지 마세요.',
  ].join('\n');
}

async function finishDeploy(git, tag, log) {
  let mainCommit;
  try {
    mainCommit = await writeDeployCommit(git, tag, log);
  } catch (error) {
    throw new Error(recoveryGuide(tag, error), { cause: error });
  }
  log(
    `\n완료: ${DEVELOP_BRANCH} 릴리스 커밋 + ${DEPLOY_BRANCH} 배포 커밋(${mainCommit.slice(0, 7)}) + 태그 ${tag}(${DEPLOY_BRANCH} 커밋).`
  );
  log(
    'push는 직접 하세요(이 스크립트는 push하지 않습니다). 한 번에 모두 반영되거나 모두 거절되도록 --atomic을 씁니다:'
  );
  log(`  ${pushCommand(tag)}`);
  return { tag, mainCommit };
}

// 버전 변경~릴리스 커밋 사이에 실패하면 릴리스 경로를 시작 시점(깨끗한 HEAD)으로 되돌린다.
// 시작 시 트리가 깨끗했음을 이미 확인했으므로 되돌려도 잃는 작업이 없다. 릴리스 경로 밖 변경은 건드리지 않는다.
function rollbackReleasePaths(git, log) {
  try {
    git.run(['reset', '-q', 'HEAD', '--', ...RELEASE_PATHS]);
    git.run(['checkout', 'HEAD', '--', ...RELEASE_PATHS]);
    git.run(['clean', '-fdq', '--', ...RELEASE_PATHS]);
    log('릴리스 경로를 시작 시점으로 되돌렸습니다.');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    log(
      `자동 복구 실패(${detail}). 직접 되돌리세요: git checkout HEAD -- ${RELEASE_PATHS.join(' ')} && git clean -fd -- ${RELEASE_PATHS.join(' ')}`
    );
  }
}

function confirmRemovals(plan, confirmed, log) {
  reportPlan(plan, log);
  if (needsRemovalConfirmation(plan, confirmed)) {
    throw new Error(
      `${DEPLOY_BRANCH}에서 ${plan.remove.length}개 파일이 지워집니다(허용 목록 밖). 의도한 것이면 --yes를 붙여 다시 실행하세요.`
    );
  }
}

// 중단된 릴리스를 이어서 마무리한다: develop HEAD가 현재 버전의 릴리스 커밋이어야 하고, main 반영과 태그만 다시 한다.
async function resumeRelease({ root, git, confirmed, log }) {
  assertDevelopAndClean(git);
  const current = await readCurrentVersion(root);
  const tag = `v${current}`;
  const subject = git.run(['log', '-1', '--format=%s', 'HEAD']);
  if (subject !== `chore(release): ${tag}`) {
    throw new Error(
      `${DEVELOP_BRANCH} HEAD가 ${tag} 릴리스 커밋이 아닙니다(현재: "${subject}"). 이어서 할 릴리스가 없습니다.`
    );
  }
  assertMainState(git, confirmed);
  confirmRemovals(planDeploy(git).plan, confirmed, log);
  log(`릴리스 이어서 하기: ${tag}`);
  return finishDeploy(git, tag, log);
}

export async function runRelease({ root = defaultRoot, args, log = console.log }) {
  const git = makeGit(root);
  const { bump, confirmed, resume } = parseReleaseArgs(args);
  if (resume) return resumeRelease({ root, git, confirmed, log });
  assertDevelopAndClean(git);

  const current = await readCurrentVersion(root);
  const next = nextVersion(current, bump);
  if (next === current) {
    throw new Error(
      `버전이 동일합니다(${current}). 더 높은 버전을 지정하세요. (직전 릴리스가 중간에 멈췄다면 pnpm release --resume)`
    );
  }
  const tag = `v${next}`;
  assertTagAbsent(git, tag);
  await assertDescriptionsConsistent(root);
  assertMainState(git, confirmed);

  // 대량 삭제는 되돌리기 어려우니 검증·버전 변경보다 먼저 보여 주고 멈춘다.
  confirmRemovals(planDeploy(git).plan, confirmed, log);

  verify(root, log);
  log(`릴리스: ${current} → ${next}`);

  try {
    await syncVersion(root, current, next);
    log('버전 동기화 완료 (package.json / plugin.json / marketplace.json / codex plugin.json)');

    // 훅은 dist/*.js를, 뷰어는 assets/serve.mjs를 직접 실행하므로 배포본에는 최신 빌드가 반드시 포함돼야 한다.
    log('재빌드 중...');
    execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
    // 이 저장소의 뷰어 사본을 새 버전 도장으로 다시 렌더한다(빌드는 사본을 만들지 않는다).
    const [renderCommand, renderArgs] = RENDER_COMMAND;
    execFileSync(renderCommand, renderArgs, { cwd: root, stdio: 'inherit' });
    assertOnlyReleaseChanges(git);

    git.run(['add', '-A', '--', ...RELEASE_PATHS]);
    git.run(['commit', '-m', `chore(release): ${tag}`]);
  } catch (error) {
    rollbackReleasePaths(git, log);
    throw error;
  }
  log(`${DEVELOP_BRANCH} 릴리스 커밋 생성`);

  return finishDeploy(git, tag, log);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runRelease({ args: process.argv.slice(2) }).catch((error) => {
    console.error('릴리스 실패:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
