// @concept:none
// src/init/referenceGitignore.ts
// reference/에는 기밀 문서(계약서·내부 명세 등)가 들어올 수 있어 기본은 로컬 전용이다.
// 폴더 전용 .gitignore로 전체를 무시하되, 공유 가능한 것은 paths.md(외부 경로 목록) 하나뿐이다.
// (README는 스캐폴드가 로컬에서 재생성하므로 추적할 필요가 없다.)
// 사용자가 이미 만든 .gitignore는 덮어쓰지 않는다.
import { access, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cpPaths } from '../paths.js'

const CONTENT = [
  '# reference material stays local by default (may contain confidential documents)',
  '# only the external-path list (paths.md) is shared; README is regenerated locally',
  '*',
  '!.gitignore',
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
