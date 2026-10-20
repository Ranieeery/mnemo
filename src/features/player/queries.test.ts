import { describe, expect, it } from "vitest";
import { createQueryClient } from "../../shared/ipc/queryClient";
import { queryKeys } from "../../shared/ipc/queryKeys";
import { libraryFolderFixture, videoFixture } from "../../shared/test/fixtures";
import { mockCommands } from "../../shared/test/ipc";
import { saveProgress } from "./queries";

describe("saveProgress", () => {
    it("refreshes the library folders, which can be sorted by recently watched", async () => {
        const video = videoFixture({ id: 1, durationSeconds: 600, watchProgressSeconds: 0 });
        mockCommands({ save_progress: { ...video, watchProgressSeconds: 30 } });
        const queryClient = createQueryClient();
        queryClient.setQueryData(queryKeys.libraryFolders(), [libraryFolderFixture()]);
        queryClient.setQueryData(queryKeys.home(10), null);
        queryClient.setQueryData(queryKeys.tags(), []);

        await saveProgress(queryClient, video, 30, false);

        expect(queryClient.getQueryState(queryKeys.libraryFolders())?.isInvalidated).toBe(true);
        expect(queryClient.getQueryState(queryKeys.home(10))?.isInvalidated).toBe(true);
        // Unrelated data stays fresh while the video plays.
        expect(queryClient.getQueryState(queryKeys.tags())?.isInvalidated).toBe(false);
    });
});
