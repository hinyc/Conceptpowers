// src/viewer/serve.ts — Conceptpowers 뷰어 로컬 서버.
// 빌드 시 esbuild가 엔진(zod 포함)을 인라인 번들해 assets/serve.mjs로 출력한다.
// 따라서 배포본은 런타임 의존성 0이면서 실제 엔진 가드 로직을 그대로 사용한다(드리프트 없음).
// `node serve.mjs`로 실행하면 docs/conceptpowers를 http로 서빙하고 기본 브라우저를 연다.
// projectRoot가 주어지면 /api/* 쓰기 엔드포인트가 활성화되어 뷰어에서 상태/내용을 편집할 수 있다.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { extname, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setConceptStatus, editConceptContent, readConcept } from '../store/conceptStore.js'
import { writeManifest } from './render.js'
import { ConceptStatus } from '../schema/concept.js'

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
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_BODY = 256 * 1024 // 256KB

// 확장자 → Content-Type. 알 수 없으면 octet-stream.
export function contentType(pathname: string): string {
  return MIME[extname(pathname).toLowerCase()] ?? 'application/octet-stream'
}

// URL 경로를 root 안의 절대 경로로 안전하게 변환한다.
// 다음은 모두 null을 반환해 차단한다: 잘못된 인코딩, 널 바이트,
// '.'으로 시작하는 세그먼트(.cache/.alignment 등 + ../ 순회), root 밖 경로.
export function safeResolve(root: string, urlPath: string): string | null {
  const base = resolve(root)
  let p: string
  try {
    p = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0])
  } catch {
    return null // malformed URI (예: "/%")
  }
  if (p.includes('\0')) return null
  if (p === '/' || p === '') p = '/index.html'
  if (p.split('/').some((seg) => seg.startsWith('.'))) return null
  const resolved = normalize(resolve(base, '.' + p))
  if (resolved !== base && !resolved.startsWith(base + sep)) return null
  return resolved
}

// 플랫폼별 "기본 브라우저로 URL 열기" 명령. http URL은 IDE가 아닌 브라우저로 열린다.
export function browserCommand(platform: string, url: string): { cmd: string; args: string[] } {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', url] }
  if (platform === 'darwin') return { cmd: 'open', args: [url] }
  return { cmd: 'xdg-open', args: [url] }
}

function openBrowser(url: string, platform: string = process.platform): void {
  try {
    const { cmd, args } = browserCommand(platform, url)
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {}) // 브라우저 자동 열기는 베스트에포트
    child.unref()
  } catch {
    // 무시: 서버는 계속 동작하고 사용자가 URL을 직접 열 수 있다.
  }
}

// 드라이브바이/DNS-rebinding 방어: 변경 요청은 Host가 localhost/127.0.0.1/[::1]일 때만 허용한다.
// HTTP/1.1은 Host를 필수로 보내므로 빈 Host는 거부한다(원시 소켓·구버전 요청 차단).
export function isLocalRequest(headers: Record<string, string | string[] | undefined>): boolean {
  const raw = String(headers.host ?? '').toLowerCase()
  // IPv6는 [::1]:port 형식 → 대괄호 안을 호스트로, 그 외는 host:port에서 앞부분을 취한다.
  const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

export interface ApiRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: string
}
export interface ApiResult {
  status: number
  json: unknown
}

// 쓰기 API 라우터(순수 로직: req 유사 객체 → {status, json}). 소켓과 무관해 테스트 가능.
// projectRoot는 엔진 함수의 root 인자(프로젝트 루트, docs/conceptpowers의 상위).
export async function handleApi(projectRoot: string, req: ApiRequest): Promise<ApiResult> {
  const path = (req.url || '').split('?')[0]

  if (req.method === 'GET' && path === '/api/health') {
    return { status: 200, json: { editable: true } }
  }

  if (req.method !== 'GET' && !isLocalRequest(req.headers)) {
    return { status: 403, json: { error: 'forbidden: non-local request' } }
  }

  // POST /api/concept/:slug/status  { status }
  const statusMatch = path.match(/^\/api\/concept\/([^/]+)\/status$/)
  if (statusMatch) {
    if (req.method !== 'POST') return { status: 405, json: { error: 'method not allowed' } }
    const slug = decodeURIComponent(statusMatch[1])
    if (!SLUG_RE.test(slug)) return { status: 400, json: { error: 'invalid slug' } }
    let parsed: unknown
    try { parsed = JSON.parse(req.body || '{}') } catch { return { status: 400, json: { error: 'invalid JSON body' } } }
    const status = ConceptStatus.safeParse((parsed as { status?: unknown }).status)
    if (!status.success) return { status: 400, json: { error: 'status must be green|pending|red' } }
    try {
      const concept = await setConceptStatus(projectRoot, slug, status.data)
      await writeManifest(projectRoot)
      return { status: 200, json: { ok: true, concept } }
    } catch (error) {
      return { status: errorStatus(error), json: { error: (error as Error).message } }
    }
  }

  // PUT /api/concept/:slug  { patch }
  const editMatch = path.match(/^\/api\/concept\/([^/]+)$/)
  if (editMatch) {
    if (req.method !== 'PUT') return { status: 405, json: { error: 'method not allowed' } }
    const slug = decodeURIComponent(editMatch[1])
    if (!SLUG_RE.test(slug)) return { status: 400, json: { error: 'invalid slug' } }
    let parsed: unknown
    try { parsed = JSON.parse(req.body || '{}') } catch { return { status: 400, json: { error: 'invalid JSON body' } } }
    const patch = (parsed as { patch?: unknown }).patch
    if (!patch || typeof patch !== 'object') return { status: 400, json: { error: 'patch object required' } }
    try {
      const before = await readConcept(projectRoot, slug)
      const wasGreen = before?.status === 'green'
      const concept = await editConceptContent(projectRoot, slug, patch)
      await writeManifest(projectRoot)
      return { status: 200, json: { ok: true, concept, downgradedToPending: wasGreen } }
    } catch (error) {
      return { status: errorStatus(error), json: { error: (error as Error).message } }
    }
  }

  return { status: 404, json: { error: 'not found' } }
}

// 엔진 에러 메시지를 HTTP 상태로 매핑한다. "not found"만 404, 나머지(가드 위반/중복/검증)는 400.
function errorStatus(error: unknown): number {
  return /not found/i.test((error as Error).message) ? 404 : 400
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    let aborted = false
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      if (aborted) return
      size += c.length
      if (size > MAX_BODY) { aborted = true; reject(new Error('body too large')); req.destroy() }
      else chunks.push(c)
    })
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, json: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(json))
}

async function handle(
  root: string,
  projectRoot: string | undefined,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = req.url || '/'
  // /api/* : projectRoot가 있을 때만 활성(정적 배포는 읽기 전용).
  if (url.split('?')[0].startsWith('/api/')) {
    if (!projectRoot) { sendJson(res, 404, { error: 'editing not available' }); return }
    try {
      const body = req.method === 'GET' ? '' : await readBody(req)
      const result = await handleApi(projectRoot, { method: req.method || 'GET', url, headers: req.headers, body })
      sendJson(res, result.status, result.json)
    } catch (error) {
      sendJson(res, 400, { error: (error as Error).message })
    }
    return
  }

  if (req.method !== 'GET') { res.writeHead(405); res.end('Method Not Allowed'); return }

  const target = safeResolve(root, url)
  if (!target) { res.writeHead(403); res.end('Forbidden'); return }
  try {
    const file = await readFile(target)
    res.writeHead(200, { 'Content-Type': contentType(target) })
    res.end(file)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
}

export interface StartServerOptions {
  root: string
  projectRoot?: string
  entry?: string
  ports?: number[]
  open?: boolean
}

// 사용 가능한 포트를 찾을 때까지 순차 시도하며 서버를 띄운다.
// entry: 브라우저로 열 진입 경로(서버 root 기준). 데이터(../data, ../../features)가
// 뷰어 디렉터리 밖에 있으므로 root는 그 상위(docs/conceptpowers)를 가리켜야 한다.
export function startServer({
  root,
  projectRoot,
  entry = '',
  ports = [4173, 4174, 4175, 4176, 4177],
  open = false,
}: StartServerOptions): Promise<{ server: ReturnType<typeof createServer>; port: number; url: string }> {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => {
      handle(root, projectRoot, req, res).catch(() => {
        try { res.writeHead(500); res.end('Internal Server Error') } catch { /* 이미 응답됨 */ }
      })
    })
    let i = 0
    const tryListen = () => server.listen(ports[i], '127.0.0.1')
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && i < ports.length - 1) { i += 1; tryListen() }
      else reject(err)
    })
    server.on('listening', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      const url = `http://localhost:${port}/${entry.replace(/^\//, '')}`
      if (open) openBrowser(url)
      resolvePromise({ server, port, url })
    })
    tryListen()
  })
}

// 직접 실행(node serve.mjs) 여부. macOS의 /var→/private/var 등 심링크 경로에서도
// 일치하도록 양쪽을 realpath로 정규화해 비교한다.
function runAsMain(): boolean {
  const argv = process.argv[1]
  if (!argv) return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(argv)
  } catch {
    return import.meta.url === pathToFileURL(argv).href
  }
}
const isMain = runAsMain()

if (isMain) {
  // serve.mjs는 .../concepts/viewer/ 에 있다. 정적 서빙 root는 데이터를 포함하도록 두 단계 위
  // (docs/conceptpowers), 엔진용 projectRoot는 네 단계 위(프로젝트 루트)다.
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url))
  startServer({ root, projectRoot, entry: 'concepts/viewer/index.html', open: true })
    .then(({ url }) => {
      // eslint-disable-next-line no-console
      console.log(`Conceptpowers 뷰어: ${url}  (편집 가능 · 종료: Ctrl+C)`)
    })
    .catch((err) => {
      console.error('뷰어 서버 시작 실패:', err.message)
      process.exit(1)
    })
}
