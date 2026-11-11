// @concept:concept-code-mapping
// tests/hooks/unknownTagsGate.test.ts
// 미지 태그 문지기가 "정의되지 않은 개념을 가리키는 표식"만을 검사 항목으로 붙잡는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-code-mapping 허용 "정의되지 않은 개념을 가리키는 표식을 감사가 보고하고 커밋 문지기가 검사 항목으로 붙잡는 것 — 막을지 물을지 알릴지는 문지기 강도가 정한다"
//    → 미지 태그가 있으면 파일·slug를 담은 검사 항목을 낸다(대응 세기는 강도 몫이라 여기서 보지 않는다)
//    → 검사 대상은 정의되지 않은 개념을 가리키는 표식뿐이다: 중복 slug만 있고 미지 태그가 없으면
//      이 문지기는 아무것도 내지 않는다(빈 문구 경고가 매 커밋 뜨던 회귀)
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
  checkUnknownTags({ root: '/nowhere', files: [], cfg: null, locale: 'ko', report });

describe('checkUnknownTags', () => {
  it('중복 slug만 있고 미지 태그가 없으면 null [규칙: 정의되지 않은 개념을 가리키는 표식을 감사가 보고하고 커밋 문지기가 검사 항목으로 붙잡는 것 — 막을지 물을지 알릴지는 문지기 강도가 정한다]', async () => {
    const report: AuditReport = {
      ...baseReport,
      ok: false,
      duplicateSlugs: [{ slug: 'dup', rels: ['a/dup.json', 'b/dup.json'] }],
    };
    expect(await run(report)).toBeNull();
  });

  it('미지 태그가 없으면 null [규칙: 정의되지 않은 개념을 가리키는 표식을 감사가 보고하고 커밋 문지기가 검사 항목으로 붙잡는 것 — 막을지 물을지 알릴지는 문지기 강도가 정한다]', async () => {
    expect(await run(baseReport)).toBeNull();
  });

  it('미지 태그가 있으면 파일과 slug를 담아 검사 항목으로 붙잡는다 [규칙: 정의되지 않은 개념을 가리키는 표식을 감사가 보고하고 커밋 문지기가 검사 항목으로 붙잡는 것 — 막을지 물을지 알릴지는 문지기 강도가 정한다]', async () => {
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
