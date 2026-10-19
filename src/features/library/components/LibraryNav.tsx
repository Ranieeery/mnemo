import { FolderPlus, RefreshCw } from "lucide-react";
import { errorMessage } from "../../../shared/ipc/client";
import { useLibraryFolders } from "../../../shared/ipc/queries";
import { cx } from "../../../shared/lib/cx";
import { Button, IconButton, Skeleton } from "../../../shared/ui";
import { useAddLibraryFolder } from "../queries";
import { LibraryFolderItem } from "./LibraryFolderItem";

type LibraryNavProps = {
    currentPath: string | undefined;
    /** Icons only, for the collapsed sidebar: names and messages move to tooltips and screen reader text. */
    compact?: boolean;
};

/** The library folders in the sidebar, with the actions to add and manage them. */
export function LibraryNav({ currentPath, compact = false }: LibraryNavProps) {
    const folders = useLibraryFolders();
    const addFolder = useAddLibraryFolder();

    return (
        <section
            aria-labelledby="library-heading"
            className={cx("flex min-h-0 flex-col gap-1", compact && "items-center")}
        >
            <div className={compact ? "flex flex-col items-center" : "flex items-center justify-between pr-1 pl-2.5"}>
                <h2 id="library-heading" className={compact ? "sr-only" : "text-small font-medium text-text-subtle"}>
                    Library
                </h2>
                <IconButton
                    label="Add folder"
                    icon={<FolderPlus />}
                    size="sm"
                    tooltipSide={compact ? "right" : undefined}
                    onClick={() => addFolder.mutate()}
                    disabled={addFolder.isPending}
                />
            </div>
            {folders.isPending &&
                (compact ? (
                    <div className="flex flex-col gap-1" role="status" aria-label="Loading folders">
                        <Skeleton className="size-9" />
                        <Skeleton className="size-9" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 px-2.5 py-1" role="status" aria-label="Loading folders">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-5 w-1/2" />
                    </div>
                ))}
            {folders.isError &&
                (compact ? (
                    <div role="alert">
                        <IconButton
                            label={`Could not load the folders: ${errorMessage(folders.error)}. Try again`}
                            icon={<RefreshCw />}
                            tooltipSide="right"
                            onClick={() => folders.refetch()}
                        />
                    </div>
                ) : (
                    <div
                        className="flex flex-col items-start gap-2 px-2.5 py-1 text-small text-text-muted"
                        role="alert"
                    >
                        <p>Could not load the folders: {errorMessage(folders.error)}</p>
                        <Button size="sm" onClick={() => folders.refetch()}>
                            Try again
                        </Button>
                    </div>
                ))}
            {folders.data?.length === 0 && (
                <p className={compact ? "sr-only" : "px-2.5 py-1 text-small text-text-subtle"}>No folders yet.</p>
            )}
            {folders.data && folders.data.length > 0 && (
                <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                    {folders.data.map((folder) => (
                        <LibraryFolderItem
                            key={folder.id}
                            folder={folder}
                            currentPath={currentPath}
                            compact={compact}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

/** Primary call to action for an empty library. */
export function AddFolderButton() {
    const addFolder = useAddLibraryFolder();
    return (
        <Button
            variant="primary"
            icon={<FolderPlus />}
            loading={addFolder.isPending}
            onClick={() => addFolder.mutate()}
        >
            Add folder
        </Button>
    );
}
