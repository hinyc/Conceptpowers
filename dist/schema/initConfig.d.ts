import { z } from 'zod';
export declare const InitConfigSchema: z.ZodObject<{
    version: z.ZodString;
    enabled: z.ZodLiteral<true>;
    backfillMode: z.ZodDefault<z.ZodEnum<["incremental", "strict"]>>;
    enforceScope: z.ZodDefault<z.ZodLiteral<"new-feature-behavior">>;
    project: z.ZodDefault<z.ZodObject<{
        name: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
    }, {
        name?: string | undefined;
        description?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    version: string;
    enabled: true;
    backfillMode: "incremental" | "strict";
    enforceScope: "new-feature-behavior";
    project: {
        name: string;
        description: string;
    };
}, {
    version: string;
    enabled: true;
    backfillMode?: "incremental" | "strict" | undefined;
    enforceScope?: "new-feature-behavior" | undefined;
    project?: {
        name?: string | undefined;
        description?: string | undefined;
    } | undefined;
}>;
export type InitConfig = z.infer<typeof InitConfigSchema>;
export declare function parseInitConfig(input: unknown): InitConfig;
