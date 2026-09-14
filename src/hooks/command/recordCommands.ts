// @concept:concept-driven-tests @concept:drift-reconcile
// src/hooks/command/recordCommands.ts
// 사람의 판단을 기록하는 CLI 명령(검토 기록·코드무관 기록)을 실행하려는지 가려낸다. 이 기록은 커밋 문지기를
// 통과시키는 근거라 에이전트 혼자 남기면 문지기가 자기신고 한 줄로 사라진다 — 실행 전에 사람에게 묻는 재료다.
// 명령 단위의 단어로 본다: 따옴표 속 인자(grep "attest-no-code")는 명령 이름이 아니다. 셸 -c·eval·명령 치환 안도 본다.
// 실행 전 조기 안내일 뿐이다 — 어떤 방법으로 썼든 새 기록이 커밋에 들어오면 커밋 문지기가 다시 묻는다.
import { parseShellCommand } from './shellWords.js';

export const HUMAN_RECORD_COMMANDS = ['attest-no-code', 'attest-test-review'] as const;
const RECORDS = new Set<string>(HUMAN_RECORD_COMMANDS);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);
// 엔진 CLI를 가리키는 단어 — 기록 명령 이름은 같은 명령 단위에서 이 단어 뒤에 올 때만 명령이다(vitest -t attest-no-code는 아니다).
const CLI_WORD = /(?:^|\/)(?:cli(?:\.(?:m?js|ts))?|conceptpowers)$/;
// CLI 경로가 실행 대상 자리(명령 첫 단어이거나 실행기 바로 뒤)에 올 때만 엔진 CLI다 — `vitest run tests/cli`는 아니다.
const RUNNERS = new Set(['node', 'bun', 'deno', 'tsx', 'npx', 'exec', 'dlx', 'x']);
const baseName = (word: string): string => word.slice(word.lastIndexOf('/') + 1);
const isCliAt = (words: string[], j: number): boolean =>
  CLI_WORD.test(words[j]) && (j === 0 || RUNNERS.has(baseName(words[j - 1])));
const SHELL_C_FLAG = /^-[a-z]*c[a-z]*$/;
const MAX_DEPTH = 4;

function scan(command: string, depth: number, found: Set<string>): void {
  if (depth > MAX_DEPTH) return;
  for (const seg of parseShellCommand(command).segments) {
    for (const sub of seg.substitutions) scan(sub, depth + 1, found);
    const words = seg.words;
    words.forEach((w, i) => {
      if (RECORDS.has(w) && words.slice(0, i).some((_, j) => isCliAt(words, j))) found.add(w);
      const base = w.slice(w.lastIndexOf('/') + 1);
      if (SHELLS.has(base) && SHELL_C_FLAG.test(words[i + 1] ?? '') && words[i + 2]) {
        scan(words[i + 2], depth + 1, found);
      }
      if (base === 'eval' && i + 1 < words.length) {
        scan(words.slice(i + 1).join(' '), depth + 1, found);
      }
    });
  }
}

export function findHumanRecordCommands(command: string): string[] {
  const found = new Set<string>();
  scan(command, 0, found);
  return HUMAN_RECORD_COMMANDS.filter((c) => found.has(c));
}
