import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProcessingStatus } from "../../shared/ipc/bindings";
import { useProcessingStore } from "../../shared/stores/processing";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { ProcessingBar } from "./components/ProcessingBar";

const running: ProcessingStatus = {
    jobs: [
        { folder: "D:\\Series\\Show", scanning: false, total: 10, done: 4, failed: 1 },
        { folder: "D:\\Movies", scanning: true, total: 0, done: 0, failed: 0 },
    ],
    inFlight: ["D:\\Series\\Show\\Ep 05.mkv", "D:\\Series\\Show\\Ep 06.mkv"],
    cancelling: false,
    errors: [{ path: "D:\\Series\\Show\\Ep 03.mkv", message: "ffprobe failed: invalid data" }],
};

function showStatus(status: ProcessingStatus) {
    act(() => useProcessingStore.setState({ status }));
}

/** `D:\Movies` is a library folder renamed in the app. */
const libraryFolders = [libraryFolderFixture({ path: "D:\\Movies", folderName: "Movies", customName: "Films" })];

/** The visible bar; its live region (role status) only says when reading starts. */
const bar = () => screen.queryByRole("region", { name: "Reading new videos" });

async function renderBar() {
    const rendered = renderScreen(<ProcessingBar />);
    showStatus(running);
    await screen.findByRole("region", { name: "Reading new videos" });
    return rendered;
}

describe("ProcessingBar", () => {
    it("is hidden while nothing is being read", () => {
        mockCommands({ list_library_folders: libraryFolders });
        renderScreen(<ProcessingBar />);
        expect(bar()).not.toBeInTheDocument();
        expect(screen.queryByText("Reading new videos")).not.toBeInTheDocument();
    });

    it("shows the folders, the files being read, the progress and the failures", async () => {
        mockCommands({ list_library_folders: libraryFolders });
        await renderBar();

        const region = screen.getByRole("region", { name: "Reading new videos" });
        expect(region).toHaveTextContent("Reading new videos in Show and 1 more folder");
        expect(region).toHaveTextContent("Ep 05.mkv, Ep 06.mkv");
        expect(region).toHaveTextContent("4 of 10");
        expect(within(region).getByRole("button", { name: "1 file couldn't be read" })).toBeInTheDocument();
        // Screen readers hear that reading started, not every file and tick.
        expect(screen.getByRole("status")).toHaveTextContent(/^Reading new videos$/);
    });

    it("cancels everything and says so until the files stop", async () => {
        const calls = mockCommands({ cancel_processing: null, list_library_folders: libraryFolders });
        const { user } = await renderBar();

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(callsOf(calls, "cancel_processing")).toEqual([{ folder: null }]);
        showStatus({ ...running, cancelling: true });
        expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();
    });

    it("details each folder, cancels one of them and lists what could not be read", async () => {
        const calls = mockCommands({
            cancel_processing: null,
            reveal_in_file_manager: null,
            list_library_folders: libraryFolders,
        });
        const { user } = await renderBar();

        await user.click(screen.getByRole("button", { name: "Details" }));
        const dialog = await screen.findByRole("dialog", { name: "Reading new videos" });
        expect(within(dialog).getByText("Looking for videos…")).toBeInTheDocument();
        expect(within(dialog).getByText("ffprobe failed: invalid data")).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", { name: "Cancel reading Films" }));
        expect(callsOf(calls, "cancel_processing")).toEqual([{ folder: "D:\\Movies" }]);
        await user.click(within(dialog).getByRole("button", { name: "Show Ep 03.mkv in file manager" }));
        expect(callsOf(calls, "reveal_in_file_manager")).toEqual([{ path: "D:\\Series\\Show\\Ep 03.mkv" }]);
    });

    it("keeps the details open with what could not be read after the last job ends", async () => {
        mockCommands({ list_library_folders: libraryFolders });
        const { user } = await renderBar();
        await user.click(screen.getByRole("button", { name: "1 file couldn't be read" }));
        const dialog = await screen.findByRole("dialog", { name: "Reading new videos" });

        showStatus({ ...running, jobs: [], inFlight: [] });
        expect(bar()).not.toBeInTheDocument();
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).getByText("Nothing left to read.")).toBeInTheDocument();
        expect(within(dialog).getByText("ffprobe failed: invalid data")).toBeInTheDocument();

        await user.click(within(dialog).getByText("Close", { selector: "button" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
