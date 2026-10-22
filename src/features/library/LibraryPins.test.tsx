import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry } from "../../shared/ipc/bindings";
import { libraryFolderFixture, libraryGroupFixture, libraryLayoutFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { LibraryNav } from "./components/LibraryNav";
import { flatFolders, mapFolders, mapGroup, pinnedFirst } from "./lib/folderLayout";

const anime = libraryFolderFixture({ id: 1, path: "D:\\Anime", name: "Anime" });
const movies = libraryFolderFixture({ id: 2, path: "D:\\Movies", name: "Movies" });
const series = libraryFolderFixture({ id: 3, path: "D:\\Series", name: "Series" });
const shows = libraryGroupFixture({ id: 10, name: "Shows" });
const dark = libraryFolderFixture({ id: 4, path: "D:\\Dark", name: "Dark", groupId: 10 });
const wire = libraryFolderFixture({ id: 5, path: "D:\\Wire", name: "Wire", groupId: 10 });

/** A backend that pins and unpins as asked, putting pinned items first (where an unpinned one goes back is its own). */
function mockLibrary(initial: LibraryEntry[]) {
    let entries = initial;
    return mockCommands({
        get_library_layout: () => entries,
        list_library_folders: () => flatFolders(entries),
        get_library_folder_sort: "custom",
        set_library_folder_pinned: ({ folderId, pinned }: { folderId: number; pinned: boolean }) => {
            entries = pinnedFirst(
                mapFolders(entries, (folder) => (folder.id === folderId ? { ...folder, pinned } : folder))
            );
            return entries;
        },
        set_library_group_pinned: ({ groupId, pinned }: { groupId: number; pinned: boolean }) => {
            entries = pinnedFirst(mapGroup(entries, groupId, (group) => ({ ...group, pinned })));
            return entries;
        },
    });
}

function linkNames() {
    return screen.getAllByRole("link").map((link) => link.textContent);
}

/** The lines between the pinned items and the others (hidden from screen readers). */
function dividers() {
    return screen.queryAllByRole("separator", { hidden: true });
}

/** Opens the menu of a focused folder, as `Shift+F10` does. */
async function openMenuOf(name: string) {
    const link = await screen.findByRole("link", { name });
    link.focus();
    fireEvent.contextMenu(link);
}

describe("pinned library folders and groups", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("offers Pin or Unpin in the menus of folders and groups, and names the pinned ones", async () => {
        mockLibrary([
            {
                kind: "group",
                group: { ...shows, pinned: true },
                folders: [{ ...dark, pinned: true }, wire],
            },
            { kind: "folder", folder: anime },
        ]);
        renderScreen(<LibraryNav currentPath={undefined} />);

        const header = await screen.findByRole("button", { name: "Shows, pinned, 2 folders" });
        expect(screen.getByRole("link", { name: "Dark, pinned" })).toBeInTheDocument();
        expect(screen.getByRole("list", { name: "Shows, pinned" })).toBeInTheDocument();

        await openMenuOf("Anime");
        expect(await screen.findByRole("menuitem", { name: "Pin" })).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
        await openMenuOf("Dark, pinned");
        expect(await screen.findByRole("menuitem", { name: "Unpin" })).toBeInTheDocument();
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
        fireEvent.contextMenu(header);
        expect(await screen.findByRole("menuitem", { name: "Unpin" })).toBeInTheDocument();
    });

    it("sets the pinned items apart with a line and a pin, without motion", async () => {
        mockLibrary(
            pinnedFirst(
                libraryLayoutFixture([{ ...anime, pinned: true }, movies, { ...dark, pinned: true }, wire], [shows])
            )
        );
        renderScreen(<LibraryNav currentPath={undefined} />);

        const pinned = await screen.findByRole("link", { name: "Anime, pinned" });
        expect(linkNames()).toEqual(["Anime, pinned", "Movies", "Dark, pinned", "Wire"]);
        expect(pinned.querySelector(".lucide-pin")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Movies" }).querySelector(".lucide-pin")).not.toBeInTheDocument();
        // One line in the library's list, one in the group's.
        expect(dividers()).toHaveLength(2);
        expect(
            within(screen.getByRole("list", { name: "Shows" })).getAllByRole("separator", { hidden: true })
        ).toHaveLength(1);
        expect(pinned.closest("li")?.nextElementSibling).toContainElement(dividers()[0] ?? null);
        for (const divider of dividers()) {
            expect(divider.closest("li")?.className).not.toMatch(/animate-|transition/);
        }
    });

    it("sets the pinned icons apart in the rail", async () => {
        mockLibrary(libraryLayoutFixture([{ ...anime, pinned: true }, movies]));
        renderScreen(<LibraryNav currentPath={undefined} compact />);
        await screen.findByRole("link", { name: "Anime, pinned" });
        expect(dividers()).toHaveLength(1);
    });

    it("draws no second line in the rail after a pinned group, which ends with its own", async () => {
        mockLibrary(pinnedFirst(libraryLayoutFixture([movies, dark], [{ ...shows, pinned: true }])));
        renderScreen(<LibraryNav currentPath={undefined} compact />);
        await screen.findByRole("link", { name: "Dark" });
        expect(linkNames()).toEqual(["Dark", "Movies"]);
        expect(dividers()).toHaveLength(0);
    });

    it("pins and unpins from the menu, following the item with the focus and telling screen readers", async () => {
        const calls = mockLibrary(libraryLayoutFixture([anime, movies, dark], [shows]));
        renderScreen(<LibraryNav currentPath={undefined} />);

        await openMenuOf("Movies");
        fireEvent.click(await screen.findByRole("menuitem", { name: "Pin" }));
        await waitFor(() => expect(screen.getByRole("link", { name: "Movies, pinned" })).toHaveFocus());
        expect(linkNames()).toEqual(["Movies, pinned", "Anime", "Dark"]);
        expect(screen.getByText("Movies pinned to the top.")).toHaveAttribute("role", "status");
        expect(callsOf(calls, "set_library_folder_pinned")).toEqual([{ folderId: 2, pinned: true }]);

        await openMenuOf("Dark");
        fireEvent.click(await screen.findByRole("menuitem", { name: "Pin" }));
        await waitFor(() => expect(screen.getByRole("link", { name: "Dark, pinned" })).toHaveFocus());
        expect(screen.getByText("Dark pinned to the top of Shows.")).toHaveAttribute("role", "status");

        const showsHeader = screen.getByRole("button", { name: "Shows, 1 folder" });
        showsHeader.focus();
        fireEvent.contextMenu(showsHeader);
        fireEvent.click(await screen.findByRole("menuitem", { name: "Pin" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Shows, pinned, 1 folder" })).toHaveFocus());
        expect(screen.getByText("Shows pinned to the top.")).toHaveAttribute("role", "status");
        expect(callsOf(calls, "set_library_group_pinned")).toEqual([{ groupId: 10, pinned: true }]);

        await openMenuOf("Movies, pinned");
        fireEvent.click(await screen.findByRole("menuitem", { name: "Unpin" }));
        await waitFor(() => expect(screen.getByRole("link", { name: "Movies" })).toHaveFocus());
        expect(screen.getByText("Movies unpinned.")).toHaveAttribute("role", "status");
    });

    it("stops Move up and Move down at the edge of the pinned items, saying why", async () => {
        const calls = mockLibrary(libraryLayoutFixture([{ ...anime, pinned: true }, movies, series]));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await openMenuOf("Movies");
        const moveUp = await screen.findByRole("menuitem", { name: "Move up" });
        expect(moveUp).toHaveAttribute("aria-disabled", "true");
        await user.hover(moveUp);
        expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Pinned items stay above. Pin it to move it there."
        );
        fireEvent.click(moveUp);
        // Nothing moves, and the menu stays open.
        expect(screen.getByRole("menu")).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "Move down" })).not.toHaveAttribute("aria-disabled");
        fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

        await openMenuOf("Anime, pinned");
        const moveDown = await screen.findByRole("menuitem", { name: "Move down" });
        expect(moveDown).toHaveAttribute("aria-disabled", "true");
        await user.hover(moveDown);
        expect(await screen.findByRole("tooltip")).toHaveTextContent(
            "Pinned items stay on top. Unpin it to move it lower."
        );
        expect(callsOf(calls, "arrange_library")).toEqual([]);
    });

    describe("dragged with the keyboard", () => {
        /**
         * jsdom has no layout: each row of the list is 36px tall, stacked in the order they are listed, and the lifted
         * folder (the drag overlay) starts where the focused folder is.
         */
        function stackRows() {
            vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
                const lifted = this.matches(".cursor-grabbing") || this.querySelector(".cursor-grabbing") !== null;
                const node = lifted && document.activeElement instanceof HTMLElement ? document.activeElement : this;
                const item = node.closest("li");
                const index = item?.parentElement ? Array.from(item.parentElement.children).indexOf(item) : 0;
                return DOMRect.fromRect({ x: 0, y: index * 36, width: 200, height: 36 });
            });
        }

        function press(element: HTMLElement, code: string, key = code) {
            fireEvent.keyDown(element, { code, key });
        }

        it("never crosses the edge of the pinned items, either way", async () => {
            stackRows();
            const calls = mockLibrary(libraryLayoutFixture([{ ...anime, pinned: true }, movies, series]));
            renderScreen(<LibraryNav currentPath={undefined} />);

            const link = await screen.findByRole("link", { name: "Movies" });
            link.focus();
            press(link, "Space", " ");
            expect(await screen.findByText("Picked up Movies, at position 2 of 3.")).toBeInTheDocument();
            press(link, "ArrowUp");
            expect(
                await screen.findByText("Movies stays at position 2 of 3. Pinned items stay above the others.")
            ).toBeInTheDocument();
            press(link, "Space", " ");
            await screen.findByText(/Movies dropped at position 2 of 3/);
            expect(linkNames()).toEqual(["Anime, pinned", "Movies", "Series"]);

            const pinned = screen.getByRole("link", { name: "Anime, pinned" });
            pinned.focus();
            press(pinned, "Space", " ");
            expect(await screen.findByText("Picked up Anime, pinned, at position 1 of 3.")).toBeInTheDocument();
            press(pinned, "ArrowDown");
            expect(
                await screen.findByText("Anime stays at position 1 of 3. Pinned items stay above the others.")
            ).toBeInTheDocument();
            press(pinned, "Space", " ");
            await screen.findByText(/Anime dropped at position 1 of 3/);

            expect(linkNames()).toEqual(["Anime, pinned", "Movies", "Series"]);
            expect(callsOf(calls, "arrange_library")).toEqual([]);
        });
    });
});
