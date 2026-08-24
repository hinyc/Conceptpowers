// @concept:generated-not-hand-edited
// src/viewer/manifest.ts
// 뷰어가 부팅 시 읽는 매니페스트를 만든다. 개념/기능의 "원본 JSON 위치(URL)"와
// 목록 렌더에 필요한 최소 메타, 그리고 지식 그래프 데이터를 담는다.
// 본문(설명/허용·제한 등)은 뷰어가 개별 data/*.json을 fetch해서 가져온다.
import type { Concept, ConceptStatus, ConceptCategory } from '../schema/concept.js';
import type { Feature } from '../schema/feature.js';
import type { Locale } from '../schema/initConfig.js';
import { buildGraphData, type GraphData } from './graph.js';

export interface ConceptEntry {
  slug: string;
  group: string;
  title: string;
  status: ConceptStatus;
  category: ConceptCategory[];
  url: string;
  codeLinks: string[];
}

// 기능은 목록의 색인 줄로만 나타난다(feature-index-row) — 줄에 필요한 것만 담고,
// 코드 경로는 담지 않는다(경로는 개념 화면이 보여준다).
export interface FeatureEntry {
  slug: string;
  group: string;
  title: string;
  description: string;
  concepts: string[];
}

export interface Manifest {
  version: 1;
  locale: Locale;
  concepts: ConceptEntry[];
  features: FeatureEntry[];
  graph: GraphData;
}

// 뷰어 루트(concepts/viewer/) 기준 상대 URL. 데이터: base/concepts/data.
const conceptUrl = (c: Pick<Concept, 'group' | 'slug'>) =>
  `../data/${c.group ? `${c.group}/` : ''}${c.slug}.json`;

// 개념의 표시용 코드 링크 = concept.codeLinks ∪ mapping.json(@concept 태그) 경로.
const own = (o: Record<string, string[]>, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k) ? o[k] : [];
const mergeLinks = (c: Concept, codeLinksBySlug: Record<string, string[]>) => [
  ...new Set([...(c.codeLinks ?? []), ...own(codeLinksBySlug, c.slug)]),
];

export function buildManifest(
  concepts: Concept[],
  features: Feature[],
  locale: Locale = 'ko',
  codeLinksBySlug: Record<string, string[]> = {}
): Manifest {
  const defined = new Set(concepts.map((c) => c.slug));
  return {
    version: 1,
    locale,
    concepts: concepts.map((c) => ({
      slug: c.slug,
      group: c.group ?? '',
      title: c.title,
      status: c.status,
      category: c.category,
      url: conceptUrl(c),
      codeLinks: mergeLinks(c, codeLinksBySlug),
    })),
    features: features.map((f) => ({
      slug: f.slug,
      group: f.group ?? '',
      title: f.title,
      description: f.description,
      // 갈 곳이 없는 참조는 딱지로 그릴 수 없으므로 정의된 개념만 남긴다.
      concepts: f.concepts.filter((slug) => defined.has(slug)),
    })),
    graph: buildGraphData(concepts, codeLinksBySlug, features),
  };
}
