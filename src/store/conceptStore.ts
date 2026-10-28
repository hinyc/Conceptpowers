// @concept:settled-status @concept:viewer-readability @concept:globally-unique-slug @concept:concept-provenance
// src/store/conceptStore.ts
import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { cpPaths } from '../paths.js';
import { writeFileAtomic } from '../util/atomicWrite.js';
import { parseConcept, type Concept, type ConceptStatus } from '../schema/concept.js';
import { clearPendingConflict } from '../concept/pendingConflicts.js';
import { checkConceptQuality } from '../concept/quality.js';
import { readAttestLog, freshPassAttest } from '../concept/attest.js';
import { walkJson } from './walkJson.js';

function fileFor(root: string, c: Concept): string {
  const dataDir = cpPaths(root).conceptsData;
  return c.group ? join(dataDir, c.group, `${c.slug}.json`) : join(dataDir, `${c.slug}.json`);
}

// 별칭은 찾아오는 길일 뿐 가리키는 열쇠가 아니다(globally-unique-slug). 그래서 별칭이
// 어떤 이름표와도, 다른 개념의 별칭과도 겹치지 않아야 무엇을 가리키는지가 갈리지 않는다.
// 자기 자신(같은 파일)의 별칭은 겹침으로 보지 않는다 — 다시 저장하는 경우다.
function assertAliasesFree(
  concept: Concept,
  existing: ConceptEntry[],
  target: string,
  root: string
): void {
  const slugs = new Set([concept.slug, ...existing.map((e) => e.concept.slug)]);
  const takenBy = new Map<string, string>();
  for (const other of existing) {
    if (resolve(root, other.rel) === target) continue;
    for (const alias of other.concept.aliases) takenBy.set(alias, other.concept.slug);
  }
  const seen = new Set<string>();
  for (const alias of concept.aliases) {
    if (slugs.has(alias)) {
      throw new Error(`Alias collides with a concept slug: "${alias}" (aliases are not keys)`);
    }
    if (seen.has(alias)) {
      throw new Error(`Duplicate alias within the concept: "${alias}" is listed twice`);
    }
    seen.add(alias);
    const owner = takenBy.get(alias);
    if (owner) {
      throw new Error(`Duplicate alias: "${alias}" is already used by ${owner}`);
    }
  }
}

export interface ConceptEntry {
  concept: Concept;
  /** 문서 파일의 루트 기준 상대 경로 — 탐색이 찾은 실제 위치(group 필드로 재구성하지 않는다) */
  rel: string;
}

// 개념과 문서의 실제 경로를 함께 돌려준다. 경로는 group/slug로 재구성하지 않고 디스크
// 탐색 결과를 그대로 쓴다 — 손으로 옮겨져 group 필드와 어긋난 파일도 정확히 가리키기 위해서다.
export async function listConceptEntries(root: string): Promise<ConceptEntry[]> {
  const files = await walkJson(cpPaths(root).conceptsData);
  const entries: ConceptEntry[] = [];
  for (const f of files) {
    try {
      entries.push({
        concept: parseConcept(JSON.parse(await readFile(f, 'utf8'))),
        rel: relative(root, f),
      });
    } catch (error) {
      throw new Error(`Failed to parse concept file: ${f} — ${(error as Error).message}`);
    }
  }
  return entries;
}

export async function listConcepts(root: string): Promise<Concept[]> {
  return (await listConceptEntries(root)).map((e) => e.concept);
}

// 같은 이름표가 실제로 놓인 위치들(globally-unique-slug). 둘 이상이면 어느 쪽이 진짜인지 정할 수 없다.
function locationsOf(root: string, entries: ConceptEntry[], slug: string): string[] {
  return entries.filter((e) => e.concept.slug === slug).map((e) => resolve(root, e.rel));
}

function duplicateError(slug: string, root: string, paths: string[]): Error {
  const where = paths.map((p) => relative(root, p)).join(', ');
  return new Error(
    `Duplicate slug: ${slug} exists in more than one file (${where}) — ` +
      `globally unique; merge them into one file before writing`
  );
}

// 정해진 위치(target)에 개념을 쓴다. 같은 이름표가 target 밖에도 있으면 쓰지 않는다 —
// 쓰면 같은 이름표 파일이 둘로 갈라져 읽는 순서에 따라 다른 내용이 보인다.
async function persistConcept(
  root: string,
  concept: Concept,
  target: string,
  entries: ConceptEntry[]
): Promise<Concept> {
  const all = locationsOf(root, entries, concept.slug);
  if (all.length > 1) throw duplicateError(concept.slug, root, all);
  if (all.length === 1 && all[0] !== target) {
    throw new Error(`Duplicate slug: ${concept.slug} already exists (globally unique)`);
  }
  assertAliasesFree(concept, entries, target, root);
  // baseline 본문도 원자적으로 저장한다 — 도중에 멈춰도 깨진 JSON이 남지 않는다.
  await writeFileAtomic(target, JSON.stringify(concept, null, 2) + '\n');
  return concept;
}

// 새로 쓰거나 같은 자리에 다시 쓴다 — 자리는 group/slug로 정한다.
export async function writeConcept(root: string, input: unknown): Promise<Concept> {
  const concept = parseConcept(input);
  return persistConcept(root, concept, fileFor(root, concept), await listConceptEntries(root));
}

interface FoundEntry {
  entry: ConceptEntry;
  entries: ConceptEntry[];
}

// 이미 있는 개념 하나를 찾는다. 같은 이름표가 둘이면 어느 쪽을 고칠지 정할 수 없으므로 거부한다.
async function readSingleEntry(root: string, slug: string): Promise<FoundEntry | null> {
  const entries = await listConceptEntries(root);
  const matches = entries.filter((e) => e.concept.slug === slug);
  if (matches.length === 0) return null;
  if (matches.length > 1) throw duplicateError(slug, root, locationsOf(root, entries, slug));
  return { entry: matches[0], entries };
}

// 이미 있는 개념을 고쳐 쓸 때는 탐색이 찾은 실제 위치에 쓴다 — 손으로 옮겨져 group 필드와 어긋난
// 파일도 그 자리에서 바뀌고, group/slug로 재구성한 옛 자리에 새 파일이 생기지 않는다.
async function rewriteConcept(root: string, found: FoundEntry, input: unknown): Promise<Concept> {
  const target = resolve(root, found.entry.rel);
  return persistConcept(root, parseConcept(input), target, found.entries);
}

export interface DuplicateSlug {
  slug: string;
  /** 같은 이름표를 가진 파일들의 루트 기준 상대 경로 */
  rels: string[];
}

// 같은 이름표가 두 파일 이상에 있는 경우를 모두 찾는다(globally-unique-slug) — 감사가 보고에 쓴다.
export async function findDuplicateSlugs(root: string): Promise<DuplicateSlug[]> {
  const bySlug = new Map<string, string[]>();
  for (const e of await listConceptEntries(root)) {
    bySlug.set(e.concept.slug, [...(bySlug.get(e.concept.slug) ?? []), e.rel]);
  }
  return [...bySlug.entries()]
    .filter(([, rels]) => rels.length > 1)
    .map(([slug, rels]) => ({ slug, rels }));
}

export async function readConcept(root: string, slug: string): Promise<Concept | null> {
  return (await listConcepts(root)).find((c) => c.slug === slug) ?? null;
}

export async function slugExists(root: string, slug: string): Promise<boolean> {
  return (await readConcept(root, slug)) !== null;
}

// 허용 상태 전이(programmatic). green/red는 settled — 이 헬퍼로는 변경 불가.
// red→green은 사람의 승인(approve), pending→green은 일관성 통과, pending→red는 거부.
// (사용자가 직접 JSON을 다시 작성하는 writeConcept 경로는 이 가드의 대상이 아니다.)
export const ALLOWED_STATUS_TRANSITIONS: Record<ConceptStatus, readonly ConceptStatus[]> = {
  red: ['red', 'green'],
  pending: ['pending', 'green', 'red'],
  green: ['green'],
};

// 개념의 승인 상태를 불변으로 갱신한다(읽기 → 전이 검증 → 새 객체 → 쓰기).
// green으로 전환 시 pending 충돌 기록도 자동으로 정리한다.
export async function setConceptStatus(
  root: string,
  slug: string,
  status: ConceptStatus
): Promise<Concept> {
  const found = await readSingleEntry(root, slug);
  if (!found) throw new Error(`Concept not found: ${slug}`);
  const concept = found.entry.concept;
  const from = concept.status;
  if (!ALLOWED_STATUS_TRANSITIONS[from].includes(status)) {
    throw new Error(
      `Illegal status transition: ${from} → ${status} (${slug}). ` +
        `green/red are settled; only red→green (human approval) and pending→green/red are allowed.`
    );
  }
  // green 승격 전제조건: 결정론적 품질 최소치 + 신선한 충돌 검사 증빙.
  // (증빙은 자기신고 — 검사의 성실성까지 보증하지 않고, 단계 생략만 막는다.)
  if (status === 'green' && from !== 'green') {
    const knownSlugs = found.entries.map((e) => e.concept.slug);
    const quality = checkConceptQuality(concept, knownSlugs);
    if (!quality.ok) {
      throw new Error(
        `Cannot promote to green — quality deficiencies for ${slug}: ` +
          `${quality.deficiencies.join('; ')}. ` +
          `Fill the missing parts together with the user (update-concepts), then retry.`
      );
    }
    if (!freshPassAttest(await readAttestLog(root), concept)) {
      throw new Error(
        `Cannot promote to green — no fresh passing consistency attestation for ${slug}. ` +
          `Run the consistency check of conceptpowers:update-concepts, then record it: ` +
          `attest-consistency ${slug} --result pass --compared all`
      );
    }
  }
  const updated = await rewriteConcept(root, found, { ...concept, status });
  if (status === 'green') await clearPendingConflict(root, slug);
  return updated;
}

// 내용 편집으로 바꿀 수 있는 필드(섹션 단위 교체). slug/group(파일 경로 키)과
// status(상태 전이는 setConceptStatus 전용)는 의도적으로 제외한다.
const EDITABLE_FIELDS = [
  'category',
  'number',
  'title',
  'description',
  'state',
  'purpose',
  'actions',
  'principle',
  'relations',
  'codeLinks',
  'sources',
] as const;
type EditableField = (typeof EDITABLE_FIELDS)[number];
export type ConceptContentPatch = Partial<Pick<Concept, EditableField>>;

// 개념 본문을 불변으로 편집한다(읽기 → 화이트리스트 병합 → 검증 → 쓰기).
// 병합은 "최상위 필드 단위 교체"다(deep-merge 아님): patch에 description이 오면
// description 전체가 교체된다. 호출자(뷰어 폼)는 각 섹션을 통째로 보내야 부분 유실이 없다.
// 정책: green 개념을 편집하면 status를 pending으로 내려 재검증을 유도한다
// (이는 setConceptStatus 가드가 막는 전이이므로 별도의 의도된 연산으로 둔다).
// pending/red는 내용만 바뀌고 상태를 유지한다.
export interface ConceptContentEdit {
  concept: Concept;
  /** 확정(green)이던 개념이 이 편집으로 검토 중(pending)으로 내려갔는가 — 호출자가 추측하지 않게 여기서 알린다 */
  downgradedToPending: boolean;
}

export async function editConceptContent(
  root: string,
  slug: string,
  patch: ConceptContentPatch
): Promise<ConceptContentEdit> {
  const found = await readSingleEntry(root, slug);
  if (!found) throw new Error(`Concept not found: ${slug}`);
  const concept = found.entry.concept;
  const safe: Partial<Concept> = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined) {
      (safe as Record<string, unknown>)[key] = patch[key];
    }
  }
  const downgradedToPending = concept.status === 'green';
  const nextStatus: ConceptStatus = downgradedToPending ? 'pending' : concept.status;
  const saved = await rewriteConcept(root, found, {
    ...concept,
    ...safe,
    slug: concept.slug,
    group: concept.group,
    status: nextStatus,
  });
  return { concept: saved, downgradedToPending };
}
