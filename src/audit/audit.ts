// @concept:concept-code-mapping
// src/audit/audit.ts
import { listConcepts } from '../store/conceptStore.js';
import { scanTags } from '../mapping/scan.js';

export interface UnknownTag {
  slug: string;
  file: string;
}
export interface AuditReport {
  ok: boolean;
  unknownTags: UnknownTag[];
  unapproved: string[]; // 프로젝트 전체의 미승인(red) 개념 slug
  unapprovedRefs: string[]; // 스캔한 파일이 참조하는 미승인(red) 개념 slug
  pending: string[]; // 프로젝트 전체의 보류(pending) 개념 slug
  pendingRefs: string[]; // 스캔한 파일이 참조하는 보류(pending) 개념 slug
}

// ignoreGlobs: init.json의 게이트 제외 글롭 — 무시 목록의 생성물·외부 코드는 검사 대상이 아니다
// (concept-code-mapping의 "대상" 규칙). 기본 []는 필터 없음: CLI 전체 스캔처럼 호출자가 이미
// 필터해 넘기는 경우와, "지정한 파일을 그대로 스캔"이 계약인 CLI 파일 지정 모드
// (tests/cli/audit.test.ts)만 생략한다. 새 호출자는 명시적으로 넘겨야 이 오탐이 재발하지 않는다.
export async function auditIntegrity(
  root: string,
  files: string[],
  ignoreGlobs: string[] = []
): Promise<AuditReport> {
  const concepts = await listConcepts(root);
  const known = new Set(concepts.map((c) => c.slug));
  const red = new Set(concepts.filter((c) => (c.status ?? 'red') === 'red').map((c) => c.slug));
  const pending = new Set(concepts.filter((c) => c.status === 'pending').map((c) => c.slug));
  const tags = await scanTags(root, files, ignoreGlobs);
  const unknownTags: UnknownTag[] = [];
  const refRed = new Set<string>();
  const refPending = new Set<string>();
  for (const [file, slugs] of Object.entries(tags))
    for (const slug of slugs) {
      if (!known.has(slug)) unknownTags.push({ slug, file });
      else if (red.has(slug)) refRed.add(slug);
      else if (pending.has(slug)) refPending.add(slug);
    }
  return {
    ok: unknownTags.length === 0, // 미승인(red)·보류(pending)는 정합성을 막지 않음(경고만)
    unknownTags,
    unapproved: [...red],
    unapprovedRefs: [...refRed],
    pending: [...pending],
    pendingRefs: [...refPending],
  };
}
