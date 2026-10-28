// @concept:concept-code-mapping @concept:globally-unique-slug @concept:governance-mode
// tests/hooks/unknownTagsGate.test.ts
// 미지 태그 문지기가 "정의되지 않은 개념 태그"만으로 경고하는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-code-mapping: 정의되지 않은 개념을 가리키는 태그는 감사가 보고하고 커밋 문지기가 알린다
//    → 미지 태그가 있으면 파일·slug를 담아 경고한다
//  - globally-unique-slug: 같은 이름표 중복은 감사 보고(audit ok=false)로 드러낸다 — 미지 태그 경고가 아니다
//    → 중복 slug만 있고 미지 태그가 없으면 이 문지기는 아무 말도 하지 않는다(빈 문구 경고가 매 커밋 뜨던 회귀)
import { describe, it, expect } from 'vitest';
import { checkUnknownTags } from '../../src/hooks/gates/unknownTagsGate.js';
import type { AuditReport } from '../../src/audit/audit.js';

const baseReport: AuditReport = {
  ok: true,
  unknownTags: [],
  unapproved: [],
  unapprovedRefs: [],
  pending: [],
  pendingRefs: [],
  duplicateSlugs: [],
};

const run = (report: AuditReport) =>
  checkUnknownTags({ root: '/nowhere', files: [], cfg: null, report });

describe('checkUnknownTags', () => {
  it('중복 slug만 있고 미지 태그가 없으면 null (globally-unique-slug: 중복은 감사 보고 몫)', async () => {
    const report: AuditReport = {
      ...baseReport,
      ok: false,
      duplicateSlugs: [{ slug: 'dup', rels: ['a/dup.json', 'b/dup.json'] }],
    };
    expect(await run(report)).toBeNull();
  });

  it('미지 태그가 없으면 null', async () => {
    expect(await run(baseReport)).toBeNull();
  });

  it('미지 태그가 있으면 파일과 slug를 담아 경고 (concept-code-mapping)', async () => {
    const report: AuditReport = {
      ...baseReport,
      ok: false,
      unknownTags: [{ slug: 'ghost', file: 'src/a.ts' }],
    };
    const finding = await run(report);
    expect(finding?.gate).toBe('unknown-tags');
    expect(finding?.reason).toContain('src/a.ts -> @concept:ghost');
  });
});
