import { emit } from "@tauri-apps/api/event";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { followProcessing, processFolder } from "../../shared/stores/processing";
import { libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { loadAllIcons } from "../../shared/ui";
import { LibraryNav } from "./components/LibraryNav";
import { MAIN_TAB_LIMIT } from "./lib/iconPicker";

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

    // Regression: a folder removed and added back in the same session was taken as already read.
    it("reads the videos of a folder added back to the library", async () => {
        const calls = mockCommands({
            list_library_folders: [],
            process_folders: null,
            add_library_folder: series,
            "plugin:dialog|open": series.path,
        });
        await processFolder(series.path);
        const { user } = renderScreen(<LibraryNav currentPath={undefined} />);

        await user.click(await screen.findByRole("button", { name: "Add folder" }));
        expect(await screen.findByText("Added Series")).toBeInTheDocument();
        await waitFor(() => expect(callsOf(calls, "process_folders")).toHaveLength(2));
    });

    it("syncs a folder, shows it is being read and reports what was found", async () => {
        const calls = mockCommands({
            list_library_folders: [series],
            process_folders: null,
            get_processing_status: { jobs: [], inFlight: [], cancelling: false, errors: [] },
        });
        const stop = followProcessing();
        renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: /Series/ }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Sync folder" }));
        await waitFor(() =>
            expect(callsOf(calls, "process_folders")).toEqual([{ paths: [series.path], report: true }])
        );

        await act(() =>
            emit("processing-status-changed", {
                jobs: [{ folder: series.path, scanning: false, total: 3, done: 1, failed: 0 }],
                inFlight: [],
                cancelling: false,
                errors: [],
            })
        );
        expect(await screen.findByRole("status", { name: "Reading videos in Series" })).toBeInTheDocument();

        await act(() =>
            emit("processing-finished", {
                folder: series.path,
                summary: { processed: 3, skipped: 40, failed: 0 },
                cancelled: false,
                missingTool: false,
                error: null,
                removed: false,
                report: true,
            })
        );
        expect(await screen.findByText("Added 3 new videos to Series")).toBeInTheDocument();
        stop();
    });

    async function openIconDialog(recent: string[] = []) {
        const calls = mockCommands({
            list_library_folders: [movies],
            recent_folder_icons: recent,
            set_library_folder_icon: null,
        });
        const rendered = renderScreen(<LibraryNav currentPath={undefined} />);
        fireEvent.contextMenu(await screen.findByRole("link", { name: "Movies" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Change icon" }));
        return { calls, ...rendered, dialog: await screen.findByRole("dialog", { name: "Icon for Movies" }) };
    }

    async function openAllIcons(user: UserEvent, dialog: HTMLElement) {
        // In tests React only retries a suspended render inside act().
        await act(async () => {
            await user.click(within(dialog).getByRole("tab", { name: "All icons" }));
            await loadAllIcons();
        });
        return within(dialog).findByRole("searchbox", { name: "Search icons" });
    }

    it("changes the icon of a folder", async () => {
        const { calls, user } = await openIconDialog();
        await user.click(await screen.findByRole("radio", { name: "popcorn" }));
        await user.click(screen.getByRole("button", { name: "Save icon" }));

        await waitFor(() =>
            expect(callsOf(calls, "set_library_folder_icon")).toEqual([{ path: "D:\\Movies", icon: "popcorn" }])
        );
    });

    it("offers recently used icons first and keeps the first tab short", async () => {
        const { dialog } = await openIconDialog(["zodiac-pisces", "film"]);
        const recent = await within(dialog).findByRole("radiogroup", { name: "Recently used" });
        expect(
            within(recent)
                .getAllByRole("radio")
                .map((radio) => radio.getAttribute("aria-label"))
        ).toEqual(["zodiac pisces", "film"]);
        const suggested = within(dialog).getByRole("radiogroup", { name: "Suggested" });
        expect(within(suggested).queryByRole("radio", { name: "film" })).not.toBeInTheDocument();
        expect(within(dialog).getAllByRole("radio")).toHaveLength(MAIN_TAB_LIMIT);
    });

    it("searches every icon and saves one outside the suggestions", async () => {
        const { calls, user, dialog } = await openIconDialog();
        await user.type(await openAllIcons(user, dialog), "zodiac pis");
        await user.click(within(dialog).getByRole("radio", { name: "zodiac pisces" }));
        await user.click(screen.getByRole("button", { name: "Save icon" }));

        await waitFor(() =>
            expect(callsOf(calls, "set_library_folder_icon")).toEqual([{ path: "D:\\Movies", icon: "zodiac-pisces" }])
        );
    });

    it("explains when no icon matches the search", async () => {
        const { user, dialog } = await openIconDialog();
        await user.type(await openAllIcons(user, dialog), "qqqq");
        expect(within(dialog).getByText(/No icon is called “qqqq”/)).toBeInTheDocument();
    });
});
