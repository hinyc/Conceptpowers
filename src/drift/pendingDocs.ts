// @concept:drift-reconcile
// src/drift/pendingDocs.ts
// 개념 문서 가운데 "아직 커밋에 정착하지 않은"(HEAD와 다른 내용이 워킹트리·스테이지에 있는)
// 파일 목록. 문지기의 문서 동반 요구와 결산의 기준선 이동은 이 정착 여부에 달려 있다:
// - 문지기: 문서가 이미 지난 커밋에 정착해 있으면(머지로 받아온 경우 등) 스테이징할 변경이
//   없으므로 동반을 요구하지 않는다 — 요구하면 해소할 수 없는 막다른 길이 된다.
// - 결산: 미커밋 문서의 지문으로 기준선을 올리지 않는다 — 문서가 정착할 때까지 결산을 미룬다.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relative } from 'node:path';
import { cpPaths } from '../paths.js';
import { normalizeRel } from './safe.js';

const execFileAsync = promisify(execFile);
// 대형 저장소에서도 잘리지 않도록 execFile 기본 1MB를 넉넉히 늘린다(preToolUse와 같은 값).
const MAX_BUFFER = 64 * 1024 * 1024;

// HEAD와 다른 개념 문서(스테이징 여부 무관)의 루트 기준 상대 경로 집합.
// git 정보를 얻을 수 없으면(저장소가 아님, 첫 커밋 이전 등) null — 판정 불가를 그대로
// 알린다. 무엇으로 후퇴할지는 호출자가 정한다(문지기는 '전부 미정착'으로 기울어 계속
// 묻고, 결산은 '전부 정착'으로 기울어 기존대로 결산한다 — 각자 조용히 새 동작을 끄지
// 않는 방향이다).
export async function pendingConceptDocs(root: string): Promise<ReadonlySet<string> | null> {
  const dataRel = normalizeRel(relative(root, cpPaths(root).conceptsData));
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-c', 'core.quotePath=false', '--no-pager', 'diff', '--name-only', '-z', 'HEAD', '--', dataRel],
      { cwd: root, maxBuffer: MAX_BUFFER }
    );
    return new Set(
      stdout
        .split('\0')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(normalizeRel)
    );
  } catch {
    return null;
  }
}
