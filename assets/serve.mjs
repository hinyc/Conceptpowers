// Conceptpowers 뷰어 로컬 서버 — 의존성 0, node 내장 모듈만 사용한다.
// `node serve.mjs`로 실행하면 이 파일이 있는 디렉터리를 http로 서빙하고
// 기본 브라우저를 연다. .html을 IDE로 여는 OS 기본 동작을 우회하기 위함이다.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { extname, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MIME = {
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
  '.map': 'application/json; charset=utf-8'
}

// 확장자 → Content-Type. 알 수 없으면 octet-stream.
export function contentType(pathname) {
  return MIME[extname(pathname).toLowerCase()] ?? 'application/octet-stream'
}

// URL 경로를 root 안의 절대 경로로 안전하게 변환한다.
// 다음은 모두 null을 반환해 차단한다: 잘못된 인코딩, 널 바이트,
// '.'으로 시작하는 세그먼트(.cache/.alignment 등 + ../ 순회), root 밖 경로.
export function safeResolve(root, urlPath) {
  const base = resolve(root)
  let p
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
export function browserCommand(platform, url) {
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '""', url] }
  if (platform === 'darwin') return { cmd: 'open', args: [url] }
  return { cmd: 'xdg-open', args: [url] }
}

function openBrowser(url, platform = process.platform) {
  try {
    const { cmd, args } = browserCommand(platform, url)
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {}) // 브라우저 자동 열기는 베스트에포트
    child.unref()
  } catch {
    // 무시: 서버는 계속 동작하고 사용자가 URL을 직접 열 수 있다.
  }
}

async function handle(root, req, res) {
  const target = safeResolve(root, req.url)
  if (!target) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  try {
    const body = await readFile(target)
    res.writeHead(200, { 'Content-Type': contentType(target) })
    res.end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  }
}

// 사용 가능한 포트를 찾을 때까지 순차 시도하며 서버를 띄운다.
// entry: 브라우저로 열 진입 경로(서버 root 기준). 데이터(../data, ../../features)가
// 뷰어 디렉터리 밖에 있으므로 root는 그 상위(docs/conceptpowers)를 가리켜야 한다.
export function startServer({ root, entry = '', ports = [4173, 4174, 4175, 4176, 4177], open = false } = {}) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer((req, res) => handle(root, req, res))
    let i = 0
    const tryListen = () => {
      server.listen(ports[i], '127.0.0.1')
    }
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && i < ports.length - 1) {
        i += 1
        tryListen()
      } else {
        reject(err)
      }
    })
    server.on('listening', () => {
      const { port } = server.address()
      const url = `http://localhost:${port}/${entry.replace(/^\//, '')}`
      if (open) openBrowser(url)
      resolvePromise({ server, port, url })
    })
    tryListen()
  })
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  // serve.mjs는 .../concepts/viewer/ 에 있다. 데이터를 포함하도록 root는 두 단계 위
  // (docs/conceptpowers)로 두고, 뷰어 진입점을 연다.
  const root = fileURLToPath(new URL('../../', import.meta.url))
  startServer({ root, entry: 'concepts/viewer/index.html', open: true })
    .then(({ url }) => {
      // eslint-disable-next-line no-console
      console.log(`Conceptpowers 뷰어: ${url}  (종료: Ctrl+C)`)
    })
    .catch((err) => {
      console.error('뷰어 서버 시작 실패:', err.message)
      process.exit(1)
    })
}
