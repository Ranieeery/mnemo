import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { FolderContents } from "../../shared/ipc/bindings";
import { entryFixture, folderContentsFixture, libraryFolderFixture, videoFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { FolderPage } from "./components/FolderPage";
import { DEFAULT_ORDER } from "./lib/videoOrder";

const SHOW = "D:\\Videos\\Show";

function contents(overrides: Partial<FolderContents> = {}): FolderContents {
    return folderContentsFixture({
        path: SHOW,
        subfolders: [
            { name: "Season 1", path: `${SHOW}\\Season 1`, stats: { totalVideos: 10, watchedVideos: 10 } },
            { name: "Season 2", path: `${SHOW}\\Season 2`, stats: { totalVideos: 8, watchedVideos: 2 } },
        ],
        groups: [
            {
                folderPath: SHOW,
                relativePath: "",
                entries: [
                    entryFixture(videoFixture({ id: 1, title: "Trailer", filePath: `${SHOW}\\Trailer.mkv` })),
                    { path: `${SHOW}\\Extra.mp4`, name: "Extra.mp4", video: null },
                ],
            },
        ],
        otherFiles: [{ name: "cover.jpg", path: `${SHOW}\\cover.jpg` }],
        ...overrides,
    });
}

function mockFolder(folderContents: FolderContents, extra: Record<string, unknown> = {}) {
    return mockCommands({
        list_library_folders: [libraryFolderFixture()],
        browse_folder: folderContents,
        get_folder_summary: { totalVideos: 19, watchedVideos: 12, taggedVideos: 3 },
        media_tools_status: { ffmpeg: true, ffprobe: true },
        process_folder: { processed: 0, skipped: 19, failed: 0 },
        ...extra,
    });
}

/** The folder screen with its order kept in state, as the route keeps it in the URL. */
function OrderedFolderPage() {
    const [order, setOrder] = useState(DEFAULT_ORDER);
    return <FolderPage path={SHOW} order={order} onOrderChange={setOrder} />;
}

function orderedContents() {
    return contents({
        groups: [
            {
                folderPath: SHOW,
                relativePath: "",
                entries: [
                    entryFixture(videoFixture({ id: 1, title: "Short one", durationSeconds: 300, isWatched: true })),
                    entryFixture(videoFixture({ id: 2, title: "Long one", durationSeconds: 3600 })),
                    { path: `${SHOW}\\Extra.mp4`, name: "Extra.mp4", video: null },
                ],
            },
        ],
    });
}

const videoNames = () =>
    screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"))
        .filter((label) => label === "Extra" || label?.includes(" one"));

describe("FolderPage", () => {
    it("shows the path, progress, subfolders, videos and other files", async () => {
        mockFolder(contents());
        renderScreen(<FolderPage path={SHOW} />);

        expect(await screen.findByRole("heading", { name: "Show", level: 1 })).toBeInTheDocument();
        const path = screen.getByRole("navigation", { name: "Folder path" });
        expect(await within(path).findByRole("link", { name: "Videos" })).toBeInTheDocument();
        expect(await screen.findByText("19 videos, 12 watched")).toBeInTheDocument();

        expect(screen.getByRole("link", { name: /Season 1/ })).toHaveTextContent("10 of 10 watched");
        expect(screen.getByLabelText("Fully watched")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Trailer" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Extra" })).toHaveTextContent("Not processed");
        expect(screen.getByRole("button", { name: "cover.jpg" })).toBeInTheDocument();
    });

    it("points to the other files from the header and jumps to them", async () => {
        mockFolder(contents());
        const { user } = renderScreen(<FolderPage path={SHOW} />);

        await user.click(await screen.findByRole("button", { name: "1 other file" }));
        expect(screen.getByRole("heading", { name: "Other files" })).toHaveFocus();
    });

    it("does not point to other files when there are none", async () => {
        mockFolder(contents({ otherFiles: [] }));
        renderScreen(<FolderPage path={SHOW} />);
        await screen.findByRole("button", { name: "Trailer" });
        expect(screen.queryByRole("button", { name: /other file/ })).not.toBeInTheDocument();
    });

    it("sorts the videos by duration, keeping unread videos last", async () => {
        mockFolder(orderedContents());
        const { user } = renderScreen(<OrderedFolderPage />);
        await screen.findByRole("button", { name: "Long one" });
        expect(videoNames()).toEqual(["Short one, watched", "Long one", "Extra"]);

        // A new field sorts ascending; choosing it again (the menu stays open) reverses it.
        await user.click(screen.getByRole("button", { name: "Sort by name, A to Z" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Duration" }));
        expect(screen.getByRole("menuitemradio", { name: "Duration, shortest first" })).toBeChecked();

        await user.click(screen.getByRole("menuitemradio", { name: "Duration, shortest first" }));
        expect(screen.getByRole("menuitemradio", { name: "Duration, longest first" })).toBeChecked();
        await user.keyboard("{Escape}");
        expect(videoNames()).toEqual(["Long one", "Short one, watched", "Extra"]);
        expect(screen.getByRole("button", { name: "Sort by duration, longest first" })).toBeInTheDocument();
    });

    it("filters the videos by status and shows how many are hidden", async () => {
        mockFolder(orderedContents());
        const { user } = renderScreen(<OrderedFolderPage />);
        await screen.findByRole("button", { name: "Long one" });

        await user.click(screen.getByRole("button", { name: "Show all videos" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Unwatched" }));
        expect(videoNames()).toEqual(["Long one", "Extra"]);
        expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3 videos");
        // Subfolders are not filtered.
        expect(screen.getByRole("link", { name: /Season 1/ })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Show all" }));
        expect(videoNames()).toHaveLength(3);
        expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    });

    it("explains when no video matches the filter", async () => {
        mockFolder(orderedContents());
        const { user } = renderScreen(<OrderedFolderPage />);
        await user.click(await screen.findByRole("button", { name: "Show all videos" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "In progress" }));

        expect(screen.getByRole("heading", { name: "No videos in progress here" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Season 2/ })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Show all videos" }));
        expect(await screen.findByRole("button", { name: "Long one" })).toBeInTheDocument();
    });

    it("hides the subfolder groups a filter empties in continuous view", async () => {
        mockFolder(
            contents({
                viewMode: { mode: "continuous", definedAt: SHOW },
                groups: [
                    {
                        folderPath: `${SHOW}\\Season 1`,
                        relativePath: "Season 1",
                        entries: [entryFixture(videoFixture({ id: 5, title: "Pilot", isWatched: true }))],
                    },
                    {
                        folderPath: `${SHOW}\\Season 2`,
                        relativePath: "Season 2",
                        entries: [entryFixture(videoFixture({ id: 6, title: "Premiere" }))],
                    },
                ],
            })
        );
        const { user } = renderScreen(<OrderedFolderPage />);
        await user.click(await screen.findByRole("button", { name: "Show all videos" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Watched" }));

        expect(screen.getByRole("link", { name: "Season 1" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Season 2" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pilot, watched" })).toBeInTheDocument();
    });

    it("reads new videos of the folder in the background when opened", async () => {
        const calls = mockFolder(contents());
        renderScreen(<FolderPage path={SHOW} />);
        await waitFor(() =>
            expect(callsOf(calls, "process_folder")).toEqual([expect.objectContaining({ path: SHOW })])
        );
    });

    it("does not try to read videos without ffmpeg", async () => {
        const calls = mockFolder(contents(), { media_tools_status: { ffmpeg: false, ffprobe: true } });
        renderScreen(<FolderPage path={SHOW} />);
        await screen.findByRole("button", { name: "Trailer" });
        expect(callsOf(calls, "process_folder")).toEqual([]);
    });

    it("groups the whole tree in continuous view and switches views", async () => {
        const calls = mockFolder(
            contents({
                viewMode: { mode: "continuous", definedAt: SHOW },
                groups: [
                    { folderPath: SHOW, relativePath: "", entries: [] },
                    {
                        folderPath: `${SHOW}\\Season 1`,
                        relativePath: "Season 1",
                        entries: [entryFixture(videoFixture({ id: 5, title: "Pilot" }))],
                    },
                ],
            }),
            { set_folder_view_mode: null }
        );
        const { user } = renderScreen(<FolderPage path={SHOW} />);

        expect(await screen.findByRole("link", { name: "Season 1" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pilot" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Continuous" }));
        await user.click(await screen.findByRole("menuitemradio", { name: /Folders/ }));
        expect(callsOf(calls, "set_folder_view_mode")).toEqual([{ path: SHOW, mode: "folders" }]);
    });

    it("marks every video of the folder as watched after confirmation", async () => {
        const calls = mockFolder(contents(), { set_folder_watched: 7 });
        const { user } = renderScreen(<FolderPage path={SHOW} />);

        await user.click(await screen.findByRole("button", { name: "Folder actions" }));
        await user.click(await screen.findByRole("menuitem", { name: "Mark all as watched" }));
        const dialog = await screen.findByRole("alertdialog", { name: "Mark 7 videos as watched?" });
        await user.click(within(dialog).getByRole("button", { name: "Mark as watched" }));

        expect(await screen.findByText("Marked 7 videos as watched")).toBeInTheDocument();
        expect(callsOf(calls, "set_folder_watched")).toEqual([{ path: SHOW, watched: true }]);
    });

    it("opens the folder menu on right-click and shows the folder properties", async () => {
        // Regression: the subfolder card did not pass the context menu's handlers on, so right-click did nothing.
        mockFolder(contents());
        renderScreen(<FolderPage path={SHOW} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: /Season 2/ }));
        expect(await screen.findByRole("menuitem", { name: "Mark all as watched" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Add tag to all videos" })).toBeInTheDocument();
        fireEvent.click(await screen.findByRole("menuitem", { name: "Properties" }));

        const dialog = await screen.findByRole("dialog", { name: "Season 2" });
        expect(dialog).toHaveTextContent(`${SHOW}\\Season 2`);
        expect(within(dialog).getByRole("button", { name: "Show in file manager" })).toBeInTheDocument();
    });

    it("adds a tag to every video of the folder", async () => {
        const calls = mockFolder(contents(), { add_tag_to_folder: 19 });
        const { user } = renderScreen(<FolderPage path={SHOW} />);

        await user.click(await screen.findByRole("button", { name: "Folder actions" }));
        await user.click(await screen.findByRole("menuitem", { name: "Add tag to all videos" }));
        await user.type(await screen.findByRole("textbox", { name: "Tag" }), "Anime{Enter}");

        expect(await screen.findByText('Tagged 19 videos with "anime"')).toBeInTheDocument();
        expect(callsOf(calls, "add_tag_to_folder")).toEqual([{ path: SHOW, name: "Anime" }]);
    });

    it("explains when the folder is outside the library", async () => {
        mockFolder(contents(), {
            browse_folder: () => {
                throw commandError("invalidInput", "D:\\Elsewhere is not inside a library folder");
            },
        });
        renderScreen(<FolderPage path={"D:\\Elsewhere"} />);
        expect(await screen.findByRole("heading", { name: "This folder is not in your library" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Go to home" })).toBeInTheDocument();
    });

    it("says so when the folder is empty", async () => {
        mockFolder(folderContentsFixture({ path: SHOW }));
        renderScreen(<OrderedFolderPage />);
        expect(await screen.findByRole("heading", { name: "This folder is empty" })).toBeInTheDocument();
        // Nothing to sort or filter.
        expect(screen.queryByRole("button", { name: /^Sort by/ })).not.toBeInTheDocument();
    });
});
