// @concept:none
// 동시에 여는 파일 수를 제한한 map — 큰 참고자료 폴더를 한꺼번에 읽어 메모리가 치솟는 것을 막는다.
// 결과 순서는 입력 순서와 같다.
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
