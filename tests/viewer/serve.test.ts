// @concept:concept-inline-edit @concept:settled-status @concept:human-owns-contract
// tests/viewer/serve.test.ts
// 뷰어 서버의 파일 서빙과 편집 통로(/api)를 검증한다.
// 검증 대상 규칙 ↔ 시나리오:
//  - concept-inline-edit 정의 "브라우저를 켜 둔 것만으로 프로젝트의 약속이 바뀌지는 않는다 —
//    뷰어에서 개념을 고칠 수 있는 사람은 그 컴퓨터 앞에 앉은 사람뿐이다" → 아래 불변 규칙 전체가
//    이 약속의 검증이다:
//  - concept-inline-edit 불변 "모든 요청은 내 컴퓨터 주소로 온 것인지 확인하고, 아니면 거절한다 — 읽기
//    요청도 예외가 아니며, 다른 사이트 이름으로 이 서버를 가리키게 한 요청은 거절한다"
//    → localhost/127.0.0.1만 허용 / 비로컬 Host의 변경 요청은 403 / 주소 바꿔치기 Host의 읽기·health도 403
//  - concept-inline-edit 불변 "고치는 요청은 이 뷰어 화면이 보낸 것일 때만 받아들인다 — 다른 사이트의 화면이
//    보냈거나, 보낸 화면을 밝히지 않았거나, 이 뷰어가 쓰는 형식이 아닌 요청은 거절한다"
//    → 같은 출처의 JSON 요청만 true / 다른 출처·출처 없음·교차 사이트 표시·JSON 아닌 형식은 403(실서버 포함)
//  - concept-inline-edit 불변 "출처를 알 수 없는 빈 요청은 안전한 쪽으로 보아 거절한다"
//    → 빈·누락 Host는 거부한다
//  - concept-inline-edit 불변 "서버가 내주는 파일은 정해진 폴더 안으로 제한하며, 상위로 거슬러 올라가는
//    경로·숨김 폴더·참고자료 폴더, 그리고 바로가기로 폴더 밖을 가리키는 파일은 거절한다"
//    → 디렉터리 탈출은 null / 잘못된 인코딩·널바이트·닷파일은 null(throw 금지) / 쿼리·해시 제거
//    → 참고자료 폴더 경로는 null, 실서버에서 403 / 폴더 밖을 가리키는 바로가기는 403
//  - concept-inline-edit 구성요소 "읽기 전용 모드: 프로젝트 위치를 모른 채 띄운 뷰어 — 고치는
//    통로가 아예 없다" → projectRoot 없이는 /api/* 가 비활성(404)이다
//  - concept-inline-edit 허용 "내 컴퓨터 주소로 온 읽기 요청에는 따로 묻지 않고 응답하는 것"
//    → 파일을 http로 서빙한다
//  - settled-status 불변 "빨강을 초록으로 올리는 것은 사람이 명시적으로 요청했을 때만 한다" / "한 번
//    확정된 초록·빨강은 시스템 경로로는 되돌리지 않는다"
//    → POST status: red→green 승인 + 디스크 반영 / 가드 위반(green→red)은 400
//  - concept-inline-edit 불변 "확정된 개념을 고치면 예외 없이 검토 중 상태로 내려간다" +
//    human-owns-contract 불변 "개념 문서의 내용 변경은 반드시 사람의 확인을 거친다"
//    → PUT 내용 편집: green이면 pending으로 내려가고 downgradedToPending=true
//  - concept-inline-edit 제한 "고칠 수 없는 것으로 정해진 값을 저장에 끼워 넣는 것"
//    → PUT 내용 편집: 스키마 위반은 400
//  - MIME 판정과 메서드·경로·본문 오류 응답(405/404/400)은 개념 규칙이 아니라 HTTP 계약이다.
// 뷰어 서버(src/viewer/serve.ts)의 순수 헬퍼·부팅 동작과 쓰기 API 라우터를 검증한다.
// 배포본 assets/serve.mjs는 이 소스를 esbuild로 번들한 산출물이다.
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, sep, join } from 'node:path';
import {
  contentType,
  safeResolve,
  browserCommand,
  startServer,
  isLocalRequest,
  isSameOriginWrite,
  isLoopbackAddress,
  handleApi,
  type ApiRequest,
} from '../../src/viewer/serve.js';
import { writeConcept, readConcept } from '../../src/store/conceptStore.js';
import { recordAttest } from '../../src/concept/attest.js';
import { parseConcept } from '../../src/schema/concept.js';

describe('contentType', () => {
  it('확장자별 MIME을 반환한다', () => {
    expect(contentType('a.html')).toContain('text/html');
    expect(contentType('a.json')).toContain('application/json');
    expect(contentType('a.css')).toContain('text/css');
    expect(contentType('a.js')).toContain('text/javascript');
  });
  it('알 수 없는 확장자는 octet-stream', () => {
    expect(contentType('a.bin')).toBe('application/octet-stream');
  });
});

describe('safeResolve', () => {
  const root = resolve('/tmp/viewer');
  it("'/'는 index.html로 매핑한다", () => {
    expect(safeResolve(root, '/')).toBe(root + sep + 'index.html');
  });
  it('쿼리/해시를 제거한다', () => {
    expect(safeResolve(root, '/manifest.json?x=1#a')).toBe(root + sep + 'manifest.json');
  });
  it('참고자료 폴더 경로는 null [규칙: 참고자료 폴더는 거절]', () => {
    expect(safeResolve(root, '/reference/secret.md')).toBeNull();
    expect(safeResolve(root, '/reference')).toBeNull();
    expect(safeResolve(root, '/%72eference/secret.md')).toBeNull();
    expect(safeResolve(root, '/features/x/reference/a.md')).toBeNull();
    expect(safeResolve(root, '/REFERENCE./secret.md')).toBeNull();
    expect(safeResolve(root, '/reference /secret.md')).toBeNull();
  });
  it('디렉터리 탈출은 null', () => {
    expect(safeResolve(root, '/../../etc/passwd')).toBeNull();
    expect(safeResolve(root, '/..%2f..%2fsecret')).toBeNull();
  });
  it('잘못된 인코딩/널바이트/닷파일은 null (throw 금지)', () => {
    expect(safeResolve(root, '/%')).toBeNull();
    expect(safeResolve(root, '/a%00b')).toBeNull();
    expect(safeResolve(root, '/.cache/mapping.json')).toBeNull();
    expect(safeResolve(root, '/.alignment/history.json')).toBeNull();
  });
});

describe('browserCommand', () => {
  it('플랫폼별 명령을 만든다', () => {
    expect(browserCommand('darwin', 'http://x').cmd).toBe('open');
    expect(browserCommand('win32', 'http://x').cmd).toBe('cmd');
    expect(browserCommand('linux', 'http://x').cmd).toBe('xdg-open');
  });
});

describe('isLocalRequest', () => {
  it('localhost/127.0.0.1만 허용한다', () => {
    expect(isLocalRequest({ host: 'localhost:4173' })).toBe(true);
    expect(isLocalRequest({ host: '127.0.0.1:4173' })).toBe(true);
    expect(isLocalRequest({ host: '[::1]:4173' })).toBe(true);
    expect(isLocalRequest({ host: 'evil.com' })).toBe(false);
  });
  it('빈/누락 Host는 거부한다', () => {
    expect(isLocalRequest({ host: '' })).toBe(false);
    expect(isLocalRequest({})).toBe(false);
  });
});

const SAME_ORIGIN = {
  host: 'localhost:4173',
  origin: 'http://localhost:4173',
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
};

describe('isLoopbackAddress', () => {
  it('요청이 실제로 내 컴퓨터 소켓에서 왔는지 본다 — 헤더만 믿지 않는다 [규칙: 모든 요청은 내 컴퓨터 주소로 온 것만]', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.0.5')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});

describe('isSameOriginWrite', () => {
  it('이 뷰어 화면이 보낸 JSON 요청만 받아들인다 [규칙: 고치는 요청은 이 뷰어 화면이 보낸 것만]', () => {
    expect(isSameOriginWrite(SAME_ORIGIN)).toBe(true);
    expect(
      isSameOriginWrite({ ...SAME_ORIGIN, 'content-type': 'application/json; charset=utf-8' })
    ).toBe(true);
  });
  it('Origin을 보내지 않는 브라우저라도 같은 출처 표시(sec-fetch-site)가 있으면 이 뷰어 화면으로 본다 [규칙: 고치는 요청은 이 뷰어 화면이 보낸 것만]', () => {
    const { origin: _omit, ...noOrigin } = SAME_ORIGIN;
    expect(isSameOriginWrite(noOrigin)).toBe(true);
    expect(isSameOriginWrite({ ...noOrigin, 'sec-fetch-site': 'same-site' })).toBe(false);
  });
  it('다른 사이트 화면·출처 없음·교차 사이트·JSON 아닌 형식은 거절한다 [규칙: 고치는 요청은 이 뷰어 화면이 보낸 것만]', () => {
    expect(isSameOriginWrite({ ...SAME_ORIGIN, origin: 'https://evil.example' })).toBe(false);
    const { origin: _omit, 'sec-fetch-site': _omit2, ...bare } = SAME_ORIGIN;
    expect(isSameOriginWrite(bare)).toBe(false); // 출처를 밝히는 신호가 하나도 없다
    expect(isSameOriginWrite({ ...SAME_ORIGIN, origin: 'null' })).toBe(false);
    expect(isSameOriginWrite({ ...SAME_ORIGIN, origin: 'http://127.0.0.1:4173' })).toBe(false);
    expect(
      isSameOriginWrite({ ...SAME_ORIGIN, 'sec-fetch-site': ['same-origin', 'cross-site'] })
    ).toBe(false);
    expect(isSameOriginWrite({ ...SAME_ORIGIN, 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(isSameOriginWrite({ ...SAME_ORIGIN, 'content-type': 'text/plain' })).toBe(false);
    expect(
      isSameOriginWrite({
        ...SAME_ORIGIN,
        host: 'evil.example:4173',
        origin: 'http://evil.example:4173',
      })
    ).toBe(false);
  });
});

function rawRequest(
  port: number,
  opts: { method?: string; path: string; headers?: Record<string, string>; body?: string }
): Promise<number> {
  return new Promise((resolveStatus, reject) => {
    const r = request(
      {
        host: '127.0.0.1',
        port,
        method: opts.method ?? 'GET',
        path: opts.path,
        headers: opts.headers,
      },
      (resp) => {
        resp.resume();
        resp.on('end', () => resolveStatus(resp.statusCode ?? 0));
      }
    );
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

describe('startServer — 주소·출처·폴더 경계', () => {
  let site: string;
  beforeEach(() => {
    site = mkdtempSync(join(tmpdir(), 'cp-site-'));
    writeFileSync(join(site, 'index.html'), '<p>ok</p>');
    mkdirSync(join(site, 'reference'), { recursive: true });
    writeFileSync(join(site, 'reference', 'secret.md'), '대외비');
    const outside = join(mkdtempSync(join(tmpdir(), 'cp-outside-')), 'leak.txt');
    writeFileSync(outside, 'leak');
    symlinkSync(outside, join(site, 'leak.txt'));
  });

  it('내 컴퓨터 주소로 온 읽기는 서빙한다 [규칙: 내 컴퓨터 주소로 온 읽기에는 응답]', async () => {
    const { server, port } = await startServer({ root: site, ports: [0], open: false });
    try {
      expect(await rawRequest(port, { path: '/index.html' })).toBe(200);
    } finally {
      server.close();
    }
  });

  it('다른 사이트 이름으로 가리킨 읽기는 403 [규칙: 읽기 요청도 주소 확인 — 주소 바꿔치기 거절]', async () => {
    const { server, port } = await startServer({ root: site, ports: [0], open: false });
    try {
      const status = await rawRequest(port, {
        path: '/index.html',
        headers: { host: `attacker.example:${port}` },
      });
      expect(status).toBe(403);
    } finally {
      server.close();
    }
  });

  it('정적 응답은 형식 추측과 외부 스크립트를 막는 헤더를 싣는다 [규칙: 고치는 요청은 이 뷰어 화면이 보낸 것만 — 같은 출처 신뢰를 지키는 조건]', async () => {
    const { server, port } = await startServer({ root: site, ports: [0], open: false });
    try {
      const res = await fetch(`http://127.0.0.1:${port}/index.html`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    } finally {
      server.close();
    }
  });

  it('다른 사이트 화면의 변경 요청은 본문을 읽기 전에 거절한다 [규칙: 고치는 요청은 이 뷰어 화면이 보낸 것만]', async () => {
    const project = mkdtempSync(join(tmpdir(), 'cp-proj-'));
    const { server, port } = await startServer({
      root: site,
      projectRoot: project,
      ports: [0],
      open: false,
    });
    try {
      // 본문 제한(256KB)을 넘는 길이를 알리고 일부만 보낸다. 본문을 다 받으려 했다면 응답이 없거나
      // 400(body too large)이고, 출처를 먼저 확인했다면 403이 즉시 온다. http 클라이언트는 이 순서에서
      // 응답보다 끊김을 먼저 알릴 수 있어 원시 소켓으로 실제 응답 첫 줄을 읽는다.
      const head = await new Promise<string>((resolveHead, reject) => {
        const sock = connect(port, '127.0.0.1');
        let got = '';
        sock.on('data', (d) => (got += d));
        sock.on('error', () => resolveHead(got)); // 서버가 먼저 끊으면 reset — 받은 것으로 판정
        sock.on('close', () => resolveHead(got));
        sock.setTimeout(3000, () => reject(new Error('no response')));
        sock.write(
          'POST /api/concept/admin-role/status HTTP/1.1\r\nHost: localhost\r\nOrigin: https://evil.example\r\n' +
            'Content-Type: text/plain\r\nContent-Length: 1048576\r\n\r\n'
        );
        sock.write('x'.repeat(65536));
      });
      expect(head.startsWith('HTTP/1.1 403')).toBe(true);
    } finally {
      server.close();
    }
  });

  it('참고자료 폴더의 파일은 내주지 않는다 [규칙: 참고자료 폴더는 거절]', async () => {
    const { server, port } = await startServer({ root: site, ports: [0], open: false });
    try {
      expect(await rawRequest(port, { path: '/reference/secret.md' })).toBe(403);
    } finally {
      server.close();
    }
  });

  it('폴더 밖을 가리키는 바로가기는 내주지 않는다 [규칙: 바로가기로 폴더 밖을 가리키는 파일은 거절]', async () => {
    const { server, port } = await startServer({ root: site, ports: [0], open: false });
    try {
      expect(await rawRequest(port, { path: '/leak.txt' })).toBe(403);
    } finally {
      server.close();
    }
  });

  it('실서버에서도 다른 사이트 화면이 보낸 변경 요청은 403 [규칙: 고치는 요청은 이 뷰어 화면이 보낸 것만]', async () => {
    const project = mkdtempSync(join(tmpdir(), 'cp-proj-'));
    const { server, port } = await startServer({
      root: site,
      projectRoot: project,
      ports: [0],
      open: false,
    });
    try {
      const status = await rawRequest(port, {
        method: 'POST',
        path: '/api/concept/admin-role/status',
        headers: { origin: 'https://evil.example', 'content-type': 'text/plain' },
        body: JSON.stringify({ status: 'red' }),
      });
      expect(status).toBe(403);
    } finally {
      server.close();
    }
  });
});

describe('startServer', () => {
  it('파일을 http로 서빙한다(브라우저 미오픈)', async () => {
    const root = resolve('assets'); // 이 레포의 assets/ 자체를 서빙해 본다
    const { server, url } = await startServer({ root, ports: [0], open: false });
    try {
      const res = await fetch(url + 'concept.css');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');
    } finally {
      server.close();
    }
  });
  it('projectRoot 없이는 /api/* 가 비활성(404)이다', async () => {
    const root = resolve('assets');
    const { server, url } = await startServer({ root, ports: [0], open: false });
    try {
      const res = await fetch(url + 'api/health');
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });
});

describe('handleApi', () => {
  let root: string;
  const base = {
    slug: 'admin-role',
    group: 'auth',
    category: ['role'],
    title: 'Admin Role',
    description: { definition: 'd' },
    purpose: { reason: 'r' },
    actions: {},
    principle: {},
  };
  const req = (over: Partial<ApiRequest>): ApiRequest => ({
    method: 'GET',
    url: '/',
    headers: SAME_ORIGIN,
    body: '',
    ...over,
  });

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cp-'));
  });

  it('GET /api/health → editable', async () => {
    const r = await handleApi(root, req({ method: 'GET', url: '/api/health' }));
    expect(r.status).toBe(200);
    expect((r.json as { editable: boolean }).editable).toBe(true);
  });

  it('POST status: red→green 승인 + 디스크 반영', async () => {
    const qualified = {
      ...base,
      state: { managed: ['이 개념이 관리하는 대상'] },
      principle: {
        immutableRules: ['이 개념의 규칙은 열 글자 이상이다'],
        operationalPrinciple: '조건이 갖춰지면 그대로 판정된다',
      },
      sources: [{ kind: 'decision', locator: '2026-09-12', supports: '검사용 결정' }],
    };
    await writeConcept(root, qualified as never);
    await recordAttest(root, parseConcept(qualified as never), 'pass');
    const r = await handleApi(
      root,
      req({
        method: 'POST',
        url: '/api/concept/admin-role/status',
        body: JSON.stringify({ status: 'green' }),
      })
    );
    expect(r.status).toBe(200);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('green');
  });

  it('POST status: 가드 위반(green→red)은 400', async () => {
    await writeConcept(root, { ...base, status: 'green' } as never);
    const r = await handleApi(
      root,
      req({
        method: 'POST',
        url: '/api/concept/admin-role/status',
        body: JSON.stringify({ status: 'red' }),
      })
    );
    expect(r.status).toBe(400);
  });

  it('POST status: 없는 개념은 404', async () => {
    const r = await handleApi(
      root,
      req({
        method: 'POST',
        url: '/api/concept/ghost/status',
        body: JSON.stringify({ status: 'green' }),
      })
    );
    expect(r.status).toBe(404);
  });

  it('POST status: 잘못된 status 값은 400', async () => {
    await writeConcept(root, base as never);
    const r = await handleApi(
      root,
      req({
        method: 'POST',
        url: '/api/concept/admin-role/status',
        body: JSON.stringify({ status: 'blue' }),
      })
    );
    expect(r.status).toBe(400);
  });

  it('PUT 내용 편집: green이면 pending으로 내려가고 downgradedToPending=true', async () => {
    await writeConcept(root, { ...base, status: 'green' } as never);
    const r = await handleApi(
      root,
      req({
        method: 'PUT',
        url: '/api/concept/admin-role',
        body: JSON.stringify({ patch: { title: 'New' } }),
      })
    );
    expect(r.status).toBe(200);
    expect((r.json as { downgradedToPending: boolean }).downgradedToPending).toBe(true);
    expect((await readConcept(root, 'admin-role'))?.status).toBe('pending');
    expect((await readConcept(root, 'admin-role'))?.title).toBe('New');
  });

  it('PUT 내용 편집: 스키마 위반은 400', async () => {
    await writeConcept(root, base as never);
    const r = await handleApi(
      root,
      req({
        method: 'PUT',
        url: '/api/concept/admin-role',
        body: JSON.stringify({ patch: { description: { definition: '' } } }),
      })
    );
    expect(r.status).toBe(400);
  });

  it('비로컬 Host의 변경 요청은 403', async () => {
    await writeConcept(root, base as never);
    const r = await handleApi(
      root,
      req({
        method: 'POST',
        url: '/api/concept/admin-role/status',
        headers: { host: 'evil.com' },
        body: JSON.stringify({ status: 'green' }),
      })
    );
    expect(r.status).toBe(403);
  });

  it('같은 주소라도 다른 사이트 화면·출처 없음·JSON 아닌 형식의 변경 요청은 403 [규칙: 고치는 요청은 이 뷰어 화면이 보낸 것만]', async () => {
    await writeConcept(root, base as never);
    const post = (headers: Record<string, string>) =>
      handleApi(
        root,
        req({
          method: 'POST',
          url: '/api/concept/admin-role/status',
          headers,
          body: JSON.stringify({ status: 'green' }),
        })
      );
    const { origin: _omit, 'sec-fetch-site': _omit2, ...noSignal } = SAME_ORIGIN;
    expect((await post({ ...SAME_ORIGIN, origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(noSignal)).status).toBe(403);
    expect((await post({ ...SAME_ORIGIN, 'content-type': 'text/plain' })).status).toBe(403);
    expect((await post({ ...SAME_ORIGIN, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await readConcept(root, 'admin-role'))?.status).not.toBe('green');
  });

  it('주소 바꿔치기 Host의 health 읽기도 403 [규칙: 읽기 요청도 주소 확인]', async () => {
    const r = await handleApi(
      root,
      req({ method: 'GET', url: '/api/health', headers: { host: 'attacker.example:4173' } })
    );
    expect(r.status).toBe(403);
  });

  it('잘못된 메서드는 405', async () => {
    const r = await handleApi(root, req({ method: 'DELETE', url: '/api/concept/admin-role' }));
    expect(r.status).toBe(405);
  });

  it('알 수 없는 경로는 404', async () => {
    const r = await handleApi(root, req({ method: 'GET', url: '/api/unknown' }));
    expect(r.status).toBe(404);
  });

  it('잘못된 JSON 본문은 400', async () => {
    await writeConcept(root, base as never);
    const r = await handleApi(
      root,
      req({
        method: 'POST',
        url: '/api/concept/admin-role/status',
        body: '{nope',
      })
    );
    expect(r.status).toBe(400);
  });
});
