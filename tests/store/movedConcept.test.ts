// @concept:globally-unique-slug @concept:settled-status
// tests/store/movedConcept.test.ts
// 손으로 옮긴 개념 파일(묶음 필드와 폴더가 어긋난 파일)을 시스템 경로로 고칠 때 같은 이름표 파일이
// 둘로 갈라지지 않는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - globally-unique-slug 목적 "묶음 구조를 나중에 바꿔도 가리키는 곳이 깨지지 않는다"
//    → 옮겨진 파일의 상태·내용을 고치면 실제 위치의 그 파일이 바뀌고, 새 파일이 생기지 않는다
//  - globally-unique-slug 제한 "같은 이름표가 두 곳에 있는 것"
//    → 같은 이름표 파일이 둘이면 쓰기를 거부한다 / findDuplicateSlugs가 두 위치를 모두 알려준다
//  - settled-status 불변 "한 번 확정된 초록·빨강은 시스템 경로로는 되돌리지 않는다"
//    → 갈라진 옛 파일(옛 상태)이 남아 읽기에 따라 상태가 되돌아 보이는 일이 없다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeConcept,
  readConcept,
  setConceptStatus,
  editConceptContent,
  findDuplicateSlugs,
} from '../../src/store/conceptStore.js';
import { parseConcept } from '../../src/schema/concept.js';

const base = {
  slug: 'admin-role',
  group: 'auth',
  category: ['role'],
  title: 'Admin Role',
  status: 'pending',
  description: { definition: 'd' },
  purpose: { reason: 'r' },
  actions: {},
  principle: {},
};

let root: string;
const dataDir = () => join(root, 'docs/conceptpowers/concepts/data');

function placeAt(relDir: string, input: unknown): void {
  const dir = join(dataDir(), relDir);
  mkdirSync(dir, { recursive: true });
  const c = parseConcept(input);
  writeFileSync(join(dir, `${c.slug}.json`), JSON.stringify(c, null, 2) + '\n');
}

function jsonFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-moved-'));
});

describe('손으로 옮긴 개념 파일 (globally-unique-slug)', () => {
  it('상태를 바꾸면 실제 위치의 파일에 쓰고 새 파일을 만들지 않는다', async () => {
    placeAt('security', base); // group 필드는 auth지만 security 폴더로 옮겨짐
    await setConceptStatus(root, 'admin-role', 'red');
    expect(jsonFilesUnder(dataDir())).toEqual(['admin-role.json']);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('red');
  });

  it('내용을 고치면 실제 위치의 파일에 쓰고 새 파일을 만들지 않는다', async () => {
    placeAt('security', base);
    await editConceptContent(root, 'admin-role', { title: 'Renamed' });
    expect(jsonFilesUnder(dataDir())).toEqual(['admin-role.json']);
    expect((await readConcept(root, 'admin-role'))?.title).toBe('Renamed');
  });

  it('같은 이름표 파일이 둘이면 상태·내용 쓰기를 모두 거부한다', async () => {
    placeAt('auth', base);
    placeAt('security', base);
    await expect(setConceptStatus(root, 'admin-role', 'red')).rejects.toThrow(/Duplicate slug/);
    await expect(editConceptContent(root, 'admin-role', { title: 'x' })).rejects.toThrow(
      /Duplicate slug/
    );
    await expect(writeConcept(root, base)).rejects.toThrow(/Duplicate slug/);
  });

  it('findDuplicateSlugs는 겹친 이름표와 그 위치를 모두 돌려준다', async () => {
    placeAt('auth', base);
    placeAt('security', base);
    placeAt('auth', { ...base, slug: 'solo' });
    const dups = await findDuplicateSlugs(root);
    expect(dups).toHaveLength(1);
    expect(dups[0].slug).toBe('admin-role');
    expect(dups[0].rels.map((r) => r.split('/').slice(-2).join('/')).sort()).toEqual([
      'auth/admin-role.json',
      'security/admin-role.json',
    ]);
  });

  it('겹친 이름표가 없으면 빈 목록이다', async () => {
    placeAt('auth', base);
    expect(await findDuplicateSlugs(root)).toEqual([]);
  });
});
