// @concept:contract-hash @concept:drift-reconcile
import { listConceptEntries } from '../store/conceptStore.js';
import { listFeatures } from '../store/featureStore.js';
import { readMappingCache } from '../mapping/scan.js';
import { readLock } from './lock.js';
import { readHistory } from './history.js';
import { contractHash, hashVersion, CONTRACT_HASH_VERSION } from './hash.js';
import { normalizeRel } from './safe.js';
import { pruneMissingPaths } from './follow.js';
import type { Concept } from '../schema/concept.js';
import type { Feature } from '../schema/feature.js';
import type { HistoryEntry } from '../schema/alignment.js';

export interface DriftItem {
  slug: string;
  currentHash: string;
  lockedHash: string;
  reason: string;
  relatedPaths: string[];
  /** 개념 문서(JSON)의 루트 기준 상대 경로 — 맞물림 판정에 쓴다 */
  docPath: string;
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// 개념에 연결된 코드 경로 — 표식 스캔(mapping) ∪ 기능 기록의 codePaths.
function collectRelatedPaths(
  slug: string,
  features: Feature[],
  mapping: Record<string, string[]>
): string[] {
  const fromFeatures = features
    .filter((f) => f.concepts.includes(slug))
    .flatMap((f) => f.codePaths);
  // 프로토타입 속성('constructor' 등)으로 인한 오조회/throw 방지: own 속성만 본다.
  const fromTags = hasOwn(mapping, slug) ? mapping[slug] : [];
  return [...new Set([...fromTags, ...fromFeatures].map(normalizeRel))];
}

// 이번 어긋남의 사유 — '실제 변경' 기록(aligned·ignored 제외)에서만 가져온다.
// 1순위: 지금 지문으로 남긴 사유(note-change는 편집 직후 지문으로 기록한다).
// 2순위: 기준선(lock)을 맞춘 뒤에 남긴, 기준선 지문이 아닌 사유(그 뒤 손으로 더 고친 경우).
// 기준선 지문과 같은 사유는 이미 결산된 지난 변경의 것이므로 절대 쓰지 않는다.
// 시각 비교: ISO 문자열이면 시각으로, 아니면 사전식으로 견준다(표기 혼재 방어).
function isAfter(a: string, b: string): boolean {
  const [x, y] = [Date.parse(a), Date.parse(b)];
  return Number.isNaN(x) || Number.isNaN(y) ? a > b : x > y;
}

function pickReason(
  history: HistoryEntry[],
  slug: string,
  currentHash: string,
  locked: { hash: string; at: string }
): string {
  // 기준선을 맞춘 뒤의 기록만 후보다 — 되돌리기(v1→v2→v1)로 옛 지문이 재등장해도 옛 사유는 쓰지 않는다.
  const changes = [...history]
    .reverse()
    .filter((e) => e.slug === slug && !e.ignored && !e.aligned && isAfter(e.at, locked.at));
  const exact = changes.find((e) => e.hash === currentHash);
  const later = changes.find((e) => e.hash !== locked.hash);
  return (exact ?? later)?.reason ?? '';
}

// 개념이 마지막 정렬(lock) 이후 바뀌었는지 판정하고, 따라와야 할 관련 코드 경로를 모은다.
export async function computeDrift(root: string): Promise<DriftItem[]> {
  const [entries, features, mapping, lock, history] = await Promise.all([
    listConceptEntries(root),
    listFeatures(root),
    readMappingCache(root),
    readLock(root),
    readHistory(root),
  ]);
  const drifted = entries
    .map(({ concept: c, rel }) => ({
      c,
      rel,
      locked: hasOwn(lock, c.slug) ? lock[c.slug] : undefined,
    }))
    .filter(
      (x): x is { c: Concept; rel: string; locked: { hash: string; at: string } } =>
        x.locked !== undefined
    ) // 신규: 첫 커밋에서 등록됨
    // 판이 다른 기준선과는 견주지 않는다 — 계산 규칙이 바뀐 것이지 개념이 바뀐 게 아니다.
    // 이런 항목은 어긋남이 아니라 재기준 대상이며, 다음 결산(reconcile)이 현재 판으로 다시 맞춘다.
    .filter((x) => hashVersion(x.locked.hash) === CONTRACT_HASH_VERSION)
    .map((x) => ({ ...x, current: contractHash(x.c) }))
    .filter((x) => x.locked.hash !== x.current) // 정렬됨
    .map((x) => ({ ...x, related: collectRelatedPaths(x.c.slug, features, mapping) }));
  // 존재 확인은 전 개념의 경로를 모아 한 번만 한다(같은 파일을 여러 개념이 공유한다).
  // 이제 존재하지 않는 경로는 연결된 코드에서 뺀다(drift-reconcile: 사라진 경로 제외).
  const unique = [...new Set(drifted.flatMap((x) => x.related))];
  const alive = new Set(await pruneMissingPaths(root, unique));
  return drifted.map((x) => ({
    slug: x.c.slug,
    currentHash: x.current,
    lockedHash: x.locked.hash,
    reason: pickReason(history, x.c.slug, x.current, x.locked),
    relatedPaths: x.related.filter((p) => alive.has(p)),
    // 탐색이 찾은 실제 파일 위치 — group 필드로 재구성하지 않아, 손으로 옮겨진 문서도 정확히 가리킨다.
    docPath: normalizeRel(x.rel),
  }));
}
