import { Link } from "@tanstack/react-router";
import { File, FolderOpen, ListFilter } from "lucide-react";
import type { FolderContents, FolderSummary } from "../../../shared/ipc/bindings";
import { plural } from "../../../shared/lib/plural";
import { Button, EmptyState } from "../../../shared/ui";
import { openInDefaultPlayer, VideoGrid } from "../../../shared/video";
import { applyOrder, type StatusFilter, type VideoOrder } from "../lib/videoOrder";
import type { FolderAction, FolderTarget } from "./FolderActionDialog";
import { FolderContextMenu } from "./FolderActionMenus";
import { SubfolderCard } from "./SubfolderCard";

type FolderContentsViewProps = {
    contents: FolderContents;
    onFolderAction: (action: FolderAction, target: FolderTarget, summary: FolderSummary) => void;
    order: VideoOrder;
    /** Clears the status filter. */
    onShowAll: () => void;
};

const noMatchTitles: Record<Exclude<StatusFilter, "all">, string> = {
    unwatched: "No unwatched videos here",
    "in-progress": "No videos in progress here",
    watched: "No watched videos here",
};

/** The "Other files" heading, which the folder header links to. */
export const OTHER_FILES_HEADING_ID = "other-files";

function SectionTitle({ children, id }: { children: string; id?: string }) {
    return (
        // Focusable from script only, so jumping to a section moves keyboard focus there too.
        <h2 id={id} tabIndex={id ? -1 : undefined} className="scroll-mt-6 text-title font-semibold text-text">
            {children}
        </h2>
    );
}

export function FolderContentsView({ contents, onFolderAction, order, onShowAll }: FolderContentsViewProps) {
    const { subfolders, otherFiles, viewMode } = contents;
    const continuous = viewMode.mode === "continuous";
    const groups = applyOrder(contents.groups, order);
    const countVideos = (list: typeof groups) => list.reduce((sum, group) => sum + group.entries.length, 0);
    const total = countVideos(contents.groups);
    const shown = countVideos(groups);

    if (subfolders.length === 0 && contents.groups.length === 0 && otherFiles.length === 0) {
        return (
            <EmptyState
                icon={FolderOpen}
                title="This folder is empty"
                description="Add videos to it on disk; they show up here the next time you open it."
            />
        );
    }

    return (
        <div className="flex flex-col gap-10">
            {order.status !== "all" && (
                <div className="-mb-6 flex items-center gap-2">
                    <p role="status" className="text-body text-text-muted tabular-nums">
                        Showing {shown} of {plural(total, "video")}
                    </p>
                    <Button variant="ghost" size="sm" onClick={onShowAll}>
                        Show all
                    </Button>
                </div>
            )}
            {subfolders.length > 0 && !continuous && (
                <section className="flex flex-col gap-3">
                    <SectionTitle>Folders</SectionTitle>
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
                        {subfolders.map((folder) => (
                            <li key={folder.path}>
                                <FolderContextMenu target={folder} onAction={onFolderAction}>
                                    <SubfolderCard folder={folder} />
                                </FolderContextMenu>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {order.status !== "all" && shown === 0 && (
                <EmptyState
                    icon={ListFilter}
                    title={noMatchTitles[order.status]}
                    description="The filter hides the other videos of this folder."
                    action={<Button onClick={onShowAll}>Show all videos</Button>}
                />
            )}

            {groups.map((group) => (
                <section key={group.folderPath} className="flex flex-col gap-3">
                    {continuous && group.relativePath ? (
                        <Link
                            to="/folder"
                            search={{ path: group.folderPath }}
                            className="self-start rounded-control text-title font-semibold text-text hover:underline underline-offset-4"
                        >
                            {group.relativePath}
                        </Link>
                    ) : (
                        <SectionTitle>{continuous ? "In this folder" : "Videos"}</SectionTitle>
                    )}
                    <VideoGrid entries={group.entries} />
                </section>
            ))}

            {otherFiles.length > 0 && (
                <section className="flex flex-col gap-3">
                    <SectionTitle id={OTHER_FILES_HEADING_ID}>Other files</SectionTitle>
                    <ul className="flex flex-col">
                        {otherFiles.map((file) => (
                            <li key={file.path}>
                                <button
                                    type="button"
                                    onClick={() => openInDefaultPlayer(file.path)}
                                    title={`Open ${file.name} with the default app`}
                                    className="flex h-9 w-full items-center gap-2.5 rounded-control px-2 text-left text-body text-text-muted hover:bg-surface-hover hover:text-text"
                                >
                                    <File className="size-4 shrink-0" aria-hidden />
                                    <span className="truncate">{file.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
