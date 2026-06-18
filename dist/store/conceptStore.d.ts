import { type Concept } from '../schema/concept.js';
export declare function writeConcept(root: string, input: unknown): Promise<Concept>;
export declare function listConcepts(root: string): Promise<Concept[]>;
export declare function readConcept(root: string, slug: string): Promise<Concept | null>;
export declare function slugExists(root: string, slug: string): Promise<boolean>;
