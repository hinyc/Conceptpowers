import type { Concept } from '../schema/concept.js';
export declare function renderViewer(concepts: Concept[]): Record<string, string>;
export declare function renderViewerToDisk(root: string): Promise<void>;
