import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import type { HiddenFolder } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { useHiddenFolders } from "../../../shared/ipc/queries";
import { relativeSegments } from "../../../shared/lib/paths";
import { Badge, Button, buttonClasses, Card, ErrorState, Skeleton } from "../../../shared/ui";
import { useSetFolderHidden } from "../../../shared/video";

/** Where a hidden folder is, starting at its library folder ("Series / Show / Extras"). */
function location(folder: HiddenFolder): string {
    const segments = relativeSegments(folder.path, folder.libraryFolder.path) ?? [];
    return [folder.libraryFolder.name, ...segments].join(" / ");
}

/** The folders hidden from the home page and the history, for Settings: hidden ones deep in a tree are found here. */
export function HiddenFoldersPanel() {
    const hiddenFolders = useHiddenFolders();
    const setHidden = useSetFolderHidden();

    return (
        <Card>
            <div className="flex flex-col gap-0.5 px-5 py-4">
                <h3 className="text-body font-medium text-text">Hidden folders</h3>
                <p className="text-small text-text-muted">
                    Their videos stay out of the home page, search and history, and show as usual when you open the
                    folder. Watch progress is still saved.
                </p>
            </div>
            {hiddenFolders.isPending && <Skeleton className="mx-5 mb-4 h-10" />}
            {hiddenFolders.isError && (
                <ErrorState
                    title="Could not load the hidden folders"
                    message={errorMessage(hiddenFolders.error)}
                    onRetry={() => hiddenFolders.refetch()}
                />
            )}
            {hiddenFolders.data?.length === 0 && (
                <p className="border-t border-border px-5 py-4 text-small text-text-subtle">
                    No hidden folders. To hide one, right-click it and choose “Hide from home and history”.
                </p>
            )}
            {hiddenFolders.data && hiddenFolders.data.length > 0 && (
                <ul className="divide-y divide-border border-t border-border">
                    {hiddenFolders.data.map((folder) => (
                        <li key={folder.path} className="flex items-center gap-3 px-5 py-3">
                            <EyeOff aria-hidden className="size-5 shrink-0 text-text-muted" />
                            <div className="flex min-w-0 flex-1 flex-col">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className="truncate text-body text-text">{folder.name}</span>
                                    {!folder.available && <Badge>Not found</Badge>}
                                </span>
                                <span className="truncate text-small text-text-subtle" title={folder.path}>
                                    {location(folder)}
                                </span>
                            </div>
                            {folder.available && (
                                <Link
                                    to="/folder"
                                    search={{ path: folder.path }}
                                    className={buttonClasses("secondary", "sm")}
                                    aria-label={`Open ${folder.name}`}
                                >
                                    Open
                                </Link>
                            )}
                            <Button
                                size="sm"
                                icon={<Eye />}
                                disabled={setHidden.isPending}
                                aria-label={`Show ${folder.name} on home and history`}
                                onClick={() =>
                                    setHidden.mutate({ path: folder.path, name: folder.name, hidden: false })
                                }
                            >
                                Show
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}
