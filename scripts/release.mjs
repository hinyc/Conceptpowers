// 릴리스 절차를 한 번에 강제한다: 버전 3곳 동기화 → dist 재빌드 → 커밋 + 태그.
// Claude Code 자동 업데이트는 plugin.json의 version 문자열이 바뀔 때만 사용자에게 반영되므로,
// "버전만 올리고 dist를 안 빌드"하거나 "커밋만 하고 버전을 안 올리는" 실수를 구조적으로 막는다.
//
// 사용법: pnpm release <patch|minor|major|x.y.z>
// 예) pnpm release patch   pnpm release minor   pnpm release 1.2.0
import { readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 버전 문자열을 담은 모든 매니페스트. 셋은 항상 동일한 값이어야 한다.
const MANIFESTS = [
  'package.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
]

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

function parseBumpArg(argv) {
  const arg = argv[2]
  if (!arg) {
    throw new Error('버전 인자가 필요합니다: pnpm release <patch|minor|major|x.y.z>')
  }
  return arg
}

function nextVersion(current, bump) {
  const match = SEMVER.exec(current)
  if (!match) {
    throw new Error(`현재 버전이 SemVer 형식이 아닙니다: "${current}"`)
  }
  const [major, minor, patch] = match.slice(1).map(Number)
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      if (!SEMVER.test(bump)) {
        throw new Error(`알 수 없는 버전 인자: "${bump}" (patch|minor|major 또는 x.y.z)`)
      }
      return bump
  }
}

// 매니페스트에서 현재 버전을 읽고, 셋이 일치하는지 검증한다.
async function readCurrentVersion() {
  const versions = await Promise.all(
    MANIFESTS.map(async (rel) => {
      const text = await readFile(join(root, rel), 'utf8')
      const found = /"version"\s*:\s*"([^"]+)"/.exec(text)
      if (!found) {
        throw new Error(`${rel}에서 version 필드를 찾지 못했습니다`)
      }
      return { rel, version: found[1] }
    }),
  )
  const unique = [...new Set(versions.map((v) => v.version))]
  if (unique.length !== 1) {
    const detail = versions.map((v) => `${v.rel}=${v.version}`).join(', ')
    throw new Error(`매니페스트 버전이 불일치합니다(${detail}). 수동으로 맞춘 뒤 다시 실행하세요.`)
  }
  return unique[0]
}

// version 필드만 치환해 기존 포맷을 보존한다(전체 재직렬화 없이 불변 교체).
async function syncVersion(current, next) {
  await Promise.all(
    MANIFESTS.map(async (rel) => {
      const path = join(root, rel)
      const text = await readFile(path, 'utf8')
      const updated = text.replace(
        new RegExp(`("version"\\s*:\\s*")${escapeRegExp(current)}(")`),
        `$1${next}$2`,
      )
      if (updated === text) {
        throw new Error(`${rel}의 version을 치환하지 못했습니다(현재 값 "${current}" 불일치)`)
      }
      await writeFile(path, updated)
    }),
  )
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

// 릴리스 커밋이 "버전 + dist"만 담도록, 시작 시점의 워킹 트리는 깨끗해야 한다.
function assertCleanTree() {
  const status = git(['status', '--porcelain'])
  if (status) {
    throw new Error('워킹 트리가 깨끗하지 않습니다. 먼저 커밋/스태시 후 릴리스하세요.\n' + status)
  }
}

function assertTagAbsent(tag) {
  const existing = git(['tag', '--list', tag])
  if (existing) {
    throw new Error(`태그 ${tag}가 이미 존재합니다.`)
  }
}

async function run() {
  try {
    const bump = parseBumpArg(process.argv)
    assertCleanTree()

    const current = await readCurrentVersion()
    const next = nextVersion(current, bump)
    if (next === current) {
      throw new Error(`버전이 동일합니다(${current}). 더 높은 버전을 지정하세요.`)
    }
    const tag = `v${next}`
    assertTagAbsent(tag)

    console.log(`릴리스: ${current} → ${next}`)

    await syncVersion(current, next)
    console.log('버전 동기화 완료 (package.json / plugin.json / marketplace.json)')

    // 훅은 dist/*.js를 직접 실행하므로 배포본에는 최신 빌드가 반드시 포함돼야 한다.
    console.log('dist 재빌드 중...')
    execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' })

    git(['add', ...MANIFESTS, 'dist'])
    git(['commit', '-m', `chore(release): ${tag}`])
    git(['tag', tag])

    console.log(`\n완료: 커밋 + 태그 ${tag} 생성.`)
    console.log(`푸시하려면: git push --follow-tags`)
  } catch (error) {
    console.error('릴리스 실패:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

run()
