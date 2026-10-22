import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryEntry, LibraryFolderSort } from "../../shared/ipc/bindings";
import {
    libraryCommandsFixture,
    libraryFolderFixture,
    libraryGroupFixture,
    libraryLayoutFixture,
} from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { LibraryNav } from "./components/LibraryNav";

const anime = libraryFolderFixture({ id: 1, path: "D:\\Anime", name: "Anime", createdAt: "2026-01-02 10:00:00" });
const movies = libraryFolderFixture({ id: 2, path: "D:\\Movies", name: "Movies", createdAt: "2026-01-03 10:00:00" });
const series = libraryFolderFixture({ id: 3, path: "D:\\Series", name: "Series", createdAt: "2026-01-01 10:00:00" });

/** The library as the backend sorts it in each mode. */
const sortedLayouts: Record<LibraryFolderSort, LibraryEntry[]> = {
    custom: libraryLayoutFixture([movies, anime, series]),
    nameAscending: libraryLayoutFixture([anime, movies, series]),
    nameDescending: libraryLayoutFixture([series, movies, anime]),
    oldestFirst: libraryLayoutFixture([series, anime, movies]),
    newestFirst: libraryLayoutFixture([movies, anime, series]),
    recentlyWatched: libraryLayoutFixture([anime, series, movies]),
};

function mockSort(sort: LibraryFolderSort) {
    return mockCommands({
        ...libraryCommandsFixture([anime, movies, series]),
        get_library_folder_sort: sort,
        set_library_folder_sort: ({ sort: chosen }: { sort: LibraryFolderSort }) => sortedLayouts[chosen],
    });
}

function folderNames(): string[] {
    return screen.getAllByRole("link").map((link) => link.textContent ?? "");
}

function checkedOption() {
    return screen.getAllByRole("menuitemradio").filter((item) => item.getAttribute("aria-checked") === "true");
}

describe("library folder sort menu", () => {
    it("sorts by a field ascending, reverses it when chosen again and switches to another field", async () => {
        const calls = mockSort("custom");
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: "Sort folders: Custom order" }));
        await user.click(screen.getByRole("menuitemradio", { name: "Name" }));
        // The menu stays open, showing the direction on the chosen field.
        expect(await screen.findByRole("menuitemradio", { name: "Name, A to Z" })).toBeChecked();

        await user.click(screen.getByRole("menuitemradio", { name: "Name, A to Z" }));
        expect(await screen.findByRole("menuitemradio", { name: "Name, Z to A" })).toBeChecked();

        await user.click(screen.getByRole("menuitemradio", { name: "Date added" }));
        expect(await screen.findByRole("menuitemradio", { name: "Date added, oldest first" })).toBeChecked();
        expect(screen.getByRole("menuitemradio", { name: "Name" })).not.toBeChecked();

        await user.click(screen.getByRole("menuitemradio", { name: "Date added, oldest first" }));
        expect(await screen.findByRole("menuitemradio", { name: "Date added, newest first" })).toBeChecked();
        await user.keyboard("{Escape}");

        expect(await screen.findByRole("button", { name: "Sort folders: Date added, newest first" })).toHaveFocus();
        await waitFor(() => expect(folderNames()).toEqual(["Movies", "Anime", "Series"]));
        expect(callsOf(calls, "set_library_folder_sort")).toEqual([
            { sort: "nameAscending" },
            { sort: "nameDescending" },
            { sort: "oldestFirst" },
            { sort: "newestFirst" },
        ]);
    });

    it.each<[LibraryFolderSort, string]>([
        ["custom", "Custom order"],
        ["nameAscending", "Name, A to Z"],
        ["nameDescending", "Name, Z to A"],
        ["oldestFirst", "Date added, oldest first"],
        ["newestFirst", "Date added, newest first"],
        ["recentlyWatched", "Recently watched"],
    ])("shows the saved mode %s as %s", async (sort, label) => {
        mockSort(sort);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: `Sort folders: ${label}` }));
        expect(checkedOption()).toEqual([screen.getByRole("menuitemradio", { name: label })]);
        expect(screen.getByRole("menu")).toHaveTextContent("Sort folders by (choose again to reverse)");
    });

    it("chooses the custom order or the recently watched one with no direction, closing the menu", async () => {
        const calls = mockSort("nameDescending");
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: "Sort folders: Name, Z to A" }));
        await user.click(screen.getByRole("menuitemradio", { name: "Recently watched" }));
        expect(await screen.findByRole("button", { name: "Sort folders: Recently watched" })).toBeInTheDocument();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();

        // Choosing the current one again changes nothing.
        await user.click(screen.getByRole("button", { name: "Sort folders: Recently watched" }));
        expect(screen.getByRole("menuitemradio", { name: "Recently watched" })).toBeChecked();
        await user.click(screen.getByRole("menuitemradio", { name: "Recently watched" }));
        await user.click(await screen.findByRole("button", { name: "Sort folders: Recently watched" }));
        await user.click(screen.getByRole("menuitemradio", { name: "Custom order" }));

        expect(await screen.findByRole("button", { name: "Sort folders: Custom order" })).toBeInTheDocument();
        expect(callsOf(calls, "set_library_folder_sort")).toEqual([{ sort: "recentlyWatched" }, { sort: "custom" }]);
    });

    it("reverses the direction from the keyboard, keeping the focus on the field", async () => {
        const calls = mockSort("custom");
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        (await screen.findByRole("button", { name: "Sort folders: Custom order" })).focus();
        await user.keyboard("{Enter}");
        await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "Custom order" })).toHaveFocus());
        await user.keyboard("{ArrowDown}{Enter}");
        await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "Name, A to Z" })).toHaveFocus());
        await user.keyboard(" ");
        await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "Name, Z to A" })).toHaveFocus());
        await user.keyboard("{Escape}");

        expect(await screen.findByRole("button", { name: "Sort folders: Name, Z to A" })).toHaveFocus();
        expect(callsOf(calls, "set_library_folder_sort")).toEqual([
            { sort: "nameAscending" },
            { sort: "nameDescending" },
        ]);
    });

    it("saves quick choices in order, reversing the choice still being saved", async () => {
        const answers: (() => void)[] = [];
        const calls = mockCommands({
            ...libraryCommandsFixture([anime, movies, series]),
            get_library_folder_sort: "custom",
            set_library_folder_sort: ({ sort }: { sort: LibraryFolderSort }) =>
                new Promise((resolve) => answers.push(() => resolve(sortedLayouts[sort]))),
        });
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: "Sort folders: Custom order" }));
        await user.click(screen.getByRole("menuitemradio", { name: "Name" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Name, A to Z" }));
        expect(await screen.findByRole("menuitemradio", { name: "Name, Z to A" })).toBeChecked();
        expect(callsOf(calls, "set_library_folder_sort")).toEqual([{ sort: "nameAscending" }]);

        answers.shift()?.();
        await waitFor(() => expect(callsOf(calls, "set_library_folder_sort")).toHaveLength(2));
        answers.shift()?.();
        expect(callsOf(calls, "set_library_folder_sort")[1]).toEqual({ sort: "nameDescending" });
        await user.keyboard("{Escape}");
        await waitFor(() => expect(folderNames()).toEqual(["Series", "Movies", "Anime"]));
        expect(screen.getByRole("button", { name: "Sort folders: Name, Z to A" })).toBeInTheDocument();
    });

    it("goes back to the saved mode when the new one cannot be saved", async () => {
        mockCommands({
            ...libraryCommandsFixture([anime, movies, series]),
            get_library_folder_sort: "nameAscending",
            set_library_folder_sort: () => {
                throw commandError("database", "database is locked");
            },
        });
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: "Sort folders: Name, A to Z" }));
        await user.click(screen.getByRole("menuitemradio", { name: "Name, A to Z" }));

        expect(await screen.findByText("Could not sort the folders")).toBeInTheDocument();
        expect(await screen.findByRole("menuitemradio", { name: "Name, A to Z" })).toBeChecked();
    });

    it("reverses the direction from the collapsed rail", async () => {
        const calls = mockSort("oldestFirst");
        const { user } = renderScreen(<LibraryNav currentPath={undefined} compact />);

        await user.click(await screen.findByRole("button", { name: "Sort folders: Date added, oldest first" }));
        await user.click(screen.getByRole("menuitemradio", { name: "Date added, oldest first" }));
        expect(await screen.findByRole("menuitemradio", { name: "Date added, newest first" })).toBeChecked();
        await user.keyboard("{Escape}");

        expect(
            await screen.findByRole("button", { name: "Sort folders: Date added, newest first" })
        ).toBeInTheDocument();
        expect(callsOf(calls, "set_library_folder_sort")).toEqual([{ sort: "newestFirst" }]);
    });

    it("sorts the groups and the folders inside them", async () => {
        const group = libraryGroupFixture({ id: 10, name: "Shows" });
        const dark = libraryFolderFixture({ id: 4, path: "D:\\Dark", name: "Dark", groupId: 10 });
        const wire = libraryFolderFixture({ id: 5, path: "D:\\Wire", name: "Wire", groupId: 10 });
        const byName: Record<string, LibraryEntry[]> = {
            nameAscending: libraryLayoutFixture([anime, dark, wire], [group]),
            nameDescending: libraryLayoutFixture([wire, dark, anime], [group]),
        };
        const calls = mockCommands({
            ...libraryCommandsFixture([anime, dark, wire], [group]),
            get_library_folder_sort: "custom",
            set_library_folder_sort: ({ sort }: { sort: string }) => byName[sort],
        });
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: "Sort folders: Custom order" }));
        await user.click(screen.getByRole("menuitemradio", { name: "Name" }));
        await user.click(await screen.findByRole("menuitemradio", { name: "Name, A to Z" }));
        await screen.findByRole("menuitemradio", { name: "Name, Z to A" });
        await user.keyboard("{Escape}");

        // The group comes first and lists its folders in reverse.
        await waitFor(() => expect(folderNames()).toEqual(["Wire", "Dark", "Anime"]));
        expect(screen.getByRole("button", { name: "Shows, 2 folders" })).toBeInTheDocument();
        expect(callsOf(calls, "set_library_folder_sort")).toEqual([
            { sort: "nameAscending" },
            { sort: "nameDescending" },
        ]);
    });
});
