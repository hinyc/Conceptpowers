// tests/i18n/messages.test.ts
import { describe, it, expect } from 'vitest'
import { buildInitHint } from '../../src/i18n/messages.js'

describe('buildInitHint', () => {
  const base = {
    viewerCommand: 'npm run concepts:view',
    viewerPath: 'docs/conceptpowers/concepts/viewer/index.html'
  }

  it('스크립트가 추가됐으면 실행 명령을 안내한다 (ko)', () => {
    const msg = buildInitHint('ko', { ...base, viewerScriptAdded: true })
    expect(msg).toContain('초기화 완료')
    expect(msg).toContain('npm run concepts:view')
    expect(msg.endsWith('\n')).toBe(true)
  })

  it('스크립트가 없으면 뷰어 파일 경로를 안내한다 (ko)', () => {
    const msg = buildInitHint('ko', { ...base, viewerScriptAdded: false })
    expect(msg).toContain('docs/conceptpowers/concepts/viewer/index.html')
    expect(msg).not.toContain('npm run concepts:view')
  })

  it('en 로케일은 영어로 안내한다', () => {
    const msg = buildInitHint('en', { ...base, viewerScriptAdded: true })
    expect(msg).toContain('Conceptpowers initialized')
    expect(msg).toContain('Next steps')
  })
})
