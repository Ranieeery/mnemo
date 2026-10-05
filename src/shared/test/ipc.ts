import { mockIPC } from "@tauri-apps/api/mocks";
import type { ErrorKind } from "../ipc/bindings";

type Args = Record<string, unknown>;
type Handler = (args: Args) => unknown;

export type CommandCall = { command: string; args: Args };

function isArgs(value: unknown): value is Args {
    return typeof value === "object" && value !== null;
}

/**
 * Stands in for the backend: each command answers with a value or a handler. Unmocked commands fail loudly so
 * tests never pass by accident. Returns the list of calls, in order.
 */
export function mockCommands(handlers: Record<string, Handler | unknown>): CommandCall[] {
    const calls: CommandCall[] = [];
    mockIPC((command, payload) => {
        const args = isArgs(payload) ? payload : {};
        calls.push({ command, args });
        if (!(command in handlers)) {
            throw commandError("internal", `no mock for ${command}`);
        }
        const handler = handlers[command];
        return typeof handler === "function" ? handler(args) : handler;
    });
    return calls;
}

/** The error payload a failing command sends; throw it from a handler. */
export function commandError(kind: ErrorKind, message: string) {
    return { kind, message };
}

export function callsOf(calls: readonly CommandCall[], command: string): Args[] {
    return calls.filter((call) => call.command === command).map((call) => call.args);
}
