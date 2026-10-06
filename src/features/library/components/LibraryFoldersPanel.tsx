import { RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { useLibraryFolders } from "../../../shared/ipc/queries";
import { processFolder } from "../../../shared/stores/processing";
import { Card, ConfirmDialog, FolderIcon, IconButton, Skeleton } from "../../../shared/ui";
import { useRemoveLibraryFolder } from "../queries";
import { AddFolderButton } from "./LibraryNav";

/** The library folders with their full paths, for Settings. */
export function LibraryFoldersPanel() {
    const folders = useLibraryFolders();
    const removeFolder = useRemoveLibraryFolder();
    const [removing, setRemoving] = useState<LibraryFolder | null>(null);

    return (
        <Card>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-body font-medium text-text">Library folders</h3>
                    <p className="text-small text-text-muted">
                        Folders are shown as they are on disk; nothing is moved.
                    </p>
                </div>
                <AddFolderButton />
            </div>
            {folders.isPending && <Skeleton className="mx-5 mb-4 h-10" />}
            {folders.data && folders.data.length > 0 && (
                <ul className="divide-y divide-border border-t border-border">
                    {folders.data.map((folder) => (
                        <li key={folder.id} className="flex items-center gap-3 px-5 py-3">
                            <FolderIcon name={folder.customIcon} className="size-5 text-text-muted" />
                            <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-body text-text">{folder.name}</span>
                                <span className="truncate text-small text-text-subtle" title={folder.path}>
                                    {folder.path}
                                </span>
                            </div>
                            <IconButton
                                label={`Sync ${folder.name}`}
                                icon={<RefreshCw />}
                                size="sm"
                                onClick={() => processFolder(folder.path, { force: true, report: true })}
                            />
                            <IconButton
                                label={`Remove ${folder.name}`}
                                icon={<Trash2 />}
                                size="sm"
                                onClick={() => setRemoving(folder)}
                            />
                        </li>
                    ))}
                </ul>
            )}
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={`Remove ${removing?.name ?? "folder"} from the library?`}
                description="Its videos, tags and watch history are removed from Mnemo. Files on disk are not touched."
                confirmLabel="Remove folder"
                tone="danger"
                onConfirm={async () => {
                    if (removing) {
                        await removeFolder.mutateAsync(removing);
                    }
                }}
            />
        </Card>
    );
}
