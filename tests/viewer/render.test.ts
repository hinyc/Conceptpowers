// tests/viewer/render.test.ts
import { describe, it, expect } from 'vitest'
import { renderViewer } from '../../src/viewer/render.js'
import type { Concept } from '../../src/schema/concept.js'

const c: Concept = {
  slug: 'admin-role', group: 'auth', category: ['role'], title: 'Admin Role', eyebrow: '운영자 역할',
  description: { definition: '운영자 권한 계층', analogy: '관제 센터장', components: ['대시보드'], example: '' },
  purpose: { reason: '리소스 배분', benefits: ['시간 절감'], vision: '', painPoints: [] },
  actions: { allow: ['역할 지정'], restrict: ['직접 개발 불가'], interaction: '' },
  principle: { immutableRules: ['모든 변경은 감사 로그'], tradeoffs: '', lifecycle: [] },
  relations: { prev: '', next: '', related: [] }, codeLinks: []
} as Concept

describe('renderViewer', () => {
  it('index.html과 그룹별 개념 페이지를 생성한다', () => {
    const out = renderViewer([c])
    expect(Object.keys(out)).toContain('index.html')
    expect(Object.keys(out)).toContain('auth/admin-role.html')
  })
  it('개념 페이지에 제목과 허용/제한 행동을 포함한다', () => {
    const out = renderViewer([c])
    const page = out['auth/admin-role.html']
    expect(page).toContain('Admin Role')
    expect(page).toContain('역할 지정')
    expect(page).toContain('직접 개발 불가')
  })
  it('HTML을 이스케이프한다(XSS 방지)', () => {
    const evil = { ...c, title: '<script>x</script>' } as Concept
    const out = renderViewer([evil])
    expect(out['auth/admin-role.html']).not.toContain('<script>x</script>')
    expect(out['auth/admin-role.html']).toContain('&lt;script&gt;')
  })
  it('그룹 개념 페이지 CSS href는 "../assets/concept.css"이다 (회귀)', () => {
    const out = renderViewer([c])
    expect(out['auth/admin-role.html']).toContain('href="../assets/concept.css"')
  })
  it('그룹 없는 개념 페이지 CSS href는 "assets/concept.css"이다 (회귀)', () => {
    const ungrouped: Concept = { ...c, group: undefined, slug: 'solo' }
    const out = renderViewer([ungrouped])
    expect(out['solo.html']).toContain('href="assets/concept.css"')
  })
  it('기본(ko) locale이면 뷰어 라벨과 lang이 한글이다', () => {
    const out = renderViewer([c])
    expect(out['auth/admin-role.html']).toContain('설명')
    expect(out['auth/admin-role.html']).toContain('허용 행동')
    expect(out['auth/admin-role.html']).toContain('lang="ko"')
    expect(out['index.html']).toContain('개념 목록')
  })
  it('en locale이면 뷰어 라벨과 lang이 영어다', () => {
    const out = renderViewer([c], 'en')
    const page = out['auth/admin-role.html']
    expect(page).toContain('Description')
    expect(page).toContain('Allowed')
    expect(page).toContain('Restricted')
    expect(page).toContain('lang="en"')
    expect(out['index.html']).toContain('Concepts')
  })
})
