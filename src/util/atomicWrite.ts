import { writeFile, rename, mkdir, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

let counter = 0

// 임시 파일에 쓴 뒤 rename으로 원자적 교체한다. 부분 기록(truncate 후 크래시)으로
// 깨진 JSON이 남는 것을 막는다. Date/random 없이 pid+카운터로 임시명을 만든다.
// 'wx' 플래그로 기존 파일/심볼릭링크를 따라가지 않게 하고, 실패 시 잔여 temp를 정리한다.
export async function writeFileAtomic(target: string, data: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.${counter++}.tmp`
  try {
    await writeFile(tmp, data, { encoding: 'utf8', flag: 'wx' })
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}
