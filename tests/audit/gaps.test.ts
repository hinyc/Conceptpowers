// @concept:audit-gap-detection
// tests/audit/gaps.test.ts
// 표식 없는 코드 찾아내기(audit-gap-detection)의 격차 판정을 임시 디렉터리 위에서 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - 구성요소 "표식: 파일 첫머리에 적는 개념 이름표 — 따를 개념이 없다는 뜻의 \"없음\"도 표식으로 친다"
//    → 태그 있는 파일 통과 / @concept:none도 통과 / 다중 태그도 통과
//  - 구성요소 "격차: 대상 파일 가운데 표식이 하나도 없는 것" + 허용 "격차로 잡힌 파일을 모아 사용자에게 알리는 것"
//    → 태그 없는 코드 파일만 검출 / 섞여 있으면 없는 것만 반환
//  - 구성요소 "대상: … 코드가 아닌 파일과 무시 목록에 등록된 생성물·외부 코드는 대상이 아니다"
//    → 비코드 확장자(.md/.json/.css) 제외 / ignoreGlobs 매칭 파일 제외
//  - 불변규칙 "읽을 수 없거나 이미 사라진 파일은 격차로 판정하지 않고 건너뛴다"
//    → 삭제/부재 파일은 격차로 세지 않는다
//  - 불변규칙 "표식은 파일 첫머리(첫 코드 줄이 나오기 전 주석 부분)에서만 읽는다 — 본문 속 문자열이나
//    예시에 등장하는 표식 모양 글자는 표식이 아니다"
//    → 선행 블록의 @concept:none은 인정 / 코드 줄 뒤 본문의 @concept:none은 인정 안 함
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findConceptlessFiles } from '../../src/audit/gaps.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cp-'));
  mkdirSync(join(root, 'src'), { recursive: true });
});

const DEFAULT_IGNORE = ['**/*.d.ts', '**/types/**', '**/utils/**'];

describe('findConceptlessFiles', () => {
  it('@concept 태그가 있는 코드 파일은 통과(개념 없음 아님)', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\nexport const a = 1\n');
    expect(await findConceptlessFiles(root, ['src/a.ts'], DEFAULT_IGNORE)).toEqual([]);
  });
  it('태그가 없는 코드 파일은 개념 없는 코드로 검출한다', async () => {
    writeFileSync(join(root, 'src/b.ts'), 'export const b = 1\n');
    expect(await findConceptlessFiles(root, ['src/b.ts'], DEFAULT_IGNORE)).toEqual(['src/b.ts']);
  });
  it('@concept:none(개념 없음 명시)도 마커로 인정해 통과시킨다', async () => {
    writeFileSync(join(root, 'src/n.ts'), '// @concept:none\nexport const n = 1\n');
    expect(await findConceptlessFiles(root, ['src/n.ts'], DEFAULT_IGNORE)).toEqual([]);
  });
  it('여러 개념 태그를 가진 파일도 통과한다(다중 컨셉 허용)', async () => {
    writeFileSync(join(root, 'src/c.ts'), '/* @concept:user-role @concept:admin-role */\n');
    expect(await findConceptlessFiles(root, ['src/c.ts'], DEFAULT_IGNORE)).toEqual([]);
  });
  it('ignoreGlobs에 매칭되는 파일은 태그 없어도 제외한다', async () => {
    mkdirSync(join(root, 'src/utils'), { recursive: true });
    writeFileSync(join(root, 'src/utils/x.ts'), 'export const x = 1\n');
    writeFileSync(join(root, 'src/y.d.ts'), 'export type Y = number\n');
    expect(
      await findConceptlessFiles(root, ['src/utils/x.ts', 'src/y.d.ts'], DEFAULT_IGNORE)
    ).toEqual([]);
  });
  it('비코드 확장자(.md/.json/.css)는 대상이 아니다', async () => {
    writeFileSync(join(root, 'README.md'), '# hi\n');
    writeFileSync(join(root, 'data.json'), '{}\n');
    expect(await findConceptlessFiles(root, ['README.md', 'data.json'], DEFAULT_IGNORE)).toEqual(
      []
    );
  });
  it('읽을 수 없는 파일(삭제/부재)은 개념 없음으로 보지 않고 건너뛴다', async () => {
    expect(await findConceptlessFiles(root, ['src/gone.ts'], DEFAULT_IGNORE)).toEqual([]);
  });
  it('태그 있는 파일과 없는 파일이 섞이면 없는 것만 반환', async () => {
    writeFileSync(join(root, 'src/a.ts'), '// @concept:admin-role\n');
    writeFileSync(join(root, 'src/b.ts'), 'export const b = 1\n');
    expect(await findConceptlessFiles(root, ['src/a.ts', 'src/b.ts'], DEFAULT_IGNORE)).toEqual([
      'src/b.ts',
    ]);
  });
  it('@concept:none이 선행 블록에 있으면 개념 없음 아님 (불변규칙: 표식은 첫 코드 줄 전 주석에서만 읽는다)', async () => {
    writeFileSync(join(root, 'src/n1.ts'), '// @concept:none\nexport const n1 = 1\n');
    expect(await findConceptlessFiles(root, ['src/n1.ts'], DEFAULT_IGNORE)).toEqual([]);
  });
  it('@concept:none이 본문(코드 줄 뒤)에만 있으면 개념 없는 코드로 검출된다 (불변규칙: 본문에 등장하는 표식 모양 글자는 표식이 아니다)', async () => {
    writeFileSync(join(root, 'src/n2.ts'), 'export const n2 = 1\n// @concept:none\n');
    expect(await findConceptlessFiles(root, ['src/n2.ts'], DEFAULT_IGNORE)).toEqual(['src/n2.ts']);
  });
});
