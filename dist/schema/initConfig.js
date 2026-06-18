import { z } from 'zod';
export const InitConfigSchema = z.object({
    version: z.string(),
    enabled: z.literal(true),
    backfillMode: z.enum(['incremental', 'strict']).default('incremental'),
    enforceScope: z.literal('new-feature-behavior').default('new-feature-behavior'),
    project: z.object({ name: z.string().default(''), description: z.string().default('') }).default({})
});
export function parseInitConfig(input) {
    return InitConfigSchema.parse(input);
}
//# sourceMappingURL=initConfig.js.map