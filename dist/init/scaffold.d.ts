export interface ScaffoldOptions {
    backfillMode?: 'incremental' | 'strict';
    name?: string;
    description?: string;
}
export declare function isInitialized(root: string): Promise<boolean>;
export declare function scaffoldInit(root: string, opts: ScaffoldOptions): Promise<void>;
