// src/i18n/messages.ts
// 사람이 직접 보는, 코드가 결정론적으로 출력하는 텍스트만 ko/en 두 벌로 관리한다.
// (HTML 뷰어 라벨 + init seed 템플릿). 에이전트가 읽는 지시문/에러는 영어 단일 언어이며
// 여기에 포함하지 않는다.
import type { Locale } from '../schema/initConfig.js'

export interface ViewerStrings {
  description: string
  purpose: string
  allow: string
  restrict: string
  principle: string
  conceptList: string
  statusApproved: string
  statusUnapproved: string
  statusPending: string
  featureList: string
  relatedFeatures: string
  relatedConcepts: string
  implementationPaths: string
  featureEyebrow: string
  graphTitle: string
  openGraph: string
  conceptNode: string
  featureNode: string
  fileNode: string
}

export const viewerStrings: Record<Locale, ViewerStrings> = {
  ko: {
    description: '설명',
    purpose: '목적',
    allow: '허용 행동',
    restrict: '제한 행동',
    principle: '운영 원칙',
    conceptList: '개념 목록',
    statusApproved: '승인됨',
    statusUnapproved: '미승인',
    statusPending: '보류',
    featureList: '기능 목록',
    relatedFeatures: '관련 기능',
    relatedConcepts: '관련 개념',
    implementationPaths: '구현 경로',
    featureEyebrow: '기능',
    graphTitle: '지식 그래프',
    openGraph: '지식 그래프 보기',
    conceptNode: '개념',
    featureNode: '기능',
    fileNode: '파일'
  },
  en: {
    description: 'Description',
    purpose: 'Purpose',
    allow: 'Allowed',
    restrict: 'Restricted',
    principle: 'Operating Principles',
    conceptList: 'Concepts',
    statusApproved: 'Approved',
    statusUnapproved: 'Unapproved',
    statusPending: 'Pending',
    featureList: 'Features',
    relatedFeatures: 'Related Features',
    relatedConcepts: 'Related Concepts',
    implementationPaths: 'Implementation',
    featureEyebrow: 'Feature',
    graphTitle: 'Knowledge Graph',
    openGraph: 'View Knowledge Graph',
    conceptNode: 'Concept',
    featureNode: 'Feature',
    fileNode: 'File'
  }
}

export interface SeedTemplates {
  architecture: string
  infra: string
}

export const seedTemplates: Record<Locale, SeedTemplates> = {
  ko: {
    architecture: '# 아키텍처\n\n<!-- 사용자가 직접 작성: 개념의 상위 기준 -->\n',
    infra: '# 인프라\n\n<!-- 사용자가 직접 작성 -->\n'
  },
  en: {
    architecture: '# Architecture\n\n<!-- Fill in: the high-level basis for concepts -->\n',
    infra: '# Infrastructure\n\n<!-- Fill in -->\n'
  }
}

// 에이전트에게 산출물 언어를 지시할 때 쓰는 사람이 읽는 라벨.
export const localeLabel: Record<Locale, string> = { ko: 'Korean', en: 'English' }

// init 완료 후 사람이 읽는 안내 문구 조각.
export interface InitHintStrings {
  done: string
  created: string
  next: string
  fillDocs: string
  viewerScript: string // 뒤에 실행 명령(npm run …)이 붙는다
  viewerFile: string // package.json이 없어 스크립트를 못 넣은 경우: 파일 경로 직접 안내
}

export const initHintStrings: Record<Locale, InitHintStrings> = {
  ko: {
    done: 'Conceptpowers 초기화 완료',
    created: '생성됨 (docs/conceptpowers/): init.json · features · concepts · architecture · infra',
    next: '다음 단계',
    fillDocs: 'architecture.md / infra.md를 채워 개념의 상위 기준을 작성하세요',
    viewerScript: '뷰어 열기:',
    viewerFile: '뷰어를 직접 여세요:'
  },
  en: {
    done: 'Conceptpowers initialized',
    created: 'Created (docs/conceptpowers/): init.json · features · concepts · architecture · infra',
    next: 'Next steps',
    fillDocs: 'Fill in architecture.md / infra.md — the high-level basis for concepts',
    viewerScript: 'Open the viewer:',
    viewerFile: 'Open the viewer file directly:'
  }
}

export interface InitHintOptions {
  viewerScriptAdded: boolean
  viewerCommand: string // 예: "npm run concepts:view"
  viewerPath: string // 예: "docs/conceptpowers/concepts/viewer/index.html"
}

// init 완료 안내 문구(끝에 개행 포함)를 조립한다. 변경 없이 새 문자열만 생성한다.
export function buildInitHint(locale: Locale, opts: InitHintOptions): string {
  const t = initHintStrings[locale]
  const viewerLine = opts.viewerScriptAdded
    ? `   2. ${t.viewerScript} ${opts.viewerCommand}`
    : `   2. ${t.viewerFile} ${opts.viewerPath}`
  return [
    `✅ ${t.done}`,
    `   ${t.created}`,
    '',
    `${t.next}:`,
    `   1. ${t.fillDocs}`,
    viewerLine,
    ''
  ].join('\n')
}
