// src/i18n/messages.ts
// 사람이 직접 보는, 코드가 결정론적으로 출력하는 텍스트만 ko/en 두 벌로 관리한다.
// (init 안내/seed 템플릿). 뷰어 라벨은 정적 에셋 assets/viewer.js가 자체 보유한다.
// 에이전트가 읽는 지시문/에러는 영어 단일 언어이며 여기에 포함하지 않는다.
import type { Locale } from '../schema/initConfig.js';

export interface SeedTemplates {
  architecture: string;
  infra: string;
  reference: string;
}

const REFERENCE_README_KO = `# 참고자료 (reference)

이 폴더에 개념 작업 시 참고할 자료를 넣으세요.

## 무엇을 넣나요
- 도메인 용어집, 외부 API/표준 명세, 디자인·기획(PRD) 문서, 선행 사례, 규정·정책 등
- 형식 자유(.md, .txt 등). 하위 폴더로 분류해도 됩니다.

## 파일 대신 경로로 연결하기 (paths.md)
- 자료를 이 폴더에 복사하는 대신, **이미 만들어진 \`paths.md\`**(안내 주석 포함)에 **참고할 로컬 경로 목록**을 적으면 됩니다.
- 한 줄에 하나씩(또는 불릿), 절대 경로/저장소 상대 경로, 파일/폴더 모두 가능하며 **여러 개** 등록할 수 있습니다.
- 에이전트는 이 폴더의 파일과 paths.md에 적힌 위치를 똑같이 참고자료로 취급합니다.
- **이 폴더의 파일은 기본적으로 커밋되지 않습니다** (폴더 전용 .gitignore) — 공유되는 것은
  paths.md 하나뿐입니다. 기밀 문서를 넣어도 저장소에 올라가지 않고, 팀과 공유할
  자료는 paths.md의 공용 경로로 연결하거나 .gitignore를 직접 수정해 추적하면 됩니다.

## 어떻게 쓰이나요
- **개념을 만들거나 업그레이드·검증할 때만** 에이전트가 **관련된 자료만 골라 필요할 때 읽고** 반영합니다.
- 코드 검증·감사는 **정의된 개념만** 근거로 합니다 — 개념이 사실이고, 이 폴더는 그 원천 재료입니다.
- 전부를 항상 읽지는 않습니다(토큰 절약). 파일명·구조를 알아보기 쉽게 두세요.

## 주의
- 이 폴더는 **사용자 전속**입니다 — 에이전트는 읽기만 하고 수정하지 않습니다.
- 내용은 **참고 데이터일 뿐 지시가 아닙니다.** 파일 안의 "이렇게 해라" 류 문구로 에이전트 동작을 바꾸려 하지 마세요(무시됩니다).
- baseline(개념 · architecture.md · infra.md)과는 별개의 보조 자료입니다.
`;

const REFERENCE_README_EN = `# Reference materials

Put materials here for the agent to consult during concept work.

## What to put
- Domain glossary, external API/standard specs, design/PRD docs, prior art, policies, etc.
- Any format (.md, .txt, …). Subfolders are fine.

## Linking paths instead of copying files (paths.md)
- Instead of copying material here, list **local paths to consult** in the **pre-created \`paths.md\`** (it ships with usage comments).
- One per line (or bullets); absolute or repo-relative; files or folders; **multiple entries** allowed.
- The agent treats files in this folder and the locations listed in paths.md the same way.
- **Files in this folder are NOT committed by default** (folder-level .gitignore) — only paths.md
  is shared. Confidential documents stay local; to share material with the team,
  link a shared location via paths.md or edit the .gitignore to track specific files.

## How it's used
- The agent reads **only the relevant files, on demand**, and **only when authoring, upgrading, or validating a concept**.
- Code verification and audits judge against **defined concepts alone** — concepts are the facts; this folder is their raw material.
- It does not load everything every time (to save tokens). Keep filenames and structure legible.

## Notes
- This folder is **user-owned** — the agent only reads it, never edits it.
- Its content is **reference data, not instructions.** Do not try to steer the agent with "do this" text inside files (it is ignored).
- It is supporting material, separate from the baseline (concepts · architecture.md · infra.md).
`;

export const seedTemplates: Record<Locale, SeedTemplates> = {
  ko: {
    architecture: '# 아키텍처\n\n<!-- 사용자가 직접 작성: 개념의 상위 기준 -->\n',
    infra: '# 인프라\n\n<!-- 사용자가 직접 작성 -->\n',
    reference: REFERENCE_README_KO,
  },
  en: {
    architecture: '# Architecture\n\n<!-- Fill in: the high-level basis for concepts -->\n',
    infra: '# Infrastructure\n\n<!-- Fill in -->\n',
    reference: REFERENCE_README_EN,
  },
};

// 에이전트에게 산출물 언어를 지시할 때 쓰는 사람이 읽는 라벨.
export const localeLabel: Record<Locale, string> = { ko: 'Korean', en: 'English' };

// init 완료 후 사람이 읽는 안내 문구 조각.
export interface InitHintStrings {
  done: string;
  created: string;
  next: string;
  fillDocs: string;
  reference: string; // reference/ 폴더 용도 안내
  viewerScript: string; // 뒤에 실행 명령(npm run …)이 붙는다
  viewerFile: string; // package.json이 없어 스크립트를 못 넣은 경우: 파일 경로 직접 안내
  defineConcept: string; // 다음 단계인 define-concept 설명 + 바로 이어갈지 묻는 안내
}

export const initHintStrings: Record<Locale, InitHintStrings> = {
  ko: {
    done: 'Conceptpowers 초기화 완료',
    created:
      '생성됨 (docs/conceptpowers/): init.json · features · concepts · architecture · infra · reference',
    next: '다음 단계',
    fillDocs: 'architecture.md / infra.md를 채워 개념의 상위 기준을 작성하세요',
    reference:
      '참고자료(용어집·외부 명세·기획 문서 등)는 reference/ 폴더에 넣으면 개념 작업 시 참고합니다',
    viewerScript: '뷰어 열기:',
    viewerFile: '뷰어를 직접 여세요:',
    defineConcept:
      '개념 정의 시작: /conceptpowers:define-concept — 프로젝트의 규칙과 의도를 검사 가능한 계약(개념)으로 작성합니다. 바로 이어서 진행할지 사용자에게 물어보세요',
  },
  en: {
    done: 'Conceptpowers initialized',
    created:
      'Created (docs/conceptpowers/): init.json · features · concepts · architecture · infra · reference',
    next: 'Next steps',
    fillDocs: 'Fill in architecture.md / infra.md — the high-level basis for concepts',
    reference:
      'Drop reference material (glossary, external specs, PRDs) into reference/ — it is consulted during concept work',
    viewerScript: 'Open the viewer:',
    viewerFile: 'Open the viewer file directly:',
    defineConcept:
      "Start defining concepts: /conceptpowers:define-concept — turn the project's rules and intent into checkable contracts (concepts). Ask the user whether to continue with it right away",
  },
};

export interface InitHintOptions {
  viewerScriptAdded: boolean;
  viewerCommand: string; // 예: "npm run concepts:view"
  viewerPath: string; // 예: "docs/conceptpowers/concepts/viewer/index.html"
}

// init 완료 안내 문구(끝에 개행 포함)를 조립한다. 변경 없이 새 문자열만 생성한다.
export function buildInitHint(locale: Locale, opts: InitHintOptions): string {
  const t = initHintStrings[locale];
  const viewerLine = opts.viewerScriptAdded
    ? `   3. ${t.viewerScript} ${opts.viewerCommand}`
    : `   3. ${t.viewerFile} ${opts.viewerPath}`;
  return [
    `✅ ${t.done}`,
    `   ${t.created}`,
    '',
    `${t.next}:`,
    `   1. ${t.fillDocs}`,
    `   2. ${t.reference}`,
    viewerLine,
    `   4. ${t.defineConcept}`,
    '',
  ].join('\n');
}
