// @concept:settled-status
// src/viewer/statusApi.ts — 뷰어의 상태 변경 통로(POST /api/concept/:slug/status).
// 본문 편집 통로(serve.ts, concept-inline-edit)와 나눠 둔다 — 승인 상태 변경은 편집이 아니라
// 개념 상태의 별도 절차가 맡는다. 출처 확인(내 컴퓨터·같은 화면)은 앞단 serve.ts가 마친 뒤 부른다.
import { setConceptStatus } from '../store/conceptStore.js';
import { ConceptStatus, SLUG_RE } from '../schema/concept.js';
import { refreshManifestData } from './render.js';

export interface StatusApiResult {
  status: number;
  json: unknown;
}

// 엔진 에러 메시지를 HTTP 상태로 매핑한다. "not found"만 404, 나머지(가드 위반/중복/검증)는 400.
export function engineErrorStatus(error: unknown): number {
  return /not found/i.test((error as Error).message) ? 404 : 400;
}

// rawSlug: 경로에서 뽑은 그대로(인코딩된 값). 전이 규칙은 엔진(setConceptStatus)이 판정한다.
export async function handleStatusApi(
  projectRoot: string,
  method: string,
  rawSlug: string,
  body: string
): Promise<StatusApiResult> {
  if (method !== 'POST') return { status: 405, json: { error: 'method not allowed' } };
  const slug = decodeURIComponent(rawSlug);
  if (!SLUG_RE.test(slug)) return { status: 400, json: { error: 'invalid slug' } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    return { status: 400, json: { error: 'invalid JSON body' } };
  }
  const status = ConceptStatus.safeParse((parsed as { status?: unknown } | null)?.status);
  if (!status.success) return { status: 400, json: { error: 'status must be green|pending|red' } };
  try {
    const concept = await setConceptStatus(projectRoot, slug, status.data);
    await refreshManifestData(projectRoot);
    return { status: 200, json: { ok: true, concept } };
  } catch (error) {
    return { status: engineErrorStatus(error), json: { error: (error as Error).message } };
  }
}
