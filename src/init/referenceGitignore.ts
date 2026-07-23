// @concept:none
// src/init/referenceGitignore.ts
// reference/에는 기밀 문서(계약서·내부 명세 등)가 들어올 수 있어 기본은 로컬 전용이다.
// 폴더 전용 .gitignore로 전체를 무시하되, 공유해도 안전한 메타 파일 둘 —
// paths.md(외부 경로 목록)와 README.md(스캐폴드 안내) — 만 추적한다.
// (커밋 게이트의 기밀 확인 면제 목록과 정확히 같은 화이트리스트다.)
// 사용자가 이미 만든 .gitignore는 덮어쓰지 않는다.
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cpPaths } from '../paths.js'

const CONTENT = [
  '# reference material stays local by default (may contain confidential documents)',
  '# only the external-path list (paths.md) and the scaffold guide (README.md) are shared',
  '*',
  '!.gitignore',
  '!README.md',
  '!paths.md',
  ''
].join('\n')

// 생성했으면 true, 이미 있으면(사용자 커스텀 보존) false.
export async function ensureReferenceGitignore(root: string): Promise<boolean> {
  const target = join(cpPaths(root).reference, '.gitignore')
  try {
    await access(target)
    return false
  } catch {
    await mkdir(cpPaths(root).reference, { recursive: true })
    await writeFile(target, CONTENT, 'utf8')
    return true
  }
}
