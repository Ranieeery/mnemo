import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui";
import { LibraryTab } from "./LibraryTab";
import { MaintenanceTab } from "./MaintenanceTab";
import { PlaybackTab } from "./PlaybackTab";

export const SETTINGS_TABS = ["library", "playback", "shortcuts", "tags", "maintenance"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: unknown): value is SettingsTab {
    return SETTINGS_TABS.some((tab) => tab === value);
}

type SettingsPageProps = {
    /** The open tab; the route keeps it in the URL so other screens can link to one. */
    tab: SettingsTab;
    onTabChange: (tab: SettingsTab) => void;
    /** Library folder management, composed in by the app. */
    foldersPanel: ReactNode;
    /** Keyboard shortcuts, composed in by the app. */
    shortcuts: ReactNode;
    /** Tag management, composed in by the app. */
    tagManager: ReactNode;
};

export function SettingsPage({ tab, onTabChange, foldersPanel, shortcuts, tagManager }: SettingsPageProps) {
    return (
        <div className="flex max-w-4xl flex-col gap-6 px-8 py-8">
            <h1 className="text-display font-semibold text-text">Settings</h1>
            <Tabs value={tab} onValueChange={(value) => isSettingsTab(value) && onTabChange(value)}>
                <TabsList>
                    <TabsTrigger value="library">Library</TabsTrigger>
                    <TabsTrigger value="playback">Playback</TabsTrigger>
                    <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
                    <TabsTrigger value="tags">Tags</TabsTrigger>
                    <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                </TabsList>
                <TabsContent value="library">
                    <LibraryTab foldersPanel={foldersPanel} />
                </TabsContent>
                <TabsContent value="playback">
                    <PlaybackTab />
                </TabsContent>
                <TabsContent value="shortcuts">{shortcuts}</TabsContent>
                <TabsContent value="tags">{tagManager}</TabsContent>
                <TabsContent value="maintenance">
                    <MaintenanceTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
