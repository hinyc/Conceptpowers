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
