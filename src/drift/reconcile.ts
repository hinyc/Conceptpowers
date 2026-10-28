// @concept:drift-reconcile
import { listConcepts } from '../store/conceptStore.js';
import { readLock, writeLock } from './lock.js';
import { appendHistoryMany, type HistoryInput } from './history.js';
import { computeDrift } from './detect.js';
import { contractHash, hashVersion, CONTRACT_HASH_VERSION } from './hash.js';
import { describeError, normalizeRel } from './safe.js';
import { relative, sep } from 'node:path';
import { cpPaths } from '../paths.js';
import {
  isEngagedWithTags,
  isFollowedWithTags,
  presentTagSlugs,
  relatedPresentWithCode,
} from './follow.js';
import { pendingConceptDocs } from './pendingDocs.js';
import { readInitConfig } from '../init/readConfig.js';
import { pruneAttestLog } from '../concept/attest.js';
import { pruneTestReviewLog } from '../concept/testReview.js';
import { readCommittedNoCodeLog, freshNoCode, pruneNoCodeLog } from './noCode.js';
import { prunePendingConflicts } from '../concept/pendingConflicts.js';
import { defaultIgnoreGlobs } from '../schema/initConfig.js';
import type { AlignmentLock } from '../schema/alignment.js';

export interface ReconcileResult {
  aligned: string[];
  ignored: string[];
  /** 사라진 개념이라 낡은 기록에서 지워진 slug 목록(중복 없음) */
  pruned: string[];
  /** 낡은 기록 정리에 실패한 기록 파일(형식이 깨짐 등) — 결산 자체는 성공했다. 파일은 덮어쓰지 않았다. */
  pruneFailures: PruneFailure[];
}

export interface PruneFailure {
  /** 저장소 루트 기준 기록 파일 경로 */
  file: string;
  error: string;
}

type Pruner = (root: string, liveSlugs: ReadonlySet<string>) => Promise<string[]>;

// 정리 대상 기록과 그 파일 자리. 정리는 결산에 딸린 일이라, 하나가 깨져도 나머지와 결산은 계속한다.
function pruneTargets(root: string): Array<[Pruner, string]> {
  const p = cpPaths(root);
  return [
    [pruneAttestLog, p.attestFile],
    [pruneTestReviewLog, p.testReviewFile],
    [prunePendingConflicts, p.pendingConflicts],
    [pruneNoCodeLog, p.noCodeFile],
  ];
}

// 각 정리를 따로 실행해 지운 slug와 실패한 기록 파일을 모은다. 깨진 파일은 엄격 판독에서 멈추므로 덮어쓰지 않는다.
async function pruneStaleRecords(
  root: string,
  slugs: ReadonlySet<string>
): Promise<{ pruned: string[]; failures: PruneFailure[] }> {
  const targets = pruneTargets(root);
  const settled = await Promise.allSettled(targets.map(([prune]) => prune(root, slugs)));
  const pruned = new Set(
    settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  );
  const failures = settled.flatMap((r, i): PruneFailure[] =>
    r.status === 'rejected'
      ? [
          {
            file: relative(root, targets[i][1]).split(sep).join('/'),
            error: describeError(r.reason, root),
          },
        ]
      : []
  );
  return { pruned: [...pruned], failures };
}

// 커밋 성공 후 호출. drift였던 개념을 "코드가 따라옴(aligned)" 또는 "override(ignored)"로
// 분류하고, 어느 쪽이든 lock을 현재 해시로 재조정한다. 신규 개념은 등록하고,
// 삭제된 개념의 낡은 기록(기준선·검사 증빙·테스트 검토·충돌 사유·코드무관 기록)은 모두 정리한다 —
// 어느 한 곳만 지우면 사라진 개념의 흔적이 남아 "낡은 기록이 쌓이지 않는다"는 약속이 깨진다.
export async function reconcileAfterCommit(
  root: string,
  committedFiles: string[],
  at?: string
): Promise<ReconcileResult> {
  const stamp = at ?? new Date().toISOString();
  const committed = new Set(committedFiles.map(normalizeRel));
  const [concepts, lock, drift, cfg] = await Promise.all([
    listConcepts(root),
    readLock(root),
    computeDrift(root),
    readInitConfig(root),
  ]);
  // 문지기(driftGate)와 같은 확장 잣대의 재료: 커밋된 파일의 첫머리 태그(생성물 제외).
  // 드리프트가 없으면 판정할 것이 없으므로 스캔을 건너뛴다.
  const ignoreGlobs = cfg?.ignoreGlobs ?? defaultIgnoreGlobs();
  const tagged =
    drift.length === 0 ? new Set<string>() : await presentTagSlugs(root, committed, ignoreGlobs);
  // 연결 코드 가운데 코드가 있는 파일만 따라옴 재료로 센다(표식만 있는 파일 제외 — 문지기와 같은 잣대).
  const committedCode = await relatedPresentWithCode(root, committed, drift);
  // 미커밋 문서의 지문으로 기준선을 올리지 않기 위한 정착 여부(HEAD와 다른 문서 목록).
  // git 정보를 얻을 수 없으면 전부 정착으로 기울인다 — 결산을 조용히 멈추지 않는 방향이다.
  const pendingDocs = drift.length === 0 ? new Set<string>() : await pendingConceptDocs(root);
  // 코드무관 기록: 신선한 기록이 있으면 무시함 이력에 그 사유를 함께 남긴다(문지기와 같은 잣대).
  // 커밋에 정착한 기록만 사유로 인정한다 — 디스크에만 있는 기록은 사람이 확인한 판단이라는 보장이 없다.
  const noCodeLog = drift.length === 0 ? {} : await readCommittedNoCodeLog(root);
  const driftBySlug = new Map(drift.map((d) => [d.slug, d]));
  const nextLock: AlignmentLock = { ...lock };
  const aligned: string[] = [];
  const ignored: string[] = [];
  const entries: HistoryInput[] = [];
  for (const c of concepts) {
    const d = driftBySlug.get(c.slug);
    if (d) {
      // 맞물린 개념만 결산한다(drift-reconcile 불변 규칙) — 개념 문서나 연결 코드가
      // 이번 커밋에 하나도 안 들어왔으면 기준선·이력을 건드리지 않고 어긋난 채 남겨 둔다.
      if (!isEngagedWithTags(d, committed, tagged, committedCode)) continue;
      // 문서가 아직 커밋에 정착하지 않았으면(미커밋 변경 존재) 결산을 미룬다 —
      // 기준선은 커밋에 정착한 내용의 지문으로만 옮긴다(문서 미동반 강행을 aligned로
      // 은폐하지 않고, 문서를 담을 다음 커밋이 정상적으로 닫게 한다).
      if (pendingDocs !== null && pendingDocs.has(normalizeRel(d.docPath))) continue;
      // 문지기(driftGate)와 같은 잣대: 연결 코드 가운데 하나라도 커밋에 들어왔거나,
      // 커밋된 파일의 첫머리 태그가 이 개념을 가리키면 따라옴.
      if (isFollowedWithTags(d, committedCode, tagged)) {
        aligned.push(c.slug);
        entries.push({
          slug: c.slug,
          hash: d.currentHash,
          reason: d.reason,
          aligned: true,
          at: stamp,
        });
      } else {
        ignored.push(c.slug);
        const noCode = freshNoCode(noCodeLog, c.slug, d.currentHash);
        entries.push({
          slug: c.slug,
          hash: d.currentHash,
          reason: d.reason,
          ignored: true,
          noCode,
          note: noCode ? noCodeLog[c.slug].note : '',
          at: stamp,
        });
      }
      nextLock[c.slug] = { hash: d.currentHash, at: stamp };
    } else if (
      lock[c.slug] === undefined ||
      hashVersion(lock[c.slug].hash) !== CONTRACT_HASH_VERSION
    ) {
      // 신규 등록, 또는 판이 달라 견줄 수 없던 기준선의 재기준 — 둘 다 어긋남 기록 없이 조용히 맞춘다.
      nextLock[c.slug] = { hash: contractHash(c), at: stamp };
    }
  }
  // 삭제된 개념의 stale lock 항목 제거(현재 존재하는 slug만 유지).
  const slugs = new Set(concepts.map((c) => c.slug));
  const cleaned: AlignmentLock = Object.fromEntries(
    Object.entries(nextLock).filter(([slug]) => slugs.has(slug))
  );
  await appendHistoryMany(root, entries);
  await writeLock(root, cleaned);
  // 기준선 밖의 기록도 같은 잣대로 정리한다. 각 정리는 지울 것이 없으면 파일에 손대지 않는다.
  // 이력·기준선은 이미 썼으므로 정리 실패는 결산 실패가 아니다 — 따로 담아 알린다.
  const { pruned, failures } = await pruneStaleRecords(root, slugs);
  return { aligned, ignored, pruned, pruneFailures: failures };
}
