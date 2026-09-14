// @concept:none
// src/util/canonicalJson.ts
// 키 순서·공백·줄끝과 무관하게 JSON 값을 견주기 위한 정규 문자열.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

// 두 JSON 글이 같은 값을 담는가. 어느 한쪽이라도 JSON이 아니면 다르다고 본다(둘 다 없으면 같다).
export function sameJsonText(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  try {
    return canonicalJson(JSON.parse(a)) === canonicalJson(JSON.parse(b));
  } catch {
    return false;
  }
}
