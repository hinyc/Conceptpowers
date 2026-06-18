export interface UnknownTag {
    slug: string;
    file: string;
}
export interface AuditReport {
    ok: boolean;
    unknownTags: UnknownTag[];
}
export declare function auditIntegrity(root: string, files: string[]): Promise<AuditReport>;
