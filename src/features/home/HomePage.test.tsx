import { screen, within } from "@testing-library/react";
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
        const folder = libraryFolderFixture({ customIcon: "film", iconColor: "amber" });
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
        // Regression: folder previews are headings too, so heading navigation reaches them.
        const folderHeading = screen.getByRole("heading", { level: 2, name: /Videos/ });
        const folderIcon = within(folderHeading)
            .getByRole("link", { name: /Videos/ })
            .querySelector("svg");
        expect(folderIcon).toHaveClass("lucide-film");
        expect(folderIcon).toHaveStyle({ color: "var(--color-folder-amber)" });
        expect(screen.getByRole("button", { name: "From the folder" })).toBeInTheDocument();
    });

    it("highlights the first video in progress and lists the next ones beside it", async () => {
        mockCommands({
            list_library_folders: [libraryFolderFixture({ path: "D:\\Videos" })],
            get_home: {
                ...emptyHome,
                continueWatching: [
                    videoFixture({ id: 1, title: "Halfway there", durationSeconds: 1500, watchProgressSeconds: 1000 }),
                    videoFixture({ id: 2, title: "Just started", durationSeconds: 600, watchProgressSeconds: 30 }),
                ],
            } satisfies HomeData,
        });
        renderHome();

        const resume = await screen.findByRole("button", { name: "Halfway there" });
        expect(resume).toHaveTextContent("Resume");
        expect(resume).toHaveAccessibleDescription(/Show, 9 min left/);
        expect(screen.getByRole("heading", { name: "Also in progress" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Just started" })).toHaveTextContent("10 min left");
    });

    it("shows the folder of each suggested and watched video", async () => {
        mockCommands({
            list_library_folders: [libraryFolderFixture({ path: "D:\\Videos\\Show", name: "My show" })],
            get_home: {
                ...emptyHome,
                suggestions: [videoFixture({ id: 1, title: "Brand new" })],
                recentlyWatched: [videoFixture({ id: 2, title: "Seen it", isWatched: true })],
            } satisfies HomeData,
        });
        renderHome();

        expect(await screen.findByRole("button", { name: "Brand new" })).toHaveTextContent("My show");
        expect(screen.getByRole("button", { name: "Seen it, watched" })).toHaveTextContent("My show");
    });

    it("previews the folders in the order of the sidebar, pinned ones first", async () => {
        const anime = libraryFolderFixture({ id: 1, path: "D:\\Anime", name: "Anime" });
        const series = libraryFolderFixture({ id: 2, path: "D:\\Series", name: "Series", pinned: true });
        mockCommands({
            list_library_folders: [series, anime],
            get_home: {
                ...emptyHome,
                folderPreviews: [
                    { folder: series, videos: [videoFixture({ id: 1, title: "Pilot" })] },
                    { folder: anime, videos: [videoFixture({ id: 2, title: "Opening" })] },
                ],
            } satisfies HomeData,
        });
        renderHome();

        await screen.findByRole("heading", { level: 2, name: /Series/ });
        const previews = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
        expect(previews.filter((name) => name === "Series" || name === "Anime")).toEqual(["Series", "Anime"]);
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
