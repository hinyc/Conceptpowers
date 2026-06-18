// src/init/readConfig.ts
import { readFile } from 'node:fs/promises'
import { cpPaths } from '../paths.js'
import { parseInitConfig, type InitConfig } from '../schema/initConfig.js'

// init.json을 읽어 검증한다. 파일이 없거나 파싱/검증에 실패하면 null.
export async function readInitConfig(root: string): Promise<InitConfig | null> {
  try {
    const raw = await readFile(cpPaths(root).initFile, 'utf8')
    return parseInitConfig(JSON.parse(raw))
  } catch {
    return null
  }
}
