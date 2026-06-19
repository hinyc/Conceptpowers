# 플러그인 새 버전 알림 (SessionStart 내장) — 설계

날짜: 2026-06-19
상태: 승인됨 (구현 대기)

## 배경 / 문제

Conceptpowers는 git 기반 마켓플레이스(`.claude-plugin/marketplace.json`)로 배포되는 Claude Code 플러그인이다. Claude Code는 서드파티 마켓플레이스에 대해 **수동 업데이트가 기본값**이며(원하는 동작), 새 버전이 나왔다는 **내장 알림이 없다**. 또 업데이트 감지는 `plugin.json`의 `version` 필드 기준이라, 저자가 버전을 올려도 사용자는 새 버전 존재 자체를 모른다.

버전 관리·릴리스 흐름은 이미 `scripts/release.mjs`(`pnpm release`)로 완비되어 있다(3개 매니페스트 version 동기화 → dist 재빌드 → 커밋 + 태그). 따라서 이 작업의 범위는 **사용자에게 "새 버전이 있다"고 알리는 메커니즘 하나**다.

## 목표 / 비목표

목표:
- conceptpowers가 활성화된 프로젝트에서 세션 시작 시, 설치 버전보다 높은 버전이 GitHub에 있으면 사용자에게 **한 줄**로 알린다.
- 알림은 best-effort: 네트워크 실패/오프라인/지연이 세션 시작을 막거나 느리게 하지 않는다.
- 사용자가 끌 수 있다(phone-home 옷아웃).

비목표:
- 자동 업데이트(수동 유지가 기본값이자 사용자 요구).
- GitHub Release/CHANGELOG 기반 알림(별도 옵션 B, 이번 범위 밖).
- 마켓플레이스 메타데이터 동기화 변경.

## 동작 결정 (승인됨)

- **phone-home 기본 ON + 옷아웃 제공.**
- 옷아웃 경로 2개: `init.json`의 `versionCheck: false`, 환경변수 `CONCEPTPOWERS_NO_VERSION_CHECK=1`.
- 알림은 SessionStart 훅의 `additionalContext`에 `<CONCEPTPOWERS-UPDATE>` 블록으로 주입 → 에이전트가 사용자에게 한 줄 전달(기존 `<CONCEPT-DRIFT>`와 동일 패턴).

## 아키텍처 / 구성 요소

작은 파일로 도메인별 분리. 모든 코드는 불변 패턴, 포괄적 오류 처리.

1. **`src/schema/initConfig.ts`** — `InitConfigSchema`에 `versionCheck: z.boolean().default(true)` 추가. 기본 true라 하위호환. 옷아웃 = init.json에 `false`.

2. **`src/version/compareSemver.ts`** — 순수 함수.
   - `isNewer(remote: string, installed: string): boolean` — `x.y.z` 숫자 비교. 형식이 아니면 `false`(안전 측).
   - 의존성 없음, 완전 결정적, 테스트 용이.

3. **`src/version/checkUpdate.ts`** — 오케스트레이션. `checkForUpdate(pluginRoot, opts?): Promise<{ installed: string; latest: string } | null>`.
   - 설치 버전: `${pluginRoot}/.claude-plugin/plugin.json`의 `version` 읽기.
   - 캐시 읽기: 캐시 파일이 있고 `now - checkedAt < TTL(24h)`이면 캐시의 `latest` 사용(네트워크 생략).
   - 캐시 미스/만료: GitHub raw `plugin.json`을 fetch(타임아웃 ~1500ms, `AbortController`) → `version` 추출 → 캐시 갱신.
   - 비교: `isNewer(latest, installed)`이면 `{ installed, latest }` 반환, 아니면 `null`.
   - **절대 throw하지 않음**: 모든 fs/네트워크/파싱 오류는 내부에서 잡아 `null` 반환.
   - 의존성은 인자/옵션으로 주입 가능하게(테스트에서 fetch·캐시 경로 모킹).

4. **`src/hooks/sessionStart.ts`** — 통합.
   - `readInitConfig`로 `versionCheck` 확인. `false`거나 `CONCEPTPOWERS_NO_VERSION_CHECK` 설정 시 검사 생략.
   - best-effort `try/catch`로 `checkForUpdate(pluginRoot)` 호출.
   - 결과가 있으면 `buildUpdateBlock(installed, latest)`로 만든 `<CONCEPTPOWERS-UPDATE>` 블록을 `additionalContext` 끝에 append.

## 데이터 흐름

```
SessionStart
  └─ isInitialized? ──no──▶ null (변화 없음)
       │yes
       ▼
  readInitConfig → versionCheck off? / env off? ──yes──▶ 검사 생략 (기존 컨텍스트만)
       │no
       ▼
  checkForUpdate(pluginRoot)
       ├─ 캐시 유효 ──▶ 캐시 latest 사용
       └─ 캐시 미스/만료 ──▶ fetch(GitHub raw plugin.json, 1.5s timeout) ──실패──▶ null
       ▼
  isNewer(latest, installed)?
       ├─ no ──▶ null (블록 없음)
       └─ yes ──▶ <CONCEPTPOWERS-UPDATE> 블록을 additionalContext에 append
       ▼
  에이전트가 사용자에게 한 줄 안내:
  "🆕 Conceptpowers v{latest} 사용 가능 (설치됨 v{installed}).
   업데이트: /plugin marketplace update conceptpowers-dev"
```

## 캐시

- 위치: `~/.cache/conceptpowers/update-check.json` (환경변수 `CONCEPTPOWERS_CACHE_DIR`로 재정의 가능; 테스트는 임시 디렉토리 사용).
- 내용: `{ checkedAt: number, latest: string }`.
- TTL: 24h → 네트워크 호출은 하루 최대 1회. 캐시 유효 구간에도 캐시 latest와 설치 버전을 매번 비교하므로, 업데이트 전까지 매 세션 알림이 지속된다(지속 리마인더).
- 쓰기 실패는 무시(캐시는 최적화일 뿐, 없어도 동작).

## 출처(fetch)

- `https://raw.githubusercontent.com/hinyc/Conceptpowers/main/.claude-plugin/plugin.json`
- Claude Code가 업데이트 감지에 사용하는 것과 동일한 `version` 필드를 본다.
- Node 18+ 전역 `fetch` 사용, `AbortController` 타임아웃.

## 오류 / 엣지 처리

- 네트워크 실패/오프라인/타임아웃/비 200/JSON 파싱 실패/`version` 누락 → `null`, 블록 없음. 세션 시작 정상 진행.
- 설치 `plugin.json` 읽기 실패 → `null`.
- remote ≤ installed(다운그레이드/동일) → `null`.
- 형식 비-semver 버전 → `isNewer` false → 알림 안 함.
- 동작은 기존 drift 계산의 `try/catch` best-effort 패턴과 일치.

## 테스트 (vitest, 80%+)

- `compareSemver`: 상위/하위/동일/major·minor·patch 경계/형식오류 → 기대 boolean.
- `checkUpdate`(fetch·캐시 경로 모킹):
  - 캐시 유효 → fetch 호출 안 함, 캐시 latest로 비교.
  - 캐시 미스 → fetch 호출, 캐시 기록.
  - fetch 실패/타임아웃/비200/잘못된 JSON → `null`.
  - latest > installed → 객체 반환; latest ≤ installed → `null`.
  - 옷아웃(env/config) → 단락(네트워크 호출 없음).
- `sessionStart`: 업데이트 있을 때 `<CONCEPTPOWERS-UPDATE>` append / 없을 때 미포함 / `versionCheck:false`일 때 미실행.

## 배포 / 문서

- 훅은 `dist/hooks/*.js`를 직접 실행하므로 `pnpm build` 필수.
- 이후 `pnpm release patch`로 v0.1.1 배포 → 플러그인이 스스로 첫 알림 대상이 된다.
- README(EN/KO)에 동작·옷아웃(`versionCheck`, `CONCEPTPOWERS_NO_VERSION_CHECK`) 한 줄 명시.

## 변경 파일 요약

- 신규: `src/version/compareSemver.ts`, `src/version/checkUpdate.ts`, 각 테스트.
- 수정: `src/schema/initConfig.ts`, `src/hooks/sessionStart.ts`(+테스트), README(EN/KO).
- 빌드: `dist/` 재생성.
