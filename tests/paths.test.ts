import { describe, it, expect } from 'vitest'
import { cpPaths } from '../src/paths.js'

describe('cpPaths', () => {
  it('init.json 경로를 만든다', () => {
    expect(cpPaths('/proj').initFile).toBe('/proj/docs/conceptpowers/init.json')
  })
  it('개념 데이터/뷰어/캐시 경로를 만든다', () => {
    const p = cpPaths('/proj')
    expect(p.conceptsData).toBe('/proj/docs/conceptpowers/concepts/data')
    expect(p.conceptsViewer).toBe('/proj/docs/conceptpowers/concepts/viewer')
    expect(p.mappingCache).toBe('/proj/docs/conceptpowers/.cache/mapping.json')
  })
})
