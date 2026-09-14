// @concept:concept-inline-edit
// src/viewer/serve.ts — Conceptpowers 뷰어 로컬 서버.
// 빌드 시 esbuild가 엔진(zod 포함)을 인라인 번들해 assets/serve.mjs로 출력한다.
// 따라서 배포본은 런타임 의존성 0이면서 실제 엔진 가드 로직을 그대로 사용한다(드리프트 없음).
// `node serve.mjs`로 실행하면 docs/conceptpowers를 http로 서빙하고 기본 브라우저를 연다.
// projectRoot가 주어지면 /api/* 쓰기 엔드포인트가 활성화되어 뷰어에서 상태/내용을 편집할 수 있다.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setConceptStatus, editConceptContent, readConcept } from '../store/conceptStore.js';
import { writeManifest } from './render.js';
import { ConceptStatus } from '../schema/concept.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// 서버가 내주지 않는 폴더(대소문자 무시) — 참고자료는 개념 작업용 기밀 자료다(reference-privacy).
const PRIVATE_DIRS = new Set(['reference']);
const MAX_BODY = 256 * 1024; // 256KB

// 확장자 → Content-Type. 알 수 없으면 octet-stream.
export function contentType(pathname: string): string {
  return MIME[extname(pathname).toLowerCase()] ?? 'application/octet-stream';
}

// URL 경로를 root 안의 절대 경로로 안전하게 변환한다.
// 다음은 모두 null을 반환해 차단한다: 잘못된 인코딩, 널 바이트,
// '.'으로 시작하는 세그먼트(.cache/.alignment 등 + ../ 순회), root 밖 경로.
export function safeResolve(root: string, urlPath: string): string | null {
  const base = resolve(root);
  let p: string;
  try {
    p = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed URI (예: "/%")
  }
  if (p.includes('\0')) return null;
  if (p === '/' || p === '') p = '/index.html';
  if (p.split('/').some((seg) => seg.startsWith('.'))) return null;
  const resolved = normalize(resolve(base, '.' + p));
  return isServable(base, resolved) ? resolved : null;
}

// base 안이고, 숨김 폴더·비공개 폴더(참고자료)를 어느 깊이에서도 거치지 않는 경로인가. 실제 경로(바로가기
// 해소 뒤)에도 쓴다. 끝의 점·공백은 Windows가 지우고 읽으므로 어휘 단계에서도 지우고 비교한다 — 아래 realpath
// (네이티브 구현: 대소문자·8.3 이름 정규화)와 함께 이중 방어다. 둘 중 하나만 남기지 않는다.
function isServable(base: string, target: string): boolean {
  if (target !== base && !target.startsWith(base + sep)) return false;
  const segs = target
    .slice(base.length + 1)
    .split(sep)
    .filter(Boolean);
  if (segs.some((seg) => seg.startsWith('.'))) return false;
  return !segs.some((seg) => PRIVATE_DIRS.has(seg.replace(/[. ]+$/, '').toLowerCase()));
}

// 요청이 실제로 내 컴퓨터(루프백) 소켓에서 왔는가 — Host 헤더는 손으로 넣을 수 있으므로 소켓 주소도 본다.
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const a = address.toLowerCase().replace(/^::ffff:/, '');
  return a === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
}

// 플랫폼별 "기본 브라우저로 URL 열기" 명령. http URL은 IDE가 아닌 브라우저로 열린다.
export function browserCommand(platform: string, url: string): { cmd: string; args: string[] } {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', url] };
  if (platform === 'darwin') return { cmd: 'open', args: [url] };
  return { cmd: 'xdg-open', args: [url] };
}

function openBrowser(url: string, platform: string = process.platform): void {
  try {
    const { cmd, args } = browserCommand(platform, url);
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {}); // 브라우저 자동 열기는 베스트에포트
    child.unref();
  } catch {
    // 무시: 서버는 계속 동작하고 사용자가 URL을 직접 열 수 있다.
  }
}

// 드라이브바이/DNS-rebinding 방어: 변경 요청은 Host가 localhost/127.0.0.1/[::1]일 때만 허용한다.
// HTTP/1.1은 Host를 필수로 보내므로 빈 Host는 거부한다(원시 소켓·구버전 요청 차단).
export function isLocalRequest(headers: Record<string, string | string[] | undefined>): boolean {
  const raw = String(headers.host ?? '').toLowerCase();
  // IPv6는 [::1]:port 형식 → 대괄호 안을 호스트로, 그 외는 host:port에서 앞부분을 취한다.
  const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0];
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function header(headers: Record<string, string | string[] | undefined>, name: string): string {
  const value = headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : String(value ?? '');
}

// CSRF 방어: 고치는 요청은 이 뷰어 화면(같은 출처)이 보낸 JSON 요청만 받는다. 브라우저는 쓰기 요청에 항상
// Origin을 싣고, 다른 사이트 화면이 JSON 형식으로 보내려면 사전 확인(preflight)을 통과해야 하는데 이 서버는
// 허락하지 않는다. Host 확인만으로는 부족하다 — 다른 사이트 화면이 보낸 요청도 Host는 localhost다.
// Origin을 보내지 않는 브라우저 설정도 있다 — 그때는 같은 출처 표시(sec-fetch-site)가 대신 증명한다.
// 둘 다 없으면 출처를 알 수 없으므로 거절한다.
export function isSameOriginWrite(headers: Record<string, string | string[] | undefined>): boolean {
  if (!isLocalRequest(headers)) return false;
  if (header(headers, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') {
    return false;
  }
  const siteValue = headers['sec-fetch-site'];
  if (Array.isArray(siteValue) && siteValue.length > 1) return false; // 중복 표시는 신뢰하지 않는다
  const site = header(headers, 'sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  const rawOrigin = header(headers, 'origin');
  if (!rawOrigin) return site === 'same-origin';
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return false;
  }
  if (origin.protocol !== 'http:') return false;
  return origin.host.toLowerCase() === header(headers, 'host').toLowerCase();
}

export interface ApiRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}
export interface ApiResult {
  status: number;
  json: unknown;
}

// 쓰기 API 라우터(순수 로직: req 유사 객체 → {status, json}). 소켓과 무관해 테스트 가능.
// projectRoot는 엔진 함수의 root 인자(프로젝트 루트, docs/conceptpowers의 상위).
export async function handleApi(projectRoot: string, req: ApiRequest): Promise<ApiResult> {
  const path = (req.url || '').split('?')[0];

  // 읽기 요청도 내 컴퓨터 주소로 온 것만 — 다른 사이트 이름으로 이 서버를 가리키게 한 요청(DNS 리바인딩) 거절.
  if (!isLocalRequest(req.headers)) {
    return { status: 403, json: { error: 'forbidden: non-local request' } };
  }

  if (req.method === 'GET' && path === '/api/health') {
    return { status: 200, json: { editable: true } };
  }

  if (req.method !== 'GET' && !isSameOriginWrite(req.headers)) {
    return { status: 403, json: { error: 'forbidden: write must come from this viewer as JSON' } };
  }

  // POST /api/concept/:slug/status  { status }
  const statusMatch = path.match(/^\/api\/concept\/([^/]+)\/status$/);
  if (statusMatch) {
    if (req.method !== 'POST') return { status: 405, json: { error: 'method not allowed' } };
    const slug = decodeURIComponent(statusMatch[1]);
    if (!SLUG_RE.test(slug)) return { status: 400, json: { error: 'invalid slug' } };
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body || '{}');
    } catch {
      return { status: 400, json: { error: 'invalid JSON body' } };
    }
    const status = ConceptStatus.safeParse((parsed as { status?: unknown }).status);
    if (!status.success)
      return { status: 400, json: { error: 'status must be green|pending|red' } };
    try {
      const concept = await setConceptStatus(projectRoot, slug, status.data);
      await writeManifest(projectRoot);
      return { status: 200, json: { ok: true, concept } };
    } catch (error) {
      return { status: errorStatus(error), json: { error: (error as Error).message } };
    }
  }

  // PUT /api/concept/:slug  { patch }
  const editMatch = path.match(/^\/api\/concept\/([^/]+)$/);
  if (editMatch) {
    if (req.method !== 'PUT') return { status: 405, json: { error: 'method not allowed' } };
    const slug = decodeURIComponent(editMatch[1]);
    if (!SLUG_RE.test(slug)) return { status: 400, json: { error: 'invalid slug' } };
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body || '{}');
    } catch {
      return { status: 400, json: { error: 'invalid JSON body' } };
    }
    const patch = (parsed as { patch?: unknown }).patch;
    if (!patch || typeof patch !== 'object')
      return { status: 400, json: { error: 'patch object required' } };
    try {
      const before = await readConcept(projectRoot, slug);
      const wasGreen = before?.status === 'green';
      const concept = await editConceptContent(projectRoot, slug, patch);
      await writeManifest(projectRoot);
      return { status: 200, json: { ok: true, concept, downgradedToPending: wasGreen } };
    } catch (error) {
      return { status: errorStatus(error), json: { error: (error as Error).message } };
    }
  }

  return { status: 404, json: { error: 'not found' } };
}

// 엔진 에러 메시지를 HTTP 상태로 매핑한다. "not found"만 404, 나머지(가드 위반/중복/검증)는 400.
function errorStatus(error: unknown): number {
  return /not found/i.test((error as Error).message) ? 404 : 400;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    let aborted = false;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// 같은 출처 신뢰가 유일한 방어선이므로, 내주는 파일이 뜻밖의 문서로 해석되거나 바깥 스크립트를 끌어오지 못하게 한다.
// 뷰어는 외부 스크립트(assets/*.js)만 쓰고 인라인 스타일 조작은 하므로 style만 inline을 허용한다.
const STATIC_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
} as const;

function sendJson(res: ServerResponse, status: number, json: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(json));
}

async function handle(
  root: string,
  projectRoot: string | undefined,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = req.url || '/';
  // 모든 요청은 내 컴퓨터 주소로 온 것만 — 주소 바꿔치기(DNS 리바인딩)로 파일을 읽어 가는 것을 막는다.
  // 헤더와 소켓 주소를 함께 본다: 바인드 주소가 바뀌어도 손으로 넣은 Host: localhost가 통하지 않게.
  if (!isLocalRequest(req.headers) || !isLoopbackAddress(req.socket?.remoteAddress)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  // /api/* : projectRoot가 있을 때만 활성(정적 배포는 읽기 전용).
  if (url.split('?')[0].startsWith('/api/')) {
    if (!projectRoot) {
      sendJson(res, 404, { error: 'editing not available' });
      return;
    }
    // 고치는 요청은 본문을 받기 전에 출처를 확인한다 — 다른 사이트 화면이 큰 본문을 흘려 넣지 못하게.
    if (req.method !== 'GET' && !isSameOriginWrite(req.headers)) {
      sendJson(res, 403, { error: 'forbidden: write must come from this viewer as JSON' });
      req.destroy();
      return;
    }
    try {
      const body = req.method === 'GET' ? '' : await readBody(req);
      const result = await handleApi(projectRoot, {
        method: req.method || 'GET',
        url,
        headers: req.headers,
        body,
      });
      sendJson(res, result.status, result.json);
    } catch (error) {
      sendJson(res, 400, { error: (error as Error).message });
    }
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  const target = safeResolve(root, url);
  if (!target) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let real: string;
  try {
    real = await realpath(target);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  // 바로가기(심링크)로 폴더 밖·숨김 폴더·참고자료를 가리키는 파일은 내주지 않는다.
  if (!isServable(await realpath(root), real)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const file = await readFile(real);
    res.writeHead(200, { 'Content-Type': contentType(real), ...STATIC_SECURITY_HEADERS });
    res.end(file);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export interface StartServerOptions {
  root: string;
  projectRoot?: string;
  entry?: string;
  ports?: number[];
  open?: boolean;
}

// 사용 가능한 포트를 찾을 때까지 순차 시도하며 서버를 띄운다.
// entry: 브라우저로 열 진입 경로(서버 root 기준). 개념 데이터(../data)가 뷰어 디렉터리
// 밖에 있으므로 root는 그 상위(docs/conceptpowers)를 가리켜야 한다.
export function startServer({
  root,
  projectRoot,
  entry = '',
  ports = [4173, 4174, 4175, 4176, 4177],
  open = false,
}: StartServerOptions): Promise<{
  server: ReturnType<typeof createServer>;
  port: number;
  url: string;
}> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      handle(root, projectRoot, req, res).catch(() => {
        try {
          res.writeHead(500);
          res.end('Internal Server Error');
        } catch {
          /* 이미 응답됨 */
        }
      });
    });
    let i = 0;
    const tryListen = () => server.listen(ports[i], '127.0.0.1');
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && i < ports.length - 1) {
        i += 1;
        tryListen();
      } else reject(err);
    });
    server.on('listening', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      const url = `http://localhost:${port}/${entry.replace(/^\//, '')}`;
      if (open) openBrowser(url);
      resolvePromise({ server, port, url });
    });
    tryListen();
  });
}

// 직접 실행(node serve.mjs) 여부. macOS의 /var→/private/var 등 심링크 경로에서도
// 일치하도록 양쪽을 realpath로 정규화해 비교한다.
function runAsMain(): boolean {
  const argv = process.argv[1];
  if (!argv) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv);
  } catch {
    return import.meta.url === pathToFileURL(argv).href;
  }
}
const isMain = runAsMain();

if (isMain) {
  // serve.mjs는 .../concepts/viewer/ 에 있다. 정적 서빙 root는 데이터를 포함하도록 두 단계 위
  // (docs/conceptpowers), 엔진용 projectRoot는 네 단계 위(프로젝트 루트)다.
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  startServer({ root, projectRoot, entry: 'concepts/viewer/index.html', open: true })
    .then(({ url }) => {
      // eslint-disable-next-line no-console
      console.log(`Conceptpowers 뷰어: ${url}  (편집 가능 · 종료: Ctrl+C)`);
    })
    .catch((err) => {
      console.error('뷰어 서버 시작 실패:', err.message);
      process.exit(1);
    });
}
