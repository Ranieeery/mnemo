import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HiddenFolder } from "../../shared/ipc/bindings";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { HiddenFoldersPanel } from "./components/HiddenFoldersPanel";

const series = libraryFolderFixture({ path: "D:\\Series", name: "Series" });
const extras: HiddenFolder = {
    path: "D:\\Series\\Show\\Extras",
    name: "Extras",
    libraryFolder: series,
    available: true,
};
const gone: HiddenFolder = { path: "D:\\Series\\Old", name: "Old", libraryFolder: series, available: false };

describe("HiddenFoldersPanel", () => {
    it("lists the hidden folders where they are, and shows one again", async () => {
        const calls = mockCommands({ list_hidden_folders: [extras, gone], set_folder_hidden: null });
        const { user, router } = renderScreen(<HiddenFoldersPanel />);

        const extrasRow = (await screen.findByText("Extras")).closest("li") as HTMLElement;
        expect(within(extrasRow).getByText("Series / Show / Extras")).toBeInTheDocument();
        const goneRow = screen.getByText("Old").closest("li") as HTMLElement;
        expect(within(goneRow).getByText("Not found")).toBeInTheDocument();
        expect(within(goneRow).queryByRole("link", { name: "Open Old" })).not.toBeInTheDocument();

        await user.click(within(extrasRow).getByRole("button", { name: "Show Extras on home and history" }));
        expect(await screen.findByText("Extras shows on home and history again")).toBeInTheDocument();
        expect(callsOf(calls, "set_folder_hidden")).toEqual([{ path: extras.path, hidden: false }]);

        await user.click(within(extrasRow).getByRole("link", { name: "Open Extras" }));
        expect(router.state.location.search).toEqual({ path: extras.path });
    });

    it("explains how to hide a folder when none is hidden", async () => {
        mockCommands({ list_hidden_folders: [] });
        renderScreen(<HiddenFoldersPanel />);
        expect(await screen.findByText(/No hidden folders/)).toBeInTheDocument();
    });

    it("offers to try again when the list cannot be read", async () => {
        mockCommands({
            list_hidden_folders: () => {
                throw commandError("database", "disk I/O error");
            },
        });
        renderScreen(<HiddenFoldersPanel />);
        expect(await screen.findByText("Could not load the hidden folders")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
    });
});
