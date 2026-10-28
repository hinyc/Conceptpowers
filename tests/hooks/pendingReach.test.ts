// @concept:governance-mode @concept:reference-privacy
// tests/hooks/pendingReach.test.ts
// 커밋될 파일을 실행 전에 확정할 수 없는 명령에서 문지기가 무엇을 모아 묻는지 — 실제 git 저장소로 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - governance-mode 불변 "참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다"
//    → 경로 표기(중간 ./·절대경로)·위치 바꾸기(cd·git -C)·git 전역 옵션·셸 확장·감싼 명령으로 참고자료를 담아도
//      light에서 묻는다(무시된 새 파일·추적 중 수정 모두)
//    → 하위 폴더(훅 입력의 작업 폴더)에서 친 스테이징·경로 지정 명령도 같은 파일로 읽어 묻는다
//  - governance-mode 불변 "문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다"
//    → 참고자료만 좁게 담는 명령은 디스크에만 바뀐 판단 기록을 "커밋에 들어온다"고 묻지 않는다(그 커밋에 안 들어간다)
//    → 커밋 위치가 다른 저장소(프로젝트 밖·루트 안의 중첩 클론)면 이 프로젝트 커밋이 아니다 — 훅 작업 폴더든 명령의
//      cd·git -C든 아무 판단도 내지 않는다(위치 판정 전반은 commitLocation.test)
//  - reference-privacy 불변 "참고자료 폴더의 파일은 기본적으로 저장소 추적에서 제외하고, 경로 목록만 공유한다"
//    → 강제 추가로 담기는 무시된 참고자료는 이미 추적에서 제외돼 있으므로 ".gitignore에 추가" 대신 "강제 추가(-f)를
//      빼라"고 사실대로 안내한다
//    → 작업 폴더를 알려 주지 않으면 루트에서 출발한 것으로 본다
//  - governance-mode 불변 "거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다"
//    → 확정할 수 없는 커밋 명령에서 디스크 설정에 사람이 바꾼 값이 섞이면 묻는다
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decidePreToolUse } from '../../src/hooks/preToolUse.js';
import { scaffoldInit } from '../../src/init/scaffold.js';
import { checkPendingGovernance } from '../../src/hooks/gates/governanceFilesGate.js';
import { pendingOptionsFor } from '../../src/hooks/command/stagingReach.js';

const INIT = 'docs/conceptpowers/init.json';
const REF = 'docs/conceptpowers/reference';
const ALIGN = 'docs/conceptpowers/concepts/.alignment';
const C = 'git ' + 'commit -m x';
let root: string;

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], { cwd: root });
const readCfg = () => JSON.parse(readFileSync(join(root, INIT), 'utf8')) as Record<string, unknown>;
const writeCfg = (cfg: Record<string, unknown>) =>
  writeFileSync(join(root, INIT), JSON.stringify(cfg, null, 2) + '\n');
const bash = (command: string) => decidePreToolUse(root, { tool: 'Bash', input: { command } });
const bashIn = (command: string, cwd: string | null) =>
  decidePreToolUse(root, { tool: 'Bash', input: { command }, cwd });
// 문지기와 같은 변환(pendingOptionsFor)을 거쳐 묻는 항목을 모은다.
const pending = (command: string) => checkPendingGovernance(root, pendingOptionsFor(command, root));

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'cp-reach-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  await scaffoldInit(root, {});
  writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 1;\n');
  git('init', '-q');
});

describe('light: 우회 형태로 참고자료를 담아도 묻는다 [규칙: 참고자료 기밀 확인은 어느 강도에서나 반드시 사람에게 묻는다]', () => {
  beforeEach(() => {
    writeCfg({ ...readCfg(), enforcement: 'light' });
    writeFileSync(join(root, REF, 'spec.md'), 'old\n');
    git('add', '-A');
    git('add', '-f', INIT, `${REF}/spec.md`);
    git('commit', '-qm', 'base');
    writeFileSync(join(root, REF, 'new.md'), 'secret\n');
    writeFileSync(join(root, REF, 'spec.md'), 'changed\n');
  });

  const shapes: [string, string][] = [
    ['new.md', `git add -f docs/conceptpowers/./reference/new.md && ${C}`],
    ['spec.md', `git add docs/conceptpowers/./reference/spec.md && ${C}`],
    ['new.md', `git -C . add -f ${REF}/new.md && ${C}`],
    ['spec.md', `git -C . add ${REF}/spec.md && ${C}`],
    ['new.md', `git --no-pager add -f ${REF}/new.md && ${C}`],
    ['new.md', `cd docs && git add -f conceptpowers/reference/new.md && cd .. && ${C}`],
    ['spec.md', `cd docs && git add conceptpowers/reference/spec.md && cd .. && ${C}`],
    ['new.md', `git add -f ROOT/${REF}/new.md && ${C}`],
    ['spec.md', `git add ROOT/${REF}/spec.md && ${C}`],
    ['new.md', `F=-f; git add $F ${REF}/new.md && ${C}`],
    ['new.md', `env git add -f ${REF}/new.md && ${C}`],
    ['spec.md', `env git add ${REF}/spec.md && ${C}`],
    ['new.md', `sh -c 'git add -f ${REF}/new.md' && ${C}`],
    ['spec.md', `sh -c 'git add ${REF}/spec.md' && ${C}`],
    ['new.md', `git add -f ${REF}/new.md; ${C}`],
  ];
  for (const [file, shape] of shapes) {
    it(`${shape.slice(0, 70)} → ${file}로 묻는다`, async () => {
      const r = await bash(shape.replace('ROOT', root));
      expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain(file);
    });
  }

  // 훅 입력의 작업 폴더가 하위 폴더여도 같은 파일로 읽는다 (A4)
  const inDir: [string, string, string][] = [
    ['new.md', REF, 'git add -f new.md && ' + C],
    ['spec.md', REF, 'git add spec.md && ' + C],
    ['spec.md', REF, C + ' spec.md'],
    ['new.md', 'docs', 'git add -f conceptpowers/reference/new.md && ' + C],
  ];
  for (const [file, dir, shape] of inDir) {
    it(`${dir}에서 ${shape.slice(0, 50)} → ${file}로 묻는다`, async () => {
      const r = await bashIn(shape, join(root, dir));
      expect(r!.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(r!.hookSpecificOutput.permissionDecisionReason).toContain(file);
    });
  }

  // 강제 추가로 담기는 무시된 파일은 이미 .gitignore에 걸려 있다 — "추가하라"가 아니라 강제 추가를 빼라고 안내한다 (L4)
  // [규칙(reference-privacy): 참고자료 폴더의 파일은 기본적으로 저장소 추적에서 제외]
  it('강제 추가하는 무시된 참고자료는 "강제 추가(-f)를 빼세요"로 안내한다', async () => {
    const r = await bash(`git add -f ${REF}/new.md && ${C}`);
    const reason = r!.hookSpecificOutput.permissionDecisionReason ?? '';
    expect(reason).toContain('new.md');
    expect(reason).toContain('강제 추가(-f)를 빼세요');
    expect(reason).toContain(`${REF}/new.md는 이미 .gitignore에 걸린 파일`);
  });
  it('추적 중인 참고자료 변경은 기존처럼 .gitignore 추가와 스테이징 빼기를 안내한다', async () => {
    const r = await bash(`git add ${REF}/spec.md && ${C}`);
    const reason = r!.hookSpecificOutput.permissionDecisionReason ?? '';
    expect(reason).toContain('.gitignore에 docs/conceptpowers/reference/ 를 추가');
    expect(reason).not.toContain('강제 추가(-f)를 빼세요');
  });

  it('add·-f 흔적이 없는 일반 명령은 무시된 새 참고자료로 묻지 않는다(강제 추가 없이는 담기지 않는다)', async () => {
    const r = await bash(`pnpm test && ${C}`);
    expect(r?.hookSpecificOutput.permissionDecisionReason ?? '').not.toContain('new.md');
  });
});

describe('참고자료만 좁게 담으면 디스크에만 바뀐 판단 기록을 묻지 않는다 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  beforeEach(() => {
    mkdirSync(join(root, ALIGN), { recursive: true });
    writeFileSync(join(root, ALIGN, 'test-review.json'), '{}\n');
    git('add', '-A');
    git('add', '-f', INIT);
    git('commit', '-qm', 'base');
    writeFileSync(
      join(root, ALIGN, 'test-review.json'),
      JSON.stringify({ x: { hash: 'h', at: 't', note: 'n' } })
    );
    writeFileSync(join(root, REF, 'a.md'), 'hi\n');
  });

  it('git add -f <참고자료> && git commit → 참고자료만 묻고 test-review 기록은 묻지 않는다', async () => {
    const finding = await pending(`git add -f ${REF}/a.md && ${C}`);
    expect(finding?.reason ?? '').toContain('a.md');
    expect(finding?.reason ?? '').not.toContain('test-review');
  });

  it('git add <참고자료> && git commit → test-review 기록은 묻지 않는다', async () => {
    const finding = await pending(`git add ${REF}/a.md && ${C}`);
    expect(finding?.reason ?? '').not.toContain('test-review');
  });

  it('.alignment 폴더에서 test-review.json만 담는 명령도 판단 기록을 묻는다', async () => {
    const r = await bashIn(`git add test-review.json && ${C}`, join(root, ALIGN));
    expect(r!.hookSpecificOutput.permissionDecisionReason ?? '').toContain('test-review');
  });

  it('넓게 담는 명령이면 디스크의 판단 기록도 묻는다', async () => {
    const finding = await pending(`git add -A && ${C}`);
    expect(finding?.reason ?? '').toContain('test-review');
  });
});

describe('확정할 수 없는 커밋에서 디스크 설정에 사람이 바꾼 값이 섞이면 묻는다 [규칙: 거버넌스 설정 파일의 변경·삭제 … 가 커밋에 들어오면 강도와 무관하게 사람에게 묻는다]', () => {
  beforeEach(() => {
    const { noConceptGlobs: _dropped, ...older } = readCfg();
    writeCfg(older);
    git('add', '-A');
    git('add', '-f', INIT);
    git('commit', '-qm', 'base');
  });

  it('사람이 바꾼 값이 섞이면 pnpm lint && git commit에서 묻는다', async () => {
    writeCfg({ ...readCfg(), noConceptGlobs: ['src/ui/**'] });
    const finding = await pending(`pnpm lint && ${C}`);
    expect(finding?.reason ?? '').toContain('init.json');
  });
});

// 작업 폴더를 알려 주지 않으면 루트에서 출발한다 — 좁은 스테이징은 좁게, 경로 지정 커밋은 확정한다 (H2)
describe('작업 폴더를 모르면 루트에서 출발한다 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  beforeEach(() => {
    git('add', '-A');
    git('add', '-f', INIT);
    git('commit', '-qm', 'base');
    writeFileSync(join(root, 'src/a.ts'), '// @concept:none\nexport const a = 2;\n');
  });

  it('git add src/a.ts && git commit은 디스크에만 바뀐 설정을 묻지 않는다', async () => {
    writeCfg({ ...readCfg(), testGlobs: ['x/**'] });
    const r = await bashIn(`git add src/a.ts && ${C}`, null);
    expect(r?.hookSpecificOutput.permissionDecisionReason ?? '').not.toContain('init.json');
  });

  it('git commit -m x src/a.ts는 확정된 커밋으로 검사한다', async () => {
    const r = await bashIn(`${C} src/a.ts`, null);
    expect(JSON.stringify(r ?? {})).not.toContain('COMMIT UNRESOLVED');
  });
});

// 다른 저장소의 커밋은 이 프로젝트 커밋이 아니다 — 문지기가 판단하지 않는다 (H1)
describe('훅 작업 폴더가 프로젝트 밖·중첩 저장소인 커밋 [규칙: 문지기는 커밋에 실제로 들어갈 파일을 기준으로 검사한다]', () => {
  let other: string;
  const gitIn = (dir: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=T', ...args], { cwd: dir });
  beforeEach(() => {
    git('add', '-A');
    git('add', '-f', INIT);
    git('commit', '-qm', 'base');
    // 이 프로젝트에 스테이징된 설정 변경 — 판단했다면 묻게 된다
    writeCfg({ ...readCfg(), testGlobs: ['x/**'] });
    git('add', '-f', INIT);
    other = mkdtempSync(join(tmpdir(), 'cp-other-'));
    gitIn(other, 'init', '-q');
    writeFileSync(join(other, 'f.txt'), '1\n');
    gitIn(other, 'add', 'f.txt');
    gitIn(other, 'commit', '-qm', 'o');
    writeFileSync(join(other, 'f.txt'), '2\n');
  });

  for (const shape of [C, 'git commit -am x', `git add -A && ${C}`, `${C} f.txt`]) {
    it(`밖의 저장소에서 ${shape} → 판단하지 않는다`, async () => {
      expect(await bashIn(shape, other)).toBeNull();
    });
  }

  it('밖에서도 cd로 루트 안을 가리키면 판단한다', async () => {
    const r = await bashIn(`cd ${root} && git add -A && ${C}`, other);
    expect(r!.hookSpecificOutput.permissionDecisionReason).toContain('init.json');
  });

  // 명시적으로 가리킨 다른 저장소도 훅 작업 폴더가 다른 저장소인 것과 같다 (F1-d)
  it('루트에서 git -C로 밖의 다른 저장소를 가리킨 커밋도 판단하지 않는다', async () => {
    writeCfg({ ...readCfg(), enforcement: 'strict' });
    git('add', '-f', INIT);
    expect(await bashIn(`git -C ${other} commit -m x`, root)).toBeNull();
  });

  describe('루트 안의 다른 git 저장소(중첩 클론)', () => {
    let nested: string;
    beforeEach(() => {
      nested = join(root, 'vendor/lib');
      mkdirSync(join(nested, 'docs/conceptpowers'), { recursive: true });
      gitIn(nested, 'init', '-q');
      writeFileSync(join(nested, INIT), '{}\n');
      gitIn(nested, 'add', INIT);
      gitIn(nested, 'commit', '-qm', 'n');
      writeFileSync(join(nested, INIT), '{"x":1}\n');
      gitIn(nested, 'add', INIT);
      git('reset', '-q', INIT); // 이 프로젝트 쪽 스테이징은 비운다
    });

    for (const shape of [C, `git add -A && ${C}`]) {
      it(`중첩 저장소에서 ${shape} → 그 저장소의 색인을 이 프로젝트 경로로 오인하지 않는다`, async () => {
        expect(await bashIn(shape, nested)).toBeNull();
      });
    }

    it('루트에서 cd로 중첩 저장소에 들어가 하는 커밋도 판단하지 않는다', async () => {
      expect(await bashIn(`cd vendor/lib && ${C}`, root)).toBeNull();
    });
  });
});
