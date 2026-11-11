// @concept:governance-mode
// src/hooks/gates/types.ts
import type { InitConfig, Locale } from '../../schema/initConfig.js';
import type { AuditReport } from '../../audit/audit.js';
import type { CommitContent } from '../command/commitTree.js';

// 커밋 게이트 한 종의 판정. reason은 사용자용 핵심 문장 — 프로젝트 로캘(ko/en)로 쓴다(src/i18n/gateMessages.ts).
// 질문 접미사는 없다 — 모드 조립기가 ask에서만 붙인다. context는 에이전트용 영어.
export interface GateFinding {
  gate: string;
  reason: string;
  context?: string;
}

export interface GateInput {
  root: string;
  files: string[];
  cfg: InitConfig | null;
  /** 사람에게 보이는 사유의 언어 — readProjectLocale이 정한다(설정 검증 실패와 무관, output-locale). */
  locale: Locale;
  report: AuditReport;
  /** 파일마다 커밋될 내용(커밋될 트리). 없으면 목록에 든 파일은 디스크, 나머지는 마지막 커밋 내용으로 본다 */
  commit?: CommitContent;
}

export type GateCheck = (input: GateInput) => Promise<GateFinding | null>;
