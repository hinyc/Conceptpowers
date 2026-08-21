// @concept:output-locale @concept:reference-privacy
// tests/i18n/messages.test.ts
// 초기화 안내문(buildInitHint)을 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - output-locale 불변 "사람이 읽을 산출물은 프로젝트에 설정된 언어로 쓴다" + 구성요소 "적용 대상:
//    … 사용자에게 보이는 안내" → ko 안내 3종 / en 로케일은 영어로 안내 / ko·en 양쪽에 같은 항목이 있다
//  - init-gate 불변 "초기화되지 않았으면 실행하지 않고, 무엇을 먼저 해야 하는지 알린다"
//    → define-concept 다음 단계 안내를 포함한다 / 스크립트 유무에 따라 실행 명령 또는 뷰어 파일 경로를 안내
//  - reference-privacy 허용 "사용자가 직접 알려준 바깥 경로만 경로 목록에 추가하는 것"
//    → 참고자료 경로 등록 수단(paths.md / add-reference)을 안내한다
import { describe, it, expect } from 'vitest';
import { buildInitHint } from '../../src/i18n/messages.js';

describe('buildInitHint', () => {
  const base = {
    viewerCommand: 'npm run concepts:view',
    viewerPath: 'docs/conceptpowers/concepts/viewer/index.html',
  };

  it('스크립트가 추가됐으면 실행 명령을 안내한다 (ko)', () => {
    const msg = buildInitHint('ko', { ...base, viewerScriptAdded: true });
    expect(msg).toContain('초기화 완료');
    expect(msg).toContain('npm run concepts:view');
    expect(msg.endsWith('\n')).toBe(true);
  });

  it('스크립트가 없으면 뷰어 파일 경로를 안내한다 (ko)', () => {
    const msg = buildInitHint('ko', { ...base, viewerScriptAdded: false });
    expect(msg).toContain('docs/conceptpowers/concepts/viewer/index.html');
    expect(msg).not.toContain('npm run concepts:view');
  });

  it('en 로케일은 영어로 안내한다', () => {
    const msg = buildInitHint('en', { ...base, viewerScriptAdded: true });
    expect(msg).toContain('Conceptpowers initialized');
    expect(msg).toContain('Next steps');
  });

  it('참고자료 경로 등록 수단(paths.md / add-reference)을 안내한다 (ko/en)', () => {
    const ko = buildInitHint('ko', { ...base, viewerScriptAdded: true });
    expect(ko).toContain('reference/paths.md');
    expect(ko).toContain('/conceptpowers:add-reference');
    const en = buildInitHint('en', { ...base, viewerScriptAdded: true });
    expect(en).toContain('reference/paths.md');
    expect(en).toContain('/conceptpowers:add-reference');
  });

  it('define-concept 다음 단계 안내를 포함한다 (ko/en)', () => {
    const ko = buildInitHint('ko', { ...base, viewerScriptAdded: true });
    expect(ko).toContain('define-concept');
    expect(ko).toContain('개념 정의');
    const en = buildInitHint('en', { ...base, viewerScriptAdded: true });
    expect(en).toContain('define-concept');
  });
});
