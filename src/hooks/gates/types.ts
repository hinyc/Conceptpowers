// @concept:governance-mode
// src/hooks/gates/types.ts
import type { InitConfig } from '../../schema/initConfig.js';
import type { AuditReport } from '../../audit/audit.js';
import type { CommitContent } from '../command/commitTree.js';

// 커밋 게이트 한 종의 판정. reason은 사용자용 한국어 핵심 문장(질문 접미사 없음 —
// 모드 조립기가 ask에서만 "그래도 커밋하시겠습니까?"를 붙인다). context는 에이전트용 영어.
export interface GateFinding {
  gate: string;
  reason: string;
  context?: string;
}

export interface GateInput {
  root: string;
  files: string[];
  cfg: InitConfig | null;
  report: AuditReport;
  /** 파일마다 커밋될 내용(커밋될 트리). 없으면 목록에 든 파일은 디스크, 나머지는 마지막 커밋 내용으로 본다 */
  commit?: CommitContent;
}

export type GateCheck = (input: GateInput) => Promise<GateFinding | null>;
