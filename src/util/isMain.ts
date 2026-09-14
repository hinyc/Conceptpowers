// @concept:governance-mode
// src/util/isMain.ts
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 번들이 `node <file>`로 직접 실행됐는지 판정한다. import.meta.url은 퍼센트 인코딩된 URL이고
// argv[1]은 원시 경로라, `file://${argv[1]}`로 이어 붙여 비교하면 공백·비ASCII·Windows 경로에서
// 항상 어긋나 훅이 조용히 아무 일도 하지 않는다. 양쪽을 실제 경로(심링크 해소)로 정규화해 비교하고,
// 경로가 디스크에 없으면 URL 형식으로 맞춰 비교한다.
export function isMainModule(moduleUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argv1);
  } catch {
    return moduleUrl === pathToFileURL(argv1).href;
  }
}
