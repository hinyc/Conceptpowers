// @concept:output-locale
// src/viewer/i18n.ts — 뷰어 서버가 사람에게 보이는 터미널 안내 문구표(ko/en).
// 화면(UI) 문구는 정적 파일 assets/viewer.js의 I18N 표가 맡는다(브라우저는 번들되지 않는다).
import type { Locale } from '../schema/initConfig.js';

export interface ServerMessages {
  started: (url: string) => string;
  startFailed: string;
}

export const SERVER_MESSAGES: Record<Locale, ServerMessages> = {
  ko: {
    started: (url) => `Conceptpowers 뷰어: ${url}  (편집 가능 · 종료: Ctrl+C)`,
    startFailed: '뷰어 서버 시작 실패:',
  },
  en: {
    started: (url) => `Conceptpowers viewer: ${url}  (editable · stop: Ctrl+C)`,
    startFailed: 'Failed to start viewer server:',
  },
};
