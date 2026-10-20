import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryFolder } from "../../shared/ipc/bindings";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { HOLD_TO_DRAG_MS } from "./components/LibraryFolderItem";
import { LibraryNav } from "./components/LibraryNav";

const anime = libraryFolderFixture({ id: 1, path: "D:\\Anime", name: "Anime" });
const movies = libraryFolderFixture({ id: 2, path: "D:\\Movies", name: "Movies" });
const series = libraryFolderFixture({ id: 3, path: "D:\\Series", name: "Series" });

function folderNames(): string[] {
    return screen.getAllByRole("link").map((link) => link.textContent ?? "");
}

/** Answers a reorder with the folders in the order of the ids it was given. */
function reorderWith(folders: LibraryFolder[]) {
    return ({ ids }: Record<string, unknown>) =>
        (Array.isArray(ids) ? ids : []).map((id) => folders.find((folder) => folder.id === id));
}

async function openMenuOf(name: RegExp | string) {
    fireEvent.contextMenu(await screen.findByRole("link", { name }));
}

describe("library folder order", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("shows the current sort mode and changes it from the menu", async () => {
        const calls = mockCommands({
            list_library_folders: [anime, movies, series],
            get_library_folder_sort: "nameAscending",
            set_library_folder_sort: [series, movies, anime],
        });
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: "Sort folders: Name (A–Z)" }));
        expect(screen.getByRole("menuitemradio", { name: "Name (A–Z)" })).toBeChecked();
        await user.click(screen.getByRole("menuitemradio", { name: "Name (Z–A)" }));

        expect(await screen.findByRole("button", { name: "Sort folders: Name (Z–A)" })).toBeInTheDocument();
        expect(callsOf(calls, "set_library_folder_sort")).toEqual([{ sort: "nameDescending" }]);
        expect(folderNames()).toEqual(["Series", "Movies", "Anime"]);
    });

    it("moves a folder from the context menu, switching to the custom order from the order on screen", async () => {
        const calls = mockCommands({
            list_library_folders: [series, movies, anime],
            get_library_folder_sort: "nameDescending",
            reorder_library_folders: reorderWith([anime, movies, series]),
        });
        renderScreen(<LibraryNav currentPath={undefined} />);

        await openMenuOf("Series");
        expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));

        await waitFor(() => expect(folderNames()).toEqual(["Movies", "Series", "Anime"]));
        expect(callsOf(calls, "reorder_library_folders")).toEqual([{ ids: [2, 3, 1] }]);
        expect(await screen.findByRole("button", { name: "Sort folders: Custom order" })).toBeInTheDocument();

        await openMenuOf("Anime");
        expect(await screen.findByRole("menuitem", { name: "Move down" })).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
        await waitFor(() => expect(callsOf(calls, "reorder_library_folders")).toHaveLength(2));
        expect(callsOf(calls, "reorder_library_folders")[1]).toEqual({ ids: [2, 1, 3] });
    });

    it("puts the folders back when the new order cannot be saved", async () => {
        mockCommands({
            list_library_folders: [anime, movies],
            get_library_folder_sort: "nameAscending",
            reorder_library_folders: () => {
                throw commandError("database", "database is locked");
            },
        });
        renderScreen(<LibraryNav currentPath={undefined} />);

        await openMenuOf("Anime");
        fireEvent.click(await screen.findByRole("menuitem", { name: "Move down" }));

        expect(await screen.findByText("Could not move the folder")).toBeInTheDocument();
        expect(folderNames()).toEqual(["Anime", "Movies"]);
        expect(screen.getByRole("button", { name: "Sort folders: Name (A–Z)" })).toBeInTheDocument();
    });

    it("does not offer to move the only folder", async () => {
        mockCommands({ list_library_folders: [anime], get_library_folder_sort: "custom" });
        renderScreen(<LibraryNav currentPath={undefined} />);

        expect(await screen.findByRole("link", { name: "Anime" })).not.toHaveAttribute("aria-describedby");
        await openMenuOf("Anime");
        expect(await screen.findByRole("menuitem", { name: "Sync folder" })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Move up" })).not.toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Move down" })).not.toBeInTheDocument();
    });

    it("keeps a folder that is not connected in its place, and lets it be moved", async () => {
        const calls = mockCommands({
            list_library_folders: [anime, movies, series],
            get_library_folder_sort: "custom",
            get_library_folder_statuses: [{ path: movies.path, watch: "unavailable", reason: null }],
            reorder_library_folders: reorderWith([anime, movies, series]),
        });
        renderScreen(<LibraryNav currentPath={undefined} />);

        await screen.findByRole("link", { name: "Movies, not connected" });
        expect(folderNames()).toEqual(["Anime", "Movies, not connected", "Series"]);

        await openMenuOf("Movies, not connected");
        fireEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));
        await waitFor(() => expect(callsOf(calls, "reorder_library_folders")).toEqual([{ ids: [2, 1, 3] }]));
    });

    it("lists the folders in the same order in the collapsed rail, with the sort menu", async () => {
        mockCommands({ list_library_folders: [series, anime], get_library_folder_sort: "recentlyWatched" });
        renderScreen(<LibraryNav currentPath={undefined} compact />);

        expect(await screen.findByRole("button", { name: "Sort folders: Recently watched" })).toBeInTheDocument();
        await screen.findByRole("link", { name: "Series" });
        expect(folderNames()).toEqual(["Series", "Anime"]);
    });

    it("picks a folder up with the mouse only after it is held, showing the press filling up", async () => {
        mockCommands({ list_library_folders: [anime, movies], get_library_folder_sort: "custom" });
        renderScreen(<LibraryNav currentPath={undefined} />);
        const link = await screen.findByRole("link", { name: "Anime" });
        const holdProgress = () => link.querySelector(".animate-hold-fill");
        const pointer = { isPrimary: true, button: 0, clientX: 10, clientY: 10 };

        vi.useFakeTimers();
        try {
            // A quick press is a click: nothing is picked up.
            fireEvent.pointerDown(link, pointer);
            expect(holdProgress()).toBeInTheDocument();
            act(() => vi.advanceTimersByTime(HOLD_TO_DRAG_MS / 2));
            fireEvent.pointerUp(document, pointer);
            expect(holdProgress()).not.toBeInTheDocument();
            act(() => vi.advanceTimersByTime(HOLD_TO_DRAG_MS));
            expect(screen.queryByText(/Picked up Anime/)).not.toBeInTheDocument();

            // Moving away while holding gives up too.
            fireEvent.pointerDown(link, pointer);
            fireEvent.pointerMove(document, { ...pointer, clientY: 30 });
            expect(holdProgress()).not.toBeInTheDocument();
            act(() => vi.advanceTimersByTime(HOLD_TO_DRAG_MS));
            expect(screen.queryByText(/Picked up Anime/)).not.toBeInTheDocument();

            fireEvent.pointerDown(link, pointer);
            act(() => vi.advanceTimersByTime(HOLD_TO_DRAG_MS));
            expect(holdProgress()).not.toBeInTheDocument();
            expect(screen.getByText("Picked up Anime, at position 1 of 2.")).toBeInTheDocument();
            fireEvent.pointerUp(document, pointer);
        } finally {
            vi.useRealTimers();
        }
    });

    describe("with the keyboard", () => {
        /** Presses a key on the focused folder. */
        function press(element: HTMLElement, code: string, key = code) {
            fireEvent.keyDown(element, { code, key });
        }

        /** jsdom has no layout: each folder is 36px tall, stacked in the order they are listed. */
        function stackFolders() {
            vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
                const item = this.closest("li");
                const index = item?.parentElement ? Array.from(item.parentElement.children).indexOf(item) : 0;
                return DOMRect.fromRect({ x: 0, y: index * 36, width: 200, height: 36 });
            });
        }

        it("picks a folder up with Space, moves it with the arrows and drops it with Space", async () => {
            stackFolders();
            const calls = mockCommands({
                list_library_folders: [anime, movies, series],
                get_library_folder_sort: "custom",
                reorder_library_folders: reorderWith([anime, movies, series]),
            });
            renderScreen(<LibraryNav currentPath={undefined} />);

            const link = await screen.findByRole("link", { name: "Anime" });
            expect(link).toHaveAccessibleDescription(/press Space to pick it up/);
            link.focus();
            press(link, "Space", " ");
            expect(await screen.findByText("Picked up Anime, at position 1 of 3.")).toBeInTheDocument();
            press(link, "ArrowDown");
            expect(await screen.findByText("Anime moved to position 2 of 3.")).toBeInTheDocument();
            press(link, "Space", " ");

            await waitFor(() => expect(callsOf(calls, "reorder_library_folders")).toEqual([{ ids: [2, 1, 3] }]));
            expect(folderNames()).toEqual(["Movies", "Anime", "Series"]);
        });

        it("leaves the order alone when Escape cancels the move", async () => {
            stackFolders();
            const calls = mockCommands({ list_library_folders: [anime, movies], get_library_folder_sort: "custom" });
            renderScreen(<LibraryNav currentPath={undefined} />);

            const link = await screen.findByRole("link", { name: "Anime" });
            link.focus();
            press(link, "Space", " ");
            expect(await screen.findByText("Picked up Anime, at position 1 of 2.")).toBeInTheDocument();
            press(link, "ArrowDown");
            expect(await screen.findByText("Anime moved to position 2 of 2.")).toBeInTheDocument();
            press(link, "Escape");
            expect(await screen.findByText("Moving cancelled. Anime stays at position 1 of 2.")).toBeInTheDocument();

            expect(folderNames()).toEqual(["Anime", "Movies"]);
            expect(callsOf(calls, "reorder_library_folders")).toEqual([]);
        });
    });
});
