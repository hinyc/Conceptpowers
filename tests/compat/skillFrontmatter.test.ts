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
//      node "<cli>" <subcommand>는 src/cli.ts에 정의된 명령 (원본·번역본 모두 — 번역본의 안내도 실재를 가리킨다.
//      번역본은 원본 references/<file>.md를 가리킬 수 있다)
//  - skill-surface 불변 "도구가 열고 따르는 원본은 영어로 쓴다 — 설명문에는 사용자가 실제로 쓰는 다른 언어의 말을 함께 담을 수 있다"
//    → 원본(SKILL.md, references/*.md)에서 한글은 description 줄에만 있다
//  - skill-surface 불변 "번역본은 사람이 읽는 것이며 스킬이나 절차 문서로 노출되지 않는다 — 번역본과 원본이 어긋나면 원본이 맞다"
//    → 번역본(*.ko.md)은 머리말 없이 번역본임을 밝히는 줄로 시작하고, 원본마다 번역본이 있으며 원본 없는 번역본은 없다
//  - skill-surface 제한 "번역본을 도구가 스킬이나 절차 문서로 열게 만드는 것 — 원본이 번역본을 가리키게 하거나 번역본이 따로 스킬로 잡히게 하는 것"
//    → 원본은 .ko.md를 가리키지 않는다 / 스킬 검사·절차 문서 검사 대상에서 번역본을 뺀다
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = 'skills';
const TRANSLATION = /\.ko\.md$/;
const HANGUL = /[가-힣]/;

type Doc = { dir: string; path: string; text: string };

// 원본: 도구가 열고 따르는 SKILL.md와 references/*.md (번역본 제외)
function originalDocs(): Doc[] {
  return skillDirs().flatMap((d) => {
    const files = [join(SKILLS_DIR, d, 'SKILL.md')];
    const refDir = join(SKILLS_DIR, d, 'references');
    if (existsSync(refDir)) {
      files.push(
        ...readdirSync(refDir)
          .filter((f) => f.endsWith('.md') && !TRANSLATION.test(f))
          .map((f) => join(refDir, f))
      );
    }
    return files.map((p) => ({ dir: d, path: p, text: readFileSync(p, 'utf8') }));
  });
}

// 번역본: 사람이 읽는 *.ko.md (스킬 폴더 바로 아래와 references/ 아래)
function translationDocs(): Doc[] {
  return skillDirs().flatMap((d) => {
    const files = readdirSync(join(SKILLS_DIR, d))
      .filter((f) => TRANSLATION.test(f))
      .map((f) => join(SKILLS_DIR, d, f));
    const refDir = join(SKILLS_DIR, d, 'references');
    if (existsSync(refDir)) {
      files.push(
        ...readdirSync(refDir)
          .filter((f) => TRANSLATION.test(f))
          .map((f) => join(refDir, f))
      );
    }
    return files.map((p) => ({ dir: d, path: p, text: readFileSync(p, 'utf8') }));
  });
}

const translationOf = (path: string) => path.replace(/\.md$/, '.ko.md');
const originalOf = (path: string) => path.replace(TRANSLATION, '.md');

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
    for (const doc of originalDocs().filter((x) => !x.path.endsWith('SKILL.md'))) {
      expect(doc.text.startsWith('---'), doc.path).toBe(false);
    }
  });
});

describe('skill language — 영어 원본과 한국어 번역본', () => {
  it('원본의 한글은 description 줄에만 있다', () => {
    for (const doc of originalDocs()) {
      const lines = doc.text.split('\n');
      const offending = lines
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => HANGUL.test(l) && !l.startsWith('description:'));
      expect(
        offending.map(({ n }) => `${doc.path}:${n}`),
        doc.path
      ).toEqual([]);
    }
  });

  it('description 줄은 머리말 안에만 있다 (본문에 description:을 두어 한글 검사를 피하지 않는다)', () => {
    for (const doc of originalDocs()) {
      const body = doc.text.replace(/^---\n[\s\S]*?\n---\n/, '');
      expect(/^description:/m.test(body), doc.path).toBe(false);
    }
  });

  it('원본마다 .ko.md 번역본이 옆에 있다', () => {
    for (const doc of originalDocs()) {
      expect(existsSync(translationOf(doc.path)), `${doc.path} → ${translationOf(doc.path)}`).toBe(
        true
      );
    }
  });

  it('번역본마다 원본이 있다 (원본 없는 번역본은 없다)', () => {
    for (const doc of translationDocs()) {
      expect(existsSync(originalOf(doc.path)), `${doc.path} → ${originalOf(doc.path)}`).toBe(true);
    }
  });

  it('번역본은 머리말 없이 번역본임을 밝히는 줄로 시작한다 (스킬로 잡히지 않는다)', () => {
    for (const doc of translationDocs()) {
      expect(doc.text.startsWith('---'), doc.path).toBe(false);
      expect(/^(name|description):/m.test(doc.text), doc.path).toBe(false);
      const first = doc.text.split('\n')[0];
      expect(first, doc.path).toContain('번역본');
      expect(first, doc.path).toContain('원본');
    }
  });

  it('원본은 번역본(.ko.md)을 가리키지 않는다', () => {
    for (const doc of originalDocs()) {
      expect(/\.ko\.md/.test(doc.text), doc.path).toBe(false);
    }
  });

  it('스킬로 잡히는 파일은 폴더마다 SKILL.md 하나뿐이다', () => {
    for (const d of skillDirs()) {
      const skillLike = readdirSync(join(SKILLS_DIR, d)).filter((f) => /^SKILL.*\.md$/i.test(f));
      for (const f of skillLike.filter((f) => f !== 'SKILL.md')) {
        expect(TRANSLATION.test(f), `${d}/${f}`).toBe(true);
        expect(readFileSync(join(SKILLS_DIR, d, f), 'utf8').startsWith('---'), `${d}/${f}`).toBe(
          false
        );
      }
    }
  });
});

describe('skill cross-references', () => {
  const dirs = skillDirs();
  // 원본과 번역본 모두 — 번역본이 가리키는 곳도 실재해야 사람이 따라갈 수 있다.
  // references/<file>.md 패턴은 .ko.md를 잡지 않으므로, 번역본은 원본 절차 문서를 가리키는 것으로만 검사된다.
  const allDocs = [...originalDocs(), ...translationDocs()];

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
