import { EyeOff } from "lucide-react";
import { cx } from "../lib/cx";
import type { FolderVisibility } from "./folderVisibility";

/** What a hidden folder's mark says, for its tooltip and screen readers. */
export function hiddenFolderLabel(visibility: FolderVisibility): string | null {
    switch (visibility.kind) {
        case "visible":
            return null;
        case "hidden":
            return "Hidden from home and history";
        case "insideHidden":
            return `Hidden from home and history with “${visibility.folder.name}”`;
    }
}

/**
 * A small eye-off icon on a hidden folder (or one inside a hidden folder). It may sit inside a link, so it explains
 * itself through the native tooltip and screen reader text rather than a focusable tooltip.
 */
export function HiddenFolderMark({ visibility, className }: { visibility: FolderVisibility; className?: string }) {
    const label = hiddenFolderLabel(visibility);
    if (!label) {
        return null;
    }
    return (
        <span title={label} className={cx("inline-flex shrink-0 text-text-subtle", className)}>
            <EyeOff aria-hidden className="size-3.5" />
            <span className="sr-only">{`, ${label.toLowerCase()}`}</span>
        </span>
    );
}
