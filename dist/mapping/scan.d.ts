export type Mapping = Record<string, string[]>;
export declare function scanTags(root: string, files: string[]): Promise<Record<string, string[]>>;
export declare function buildMapping(root: string, files: string[]): Promise<Mapping>;
export declare function writeMappingCache(root: string, mapping: Mapping): Promise<void>;
