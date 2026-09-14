// @concept:skill-surface
// tests/compat/skillFrontmatter.test.ts
// 스킬 껍데기의 형식과 참조의 실재를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - skill-surface 불변 "스킬 이름은 폴더 이름과 같다"
//    → SKILL.md 첫머리는 name/description 두 항목뿐인 머리말이고 name은 폴더 이름이다
//  - skill-surface 불변 "설명문은 한 줄이며 파서가 오해할 표기(쌍점 뒤 공백)를 품지 않는다"
//    → description은 비어 있지 않고 ": "가 없으며 1024자 이하
//  - skill-surface 불변 "절차 문서는 스킬로 노출되지 않는다 — 첫머리에 스킬 머리말을 두지 않는다"
//    → references/*.md는 머리말로 시작하지 않는다
//  - skill-surface 불변 "스킬이 가리키는 절차 문서·스킬·도구 명령은 실제로 존재한다"
//    → conceptpowers:<skill> 언급은 실제 스킬 / references/<file>.md는 같은 스킬 폴더에 실재 /
//      node "<cli>" <subcommand>는 src/cli.ts에 정의된 명령
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = 'skills';

function skillDirs(): string[] {
  return readdirSync(SKILLS_DIR).filter((d) => existsSync(join(SKILLS_DIR, d, 'SKILL.md')));
}

function frontmatter(text: string): { name: string; description: string; lines: string[] } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  expect(m, 'frontmatter 블록이 없다').toBeTruthy();
  const lines = m![1].split('\n');
  const get = (key: string) =>
    lines
      .find((l) => l.startsWith(`${key}:`))
      ?.slice(key.length + 1)
      .trim();
  return { name: get('name') ?? '', description: get('description') ?? '', lines };
}

function cliSubcommands(): Set<string> {
  const src = readFileSync('src/cli.ts', 'utf8');
  return new Set([...src.matchAll(/\.command\('([a-z-]+)'\)/g)].map((m) => m[1]));
}

describe('skill frontmatter', () => {
  it('name/description 두 항목뿐이고 name은 디렉터리 이름이다', () => {
    for (const d of skillDirs()) {
      const fm = frontmatter(readFileSync(join(SKILLS_DIR, d, 'SKILL.md'), 'utf8'));
      expect(fm.name, d).toBe(d);
      expect(fm.lines.map((l) => l.split(':')[0]).sort(), d).toEqual(['description', 'name']);
    }
  });

  it('description은 한 줄, ": " 없음, 1024자 이하', () => {
    for (const d of skillDirs()) {
      const fm = frontmatter(readFileSync(join(SKILLS_DIR, d, 'SKILL.md'), 'utf8'));
      expect(fm.description.length, d).toBeGreaterThan(0);
      expect(fm.description.length, d).toBeLessThanOrEqual(1024);
      expect(
        fm.description.includes(': '),
        `${d}: description에 ": "가 있으면 YAML이 깨질 수 있다`
      ).toBe(false);
    }
  });

  it('references/*.md에는 frontmatter가 없다', () => {
    for (const d of skillDirs()) {
      const refDir = join(SKILLS_DIR, d, 'references');
      if (!existsSync(refDir)) continue;
      for (const f of readdirSync(refDir)) {
        expect(
          readFileSync(join(refDir, f), 'utf8').startsWith('---'),
          `${d}/references/${f}`
        ).toBe(false);
      }
    }
  });
});

describe('skill cross-references', () => {
  const dirs = skillDirs();
  const allDocs = dirs.flatMap((d) => {
    const files = [join(SKILLS_DIR, d, 'SKILL.md')];
    const refDir = join(SKILLS_DIR, d, 'references');
    if (existsSync(refDir)) files.push(...readdirSync(refDir).map((f) => join(refDir, f)));
    return files.map((p) => ({ dir: d, path: p, text: readFileSync(p, 'utf8') }));
  });

  it('conceptpowers:<skill> 언급은 실제 스킬을 가리킨다', () => {
    const known = new Set(dirs);
    for (const doc of allDocs) {
      for (const m of doc.text.matchAll(/conceptpowers:([a-z-]+)/g)) {
        expect(known.has(m[1]), `${doc.path} → conceptpowers:${m[1]}`).toBe(true);
      }
    }
  });

  it('references/<file>.md 언급은 같은 스킬 폴더에 실제로 있다', () => {
    for (const doc of allDocs) {
      for (const m of doc.text.matchAll(/references\/([a-z-]+\.md)/g)) {
        expect(
          existsSync(join(SKILLS_DIR, doc.dir, 'references', m[1])),
          `${doc.path} → ${m[0]}`
        ).toBe(true);
      }
    }
  });

  it('node "<cli>" <subcommand> 호출은 src/cli.ts에 정의된 명령이다', () => {
    const known = cliSubcommands();
    for (const doc of allDocs) {
      for (const m of doc.text.matchAll(/node "<cli>" ([a-z-]+)/g)) {
        expect(known.has(m[1]), `${doc.path} → ${m[1]}`).toBe(true);
      }
    }
  });
});
