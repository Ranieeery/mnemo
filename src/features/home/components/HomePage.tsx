import { Link } from "@tanstack/react-router";
import { ChevronRight, Film, FolderOpen } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { errorMessage } from "../../../shared/ipc/client";
import { useLibraryFolders } from "../../../shared/ipc/queries";
import { EmptyState, ErrorState, FolderIcon, useColumns } from "../../../shared/ui";
import { VIDEO_CARD_MIN_WIDTH, VIDEO_GRID_GAP } from "../../../shared/video";
import { useHome } from "../queries";
import { SectionHeading, VideoRow, VideoRowSkeleton } from "./VideoRow";

type HomePageProps = {
    /** Call to action shown when the library has no folders yet. */
    addFolderAction: ReactNode;
};

export function HomePage({ addFolderAction }: HomePageProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const columns = useColumns(containerRef, VIDEO_CARD_MIN_WIDTH, VIDEO_GRID_GAP);
    const home = useHome();
    const folders = useLibraryFolders();

    return (
        <div ref={containerRef} className="flex flex-col gap-10 px-8 py-8">
            <h1 className="text-display font-semibold text-text">Home</h1>
            <HomeContent
                columns={columns}
                home={home}
                hasFolders={(folders.data?.length ?? 0) > 0}
                addFolderAction={addFolderAction}
            />
        </div>
    );
}

type HomeContentProps = {
    columns: number;
    home: ReturnType<typeof useHome>;
    hasFolders: boolean;
    addFolderAction: ReactNode;
};

function HomeContent({ columns, home, hasFolders, addFolderAction }: HomeContentProps) {
    if (home.isPending) {
        return (
            <>
                <VideoRowSkeleton columns={columns} />
                <VideoRowSkeleton columns={columns} />
            </>
        );
    }
    if (home.isError) {
        return (
            <ErrorState
                title="Could not load the home page"
                message={errorMessage(home.error)}
                onRetry={() => home.refetch()}
            />
        );
    }
    const { continueWatching, suggestions, recentlyWatched, folderPreviews } = home.data;
    const isEmpty = continueWatching.length + suggestions.length + recentlyWatched.length + folderPreviews.length === 0;

    if (isEmpty && !hasFolders) {
        return (
            <EmptyState
                icon={FolderOpen}
                title="Add a folder to start your library"
                description="Mnemo shows your videos the way they are organized on disk. Nothing is moved or renamed."
                action={addFolderAction}
            />
        );
    }
    if (isEmpty) {
        return (
            <EmptyState
                icon={Film}
                title="No videos yet"
                description="Videos show up here as they are read. Open a folder in the sidebar to browse it now."
            />
        );
    }

    return (
        <>
            <VideoRow
                heading={<SectionHeading>Continue watching</SectionHeading>}
                videos={continueWatching}
                columns={columns}
            />
            <VideoRow heading={<SectionHeading>Suggestions</SectionHeading>} videos={suggestions} columns={columns} />
            <VideoRow
                heading={<SectionHeading>Recently watched</SectionHeading>}
                videos={recentlyWatched}
                columns={columns}
            />
            {folderPreviews.map(({ folder, videos }) => (
                <VideoRow
                    key={folder.id}
                    columns={columns}
                    videos={videos}
                    heading={
                        <Link
                            to="/folder"
                            search={{ path: folder.path }}
                            className="group flex items-center gap-2 self-start rounded-control text-title font-semibold text-text"
                        >
                            <FolderIcon name={folder.customIcon} className="size-5 text-text-muted" />
                            {folder.name}
                            <ChevronRight
                                className="size-4 text-text-subtle transition-transform duration-(--duration-fast) ease-standard group-hover:translate-x-0.5"
                                aria-hidden
                            />
                        </Link>
                    }
                />
            ))}
        </>
    );
}
