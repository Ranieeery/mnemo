import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PLAYABLE_COPY_SETTINGS } from "../../shared/ipc/bindings";
import { libraryFolderFixture, videoFixture } from "../../shared/test/fixtures";
import { callsOf, commandError, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { SettingsPage, type SettingsTab } from "./components/SettingsPage";

const GB = 1024 ** 3;

function mockSettings(extra: Record<string, unknown> = {}) {
    return mockCommands({
        get_library_stats: {
            totalVideos: 40,
            watchedVideos: 10,
            totalDurationSeconds: 7200,
            totalTags: 3,
            totalFolders: 2,
            orphanedVideos: 1,
        },
        list_library_folders: [libraryFolderFixture()],
        get_settings: { watchedThreshold: 0.9, watchFolders: true },
        get_database_info: {
            path: "C:\\Users\\me\\AppData\\Roaming\\com.mnemo\\mnemo.db",
            sizeBytes: 233_472,
            schemaVersion: 2,
        },
        list_orphaned_videos: [videoFixture({ filePath: "E:\\Old\\gone.mkv" })],
        list_missing_videos: { videos: [videoFixture({ filePath: "D:\\Series\\deleted.mkv" })], hiddenCount: 0 },
        get_update_status: { automatic: true, lastCheckedMs: null, running: "2.6.0", available: null },
        get_playable_copy_settings: DEFAULT_PLAYABLE_COPY_SETTINGS,
        get_playable_copies_usage: { usedBytes: 1.5 * GB, limitBytes: 5 * GB, count: 2 },
        ...extra,
    });
}

/** Settings with its tab kept in state, as the route keeps it in the URL. */
function Settings() {
    const [tab, setTab] = useState<SettingsTab>("library");
    return (
        <SettingsPage
            tab={tab}
            onTabChange={setTab}
            foldersPanel={<p>Folders panel</p>}
            shortcuts={<p>Shortcut list</p>}
            tagManager={<p>Tag manager</p>}
        />
    );
}

function renderSettings() {
    return renderScreen(<Settings />);
}

/** The one-sentence library summary, found by its start since its numbers sit in their own elements. */
function findSummary() {
    return screen.findByText(
        (_, element) => element?.tagName === "P" && /^[\d,]+ videos? in/.test(element.textContent)
    );
}

describe("SettingsPage", () => {
    it("shows the library statistics and the composed folder panel", async () => {
        mockSettings();
        renderSettings();
        const summary = await findSummary();
        expect(summary).toHaveTextContent("40 videos in 2 folders · 2 h in total · 10 watched (25%) · 3 tags");
        expect(screen.getByText("Folders panel")).toBeInTheDocument();
    });

    it("sums up a large library with thousands separators and singular nouns", async () => {
        mockSettings({
            get_library_stats: {
                totalVideos: 1296,
                watchedVideos: 1,
                totalDurationSeconds: 1_584_978,
                totalTags: 1,
                totalFolders: 1,
                orphanedVideos: 0,
            },
        });
        renderSettings();
        const summary = await findSummary();
        expect(summary).toHaveTextContent("1,296 videos in 1 folder · 440 h 16 min in total · 1 watched (0%) · 1 tag");
    });

    it("leaves duration and watched out of the summary of an empty library", async () => {
        mockSettings({
            get_library_stats: {
                totalVideos: 0,
                watchedVideos: 0,
                totalDurationSeconds: 0,
                totalTags: 0,
                totalFolders: 0,
                orphanedVideos: 0,
            },
        });
        renderSettings();
        const summary = await findSummary();
        expect(summary).toHaveTextContent(/^0 videos in 0 folders · 0 tags$/);
    });

    it("resets the watch status after confirmation, keeping tags", async () => {
        const calls = mockSettings({ reset_all_watch_status: 10 });
        const { user } = renderSettings();
        await user.click(await screen.findByRole("button", { name: "Reset" }));
        const dialog = await screen.findByRole("alertdialog", { name: "Mark every video as unwatched?" });
        await user.click(within(dialog).getByRole("button", { name: "Reset watch status" }));
        expect(await screen.findByText("Cleared the watch status of 10 videos")).toBeInTheDocument();
        expect(callsOf(calls, "reset_all_watch_status")).toHaveLength(1);
    });

    it("imports a library file only after confirming the replacement", async () => {
        const calls = mockSettings({
            "plugin:dialog|open": "D:\\Backups\\library.json",
            import_library: { folders: 1, videos: 339, tags: 0 },
        });
        const { user } = renderSettings();
        await user.click(await screen.findByRole("button", { name: "Import" }));
        const dialog = await screen.findByRole("alertdialog", { name: "Replace your library with this file?" });
        expect(callsOf(calls, "import_library")).toEqual([]);
        await user.click(within(dialog).getByRole("button", { name: "Replace library" }));
        expect(await screen.findByText("Library imported")).toBeInTheDocument();
        expect(callsOf(calls, "import_library")).toEqual([{ path: "D:\\Backups\\library.json" }]);
    });

    it("names the export after the local day, near midnight too", async () => {
        const calls = mockSettings({ "plugin:dialog|save": null });
        const { user } = renderSettings();
        const exportButton = await screen.findByRole("button", { name: "Export" });
        // Outside UTC, one of these times falls on another UTC day.
        vi.useFakeTimers({ toFake: ["Date"] });
        try {
            for (const time of [new Date(2026, 9, 21, 0, 30), new Date(2026, 9, 21, 23, 30)]) {
                vi.setSystemTime(time);
                await user.click(exportButton);
            }
        } finally {
            vi.useRealTimers();
        }
        await waitFor(() => expect(callsOf(calls, "plugin:dialog|save")).toHaveLength(2));
        for (const args of callsOf(calls, "plugin:dialog|save")) {
            expect(args).toMatchObject({ options: { defaultPath: "mnemo-library-2026-10-21.json" } });
        }
    });

    it("saves the watched threshold when the slider is released", async () => {
        const calls = mockSettings({ update_settings: { watchedThreshold: 0.85, watchFolders: true } });
        const { user } = renderSettings();
        await user.click(await screen.findByRole("tab", { name: "Playback" }));
        const slider = await screen.findByRole("slider", { name: "Watched threshold" });
        expect(slider).toHaveAttribute("aria-valuenow", "90");
        // Regression: a default `w-full` overrode the given width and collapsed the slider inside the settings row.
        expect(slider.closest(".touch-none")).toHaveClass("w-48");
        expect(slider.closest(".touch-none")).not.toHaveClass("w-full");

        slider.focus();
        fireEvent.keyDown(slider, { key: "ArrowLeft" });
        await waitFor(() =>
            expect(callsOf(calls, "update_settings")).toEqual([
                { settings: { watchedThreshold: 0.85, watchFolders: true } },
            ])
        );
    });

    it("shows the saved threshold again when saving it fails", async () => {
        mockSettings({
            update_settings: () => {
                throw commandError("database", "database is locked");
            },
        });
        const { user } = renderSettings();
        await user.click(await screen.findByRole("tab", { name: "Playback" }));
        const slider = await screen.findByRole("slider", { name: "Watched threshold" });

        slider.focus();
        fireEvent.keyDown(slider, { key: "ArrowLeft" });
        expect(await screen.findByText("Could not save the setting")).toBeInTheDocument();
        await waitFor(() => expect(slider).toHaveAttribute("aria-valuenow", "90"));
    });

    describe("playable copies", () => {
        it("chooses whether to make copies, keeping the limit", async () => {
            const calls = mockSettings({
                update_playable_copy_settings: ({ settings }: Record<string, unknown>) => settings,
            });
            const { user } = renderSettings();
            await user.click(await screen.findByRole("tab", { name: "Playback" }));
            const modes = await screen.findByRole("group", { name: "Make playable copies" });
            expect(within(modes).getByRole("button", { name: "Ask" })).toHaveAttribute("aria-pressed", "true");

            await user.click(within(modes).getByRole("button", { name: "Always" }));
            await waitFor(() =>
                expect(callsOf(calls, "update_playable_copy_settings")).toEqual([
                    { settings: { mode: "always", limitGb: 5 } },
                ])
            );
            expect(within(modes).getByRole("button", { name: "Always" })).toHaveAttribute("aria-pressed", "true");
        });

        it("saves the disk limit when the slider is released and reads the usage again", async () => {
            const calls = mockSettings({
                update_playable_copy_settings: ({ settings }: Record<string, unknown>) => settings,
            });
            const { user } = renderSettings();
            await user.click(await screen.findByRole("tab", { name: "Playback" }));
            const slider = await screen.findByRole("slider", { name: "Disk space for playable copies" });
            expect(slider).toHaveAttribute("aria-valuetext", "5 GB");

            slider.focus();
            fireEvent.keyDown(slider, { key: "ArrowRight" });
            await waitFor(() =>
                expect(callsOf(calls, "update_playable_copy_settings")).toEqual([
                    { settings: { mode: "ask", limitGb: 6 } },
                ])
            );
            await waitFor(() => expect(callsOf(calls, "get_playable_copies_usage")).toHaveLength(2));
        });

        it("shows the disk usage and clears the copies", async () => {
            const calls = mockSettings({ clear_playable_copies: { freedBytes: 1.5 * GB, kept: 0 } });
            const { user } = renderSettings();
            await user.click(await screen.findByRole("tab", { name: "Playback" }));
            expect(await screen.findByText(/^1\.5 GB of 5\.0 GB used by 2 copies\./)).toBeInTheDocument();

            await user.click(screen.getByRole("button", { name: "Clear copies" }));
            expect(await screen.findByText("Freed 1.5 GB")).toBeInTheDocument();
            expect(callsOf(calls, "clear_playable_copies")).toHaveLength(1);
        });

        it("says when the copy open in the player was kept", async () => {
            mockSettings({ clear_playable_copies: { freedBytes: 0, kept: 1 } });
            const { user } = renderSettings();
            await user.click(await screen.findByRole("tab", { name: "Playback" }));
            await user.click(await screen.findByRole("button", { name: "Clear copies" }));
            expect(await screen.findByText("The copy open in the player was kept.")).toBeInTheDocument();
        });
    });

    it("turns folder watching off, keeping the other settings", async () => {
        const calls = mockSettings({ update_settings: { watchedThreshold: 0.9, watchFolders: false } });
        const { user } = renderSettings();
        const toggle = await screen.findByRole("switch", { name: "Watch folders for changes" });
        expect(toggle).toBeChecked();
        await user.click(toggle);
        await waitFor(() =>
            expect(callsOf(calls, "update_settings")).toEqual([
                { settings: { watchedThreshold: 0.9, watchFolders: false } },
            ])
        );
    });

    // Regression: a failed read hid the switch without saying why.
    it("offers to try again when the watch setting cannot be read", async () => {
        mockSettings({
            get_settings: () => {
                throw commandError("database", "database is locked");
            },
        });
        renderSettings();
        expect(await screen.findByText("Could not load the settings")).toBeInTheDocument();
        expect(screen.getByText("database is locked")).toBeInTheDocument();
        expect(screen.queryByRole("switch", { name: "Watch folders for changes" })).not.toBeInTheDocument();
    });

    it("lists videos whose file is missing and removes them after confirmation", async () => {
        const calls = mockSettings({ clean_missing_videos: 1 });
        const { user } = renderSettings();
        await user.click(await screen.findByRole("tab", { name: "Maintenance" }));
        expect(await screen.findByText("D:\\Series\\deleted.mkv")).toBeInTheDocument();
        expect(screen.getByText(/1 video can no longer be found on disk/)).toBeInTheDocument();

        const [cleanMissing] = screen.getAllByRole("button", { name: "Clean up" });
        await user.click(cleanMissing as HTMLElement);
        const dialog = await screen.findByRole("alertdialog", { name: "Remove 1 missing video?" });
        await user.click(within(dialog).getByRole("button", { name: "Remove videos" }));
        expect(await screen.findByText("Removed 1 missing video")).toBeInTheDocument();
        expect(callsOf(calls, "clean_missing_videos")).toHaveLength(1);
    });

    it("only counts the missing videos of hidden folders, and cleans them up too", async () => {
        mockSettings({
            list_missing_videos: { videos: [videoFixture({ filePath: "D:\\Series\\deleted.mkv" })], hiddenCount: 2 },
        });
        const { user } = renderSettings();
        await user.click(await screen.findByRole("tab", { name: "Maintenance" }));
        expect(await screen.findByText("+ 2 videos in hidden folders")).toBeInTheDocument();
        expect(screen.getByText(/3 videos can no longer be found on disk/)).toBeInTheDocument();

        const [cleanMissing] = screen.getAllByRole("button", { name: "Clean up" });
        await user.click(cleanMissing as HTMLElement);
        expect(await screen.findByRole("alertdialog", { name: "Remove 3 missing videos?" })).toBeInTheDocument();
    });

    it("lists orphaned videos and the database details", async () => {
        mockSettings();
        const { user } = renderSettings();
        await user.click(await screen.findByRole("tab", { name: "Maintenance" }));
        expect(await screen.findByText("E:\\Old\\gone.mkv")).toBeInTheDocument();
        expect(screen.getByText("228.0 KB")).toBeInTheDocument();
        expect(screen.queryByText(/rows/)).not.toBeInTheDocument();
    });
});
