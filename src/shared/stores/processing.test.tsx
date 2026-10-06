import { emit } from "@tauri-apps/api/event";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProcessingOutcome, ProcessingStatus } from "../ipc/bindings";
import { callsOf, commandError, mockCommands } from "../test/ipc";
import { renderWithUi } from "../test/render";
import { followProcessing, processFolder, syncFolders, useProcessingStore } from "./processing";

const idle: ProcessingStatus = { jobs: [], inFlight: [], cancelling: false, errors: [] };

function outcome(folder: string, overrides: Partial<ProcessingOutcome> = {}): ProcessingOutcome {
    return {
        folder,
        summary: { processed: 0, skipped: 0, failed: 0 },
        cancelled: false,
        missingTool: false,
        error: null,
        report: false,
        ...overrides,
    };
}

async function finish(result: ProcessingOutcome) {
    await act(() => emit("processing-finished", result));
}

describe("processing store", () => {
    let stopFollowing: () => void = () => {};

    async function follow(extra: Record<string, unknown> = {}) {
        const calls = mockCommands({ get_processing_status: idle, process_folders: null, ...extra });
        stopFollowing = followProcessing();
        // Toasts need a place to show up.
        renderWithUi(<p>screen</p>);
        // Listening is asynchronous; events sent before it is set up would be missed.
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
        return calls;
    }

    afterEach(() => {
        stopFollowing();
    });

    it("follows the status the backend sends", async () => {
        await follow();
        const running: ProcessingStatus = {
            jobs: [{ folder: "D:\\Videos", scanning: false, total: 4, done: 1, failed: 0 }],
            inFlight: ["D:\\Videos\\Ep 2.mkv"],
            cancelling: false,
            errors: [],
        };
        await act(() => emit("processing-status-changed", running));
        expect(useProcessingStore.getState().status).toEqual(running);
    });

    it("does not read a folder again in the same session unless forced", async () => {
        const calls = await follow();
        await processFolder("D:\\Videos");
        await processFolder("D:\\Videos\\Show");
        await processFolder("D:\\Videos 2");
        await processFolder("D:\\Videos", { force: true, report: true });
        expect(callsOf(calls, "process_folders")).toEqual([
            { paths: ["D:\\Videos"], report: false },
            { paths: ["D:\\Videos 2"], report: false },
            { paths: ["D:\\Videos"], report: true },
        ]);
    });

    it("reads a folder again after its job was cancelled", async () => {
        const calls = await follow();
        await processFolder("D:\\Videos");
        await finish(outcome("D:\\Videos", { cancelled: true, summary: { processed: 3, skipped: 0, failed: 0 } }));
        expect(await screen.findByText("Stopped reading videos in Videos")).toBeInTheDocument();
        expect(screen.getByText("3 new videos added; the rest is left for later.")).toBeInTheDocument();

        await processFolder("D:\\Videos");
        expect(callsOf(calls, "process_folders")).toHaveLength(2);
    });

    it("reports a finished job when asked to", async () => {
        await follow();
        await finish(outcome("D:\\Videos", { report: true, summary: { processed: 1, skipped: 4, failed: 2 } }));
        expect(await screen.findByText("Added 1 new video to Videos")).toBeInTheDocument();
        expect(screen.getByText("2 files could not be read.")).toBeInTheDocument();
    });

    it("explains a folder that could not be read", async () => {
        await follow();
        await finish(outcome("D:\\Gone", { error: "D:\\Gone: not found" }));
        expect(await screen.findByText("Could not read Gone")).toBeInTheDocument();
    });

    it("allows a retry after the request failed", async () => {
        let attempts = 0;
        const calls = await follow({
            process_folders: () => {
                attempts += 1;
                if (attempts === 1) {
                    throw commandError("invalidInput", "not in the library");
                }
                return null;
            },
        });
        await processFolder("D:\\Videos");
        expect(await screen.findByText("Could not read Videos")).toBeInTheDocument();
        await processFolder("D:\\Videos");
        expect(callsOf(calls, "process_folders")).toHaveLength(2);
    });

    it("syncs several folders and adds up their results once all ended", async () => {
        await follow();
        let summary: Awaited<ReturnType<typeof syncFolders>> | undefined;
        const sync = syncFolders(["D:\\Movies", "D:\\Series\\Show"]).then((result) => {
            summary = result;
        });
        await finish(outcome("D:\\Movies", { summary: { processed: 2, skipped: 1, failed: 0 } }));
        expect(summary).toBeUndefined();
        // The show was covered by a job already reading the whole series.
        await finish(outcome("D:\\Series", { summary: { processed: 1, skipped: 0, failed: 1 } }));
        await sync;
        await waitFor(() => expect(summary).toEqual({ processed: 3, skipped: 1, failed: 1 }));
    });
});
