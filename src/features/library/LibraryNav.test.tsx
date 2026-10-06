import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { LibraryNav } from "./components/LibraryNav";

const series = libraryFolderFixture({ id: 1, path: "D:\\Series", name: "Series", customIcon: "tv" });
const movies = libraryFolderFixture({ id: 2, path: "D:\\Movies", name: "Movies" });

describe("LibraryNav", () => {
    it("lists the folders and highlights the one being browsed", async () => {
        mockCommands({ list_library_folders: [series, movies] });
        renderScreen(<LibraryNav currentPath={"D:\\Series\\Show"} />);

        const current = await screen.findByRole("link", { name: /Series/ });
        expect(current).toHaveAttribute("aria-current", "page");
        expect(current.querySelector("svg")).toHaveClass("lucide-tv");
        expect(screen.getByRole("link", { name: "Movies" })).not.toHaveAttribute("aria-current");
    });

    it("removes a folder after confirmation", async () => {
        const calls = mockCommands({ list_library_folders: [series], remove_library_folder: 42 });
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: /Series/ }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Remove from library" }));
        const dialog = await screen.findByRole("alertdialog", { name: "Remove Series from the library?" });
        expect(dialog).toHaveTextContent("Files on disk are not touched");
        await user.click(within(dialog).getByRole("button", { name: "Remove folder" }));

        expect(await screen.findByText("Removed Series")).toBeInTheDocument();
        expect(callsOf(calls, "remove_library_folder")).toEqual([{ path: "D:\\Series" }]);
    });

    it("syncs a folder and reports what was found", async () => {
        const calls = mockCommands({
            list_library_folders: [series],
            process_folder: { processed: 3, skipped: 40, failed: 0 },
        });
        renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: /Series/ }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Sync folder" }));

        expect(await screen.findByText("Added 3 new videos")).toBeInTheDocument();
        await waitFor(() => expect(callsOf(calls, "process_folder")).toHaveLength(1));
    });

    it("changes the icon of a folder", async () => {
        const calls = mockCommands({ list_library_folders: [movies], set_library_folder_icon: null });
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: "Movies" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Change icon" }));
        await user.click(await screen.findByRole("radio", { name: "popcorn" }));
        await user.click(screen.getByRole("button", { name: "Save icon" }));

        await waitFor(() =>
            expect(callsOf(calls, "set_library_folder_icon")).toEqual([{ path: "D:\\Movies", icon: "popcorn" }])
        );
    });
});
