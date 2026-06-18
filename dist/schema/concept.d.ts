import { z } from 'zod';
export declare const ConceptCategory: z.ZodEnum<["feature", "behavior", "role", "permission", "term"]>;
export type ConceptCategory = z.infer<typeof ConceptCategory>;
export declare const ConceptSchema: z.ZodObject<{
    slug: z.ZodString;
    group: z.ZodDefault<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    category: z.ZodArray<z.ZodEnum<["feature", "behavior", "role", "permission", "term"]>, "many">;
    number: z.ZodOptional<z.ZodNumber>;
    title: z.ZodString;
    eyebrow: z.ZodDefault<z.ZodString>;
    description: z.ZodObject<{
        definition: z.ZodString;
        analogy: z.ZodDefault<z.ZodString>;
        components: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        example: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        definition: string;
        analogy: string;
        components: string[];
        example: string;
    }, {
        definition: string;
        analogy?: string | undefined;
        components?: string[] | undefined;
        example?: string | undefined;
    }>;
    purpose: z.ZodObject<{
        reason: z.ZodString;
        benefits: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        vision: z.ZodDefault<z.ZodString>;
        painPoints: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        benefits: string[];
        vision: string;
        painPoints: string[];
    }, {
        reason: string;
        benefits?: string[] | undefined;
        vision?: string | undefined;
        painPoints?: string[] | undefined;
    }>;
    actions: z.ZodObject<{
        allow: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        restrict: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        interaction: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        allow: string[];
        restrict: string[];
        interaction: string;
    }, {
        allow?: string[] | undefined;
        restrict?: string[] | undefined;
        interaction?: string | undefined;
    }>;
    principle: z.ZodObject<{
        immutableRules: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        tradeoffs: z.ZodDefault<z.ZodString>;
        lifecycle: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        immutableRules: string[];
        tradeoffs: string;
        lifecycle: string[];
    }, {
        immutableRules?: string[] | undefined;
        tradeoffs?: string | undefined;
        lifecycle?: string[] | undefined;
    }>;
    relations: z.ZodDefault<z.ZodObject<{
        prev: z.ZodDefault<z.ZodString>;
        next: z.ZodDefault<z.ZodString>;
        related: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        prev: string;
        next: string;
        related: string[];
    }, {
        prev?: string | undefined;
        next?: string | undefined;
        related?: string[] | undefined;
    }>>;
    codeLinks: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    description: {
        definition: string;
        analogy: string;
        components: string[];
        example: string;
    };
    slug: string;
    group: string;
    category: ("feature" | "behavior" | "role" | "permission" | "term")[];
    title: string;
    eyebrow: string;
    purpose: {
        reason: string;
        benefits: string[];
        vision: string;
        painPoints: string[];
    };
    actions: {
        allow: string[];
        restrict: string[];
        interaction: string;
    };
    principle: {
        immutableRules: string[];
        tradeoffs: string;
        lifecycle: string[];
    };
    relations: {
        prev: string;
        next: string;
        related: string[];
    };
    codeLinks: string[];
    number?: number | undefined;
}, {
    description: {
        definition: string;
        analogy?: string | undefined;
        components?: string[] | undefined;
        example?: string | undefined;
    };
    slug: string;
    category: ("feature" | "behavior" | "role" | "permission" | "term")[];
    title: string;
    purpose: {
        reason: string;
        benefits?: string[] | undefined;
        vision?: string | undefined;
        painPoints?: string[] | undefined;
    };
    actions: {
        allow?: string[] | undefined;
        restrict?: string[] | undefined;
        interaction?: string | undefined;
    };
    principle: {
        immutableRules?: string[] | undefined;
        tradeoffs?: string | undefined;
        lifecycle?: string[] | undefined;
    };
    number?: number | undefined;
    group?: string | undefined;
    eyebrow?: string | undefined;
    relations?: {
        prev?: string | undefined;
        next?: string | undefined;
        related?: string[] | undefined;
    } | undefined;
    codeLinks?: string[] | undefined;
}>;
export type Concept = z.infer<typeof ConceptSchema>;
export declare function parseConcept(input: unknown): Concept;
