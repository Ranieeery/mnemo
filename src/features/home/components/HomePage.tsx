import { Link } from "@tanstack/react-router";
import { ChevronRight, Film, FolderOpen } from "lucide-react";
import { type ReactNode, useRef } from "react";
import type { LibraryFolder, Video } from "../../../shared/ipc/bindings";
import { errorMessage } from "../../../shared/ipc/client";
import { useLibraryFolders } from "../../../shared/ipc/queries";
import { folderName } from "../../../shared/lib/folderName";
import { parentPath } from "../../../shared/lib/paths";
import { EmptyState, ErrorState, FolderIcon, Skeleton, useColumns } from "../../../shared/ui";
import { VIDEO_CARD_MIN_WIDTH, VIDEO_GRID_GAP } from "../../../shared/video";
import { greeting } from "../lib/greeting";
import { useHome } from "../queries";
import { ContinueWatching } from "./ContinueWatching";
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
            {/* Screen readers get the screen's name, which focus moves to on navigation; the eye gets a greeting. */}
            <h1 className="sr-only">Home</h1>
            <p className="text-display font-semibold text-text" aria-hidden>
                {greeting(new Date().getHours())}
            </p>
            <HomeContent
                columns={columns}
                home={home}
                libraryFolders={folders.data}
                addFolderAction={addFolderAction}
            />
        </div>
    );
}

type HomeContentProps = {
    columns: number;
    home: ReturnType<typeof useHome>;
    libraryFolders: readonly LibraryFolder[] | undefined;
    addFolderAction: ReactNode;
};

function HomeContent({ columns, home, libraryFolders, addFolderAction }: HomeContentProps) {
    if (home.isPending) {
        return (
            <>
                <Skeleton className="h-64 w-full rounded-dialog" />
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
    const folderOf = (video: Video) => folderName(parentPath(video.filePath), libraryFolders);

    if (isEmpty && (libraryFolders?.length ?? 0) === 0) {
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
            <ContinueWatching videos={continueWatching} folderOf={folderOf} />
            <VideoRow
                heading={<SectionHeading>Suggestions</SectionHeading>}
                videos={suggestions}
                columns={columns}
                detail={folderOf}
            />
            <VideoRow
                heading={<SectionHeading>Recently watched</SectionHeading>}
                videos={recentlyWatched}
                columns={columns}
                detail={folderOf}
            />
            {folderPreviews.map(({ folder, videos }) => (
                <VideoRow
                    key={folder.id}
                    columns={columns}
                    videos={videos}
                    heading={
                        <SectionHeading>
                            <Link
                                to="/folder"
                                search={{ path: folder.path }}
                                className="group inline-flex items-center gap-2 rounded-control"
                            >
                                <FolderIcon
                                    name={folder.customIcon}
                                    color={folder.iconColor}
                                    className="size-5 text-text-muted"
                                />
                                {folder.name}
                                <ChevronRight
                                    className="size-4 text-text-subtle transition-transform duration-(--duration-fast) ease-standard group-hover:translate-x-0.5"
                                    aria-hidden
                                />
                            </Link>
                        </SectionHeading>
                    }
                />
            ))}
        </>
    );
}
