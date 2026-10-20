import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayoutEntry, LibraryEntry, LibraryFolder, LibraryGroup } from "../../shared/ipc/bindings";
import { libraryFolderFixture, libraryGroupFixture, libraryLayoutFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { HOLD_TO_DRAG_MS } from "./components/LibraryFolderItem";
import { LibraryNav } from "./components/LibraryNav";
import { OPEN_GROUP_DELAY_MS } from "./hooks/useLibraryDrag";
import { flatFolders, mapGroup, moveToGroup } from "./lib/folderLayout";

const series = libraryGroupFixture({ id: 10, name: "Series" });
const courses = libraryGroupFixture({ id: 20, name: "Courses" });
const anime = libraryFolderFixture({ id: 1, path: "D:\\Anime", name: "Anime" });
const dark = libraryFolderFixture({ id: 2, path: "D:\\Dark", name: "Dark", groupId: 10 });
const wire = libraryFolderFixture({ id: 3, path: "D:\\Wire", name: "Wire", groupId: 10 });
const intro = libraryFolderFixture({ id: 4, path: "D:\\Intro", name: "Intro", groupId: 20 });

/** A backend with groups that follows what it is asked, as far as these tests need. */
function mockLibrary(initial: LibraryEntry[]) {
    let entries = initial;
    const folders = () => flatFolders(entries);
    return mockCommands({
        get_library_layout: () => entries,
        list_library_folders: () => folders(),
        get_library_folder_sort: "custom",
        set_library_group_collapsed: ({ id, collapsed }: { id: number; collapsed: boolean }) => {
            entries = mapGroup(entries, id, (group) => ({ ...group, collapsed }));
            return null;
        },
        create_library_group: ({ name, folderId }: { name: string; folderId: number | null }) => {
            const group = libraryGroupFixture({ id: 30, name });
            entries = [...entries, { kind: "group", group, folders: [] }];
            entries = folderId === null ? entries : moveToGroup(entries, folderId, group.id);
            return group;
        },
        rename_library_group: ({ id, name }: { id: number; name: string }) => {
            entries = mapGroup(entries, id, (group) => ({ ...group, name }));
            return null;
        },
        delete_library_group: ({ id }: { id: number }) => {
            const deleted = entries.find((entry) => entry.kind === "group" && entry.group.id === id);
            entries = entries.flatMap((entry): LibraryEntry[] =>
                entry === deleted && entry.kind === "group"
                    ? entry.folders.map((folder) => ({ kind: "folder", folder: { ...folder, groupId: null } }))
                    : [entry]
            );
            return deleted?.kind === "group" ? deleted.folders.length : 0;
        },
        move_library_folder_to_group: ({ folderId, groupId }: { folderId: number; groupId: number | null }) => {
            entries = moveToGroup(entries, folderId, groupId);
            return null;
        },
        arrange_library: ({ entries: layout }: { entries: LayoutEntry[] }) => {
            const folder = (id: number) => folders().find((candidate) => candidate.id === id);
            const group = (id: number) =>
                entries.flatMap((entry) => (entry.kind === "group" && entry.group.id === id ? [entry.group] : []))[0];
            entries = layout.flatMap((item): LibraryEntry[] => {
                if (item.kind === "folder") {
                    const found = folder(item.id);
                    return found ? [{ kind: "folder", folder: { ...found, groupId: null } }] : [];
                }
                const found = group(item.id);
                const inside = item.folders.flatMap((id) => folders().filter((candidate) => candidate.id === id));
                return found
                    ? [{ kind: "group", group: found, folders: inside.map((f) => ({ ...f, groupId: found.id })) }]
                    : [];
            });
            return entries;
        },
    });
}

function layout(folders: LibraryFolder[], groups: LibraryGroup[]) {
    return libraryLayoutFixture(folders, groups);
}

function header(name: RegExp | string) {
    return screen.findByRole("button", { name });
}

function linkNames() {
    return screen.getAllByRole("link").map((link) => link.textContent);
}

async function openMenuOf(name: string) {
    fireEvent.contextMenu(await screen.findByRole("link", { name }));
}

/**
 * jsdom has no layout: each row of the list (a folder, a group's header, a group's end) is 36px tall, stacked in the
 * order they are listed, and the lifted folder (the drag overlay) starts where the focused folder is.
 */
function stackRows() {
    const rows = () =>
        Array.from(document.querySelectorAll("li, button[aria-expanded]"))
            .map((element) => (element.matches("button") ? element.parentElement : element))
            .filter(
                (element): element is HTMLElement => element instanceof HTMLElement && !element.querySelector("li")
            );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const lifted = this.matches(".cursor-grabbing") || this.querySelector(".cursor-grabbing") !== null;
        const node = lifted && document.activeElement instanceof HTMLElement ? document.activeElement : this;
        const index = rows().findIndex((row) => row.contains(node));
        return DOMRect.fromRect({ x: 0, y: Math.max(index, 0) * 36, width: 200, height: 36 });
    });
}

function press(code: string, key = code) {
    fireEvent.keyDown(document.activeElement ?? document.body, { code, key });
}

describe("library groups", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("lists groups among the folders with their count, expanding and collapsing them", async () => {
        const calls = mockLibrary(layout([dark, wire, anime], [series, courses]));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        const seriesHeader = await header("Series, 2 folders");
        expect(seriesHeader).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("button", { name: "Courses, 0 folders" })).toBeInTheDocument();
        expect(screen.getByText("Drag folders here")).toBeInTheDocument();
        // The folder without a group comes after the group, as stored.
        expect(linkNames()).toEqual(["Dark", "Wire", "Anime"]);
        expect(within(screen.getByRole("list", { name: "Series" })).getAllByRole("link")).toHaveLength(2);

        await user.click(seriesHeader);
        expect(seriesHeader).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("link", { name: "Dark" })).not.toBeInTheDocument();
        expect(callsOf(calls, "set_library_group_collapsed")).toEqual([{ id: 10, collapsed: true }]);

        seriesHeader.focus();
        await user.keyboard("{Enter}");
        expect(await screen.findByRole("link", { name: "Dark" })).toBeInTheDocument();
        expect(callsOf(calls, "set_library_group_collapsed")[1]).toEqual({ id: 10, collapsed: false });
    });

    it("marks a collapsed group that holds the folder being browsed", async () => {
        mockLibrary(layout([anime, dark], [{ ...series, collapsed: true }]));
        renderScreen(<LibraryNav currentPath={"D:\\Dark\\Season 1"} />);
        expect((await header(/Series/)).className).toContain("before:bg-accent");
    });

    it("creates a group from the sort menu, focusing its header", async () => {
        const calls = mockLibrary(layout([anime], []));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: /Sort folders/ }));
        await user.click(screen.getByRole("menuitem", { name: "New group…" }));
        const field = await screen.findByRole("textbox", { name: "Group name" });
        await waitFor(() => expect(field).toHaveFocus());
        expect(field).toHaveValue("New group");
        await user.keyboard("Series{Enter}");

        await waitFor(() => expect(screen.getByRole("button", { name: "Series, 0 folders" })).toHaveFocus());
        expect(callsOf(calls, "create_library_group")).toEqual([{ name: "Series", folderId: null }]);
    });

    it("gives up a new group with Esc or an empty name", async () => {
        const calls = mockLibrary(layout([anime], []));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        for (const keys of ["{Escape}", "{Backspace}{Enter}"]) {
            await user.click(await screen.findByRole("button", { name: /Sort folders/ }));
            await user.click(screen.getByRole("menuitem", { name: "New group…" }));
            await waitFor(() => expect(screen.getByRole("textbox", { name: "Group name" })).toHaveFocus());
            await user.keyboard(keys);
            expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        }
        expect(callsOf(calls, "create_library_group")).toEqual([]);
    });

    it("moves a folder to a group, out of it to the end of the list, or into a new group from its menu", async () => {
        const calls = mockLibrary(layout([anime, dark], [series, courses]));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await openMenuOf("Anime");
        await user.click(await screen.findByRole("menuitem", { name: "Move to group" }));
        expect(await screen.findByRole("menuitem", { name: "Series" })).not.toHaveAttribute("aria-disabled");
        expect(screen.queryByRole("menuitem", { name: "Remove from group" })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("menuitem", { name: "Series" }));
        await waitFor(() =>
            expect(within(screen.getByRole("list", { name: "Series" })).getAllByRole("link")).toHaveLength(2)
        );
        expect(await header("Series, 2 folders")).toBeInTheDocument();

        await openMenuOf("Dark");
        await user.click(await screen.findByRole("menuitem", { name: "Move to group" }));
        expect(await screen.findByRole("menuitem", { name: "Series" })).toHaveAttribute("aria-disabled", "true");
        fireEvent.click(screen.getByRole("menuitem", { name: "Remove from group" }));
        expect(await header("Series, 1 folder")).toBeInTheDocument();
        // After the empty group Courses.
        expect(linkNames()).toEqual(["Anime", "Dark"]);
        expect(within(screen.getByRole("list", { name: "Series" })).getAllByRole("link")).toHaveLength(1);

        await openMenuOf("Dark");
        await user.click(await screen.findByRole("menuitem", { name: "Move to group" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "New group…" }));
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Group name" })).toHaveFocus());
        await user.keyboard("Shows{Enter}");
        expect(await header("Shows, 1 folder")).toBeInTheDocument();

        expect(callsOf(calls, "move_library_folder_to_group")).toEqual([
            { folderId: 1, groupId: 10 },
            { folderId: 2, groupId: null },
        ]);
        expect(callsOf(calls, "create_library_group")).toEqual([{ name: "Shows", folderId: 2 }]);
    });

    it("asks before deleting a group with folders, which stay where the group was", async () => {
        const calls = mockLibrary(layout([dark, anime], [series, courses]));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        // An empty group goes at once.
        fireEvent.contextMenu(await header("Courses, 0 folders"));
        await user.click(await screen.findByRole("menuitem", { name: "Delete group" }));
        await waitFor(() => expect(screen.queryByRole("button", { name: /Courses/ })).not.toBeInTheDocument());

        fireEvent.contextMenu(await header("Series, 1 folder"));
        await user.click(await screen.findByRole("menuitem", { name: "Delete group" }));
        const dialog = await screen.findByRole("alertdialog", { name: "Delete Series?" });
        expect(dialog).toHaveTextContent("No folder is removed from the library");
        await user.click(within(dialog).getByRole("button", { name: "Delete group" }));

        expect(await screen.findByText("Deleted Series")).toBeInTheDocument();
        expect(screen.getByText("1 folder moved out of the group.")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("button", { name: /Series/ })).not.toBeInTheDocument());
        expect(linkNames()).toEqual(["Dark", "Anime"]);
        expect(callsOf(calls, "delete_library_group")).toEqual([{ id: 20 }, { id: 10 }]);
    });

    it("renames a group with F2, keeping the name when emptied", async () => {
        const calls = mockLibrary(layout([dark], [series]));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        const seriesHeader = await header(/Series/);
        act(() => seriesHeader.focus());
        await user.keyboard("{F2}");
        expect(screen.getByRole("textbox", { name: "Group name" })).toHaveValue("Series");
        await user.keyboard("{Backspace}{Enter}");
        expect(await header("Series, 1 folder")).toHaveFocus();

        await user.keyboard("{F2}Shows{Enter}");
        expect(await header("Shows, 1 folder")).toHaveFocus();
        expect(callsOf(calls, "rename_library_group")).toEqual([{ id: 10, name: "Shows" }]);
    });

    it("moves groups up and down among the folders from their menu", async () => {
        const calls = mockLibrary(layout([dark, anime], [series, courses]));
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await header(/Series/));
        expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute("aria-disabled", "true");
        await user.click(screen.getByRole("menuitem", { name: "Move down" }));

        await waitFor(() => expect(linkNames()).toEqual(["Anime", "Dark"]));
        expect(callsOf(calls, "arrange_library")).toEqual([
            {
                entries: [
                    { kind: "folder", id: 1 },
                    { kind: "group", id: 10, folders: [2] },
                    { kind: "group", id: 20, folders: [] },
                ],
            },
        ]);
    });

    describe("dragging", () => {
        it("moves a folder into a group with the keyboard", async () => {
            stackRows();
            const calls = mockLibrary(layout([anime, dark], [series]));
            renderScreen(<LibraryNav currentPath={undefined} />);

            const link = await screen.findByRole("link", { name: "Anime" });
            act(() => link.focus());
            press("Space", " ");
            expect(await screen.findByText("Picked up Anime, at position 1 of 2.")).toBeInTheDocument();
            press("ArrowDown");
            expect(await screen.findByText("Anime moved into Series, position 1 of 2.")).toBeInTheDocument();
            press("Space", " ");

            await waitFor(() =>
                expect(callsOf(calls, "arrange_library")).toEqual([
                    { entries: [{ kind: "group", id: 10, folders: [1, 2] }] },
                ])
            );
        });

        it("takes a folder out of a group when it goes past the group's end", async () => {
            stackRows();
            const calls = mockLibrary(layout([dark, wire], [series]));
            renderScreen(<LibraryNav currentPath={undefined} />);

            const link = await screen.findByRole("link", { name: "Wire" });
            act(() => link.focus());
            press("Space", " ");
            expect(await screen.findByText("Picked up Wire, at position 2 of 2 in Series.")).toBeInTheDocument();
            press("ArrowDown");
            expect(await screen.findByText("Wire moved out of Series, to position 2 of 2.")).toBeInTheDocument();
            press("Space", " ");

            await waitFor(() =>
                expect(callsOf(calls, "arrange_library")).toEqual([
                    {
                        entries: [
                            { kind: "group", id: 10, folders: [2] },
                            { kind: "folder", id: 3 },
                        ],
                    },
                ])
            );
        });

        it("opens a collapsed group while a folder is held over its header, without saving it open", async () => {
            stackRows();
            const calls = mockLibrary(layout([anime, intro], [{ ...courses, collapsed: true }]));
            renderScreen(<LibraryNav currentPath={undefined} />);
            const link = await screen.findByRole("link", { name: "Anime" });
            const target = (await header(/Courses/)).parentElement;
            const distance = (target?.getBoundingClientRect().y ?? 0) - link.getBoundingClientRect().y;
            const pointer = { isPrimary: true, button: 0, clientX: 10, clientY: 10 };

            act(() => link.focus());
            vi.useFakeTimers();
            fireEvent.pointerDown(link, pointer);
            act(() => vi.advanceTimersByTime(HOLD_TO_DRAG_MS));
            fireEvent.pointerMove(document, { ...pointer, clientY: 10 + distance });
            expect(screen.queryByRole("link", { name: "Intro" })).not.toBeInTheDocument();
            act(() => vi.advanceTimersByTime(OPEN_GROUP_DELAY_MS));
            expect(screen.getByRole("link", { name: "Intro" })).toBeInTheDocument();

            fireEvent.pointerUp(document, pointer);
            vi.useRealTimers();
            await waitFor(() => expect(screen.queryByRole("link", { name: "Intro" })).not.toBeInTheDocument());
            expect(callsOf(calls, "set_library_group_collapsed")).toEqual([]);
        });
    });

    describe("in the collapsed rail", () => {
        it("separates the groups with lines, always shows their folders and leaves empty groups out", async () => {
            mockLibrary(layout([anime, dark], [{ ...series, collapsed: true }, courses]));
            const { user } = renderScreen(<LibraryNav currentPath={undefined} compact />);

            const darkLink = await screen.findByRole("link", { name: "Dark" });
            expect(within(screen.getByRole("list", { name: "Series" })).getByRole("link")).toBe(darkLink);
            expect(screen.queryByRole("list", { name: "Courses" })).not.toBeInTheDocument();
            expect(screen.queryByRole("button", { expanded: true })).not.toBeInTheDocument();

            await user.hover(darkLink);
            expect(await screen.findByRole("tooltip")).toHaveTextContent("Group: Series");
        });
    });
});
