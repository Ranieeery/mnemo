import { Clock, type LucideIcon, Unplug } from "lucide-react";
import type { FolderWatch, LibraryFolderStatus } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";

/**
 * States without an icon are the expected ones: only screen readers hear them, so the list points out just the folders
 * that need attention. With watching off, the panel says so once instead of on every row.
 */
const DESCRIPTIONS: Record<FolderWatch, { label: string; icon?: LucideIcon }> = {
    watching: { label: "Watching for changes" },
    polling: { label: "Checked every 10 minutes", icon: Clock },
    off: { label: "Checked when Mnemo starts and when you sync" },
    unavailable: { label: "Not connected. Its videos and progress are kept until it is back.", icon: Unplug },
};

/** How a library folder is kept in step with the disk, for the folder list in Settings. */
export function FolderWatchStatus({ status }: { status: LibraryFolderStatus }) {
    const { icon: Icon, label } = DESCRIPTIONS[status.watch];
    if (!Icon) {
        return <span className="sr-only">{label}</span>;
    }
    return (
        <span className="flex items-start gap-1.5 text-caption text-text-muted">
            <Icon
                aria-hidden
                className={cx("mt-0.5 size-3.5 shrink-0", status.watch === "unavailable" && "text-warning")}
            />
            <span>
                {label}
                {status.reason && <span className="text-text-subtle">: {status.reason}</span>}
            </span>
        </span>
    );
}
