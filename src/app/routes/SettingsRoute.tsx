import { getRouteApi } from "@tanstack/react-router";
import { LibraryFoldersPanel } from "../../features/library";
import { SettingsPage } from "../../features/settings";
import { ShortcutsSettings } from "../../features/shortcuts";
import { TagManager } from "../../features/tags";

const route = getRouteApi("/shell/settings");

export function SettingsRoute() {
    const { tab = "library" } = route.useSearch();
    const navigate = route.useNavigate();
    return (
        <SettingsPage
            tab={tab}
            // Switching tabs replaces the entry: back leaves Settings rather than walking through its tabs.
            onTabChange={(next) => navigate({ search: { tab: next === "library" ? undefined : next }, replace: true })}
            foldersPanel={<LibraryFoldersPanel />}
            shortcuts={<ShortcutsSettings />}
            tagManager={<TagManager />}
        />
    );
}
