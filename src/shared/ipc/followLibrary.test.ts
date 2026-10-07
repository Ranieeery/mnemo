import { emit } from "@tauri-apps/api/event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockCommands } from "../test/ipc";
import { followLibrary } from "./followLibrary";
import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

/** Listening is asynchronous; events sent before it is set up would be missed. */
const listening = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("followLibrary", () => {
    let stop: () => void = () => {};

    afterEach(() => {
        stop();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("refreshes the library when files change, at most once a second", async () => {
        mockCommands({});
        const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
        stop = followLibrary();
        await listening();
        vi.useFakeTimers();

        await emit("library-changed", null);
        await emit("library-changed", null);
        await emit("library-changed", null);
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.library });

        // The changes that arrived meanwhile are picked up once the interval ends.
        await vi.advanceTimersByTimeAsync(1000);
        expect(invalidate).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(1000);
        expect(invalidate).toHaveBeenCalledTimes(2);
    });

    it("refreshes the folder statuses when a folder is connected or unplugged", async () => {
        mockCommands({});
        const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
        stop = followLibrary();
        await listening();

        await emit("library-folders-changed", null);
        expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.libraryFolderStatuses() });
    });
});
