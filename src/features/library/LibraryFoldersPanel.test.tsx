import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { mockCommands } from "../../shared/test/ipc";
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

        expect(await screen.findByText("Watching for changes")).toBeInTheDocument();
        expect(screen.getByText("Checked every 10 minutes")).toBeInTheDocument();
        expect(screen.getByText(": Watching is not supported here")).toBeInTheDocument();
        expect(screen.getByText(/Not connected\. Its videos and progress are kept/)).toBeInTheDocument();
    });
});
