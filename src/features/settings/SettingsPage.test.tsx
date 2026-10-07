import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { libraryFolderFixture, videoFixture } from "../../shared/test/fixtures";
import { callsOf, mockCommands } from "../../shared/test/ipc";
import { renderScreen } from "../../shared/test/render";
import { SettingsPage, type SettingsTab } from "./components/SettingsPage";

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
        list_missing_videos: [videoFixture({ filePath: "D:\\Series\\deleted.mkv" })],
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

describe("SettingsPage", () => {
    it("shows the library statistics and the composed folder panel", async () => {
        mockSettings();
        renderSettings();
        expect(await screen.findByText("10 (25%)")).toBeInTheDocument();
        expect(screen.getByText("2:00:00")).toBeInTheDocument();
        expect(screen.getByText("Folders panel")).toBeInTheDocument();
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

    it("lists orphaned videos and the database details", async () => {
        mockSettings();
        const { user } = renderSettings();
        await user.click(await screen.findByRole("tab", { name: "Maintenance" }));
        expect(await screen.findByText("E:\\Old\\gone.mkv")).toBeInTheDocument();
        expect(screen.getByText("228.0 KB")).toBeInTheDocument();
        expect(screen.queryByText(/rows/)).not.toBeInTheDocument();
    });
});
