import { EyeOff, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LibraryFolder } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import {
    useHiddenFolders,
    useLibraryFolderStatuses,
    useLibraryFolders,
    useLibraryLayout,
} from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { processFolder } from "../../../shared/stores/processing";
import { Badge, Card, ConfirmDialog, ErrorState, FolderIcon, IconButton, Skeleton } from "../../../shared/ui";
import { folderVisibility, HiddenFolderMark } from "../../../shared/video";
import { groupsOf } from "../lib/folderLayout";
import { useRemoveLibraryFolder } from "../queries";
import { FolderWatchStatus } from "./FolderWatchStatus";
import { AddFolderButton } from "./LibraryNav";

/** The library folders with their full paths, for Settings. */
export function LibraryFoldersPanel() {
    const folders = useLibraryFolders();
    const statuses = useLibraryFolderStatuses();
    const hiddenFolders = useHiddenFolders();
    const groups = groupsOf(useLibraryLayout().data ?? []);
    const groupName = (folder: LibraryFolder) => groups.find((group) => group.id === folder.groupId)?.name;
    const removeFolder = useRemoveLibraryFolder();
    const [removing, setRemoving] = useState<LibraryFolder | null>(null);
    const watchingOff = statuses.data?.some((status) => status.watch === "off") ?? false;

    return (
        <Card>
            <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex flex-col gap-0.5">
                    <h3 className="text-body font-medium text-text">Library folders</h3>
                    <p className="text-small text-text-muted">
                        Folders are shown as they are on disk; nothing is moved.
                    </p>
                    {watchingOff && (
                        <p className="flex items-center gap-1.5 text-caption text-text-muted">
                            <EyeOff aria-hidden className="size-3.5 shrink-0" />
                            Watching is off: folders are checked when Mnemo starts and when you sync.
                        </p>
                    )}
                </div>
                <AddFolderButton />
            </div>
            {folders.isPending && <Skeleton className="mx-5 mb-4 h-10" />}
            {folders.isError && (
                <ErrorState
                    title="Could not load the library folders"
                    message={errorMessage(folders.error)}
                    onRetry={() => folders.refetch()}
                />
            )}
            {folders.data?.length === 0 && (
                <p className="border-t border-border px-5 py-4 text-small text-text-subtle">
                    No folders yet. Add one to browse its videos.
                </p>
            )}
            {folders.data && folders.data.length > 0 && (
                <ul className="divide-y divide-border border-t border-border">
                    {folders.data.map((folder) => {
                        const status = statuses.data?.find((candidate) => candidate.path === folder.path);
                        const group = groupName(folder);
                        return (
                            <li
                                key={folder.id}
                                className={cx(
                                    "group flex items-center gap-3 px-5 py-3 transition-colors",
                                    "duration-(--duration-fast) ease-standard hover:bg-surface-raised"
                                )}
                            >
                                <FolderIcon
                                    name={folder.customIcon}
                                    color={folder.iconColor}
                                    className="size-5 text-text-muted"
                                />
                                <div className="flex min-w-0 flex-1 flex-col">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span
                                            className={cx(
                                                "truncate text-body",
                                                status?.watch === "unavailable" ? "text-text-muted" : "text-text"
                                            )}
                                        >
                                            {folder.name}
                                        </span>
                                        {group && (
                                            <Badge className="max-w-48 shrink-0">
                                                <span className="sr-only">Group: </span>
                                                <span className="truncate" title={group}>
                                                    {group}
                                                </span>
                                            </Badge>
                                        )}
                                        <HiddenFolderMark
                                            visibility={folderVisibility(folder.path, hiddenFolders.data ?? [])}
                                        />
                                    </span>
                                    <span className="truncate text-small text-text-subtle" title={folder.path}>
                                        {folder.path}
                                    </span>
                                    {status && <FolderWatchStatus status={status} />}
                                </div>
                                {/* Out of the way until the row is pointed at or focused; Tab still reaches them. */}
                                <div
                                    className={cx(
                                        "flex shrink-0 gap-1 opacity-0 transition-opacity duration-(--duration-fast)",
                                        "ease-standard group-focus-within:opacity-100 group-hover:opacity-100"
                                    )}
                                >
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
                                </div>
                            </li>
                        );
                    })}
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
