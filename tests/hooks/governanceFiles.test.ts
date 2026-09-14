// @concept:governance-mode @concept:human-owns-contract
// tests/hooks/governanceFiles.test.ts
// 거버넌스 설정·기록·개념 문서를 건드리는 커밋과 도구 편집에 문지기가 사람에게 묻는지 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "거버넌스 설정 파일의 변경이나 개념 문서의 삭제가 커밋에 들어오면 강도와 무관하게
//    사람에게 묻는다 — 검사 항목과 강도를 정하는 것은 사람이다"
//    → init.json이 커밋에 들어오면 strict·standard·light 어느 강도에서도 ask다
//    → 개념 문서가 삭제되는 커밋도 어느 강도에서도 ask다
//    → init.json 삭제·증빙 기록 파일 삭제도 묻는다
//    → strict에서 다른 위반이 함께 있으면 deny에 설정 변경 사실을 함께 담는다(가려지지 않는다)
//  - governance-mode 불변 "강도가 무엇이든 지키는 대상(검사 항목)은 같다"
//    → standard에서 설정 변경 질문이 다른 위반을 가리지 않는다 — 한 질문에 함께 담는다
//  - drift-reconcile 불변 "코드 변경이 필요 없다는 기록은 사람의 확인을 거쳐 남긴다 — 새로 남기거나 바뀐 기록이
//    커밋에 들어오면 문지기가 강도와 무관하게 사람에게 묻는다" / concept-driven-tests 제한 "사람의 확인 없이 검토
//    기록을 남겨 통과시키는 것"
//    → 새 기록·바뀐 기록이 커밋에 들어오면 어느 강도에서도 ask다(어떤 방법으로 썼든) / 그대로거나 지워진 기록은 묻지 않는다
//    → include 범위로 스테이징만 된 기록, 스테이징과 커밋을 섞은 명령의 새 기록도 묻는다(strict는 막는다)
//  - human-owns-contract 불변 "개념 문서의 내용 변경은 반드시 사람의 확인을 거친다"
//    → Edit/Write로 개념 문서·거버넌스 설정·증빙 기록을 직접 고치려 하면 ask다
//    → 대소문자만 다른 경로(대소문자 무시 파일시스템)·바로가기 경로·MultiEdit으로도 피할 수 없다
//    → 프로젝트의 다른 파일 편집은 지금처럼 안내만 붙이고 묻지 않는다
import { describe, it, expect, beforeEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';
import { scaffoldInit } from '../../src/init/scaffold.js';

let root: string;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-gov-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  await scaffoldInit(root, {});
});

function setEnforcement(level: 'strict' | 'standard' | 'light') {
  const p = join(root, 'docs/conceptpowers/init.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  writeFileSync(p, JSON.stringify({ ...cfg, enforcement: level }, null, 2) + '\n');
}

const commit = (changedFiles: string[], deletedFiles: string[] = []) =>
  decidePreToolUse(root, {
    tool: 'Bash',
    input: { command: 'git commit -m x' },
    changedFiles,
    deletedFiles,
  });

const INIT = 'docs/conceptpowers/init.json';
const DOC = 'docs/conceptpowers/concepts/data/governance/foo-rule.json';

describe('거버넌스 설정 변경이 커밋에 들어오면 [규칙: 강도와 무관하게 사람에게 묻는다]', () => {
  for (const level of ['strict', 'standard', 'light'] as const) {
    it(`${level}: init.json 스테이징은 ask다`, async () => {
      setEnforcement(level);
      const r = await commit([INIT]);
      expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('init.json');
    });
    it(`${level}: 개념 문서 삭제는 ask다`, async () => {
      setEnforcement(level);
      const r = await commit([], [DOC]);
      expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('foo-rule');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('삭제');
    });
  }
  it('strict에서 다른 위반과 함께 오면 deny에 설정 변경 사실을 함께 담는다', async () => {
    setEnforcement('strict');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\nexport const a = 1;\n');
    const r = await commit(['src/a.ts', INIT]);
    expect(r!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('ghost');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('init.json');
  });
  it('init.json 삭제와 증빙 기록 파일 삭제도 묻는다', async () => {
    setEnforcement('strict');
    const r1 = await commit([], [INIT]);
    expect(r1!.hookSpecificOutput.permissionDecision).toBe('ask');
    const r2 = await commit([], ['docs/conceptpowers/concepts/.alignment/attest.json']);
    expect(r2!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r2!.hookSpecificOutput.permissionDecisionReason).toContain('attest.json');
  });
  it('standard: 설정 변경 질문이 다른 위반을 가리지 않고 한 질문에 함께 담는다 [규칙: 지키는 대상은 같다]', async () => {
    setEnforcement('standard');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:ghost\nexport const a = 1;\n');
    const r = await commit(['src/a.ts', INIT]);
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('init.json');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('ghost');
  });
  it('설정 변경도 삭제도 없는 커밋은 묻지 않는다', async () => {
    setEnforcement('strict');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 1;\n');
    const r = await commit(['src/a.ts']);
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
  });
});

describe('사람의 판단 기록이 커밋에 들어오면 [규칙: 사람의 확인을 거쳐 남긴다]', () => {
  const REVIEW = 'docs/conceptpowers/concepts/.alignment/test-review.json';
  const NOCODE = 'docs/conceptpowers/concepts/.alignment/no-code.json';
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], { cwd: root });
  const entry = (note: string) => ({ hash: '3:abc', note, at: '2026-01-01T00:00:00.000Z' });
  beforeEach(() => {
    writeFileSync(
      join(root, NOCODE),
      JSON.stringify({ kept: entry('기존'), gone: entry('지울 것') })
    );
    git('init', '-q');
    git('add', '-A');
    git('commit', '-qm', 'base');
  });

  for (const level of ['strict', 'standard', 'light'] as const) {
    it(`${level}: 새 코드무관 기록이 커밋에 들어오면 ask다`, async () => {
      setEnforcement(level);
      writeFileSync(
        join(root, NOCODE),
        JSON.stringify({ kept: entry('기존'), gone: entry('지울 것'), fresh: entry('새 사유') })
      );
      const r = await commit([NOCODE]);
      expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('fresh');
      expect(r!.hookSpecificOutput.permissionDecisionReason).not.toContain('kept');
    });
  }
  it('바뀐 기록도 묻는다 — 검토 기록(test-review)도 같다', async () => {
    writeFileSync(
      join(root, NOCODE),
      JSON.stringify({ kept: entry('사유를 바꿈'), gone: entry('지울 것') })
    );
    writeFileSync(
      join(root, REVIEW),
      JSON.stringify({ t: { hash: '3:x', result: 'no-impact', note: 'n', at: 'a' } })
    );
    const r = await commit([NOCODE, REVIEW]);
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('kept');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('t');
  });
  it('include 범위(-i)로 스테이징만 된 기록을 커밋해도 묻는다 — 디스크를 되돌려 두어도 커밋될 내용으로 판정한다', async () => {
    setEnforcement('strict');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 1;\n');
    git('add', 'src/a.ts', INIT);
    git('commit', '-qm', 'a');
    const original = readFileSync(join(root, NOCODE), 'utf8');
    writeFileSync(
      join(root, NOCODE),
      JSON.stringify({ kept: entry('기존'), gone: entry('지울 것'), fresh: entry('새 사유') })
    );
    git('add', NOCODE);
    writeFileSync(join(root, NOCODE), original);
    writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 2;\n');
    const r = await decidePreToolUse(root, {
      tool: 'Bash',
      input: { command: 'git commit -i src/a.ts -m x' },
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('fresh');
  });
  it('스테이징과 커밋을 한 명령에 섞어도 새 기록이 있으면 기록 질문을 함께 싣는다 — light도 묻고 strict는 막는다', async () => {
    writeFileSync(
      join(root, NOCODE),
      JSON.stringify({ kept: entry('기존'), gone: entry('지울 것'), fresh: entry('새 사유') })
    );
    const mixed = { tool: 'Bash', input: { command: 'git add -A && git commit -m x' } };
    for (const level of ['standard', 'light'] as const) {
      setEnforcement(level);
      const r = await decidePreToolUse(root, mixed);
      expect(r!.hookSpecificOutput.permissionDecision, level).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('HUMAN RECORD');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('fresh');
    }
    setEnforcement('strict');
    const strict = await decidePreToolUse(root, mixed);
    expect(strict!.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(strict!.hookSpecificOutput.permissionDecisionReason).toContain('HUMAN RECORD');
  });
  it('그대로거나 지워진 기록만 들어오면 묻지 않는다(결산의 정리)', async () => {
    setEnforcement('strict');
    writeFileSync(join(root, NOCODE), JSON.stringify({ kept: entry('기존') }));
    const r = await commit([NOCODE]);
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
  });
});

describe('도구로 거버넌스 파일을 직접 고치려 하면 [규칙: 개념 문서의 내용 변경은 사람의 확인을 거친다]', () => {
  const edit = (tool: 'Edit' | 'Write', rel: string) =>
    decidePreToolUse(root, { tool, input: { file_path: join(root, rel) } });

  it('init.json 편집은 ask다', async () => {
    const r = await edit('Edit', INIT);
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('init.json');
  });
  it('증빙·검토·코드무관 기록과 기준선 파일 편집은 ask다', async () => {
    for (const f of [
      'attest.json',
      'test-review.json',
      'no-code.json',
      'alignment.lock.json',
      'history.json',
    ]) {
      const r = await edit('Edit', `docs/conceptpowers/concepts/.alignment/${f}`);
      expect(r!.hookSpecificOutput.permissionDecision, f).toBe('ask');
    }
  });
  it('개념 문서 Write는 ask다 — 새 개념 저장도 사람의 확인 뒤에 한다', async () => {
    const r = await edit('Write', DOC);
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('foo-rule');
    expect(r!.hookSpecificOutput.additionalContext).toContain('update-concepts');
  });
  it('MultiEdit으로 고쳐도 ask다', async () => {
    const r = await decidePreToolUse(root, {
      tool: 'MultiEdit',
      input: { file_path: join(root, INIT) },
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
  });
  it('바로가기(심볼릭 링크) 경로로 고쳐도 ask다', async () => {
    symlinkSync(join(root, 'docs/conceptpowers'), join(root, 'cp-link'));
    const r = await edit('Edit', 'cp-link/init.json');
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
  });
  it('실제 경로(/private/tmp)와 다른 표기의 프로젝트 루트여도 ask다', async () => {
    const r = await decidePreToolUse(root, {
      tool: 'Edit',
      input: { file_path: join(realpathSync(root), INIT) },
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
  });
  it.skipIf(process.platform !== 'darwin' && process.platform !== 'win32')(
    '대소문자 무시 파일시스템에서 대소문자만 다른 경로도 ask다',
    async () => {
      const r = await edit('Edit', 'Docs/ConceptPowers/init.json');
      expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
    }
  );
  it('다른 파일 편집은 묻지 않고 안내만 붙인다', async () => {
    const r = await edit('Edit', 'src/a.ts');
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
    expect(r!.hookSpecificOutput.additionalContext).toContain('conceptpowers:review');
  });
  it('뷰어 생성물·참고자료 폴더는 묻지 않는다 — 기준선 판정 파일이 아니다', async () => {
    const viewer = await edit('Write', 'docs/conceptpowers/concepts/viewer/manifest.json');
    expect(viewer!.hookSpecificOutput.permissionDecision).toBeUndefined();
    const ref = await edit('Write', 'docs/conceptpowers/reference/note.md');
    expect(ref!.hookSpecificOutput.permissionDecision).toBeUndefined();
  });
  it('프로젝트 밖 경로는 묻지 않는다', async () => {
    const r = await decidePreToolUse(root, {
      tool: 'Edit',
      input: { file_path: join(tmpdir(), 'elsewhere/docs/conceptpowers/init.json') },
    });
    expect(r!.hookSpecificOutput.permissionDecision).toBeUndefined();
  });
});
