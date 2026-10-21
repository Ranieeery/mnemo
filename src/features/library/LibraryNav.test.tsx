import { emit } from "@tauri-apps/api/event";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FOLDER_COLORS } from "../../shared/ipc/bindings";
import { capitalize } from "../../shared/lib/capitalize";
import { useDialogStore } from "../../shared/stores/dialogs";
import { followProcessing, processFolder } from "../../shared/stores/processing";
import { libraryCommandsFixture, libraryFolderFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { loadAllIcons } from "../../shared/ui";
import { LibraryNav } from "./components/LibraryNav";
import { MAIN_TAB_LIMIT } from "./lib/iconPicker";

const series = libraryFolderFixture({ id: 1, path: "D:\\Series", name: "Series", customIcon: "tv" });
const movies = libraryFolderFixture({ id: 2, path: "D:\\Movies", name: "Movies" });

describe("LibraryNav", () => {
    it("lists the folders and highlights the one being browsed", async () => {
        mockCommands(libraryCommandsFixture([series, movies]));
        renderScreen(<LibraryNav currentPath={"D:\\Series\\Show"} />);

        const current = await screen.findByRole("link", { name: /Series/ });
        expect(current).toHaveAttribute("aria-current", "page");
        expect(current.querySelector("svg")).toHaveClass("lucide-tv");
        expect(screen.getByRole("link", { name: "Movies" })).not.toHaveAttribute("aria-current");
    });

    it("marks a folder whose drive is not connected", async () => {
        mockCommands({
            ...libraryCommandsFixture([series, movies]),
            get_library_folder_statuses: [
                { path: series.path, watch: "unavailable", reason: null },
                { path: movies.path, watch: "watching", reason: null },
            ],
        });
        renderScreen(<LibraryNav currentPath={undefined} />);

        expect(await screen.findByRole("link", { name: "Series, not connected" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Movies" })).toBeInTheDocument();
    });

    it("offers to locate only a folder that is not connected", async () => {
        mockCommands({
            ...libraryCommandsFixture([series, movies]),
            get_library_folder_statuses: [
                { path: series.path, watch: "unavailable", reason: null },
                { path: movies.path, watch: "watching", reason: null },
            ],
        });
        renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: "Movies" }));
        expect(await screen.findByRole("menuitem", { name: "Sync folder" })).toBeInTheDocument();
        expect(screen.queryByRole("menuitem", { name: "Locate folder…" })).not.toBeInTheDocument();
        fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

        fireEvent.contextMenu(await screen.findByRole("link", { name: "Series, not connected" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Locate folder…" }));
        expect(useDialogStore.getState().folderRelocation).toBe(series.path);
    });

    it("removes a folder after confirmation", async () => {
        const calls = mockCommands({ ...libraryCommandsFixture([series]), remove_library_folder: 42 });
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
            ...libraryCommandsFixture([]),
            process_folders: [],
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
            ...libraryCommandsFixture([series]),
            process_folders: [],
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

    async function openIconDialog(recent: string[] = [], folder = movies) {
        const calls = mockCommands({
            ...libraryCommandsFixture([folder]),
            recent_folder_icons: recent,
            set_library_folder_appearance: null,
        });
        const rendered = renderScreen(<LibraryNav currentPath={undefined} />);
        fireEvent.contextMenu(await screen.findByRole("link", { name: folder.name }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Icon and color…" }));
        const dialog = await screen.findByRole("dialog", { name: `Icon and color for ${folder.name}` });
        return { calls, ...rendered, dialog };
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
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(callsOf(calls, "set_library_folder_appearance")).toEqual([
                { path: "D:\\Movies", icon: "popcorn", color: null },
            ])
        );
    });

    it("previews and saves a color for the icon, chosen with the keyboard", async () => {
        const { calls, user, dialog } = await openIconDialog();
        const colors = within(dialog).getByRole("radiogroup", { name: "Icon color" });
        const swatches = within(colors).getAllByRole("radio");
        expect(swatches.map((swatch) => swatch.getAttribute("aria-label"))).toEqual([
            "Default",
            ...FOLDER_COLORS.map(capitalize),
        ]);
        // One tab stop, on the chosen swatch.
        expect(swatches.filter((swatch) => swatch.tabIndex === 0)).toEqual([swatches[0]]);
        expect(within(colors).getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "true");

        swatches[0]?.focus();
        await user.keyboard("{ArrowRight}{ArrowRight}");
        const orange = within(colors).getByRole("radio", { name: "Orange" });
        expect(orange).toHaveAttribute("aria-checked", "true");
        expect(orange).toHaveFocus();
        await user.keyboard("{End}");
        expect(within(colors).getByRole("radio", { name: "Pink" })).toHaveAttribute("aria-checked", "true");
        await user.keyboard("{ArrowRight}");
        expect(within(colors).getByRole("radio", { name: "Default" })).toHaveAttribute("aria-checked", "true");
        await user.click(within(colors).getByRole("radio", { name: "Teal" }));

        // The preview and every icon of the grid show the chosen color before saving.
        const preview = within(dialog).getByRole("img", { name: "Preview of Movies in the sidebar" });
        expect(preview.querySelector("svg")).toHaveStyle({ color: "var(--color-folder-teal)" });
        expect(within(dialog).getByRole("radio", { name: "popcorn" })).toHaveStyle({
            color: "var(--color-folder-teal)",
        });

        await user.click(within(dialog).getByRole("button", { name: "Save" }));
        await waitFor(() =>
            expect(callsOf(calls, "set_library_folder_appearance")).toEqual([
                { path: "D:\\Movies", icon: null, color: "teal" },
            ])
        );
    });

    it("resets the icon and its color together", async () => {
        const styled = { ...movies, customIcon: "popcorn", iconColor: "violet" as const };
        const { calls, user, dialog } = await openIconDialog([], styled);
        expect(within(dialog).getByRole("radio", { name: "Violet" })).toHaveAttribute("aria-checked", "true");
        await user.click(within(dialog).getByRole("button", { name: "Reset to default" }));
        await waitFor(() =>
            expect(callsOf(calls, "set_library_folder_appearance")).toEqual([
                { path: "D:\\Movies", icon: null, color: null },
            ])
        );
    });

    it("shows a folder's color and marks the current folder without relying on it", async () => {
        mockCommands(libraryCommandsFixture([{ ...series, iconColor: "red" }, movies]));
        renderScreen(<LibraryNav currentPath={"D:\\Series"} />);
        const current = await screen.findByRole("link", { name: "Series" });
        expect(current.querySelector("svg")).toHaveStyle({ color: "var(--color-folder-red)" });
        expect(current).toHaveAttribute("aria-current", "page");
        expect(current).toHaveClass("before:bg-accent", "bg-surface-raised");
        expect(screen.getByRole("link", { name: "Movies" }).querySelector("svg")?.getAttribute("style")).toBeNull();
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
        const icons = [recent, suggested].flatMap((group) => within(group).getAllByRole("radio"));
        expect(icons).toHaveLength(MAIN_TAB_LIMIT);
    });

    it("searches every icon and saves one outside the suggestions", async () => {
        const { calls, user, dialog } = await openIconDialog();
        await user.type(await openAllIcons(user, dialog), "zodiac pis");
        await user.click(within(dialog).getByRole("radio", { name: "zodiac pisces" }));
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(callsOf(calls, "set_library_folder_appearance")).toEqual([
                { path: "D:\\Movies", icon: "zodiac-pisces", color: null },
            ])
        );
    });

    it("explains when no icon matches the search", async () => {
        const { user, dialog } = await openIconDialog();
        await user.type(await openAllIcons(user, dialog), "qqqq");
        expect(within(dialog).getByText(/No icon is called “qqqq”/)).toBeInTheDocument();
    });

    it("hides a folder from home and history, and shows it again", async () => {
        let hidden = false;
        const calls = mockCommands({
            ...libraryCommandsFixture([series, movies]),
            list_hidden_folders: () =>
                hidden ? [{ path: series.path, name: "Series", libraryFolder: series, available: true }] : [],
            set_folder_hidden: (args: { hidden: boolean }) => {
                hidden = args.hidden;
                return null;
            },
        });
        renderScreen(<LibraryNav currentPath={undefined} />);

        fireEvent.contextMenu(await screen.findByRole("link", { name: "Series" }));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Hide from home and history" }));
        expect(await screen.findByText("Series is hidden from home and history")).toBeInTheDocument();
        const marked = await screen.findByRole("link", { name: "Series, hidden from home and history" });

        fireEvent.contextMenu(marked);
        fireEvent.click(await screen.findByRole("menuitem", { name: "Show on home and history" }));
        expect(await screen.findByRole("link", { name: "Series" })).toBeInTheDocument();
        expect(callsOf(calls, "set_folder_hidden")).toEqual([
            { path: series.path, hidden: true },
            { path: series.path, hidden: false },
        ]);
    });
});
