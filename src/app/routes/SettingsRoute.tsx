import { LibraryFoldersPanel } from "../../features/library";
import { SettingsPage } from "../../features/settings";
import { TagManager } from "../../features/tags";

export function SettingsRoute() {
    return <SettingsPage foldersPanel={<LibraryFoldersPanel />} tagManager={<TagManager />} />;
}
