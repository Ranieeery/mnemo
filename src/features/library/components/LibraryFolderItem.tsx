import { Link, useNavigate } from "@tanstack/react-router";
import { Palette, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
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
} from "../../../shared/ui";
import { useRemoveLibraryFolder } from "../queries";
import { ChangeIconDialog } from "./ChangeIconDialog";

type LibraryFolderItemProps = {
    folder: LibraryFolder;
    /** Path of the folder being browsed, to highlight the library folder that contains it. */
    currentPath: string | undefined;
};

export function LibraryFolderItem({ folder, currentPath }: LibraryFolderItemProps) {
    const navigate = useNavigate();
    const removeFolder = useRemoveLibraryFolder();
    const processing = useProcessingStore((state) => state.job !== null && isWithin(state.job.folder, folder.path));
    const [iconOpen, setIconOpen] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const active = currentPath !== undefined && isWithin(currentPath, folder.path);

    return (
        <li>
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <Link
                        to="/folder"
                        search={{ path: folder.path }}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                            "flex h-9 items-center gap-2.5 rounded-control px-2.5 text-body",
                            "transition-colors duration-(--duration-fast) ease-standard",
                            active
                                ? "bg-surface-raised font-medium text-text"
                                : "text-text-muted hover:bg-surface-hover hover:text-text"
                        )}
                    >
                        <FolderIcon name={folder.customIcon} />
                        <span className="min-w-0 flex-1 truncate" title={folder.path}>
                            {folder.name}
                        </span>
                        {processing && <Spinner label={`Reading videos in ${folder.name}`} className="size-3.5" />}
                    </Link>
                </ContextMenuTrigger>
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
