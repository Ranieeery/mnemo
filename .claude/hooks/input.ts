// What Claude Code sends a hook on stdin (only the fields these hooks read).
export type HookInput = {
    tool_name?: string;
    tool_input?: {
        file_path?: unknown;
        command?: unknown;
        content?: unknown;
        old_string?: unknown;
        new_string?: unknown;
        replace_all?: unknown;
    };
};

export async function readHookInput(): Promise<HookInput> {
    let text = "";
    for await (const chunk of process.stdin) {
        text += chunk;
    }
    return JSON.parse(text);
}

/** The repository root: hooks run from whatever directory the session is in. */
export function projectDir(): string {
    return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}
