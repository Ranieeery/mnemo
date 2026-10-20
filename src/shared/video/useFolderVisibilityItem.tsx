import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { useFolderVisibility, useSetFolderHidden } from "./folderVisibility";

type VisibilityItem = { icon: ReactNode; label: string; disabled: boolean; onSelect: () => void };

/**
 * The menu item that hides a folder from the home page and the history, or shows it again, for any folder menu
 * (context or dropdown). Inside a hidden folder it is disabled and names that folder.
 */
export function useFolderVisibilityItem(target: { path: string; name: string }): VisibilityItem {
    const visibility = useFolderVisibility(target.path);
    const setHidden = useSetFolderHidden();
    if (visibility.kind === "insideHidden") {
        return {
            icon: <EyeOff />,
            label: `Hidden with “${visibility.folder.name}”`,
            disabled: true,
            onSelect: () => {},
        };
    }
    const hidden = visibility.kind === "hidden";
    return {
        icon: hidden ? <Eye /> : <EyeOff />,
        label: hidden ? "Show on home and history" : "Hide from home and history",
        disabled: setHidden.isPending,
        onSelect: () => setHidden.mutate({ ...target, hidden: !hidden }),
    };
}
