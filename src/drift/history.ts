// @concept:drift-reconcile
// src/drift/history.ts
// 결산 이력(why-log). 기록 하나를 파일 하나로 `.alignment/history/`에 더하기만 하고 이미 있는 파일은 고쳐 쓰지 않는다 —
// 브랜치마다 쌓인 기록이 서로 다른 파일이 되어, 합칠 때 한 배열 파일을 두고 부딪치는 머지 충돌이 생기지 않는다.
// 예전 한 파일(history.json)의 기록은 읽기만 하고 그 뒤에 새 기록을 잇는다.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cpPaths } from '../paths.js';
import { History, HistoryEntry } from '../schema/alignment.js';
import { writeFileAtomic } from '../util/atomicWrite.js';

async function readLegacyHistory(root: string): Promise<HistoryEntry[]> {
  try {
    return History.parse(JSON.parse(await readFile(cpPaths(root).alignmentHistory, 'utf8')));
  } catch {
    return [];
  }
}

// 기록 파일 이름은 시각으로 시작하므로 이름순이 곧 시각순이다. 읽을 수 없는 파일 하나는 건너뛴다 —
// 한 파일이 깨졌다고 나머지 이력 전체를 잃지 않게 한다.
async function readRecordFiles(root: string): Promise<HistoryEntry[]> {
  const dir = cpPaths(root).alignmentHistoryDir;
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const entries = await Promise.all(
    names.map(async (name) => {
      try {
        return HistoryEntry.parse(JSON.parse(await readFile(join(dir, name), 'utf8')));
      } catch {
        return null;
      }
    })
  );
  return entries.filter((entry): entry is HistoryEntry => entry !== null);
}

export async function readHistory(root: string): Promise<HistoryEntry[]> {
  const [legacy, records] = await Promise.all([readLegacyHistory(root), readRecordFiles(root)]);
  return [...legacy, ...records];
}

export interface HistoryInput {
  slug: string;
  hash: string;
  reason?: string;
  ignored?: boolean;
  aligned?: boolean;
  noCode?: boolean;
  note?: string;
  at?: string;
}

function toEntry(input: HistoryInput, prevHash: string): HistoryEntry {
  return HistoryEntry.parse({
    slug: input.slug,
    hash: input.hash,
    prevHash,
    reason: input.reason ?? '',
    ignored: input.ignored ?? false,
    aligned: input.aligned ?? false,
    noCode: input.noCode ?? false,
    note: input.note ?? '',
    at: input.at ?? new Date().toISOString(),
  });
}

// 이름: <시각(영숫자만)>-<한 번에 기록한 순서>-<slug>-<내용 지문>.json — 같은 시각에도 순서가 보존되고,
// 다른 브랜치에서 같은 시각·순서로 기록해도 내용이 다르면 이름이 겹치지 않는다.
function recordFileName(entry: HistoryEntry, order: number): string {
  const stamp = entry.at.replace(/[^0-9A-Za-z]/g, '') || 'unknown';
  const digest = createHash('sha256').update(JSON.stringify(entry)).digest('hex').slice(0, 10);
  return `${stamp}-${String(order).padStart(3, '0')}-${entry.slug}-${digest}.json`;
}

// 여러 항목을 한 번에 기록한다. 같은 slug의 직전 hash를 prevHash로 잇고, 항목마다 새 파일을 만든다.
export async function appendHistoryMany(
  root: string,
  inputs: HistoryInput[]
): Promise<HistoryEntry[]> {
  if (inputs.length === 0) return [];
  const existing = await readHistory(root);
  const lastHash = new Map(existing.map((entry) => [entry.slug, entry.hash]));
  const dir = cpPaths(root).alignmentHistoryDir;
  const added: HistoryEntry[] = [];
  for (const [order, input] of inputs.entries()) {
    const entry = toEntry(input, lastHash.get(input.slug) ?? '');
    lastHash.set(entry.slug, entry.hash);
    await writeFileAtomic(
      join(dir, recordFileName(entry, order)),
      JSON.stringify(entry, null, 2) + '\n'
    );
    added.push(entry);
  }
  return added;
}

export async function appendHistory(root: string, input: HistoryInput): Promise<HistoryEntry> {
  return (await appendHistoryMany(root, [input]))[0];
}
