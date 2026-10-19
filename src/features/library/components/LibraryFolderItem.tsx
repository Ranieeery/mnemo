import { Link, useNavigate } from "@tanstack/react-router";
import { Palette, RefreshCw, Trash2, Unplug } from "lucide-react";
import { useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { useLibraryFolderStatus } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { isWithin } from "../../../shared/lib/paths";
import { processFolder, useProcessingStore } from "../../../shared/stores/processing";
import {
    ConfirmDialog,
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
    FolderIcon,
    Spinner,
    Tooltip,
} from "../../../shared/ui";
import { useRemoveLibraryFolder } from "../queries";
import { ChangeIconDialog } from "./ChangeIconDialog";

type LibraryFolderItemProps = {
    folder: LibraryFolder;
    /** Path of the folder being browsed, to highlight the library folder that contains it. */
    currentPath: string | undefined;
    /** Only the icon shows (the collapsed sidebar); the name moves to a tooltip and the status to a corner badge. */
    compact?: boolean;
};

export function LibraryFolderItem({ folder, currentPath, compact = false }: LibraryFolderItemProps) {
    const navigate = useNavigate();
    const removeFolder = useRemoveLibraryFolder();
    const processing = useProcessingStore((state) =>
        state.status.jobs.some((job) => isWithin(job.folder, folder.path))
    );
    const unavailable = useLibraryFolderStatus(folder.path)?.watch === "unavailable";
    const [iconOpen, setIconOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const active = currentPath !== undefined && isWithin(currentPath, folder.path);

    const statusIcon = (className?: string) =>
        cx("size-3.5 shrink-0", compact && "absolute top-0.5 right-0.5", className);
    const trigger = (
        <ContextMenuTrigger asChild>
            <Link
                to="/folder"
                search={{ path: folder.path }}
                aria-current={active ? "page" : undefined}
                className={cx(
                    "flex h-9 items-center gap-2.5 rounded-control text-body",
                    "transition-colors duration-(--duration-fast) ease-standard",
                    compact ? "relative w-10 justify-center" : "px-2.5",
                    active && "bg-surface-raised font-medium text-text",
                    !active && "hover:bg-surface-hover hover:text-text",
                    !active && (unavailable ? "text-text-subtle" : "text-text-muted")
                )}
            >
                <FolderIcon name={folder.customIcon} />
                <span
                    className={compact ? "sr-only" : "min-w-0 flex-1 truncate"}
                    title={compact ? undefined : unavailable ? `${folder.path} (not connected)` : folder.path}
                >
                    {folder.name}
                    {unavailable && <span className="sr-only">, not connected</span>}
                </span>
                {unavailable && <Unplug aria-hidden className={statusIcon("text-warning")} />}
                {processing && <Spinner label={`Reading videos in ${folder.name}`} className={statusIcon()} />}
            </Link>
        </ContextMenuTrigger>
    );

    return (
        <li>
            <ContextMenu>
                {compact ? (
                    <Tooltip content={unavailable ? `${folder.name} (not connected)` : folder.name} side="right">
                        {trigger}
                    </Tooltip>
                ) : (
                    trigger
                )}
                <ContextMenuContent>
                    <ContextMenuItem
                        icon={<RefreshCw />}
                        onSelect={() => processFolder(folder.path, { force: true, report: true })}
                    >
                        Sync folder
                    </ContextMenuItem>
                    <ContextMenuItem icon={<Palette />} onSelect={() => setIconOpen(true)}>
                        Change icon
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem icon={<Trash2 />} tone="danger" onSelect={() => setRemoveOpen(true)}>
                        Remove from library
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {iconOpen && <ChangeIconDialog folder={folder} open={iconOpen} onOpenChange={setIconOpen} />}
            <ConfirmDialog
                open={removeOpen}
                onOpenChange={setRemoveOpen}
                title={`Remove ${folder.name} from the library?`}
                description="Its videos, tags and watch history are removed from Mnemo. Files on disk are not touched."
                confirmLabel="Remove folder"
                tone="danger"
                onConfirm={async () => {
                    await removeFolder.mutateAsync(folder);
                    if (active) {
                        await navigate({ to: "/" });
                    }
                }}
            />
        </li>
    );
}
