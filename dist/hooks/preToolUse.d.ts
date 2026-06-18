export interface PreToolEvent {
    tool: string;
    input: {
        file_path?: string;
        command?: string;
    };
    changedFiles?: string[];
}
export interface PreToolOutput {
    hookSpecificOutput: {
        hookEventName: "PreToolUse";
        permissionDecision?: "allow" | "deny" | "ask";
        permissionDecisionReason?: string;
        additionalContext?: string;
    };
}
export declare function decidePreToolUse(root: string, ev: PreToolEvent): Promise<PreToolOutput | null>;
