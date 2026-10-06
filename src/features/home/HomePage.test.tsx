import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HomeData } from "../../shared/ipc/bindings";
import { libraryFolderFixture, videoFixture } from "../../shared/test/fixtures";
import { commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { HomePage } from "./components/HomePage";

const emptyHome: HomeData = { continueWatching: [], recentlyWatched: [], suggestions: [], folderPreviews: [] };

function renderHome() {
    return renderScreen(<HomePage addFolderAction={<button type="button">Add folder</button>} />);
}

describe("HomePage", () => {
    it("shows each section and a preview per library folder", async () => {
        const folder = libraryFolderFixture({ customIcon: "film" });
        mockCommands({
            list_library_folders: [folder],
            get_home: {
                continueWatching: [videoFixture({ id: 1, title: "Halfway there", watchProgressSeconds: 300 })],
                recentlyWatched: [videoFixture({ id: 2, title: "Seen it", isWatched: true })],
                suggestions: [videoFixture({ id: 3, title: "Brand new" })],
                folderPreviews: [{ folder, videos: [videoFixture({ id: 4, title: "From the folder" })] }],
            } satisfies HomeData,
        });
        renderHome();

        expect(await screen.findByRole("heading", { name: "Continue watching" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Suggestions" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Recently watched" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Halfway there" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Seen it, watched" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Videos/ }).querySelector("svg")).toHaveClass("lucide-film");
        expect(screen.getByRole("button", { name: "From the folder" })).toBeInTheDocument();
    });

    it("invites to add a folder when the library is empty", async () => {
        mockCommands({ list_library_folders: [], get_home: emptyHome });
        renderHome();
        expect(await screen.findByRole("heading", { name: "Add a folder to start your library" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add folder" })).toBeInTheDocument();
    });

    it("explains that videos are still being read when folders exist", async () => {
        mockCommands({ list_library_folders: [libraryFolderFixture()], get_home: emptyHome });
        renderHome();
        expect(await screen.findByRole("heading", { name: "No videos yet" })).toBeInTheDocument();
    });

    it("offers a retry when loading fails", async () => {
        let attempts = 0;
        mockCommands({
            list_library_folders: [],
            get_home: () => {
                attempts += 1;
                if (attempts === 1) {
                    throw commandError("database", "database is locked");
                }
                return emptyHome;
            },
        });
        const { user } = renderHome();

        expect(await screen.findByRole("alert")).toHaveTextContent("database is locked");
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("heading", { name: "Add a folder to start your library" })).toBeInTheDocument();
    });
});
