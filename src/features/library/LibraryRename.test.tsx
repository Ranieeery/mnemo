import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LibraryFolder } from "../../shared/ipc/bindings";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { LibraryNav } from "./components/LibraryNav";
import { renamed } from "./lib/rename";

const anime = libraryFolderFixture({ id: 1, path: "D:\\Anime 2019", folderName: "Anime 2019" });
const movies = libraryFolderFixture({ id: 2, path: "D:\\Movies", folderName: "Movies" });

/** A backend that keeps the names it is given; `fail` makes renaming fail. */
function mockLibrary(initial: LibraryFolder[], { fail = false } = {}) {
    let folders = initial;
    return mockCommands({
        list_library_folders: () => folders,
        rename_library_folder: ({ path, name }: { path: string; name: string | null }) => {
            if (fail) {
                throw commandError("invalidInput", "folder names can have at most 100 characters");
            }
            folders = folders.map((folder) => (folder.path === path ? renamed(folder, name ?? "") : folder));
            return folders.find((folder) => folder.path === path);
        },
    });
}

async function focusFolder(name: string) {
    const link = await screen.findByRole("link", { name });
    act(() => link.focus());
    return link;
}

describe("renaming a library folder", () => {
    it("opens with F2, saves with Enter and shows the new name at once", async () => {
        const calls = mockLibrary([anime, movies]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);
        await focusFolder("Anime 2019");

        await user.keyboard("{F2}");
        const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Folder name" });
        expect(field).toHaveFocus();
        expect(field).toHaveValue("Anime 2019");
        expect([field.selectionStart, field.selectionEnd]).toEqual([0, "Anime 2019".length]);
        expect(field).toHaveAttribute("placeholder", "Anime 2019");

        await user.keyboard("Anime{Enter}");
        const link = screen.getByRole("link", { name: "Anime" });
        expect(link).toHaveFocus();
        expect(callsOf(calls, "rename_library_folder")).toEqual([{ path: "D:\\Anime 2019", name: "Anime" }]);
    });

    it("cancels with Esc without saving", async () => {
        const calls = mockLibrary([anime]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);
        await focusFolder("Anime 2019");

        await user.keyboard("{F2}Other{Escape}");
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Anime 2019" })).toHaveFocus();
        expect(callsOf(calls, "rename_library_folder")).toEqual([]);
    });

    it("saves when clicking outside, and not at all when nothing changed", async () => {
        const calls = mockLibrary([anime]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);
        await focusFolder("Anime 2019");

        await user.keyboard("{F2}");
        await user.click(document.body);
        expect(callsOf(calls, "rename_library_folder")).toEqual([]);

        await focusFolder("Anime 2019");
        await user.keyboard("{F2}My anime");
        await user.click(document.body);
        expect(await screen.findByRole("link", { name: "My anime" })).toBeInTheDocument();
        expect(callsOf(calls, "rename_library_folder")).toEqual([{ path: "D:\\Anime 2019", name: "My anime" }]);
    });

    it("goes back to the folder name when emptied or reset from the menu", async () => {
        const calls = mockLibrary([{ ...anime, name: "Anime", customName: "Anime" }]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);
        await focusFolder("Anime");

        await user.keyboard("{F2}{Backspace}{Enter}");
        expect(await screen.findByRole("link", { name: "Anime 2019" })).toBeInTheDocument();
        expect(callsOf(calls, "rename_library_folder")).toEqual([{ path: "D:\\Anime 2019", name: "" }]);

        // Without a custom name there is nothing to reset.
        fireEvent.contextMenu(screen.getByRole("link", { name: "Anime 2019" }));
        expect(await screen.findByRole("menuitem", { name: /Rename/ })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Reset to folder name" })).not.toBeInTheDocument();
    });

    it("renames and resets from the context menu", async () => {
        const calls = mockLibrary([{ ...anime, name: "Anime", customName: "Anime" }]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: "Anime" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: /Rename/ }));
        const field = await screen.findByRole("textbox", { name: "Folder name" });
        await waitFor(() => expect(field).toHaveFocus());
        await user.keyboard("Shows{Enter}");
        expect(await screen.findByRole("link", { name: "Shows" })).toBeInTheDocument();

        fireEvent.contextMenu(screen.getByRole("link", { name: "Shows" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Reset to folder name" }));
        expect(await screen.findByRole("link", { name: "Anime 2019" })).toBeInTheDocument();
        expect(callsOf(calls, "rename_library_folder")).toEqual([
            { path: "D:\\Anime 2019", name: "Shows" },
            { path: "D:\\Anime 2019", name: "" },
        ]);
    });

    it("puts the name back and says why when it cannot be saved", async () => {
        mockLibrary([anime], { fail: true });
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);
        await focusFolder("Anime 2019");

        await user.keyboard("{F2}Too long{Enter}");
        expect(await screen.findByText("Could not rename the folder")).toBeInTheDocument();
        expect(screen.getByText("folder names can have at most 100 characters")).toBeInTheDocument();
        expect(await screen.findByRole("link", { name: "Anime 2019" })).toBeInTheDocument();
    });

    it("tells which folder a custom name is on disk", async () => {
        mockLibrary([{ ...anime, name: "Anime", customName: "Anime" }]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.hover(await screen.findByRole("link", { name: "Anime" }));
        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("Folder: Anime 2019");
        expect(tooltip).toHaveTextContent("D:\\Anime 2019");
    });

    // Regression: the popover opened while the context menu still held the focus, which pulled it back and closed it.
    it("keeps the popover open when Rename is chosen from the context menu of the rail", async () => {
        const calls = mockLibrary([anime]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} compact />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: "Anime 2019" }));
        await user.click(await screen.findByRole("menuitem", { name: /Rename/ }));
        const field = await screen.findByRole("textbox", { name: "Folder name" });
        await waitFor(() => expect(field).toHaveFocus());
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveFocus();

        await user.keyboard("Anime{Enter}");
        expect(await screen.findByRole("link", { name: "Anime" })).toBeInTheDocument();
        expect(callsOf(calls, "rename_library_folder")).toEqual([{ path: "D:\\Anime 2019", name: "Anime" }]);
    });

    it("renames in a popover from the collapsed sidebar", async () => {
        const calls = mockLibrary([anime, movies]);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} compact />);
        await focusFolder("Anime 2019");

        await user.keyboard("{F2}");
        const field = await screen.findByRole("textbox", { name: "Folder name" });
        await waitFor(() => expect(field).toHaveFocus());
        expect(field).toHaveAccessibleDescription("Folder on disk: Anime 2019. Leave empty to use it.");
        await user.keyboard("Anime{Enter}");
        await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
        expect(screen.getByRole("link", { name: "Anime" })).toHaveFocus();

        // A click outside saves too.
        await focusFolder("Movies");
        await user.keyboard("{F2}");
        await waitFor(() => expect(screen.getByRole("textbox", { name: "Folder name" })).toHaveFocus());
        await user.keyboard("Films");
        await user.click(document.body);
        expect(await screen.findByRole("link", { name: "Films" })).toBeInTheDocument();
        expect(callsOf(calls, "rename_library_folder")).toEqual([
            { path: "D:\\Anime 2019", name: "Anime" },
            { path: "D:\\Movies", name: "Films" },
        ]);
    });
});
