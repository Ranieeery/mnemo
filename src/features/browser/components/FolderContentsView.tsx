import { Link } from "@tanstack/react-router";
import { File, FolderOpen } from "lucide-react";
import type { FolderContents, FolderSummary } from "../../../shared/ipc/bindings";
import { EmptyState } from "../../../shared/ui";
import { openInDefaultPlayer, VideoGrid } from "../../../shared/video";
import type { FolderAction, FolderTarget } from "./FolderActionDialog";
import { FolderContextMenu } from "./FolderActionMenus";
import { SubfolderCard } from "./SubfolderCard";

type FolderContentsViewProps = {
    contents: FolderContents;
    onFolderAction: (action: FolderAction, target: FolderTarget, summary: FolderSummary) => void;
};

function SectionTitle({ children }: { children: string }) {
    return <h2 className="text-title font-semibold text-text">{children}</h2>;
}

export function FolderContentsView({ contents, onFolderAction }: FolderContentsViewProps) {
    const { subfolders, groups, otherFiles, viewMode } = contents;
    const continuous = viewMode.mode === "continuous";

    if (subfolders.length === 0 && groups.length === 0 && otherFiles.length === 0) {
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
                    <SectionTitle>Other files</SectionTitle>
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
