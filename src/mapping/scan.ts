// @concept:concept-code-mapping
// src/mapping/scan.ts
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { z } from 'zod';
import { cpPaths } from '../paths.js';
import { leadingCommentBlock } from './leadingComment.js';
import { matchesAny } from '../util/glob.js';

export type Mapping = Record<string, string[]>;
const MappingSchema = z.record(z.string(), z.array(z.string()));
const TAG_RE = /@concept:([a-z0-9]+(?:-[a-z0-9]+)*)/g;

// `@concept:none` — 개념이 해당 없음을 파일에 명시하는 예약 마커.
// 실제 개념이 아니므로 매핑(개념→코드)·감사(미지 태그 검출)에서 개념으로 취급하지 않는다.
// 단, 커밋 게이트(audit/gaps)는 "@concept 태그 존재"로 인정해 통과시킨다.
export const NO_CONCEPT_TAG = 'none';

// ignoreGlobs: init.json의 게이트 제외 글롭(재생성물·외부 코드). 기본값 []는 "필터 없음" —
// 기존 호출부(auditIntegrity 등, 이미 대상 파일이 확정된 경우)는 그대로 동작한다.
// findConceptlessFiles가 이미 하는 방식을 매핑 스캔에도 그대로 적용해, docs/conceptpowers/**
// 같은 플러그인 생성물이 매핑 캐시(개념→코드)에 섞여 들어가지 않게 한다.
export async function scanTags(
  root: string,
  files: string[],
  ignoreGlobs: string[] = []
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (const rel of files) {
    if (matchesAny(rel, ignoreGlobs)) continue;
    let content: string;
    try {
      content = await readFile(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const slugs: string[] = [];
    for (const m of leadingCommentBlock(content).matchAll(TAG_RE)) {
      if (m[1] !== NO_CONCEPT_TAG) slugs.push(m[1]); // 예약 마커는 개념 목록에서 제외
    }
    if (slugs.length) result[rel] = slugs;
  }
  return result;
}

export async function buildMapping(
  root: string,
  files: string[],
  ignoreGlobs: string[] = []
): Promise<Mapping> {
  const tags = await scanTags(root, files, ignoreGlobs);
  const mapping: Mapping = {};
  for (const [file, slugs] of Object.entries(tags)) {
    for (const slug of slugs) mapping[slug] = [...(mapping[slug] ?? []), file];
  }
  return mapping;
}

export async function writeMappingCache(root: string, mapping: Mapping): Promise<void> {
  const target = cpPaths(root).mappingCache;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
}

// 증분 갱신: 전달된 파일의 항목만 새 스캔 결과로 교체하고, 나머지 캐시 항목은 보존한다.
// 삭제된 파일도 files에 포함해 넘기면 그 항목이 캐시에서 빠진다.
export async function updateMappingCache(
  root: string,
  files: string[],
  ignoreGlobs: string[] = []
): Promise<Mapping> {
  const existing = await readMappingCache(root);
  const fresh = await buildMapping(root, files, ignoreGlobs);
  const targets = new Set(files);
  const merged: Mapping = {};
  for (const [slug, list] of Object.entries(existing)) {
    const kept = list.filter((f) => !targets.has(f));
    if (kept.length) merged[slug] = kept;
  }
  for (const [slug, list] of Object.entries(fresh)) {
    merged[slug] = [...(merged[slug] ?? []), ...list];
  }
  await writeMappingCache(root, merged);
  return merged;
}

export async function readMappingCache(root: string): Promise<Mapping> {
  try {
    return MappingSchema.parse(JSON.parse(await readFile(cpPaths(root).mappingCache, 'utf8')));
  } catch {
    return {};
  }
}
