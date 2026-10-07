import { Clock, Eye, EyeOff, type LucideIcon, Unplug } from "lucide-react";
import type { FolderWatch, LibraryFolderStatus } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";

const DESCRIPTIONS: Record<FolderWatch, { icon: LucideIcon; label: string }> = {
    watching: { icon: Eye, label: "Watching for changes" },
    polling: { icon: Clock, label: "Checked every 10 minutes" },
    off: { icon: EyeOff, label: "Checked when Mnemo starts and when you sync" },
    unavailable: { icon: Unplug, label: "Not connected. Its videos and progress are kept until it is back." },
};

/** How a library folder is kept in step with the disk, for the folder list in Settings. */
export function FolderWatchStatus({ status }: { status: LibraryFolderStatus }) {
    const { icon: Icon, label } = DESCRIPTIONS[status.watch];
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
