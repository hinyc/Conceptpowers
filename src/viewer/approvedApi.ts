// @concept:pending-diff
// src/viewer/approvedApi.ts — 검토 중 개념과 견줄 승인본을 읽어 주는 통로(GET /api/concept/:slug/approved).
// 읽기만 한다: 파일도 개념 상태도 쓰지 않는다. 출처 확인(내 컴퓨터)은 앞단 serve.ts가 마친 뒤 부른다.
import { readConcept } from '../store/conceptStore.js';
import { readApprovedSnapshot } from '../store/approvedSnapshot.js';
import { SLUG_RE } from '../schema/concept.js';

export interface ApprovedApiResult {
  status: number;
  json: unknown;
}

// rawSlug: 경로에서 뽑은 그대로(인코딩된 값).
export async function handleApprovedApi(
  projectRoot: string,
  method: string,
  rawSlug: string
): Promise<ApprovedApiResult> {
  if (method !== 'GET') return { status: 405, json: { error: 'method not allowed' } };
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug);
  } catch {
    return { status: 400, json: { error: 'invalid slug' } };
  }
  if (!SLUG_RE.test(slug)) return { status: 400, json: { error: 'invalid slug' } };
  try {
    if (!(await readConcept(projectRoot, slug))) {
      return { status: 404, json: { error: 'not found' } };
    }
    const snapshot = await readApprovedSnapshot(projectRoot, slug);
    if (!snapshot) return { status: 200, json: { approved: null } };
    return {
      status: 200,
      json: { approved: { savedAt: snapshot.savedAt, concept: snapshot.concept } },
    };
  } catch {
    // 경로·내부 오류 문구는 밖으로 내지 않는다 — 화면에는 "비교할 수 없음"만 전한다.
    return { status: 500, json: { error: 'approved snapshot is unreadable' } };
  }
}
