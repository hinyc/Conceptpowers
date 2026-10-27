// @concept:concept-code-mapping
// src/mapping/scan.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { cpPaths } from '../paths.js';
import { leadingCommentBlock, hasCodeAfterLeadingComment } from './leadingComment.js';
import { matchesAny } from '../util/glob.js';
import { writeFileAtomic } from '../util/atomicWrite.js';

export type Mapping = Record<string, string[]>;
const MappingSchema = z.record(z.string(), z.array(z.string()));
const TAG_RE = '@concept:([a-z0-9]+(?:-[a-z0-9]+)*)';

// `@concept:<slug>` 표식 판독의 단일 출처 — 지도 만들기·격차 탐지·검사 범위 문지기가 같은 잣대로 읽는다.
// 넘긴 글(보통 첫머리 주석 블록)에 적힌 표식의 slug를 적힌 순서대로 돌려준다(예약 마커 none 포함).
export function conceptTagSlugs(text: string): string[] {
  return [...text.matchAll(new RegExp(TAG_RE, 'g'))].map((m) => m[1]);
}

// `@concept:none` — 개념이 해당 없음을 파일에 명시하는 예약 마커.
// 실제 개념이 아니므로 매핑(개념→코드)·감사(미지 태그 검출)에서 개념으로 취급하지 않는다.
// 단, 커밋 게이트(audit/gaps)는 "@concept 태그 존재"로 인정해 통과시킨다.
export const NO_CONCEPT_TAG = 'none';

// ignoreGlobs: init.json의 게이트 제외 글롭(재생성물·외부 코드). 기본값 []는 "필터 없음" —
// 기존 호출부(auditIntegrity 등, 이미 대상 파일이 확정된 경우)는 그대로 동작한다.
// findConceptlessFiles가 이미 하는 방식을 매핑 스캔에도 그대로 적용해, docs/conceptpowers/**
// 같은 플러그인 생성물이 매핑 캐시(개념→코드)에 섞여 들어가지 않게 한다.
// requireCode: 첫머리 표식만 있고 코드가 없는 파일은 세지 않는다 — 커밋에 "코드가 따라왔다"·
// "검사가 따라왔다"를 판정할 때 쓴다(지도 만들기에서는 표식만 있는 파일도 연결로 남긴다).
export interface ScanTagsOptions {
  requireCode?: boolean;
}

export async function scanTags(
  root: string,
  files: string[],
  ignoreGlobs: string[] = [],
  opts: ScanTagsOptions = {}
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
    if (opts.requireCode && !hasCodeAfterLeadingComment(content)) continue;
    const slugs: string[] = [];
    for (const slug of conceptTagSlugs(leadingCommentBlock(content))) {
      if (slug !== NO_CONCEPT_TAG) slugs.push(slug); // 예약 마커는 개념 목록에서 제외
    }
    if (slugs.length) result[rel] = slugs;
  }
  return result;
}

export async function buildMapping(
  root: string,
  files: string[],
  ignoreGlobs: string[] = [],
  opts: ScanTagsOptions = {}
): Promise<Mapping> {
  const tags = await scanTags(root, files, ignoreGlobs, opts);
  const mapping: Mapping = {};
  for (const [file, slugs] of Object.entries(tags)) {
    for (const slug of slugs) mapping[slug] = [...(mapping[slug] ?? []), file];
  }
  return mapping;
}

// 갈아 끼우기(임시 파일에 쓴 뒤 교체)로 쓴다 — 쓰다 멈춰도 반쯤 쓴 보관본이 남지 않는다.
export async function writeMappingCache(root: string, mapping: Mapping): Promise<void> {
  await writeFileAtomic(cpPaths(root).mappingCache, JSON.stringify(mapping, null, 2) + '\n');
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
