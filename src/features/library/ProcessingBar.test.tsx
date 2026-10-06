import { act, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProcessingStatus } from "../../shared/ipc/bindings";
import { useProcessingStore } from "../../shared/stores/processing";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderWithUi } from "../../shared/test/render";
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

describe("ProcessingBar", () => {
    it("is hidden while nothing is being read", () => {
        renderWithUi(<ProcessingBar />);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("shows the folders, the files being read, the progress and the failures", () => {
        mockCommands({});
        renderWithUi(<ProcessingBar />);
        showStatus(running);

        const bar = screen.getByRole("status");
        expect(bar).toHaveTextContent("Reading new videos in Show and 1 more folder");
        expect(bar).toHaveTextContent("Ep 05.mkv, Ep 06.mkv");
        expect(bar).toHaveTextContent("4 of 10");
        expect(within(bar).getByRole("button", { name: "1 file couldn't be read" })).toBeInTheDocument();
    });

    it("cancels everything and says so until the files stop", async () => {
        const calls = mockCommands({ cancel_processing: null });
        const { user } = renderWithUi(<ProcessingBar />);
        showStatus(running);

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(callsOf(calls, "cancel_processing")).toEqual([{ folder: null }]);
        showStatus({ ...running, cancelling: true });
        expect(screen.getByRole("button", { name: "Cancelling…" })).toBeDisabled();
    });

    it("details each folder, cancels one of them and lists what could not be read", async () => {
        const calls = mockCommands({ cancel_processing: null, reveal_in_file_manager: null });
        const { user } = renderWithUi(<ProcessingBar />);
        showStatus(running);

        await user.click(screen.getByRole("button", { name: "Details" }));
        const dialog = await screen.findByRole("dialog", { name: "Reading new videos" });
        expect(within(dialog).getByText("Looking for videos…")).toBeInTheDocument();
        expect(within(dialog).getByText("ffprobe failed: invalid data")).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", { name: "Cancel reading Movies" }));
        expect(callsOf(calls, "cancel_processing")).toEqual([{ folder: "D:\\Movies" }]);
        await user.click(within(dialog).getByRole("button", { name: "Show Ep 03.mkv in file manager" }));
        expect(callsOf(calls, "reveal_in_file_manager")).toEqual([{ path: "D:\\Series\\Show\\Ep 03.mkv" }]);
    });
});
