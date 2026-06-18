// tests/store/featureStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFeature, listFeatures, readFeature } from '../../src/store/featureStore.js'

const base = { slug: 'user-login', group: 'auth', title: 'User Login', concepts: ['auth'], codePaths: ['src/a.ts'] }
let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cp-')) })

describe('featureStore', () => {
  it('기능을 그룹 폴더에 쓰고 다시 읽는다', async () => {
    await writeFeature(root, base as any)
    const read = await readFeature(root, 'user-login')
    expect(read?.title).toBe('User Login')
    expect(read?.codePaths).toEqual(['src/a.ts'])
  })
  it('모든 기능을 그룹 하위까지 재귀로 나열한다', async () => {
    await writeFeature(root, base as any)
    await writeFeature(root, { ...base, slug: 'logout', group: 'auth' } as any)
    await writeFeature(root, { ...base, slug: 'billing-meter', group: 'billing' } as any)
    const all = await listFeatures(root)
    expect(all.map(f => f.slug).sort()).toEqual(['billing-meter', 'logout', 'user-login'])
  })
  it('다른 그룹에 동일 slug 쓰기를 거부한다 (전역 고유)', async () => {
    await writeFeature(root, { ...base, group: 'auth' } as any)
    await expect(
      writeFeature(root, { ...base, group: 'billing' } as any)
    ).rejects.toThrow('Duplicate feature slug')
  })
  it('동일 경로 덮어쓰기는 허용한다', async () => {
    await writeFeature(root, { ...base, title: 'v1' } as any)
    await writeFeature(root, { ...base, title: 'v2' } as any)
    expect((await readFeature(root, 'user-login'))?.title).toBe('v2')
  })
  it('기능이 없으면 빈 배열을 반환한다', async () => {
    expect(await listFeatures(root)).toEqual([])
  })
})
