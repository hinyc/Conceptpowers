export interface SessionStartOutput {
    hookSpecificOutput: {
        hookEventName: "SessionStart";
        additionalContext: string;
    };
}
export declare function buildSessionStartOutput(root: string, pluginRoot: string): Promise<SessionStartOutput | null>;
