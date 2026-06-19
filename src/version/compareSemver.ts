const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parse(v: string): [number, number, number] | null {
  const m = SEMVER.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// remote가 installed보다 높은 버전이면 true. 비-semver는 안전하게 false.
export function isNewer(remote: string, installed: string): boolean {
  const r = parse(remote);
  const i = parse(installed);
  if (!r || !i) return false;
  for (let k = 0; k < 3; k++) {
    if (r[k] > i[k]) return true;
    if (r[k] < i[k]) return false;
  }
  return false;
}
