import type { Channel } from "@tauri-apps/api/core";
import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessingEvent, ProcessingSummary } from "../ipc/bindings";
import { processFolder, resetProcessingSession, useProcessingStore } from "./processing";

type ProcessArgs = { path: string; onEvent: Channel<ProcessingEvent> };

function mockProcessing(summary: ProcessingSummary, during?: () => void) {
    const calls: string[] = [];
    mockIPC((command, payload) => {
        if (command !== "process_folder") {
            return undefined;
        }
        const { path, onEvent } = payload as ProcessArgs;
        calls.push(path);
        onEvent.onmessage({ event: "started", data: { folder: path, total: 2 } });
        onEvent.onmessage({ event: "progress", data: { done: 0, total: 2, currentFile: "Ep 1.mkv" } });
        during?.();
        onEvent.onmessage({ event: "finished", data: summary });
        return summary;
    });
    return calls;
}

describe("processFolder", () => {
    beforeEach(() => {
        resetProcessingSession();
    });

    it("exposes progress while working and clears it at the end", async () => {
        const seen = vi.fn();
        mockProcessing({ processed: 2, skipped: 0, failed: 0 }, () => seen(useProcessingStore.getState().job));

        await expect(processFolder("D:\\Videos")).resolves.toEqual({ processed: 2, skipped: 0, failed: 0 });
        expect(seen).toHaveBeenCalledWith({ folder: "D:\\Videos", done: 0, total: 2, currentFile: "Ep 1.mkv" });
        expect(useProcessingStore.getState().job).toBeNull();
    });

    it("does not walk a folder again in the same session unless forced", async () => {
        const calls = mockProcessing({ processed: 0, skipped: 2, failed: 0 });

        await processFolder("D:\\Videos");
        await expect(processFolder("D:\\Videos\\Show")).resolves.toBeNull();
        await processFolder("D:\\Videos 2");
        await processFolder("D:\\Videos", { force: true });

        expect(calls).toEqual(["D:\\Videos", "D:\\Videos 2", "D:\\Videos"]);
    });

    it("allows a retry after a failure", async () => {
        mockIPC(() => {
            throw { kind: "io", message: "folder is gone" };
        });
        await expect(processFolder("D:\\Videos")).resolves.toBeNull();

        const calls = mockProcessing({ processed: 1, skipped: 0, failed: 0 });
        await processFolder("D:\\Videos");
        expect(calls).toEqual(["D:\\Videos"]);
    });
});
