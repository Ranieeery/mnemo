import type { ErrorKind, IpcError } from "./bindings";

/** A failed backend command, carrying the stable `kind` the UI branches on. */
export class CommandError extends Error {
    readonly kind: ErrorKind;

    constructor(payload: IpcError) {
        super(payload.message);
        this.name = "CommandError";
        this.kind = payload.kind;
    }
}

type CommandResult<T> = { status: "ok"; data: T } | { status: "error"; error: IpcError };

/**
 * Turns a generated command call into a plain promise that rejects with {@link CommandError}, which is what
 * TanStack Query and `try/await` expect: `const folders = await call(commands.listLibraryFolders())`.
 */
export async function call<T>(result: Promise<CommandResult<T>>): Promise<T> {
    const settled = await result;
    if (settled.status === "error") {
        throw new CommandError(settled.error);
    }
    return settled.data;
}

/** Message to show for any error thrown by a command or by the frontend itself. */
export function errorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === "string" ? error : "Unexpected error";
}

export function isErrorKind(error: unknown, kind: ErrorKind): boolean {
    return error instanceof CommandError && error.kind === kind;
}
