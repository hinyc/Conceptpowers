// @concept:governance-mode
// src/util/exitAfterWrite.ts

// 훅 판정 JSON을 stdout에 끝까지 쓴 뒤에 종료한다. 파이프에서 write 직후 process.exit를 부르면
// 64KB를 넘는 출력이 잘리고, 잘린 JSON은 판정 없음으로 처리돼 커밋이 조용히 통과한다.
export function exitAfterWrite(text: string | null, code = 0): void {
  if (!text) {
    process.exit(code);
    return;
  }
  process.stdout.write(text, () => process.exit(code));
}
