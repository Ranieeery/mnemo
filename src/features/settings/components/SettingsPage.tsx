import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../shared/ui";
import { LibraryTab } from "./LibraryTab";
import { MaintenanceTab } from "./MaintenanceTab";
import { PlaybackTab } from "./PlaybackTab";

type SettingsPageProps = {
    /** Library folder management, composed in by the app. */
    foldersPanel: ReactNode;
    /** Tag management, composed in by the app. */
    tagManager: ReactNode;
};

export function SettingsPage({ foldersPanel, tagManager }: SettingsPageProps) {
    return (
        <div className="flex max-w-4xl flex-col gap-6 px-8 py-8">
            <h1 className="text-display font-semibold text-text">Settings</h1>
            <Tabs defaultValue="library">
                <TabsList>
                    <TabsTrigger value="library">Library</TabsTrigger>
                    <TabsTrigger value="playback">Playback</TabsTrigger>
                    <TabsTrigger value="tags">Tags</TabsTrigger>
                    <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
                </TabsList>
                <TabsContent value="library">
                    <LibraryTab foldersPanel={foldersPanel} />
                </TabsContent>
                <TabsContent value="playback">
                    <PlaybackTab />
                </TabsContent>
                <TabsContent value="tags">{tagManager}</TabsContent>
                <TabsContent value="maintenance">
                    <MaintenanceTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
