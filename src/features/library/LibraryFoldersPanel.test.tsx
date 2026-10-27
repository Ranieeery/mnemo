import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { libraryFolderFixture, libraryGroupFixture, libraryLayoutFixture } from "../../shared/test/fixtures";
import { commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { LibraryFoldersPanel } from "./components/LibraryFoldersPanel";

const series = libraryFolderFixture({ id: 1, path: "D:Series", name: "Series" });
const share = libraryFolderFixture({ id: 2, path: "\\nasMovies", name: "Movies" });
const external = libraryFolderFixture({ id: 3, path: "E:Anime", name: "Anime" });

describe("LibraryFoldersPanel", () => {
    it("says how each folder is kept in step with the disk", async () => {
        mockCommands({
            list_library_folders: [series, share, external],
            get_library_folder_statuses: [
                { path: series.path, watch: "watching", reason: null },
                { path: share.path, watch: "polling", reason: "Watching is not supported here" },
                { path: external.path, watch: "unavailable", reason: null },
            ],
        });
        renderScreen(<LibraryFoldersPanel />);

        // The expected state is only for screen readers; the deviations are shown.
        expect(await screen.findByText("Watching for changes")).toHaveClass("sr-only");
        expect(screen.getByText("Checked every 10 minutes")).not.toHaveClass("sr-only");
        expect(screen.getByText(": Watching is not supported here")).toBeInTheDocument();
        expect(screen.getByText(/Not connected\. Its videos and progress are kept/)).toBeInTheDocument();
        expect(screen.queryByText(/Watching is off/)).not.toBeInTheDocument();
    });

    it("says once that watching is off instead of on every folder", async () => {
        mockCommands({
            list_library_folders: [series, share],
            get_library_folder_statuses: [
                { path: series.path, watch: "off", reason: null },
                { path: share.path, watch: "off", reason: null },
            ],
        });
        renderScreen(<LibraryFoldersPanel />);

        expect(await screen.findByText(/^Watching is off/)).toBeInTheDocument();
        for (const row of screen.getAllByText("Checked when Mnemo starts and when you sync")) {
            expect(row).toHaveClass("sr-only");
        }
    });

    it("names the group of a folder for screen readers too", async () => {
        const grouped = { ...series, groupId: 7 };
        mockCommands({
            list_library_folders: [grouped],
            get_library_folder_statuses: [],
            get_library_layout: libraryLayoutFixture([grouped], [libraryGroupFixture({ id: 7, name: "Shows" })]),
        });
        renderScreen(<LibraryFoldersPanel />);

        expect((await screen.findByText("Shows")).parentElement).toHaveTextContent("Group: Shows");
    });

    it("lists the folders in the order of the sidebar, pinned ones first", async () => {
        mockCommands({
            list_library_folders: [{ ...external, pinned: true }, series, share],
            get_library_folder_statuses: [],
        });
        renderScreen(<LibraryFoldersPanel />);

        await screen.findByText("Anime");
        const names = screen.getAllByText(/^(Anime|Series|Movies)$/).map((element) => element.textContent);
        expect(names).toEqual(["Anime", "Series", "Movies"]);
    });

    it("says when there are no folders yet", async () => {
        mockCommands({ list_library_folders: [], get_library_folder_statuses: [] });
        renderScreen(<LibraryFoldersPanel />);
        expect(await screen.findByText(/No folders yet/)).toBeInTheDocument();
    });

    // Regression: a failed read showed nothing, as if the library were empty.
    it("offers to try again when the folders cannot be read", async () => {
        let fail = true;
        mockCommands({
            list_library_folders: () => {
                if (fail) {
                    throw commandError("database", "disk I/O error");
                }
                return [series];
            },
            get_library_folder_statuses: [],
        });
        const { user } = renderScreen(<LibraryFoldersPanel />);
        expect(await screen.findByText("Could not load the library folders")).toBeInTheDocument();
        expect(screen.getByText("disk I/O error")).toBeInTheDocument();
        expect(screen.queryByText(/No folders yet/)).not.toBeInTheDocument();

        fail = false;
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Series")).toBeInTheDocument();
    });
});
