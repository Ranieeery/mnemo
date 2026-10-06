import { Link } from "@tanstack/react-router";
import { ArrowDown, File } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { errorMessage, isErrorKind } from "../../../shared/ipc/client";
import { useLibraryFolders, useMediaTools } from "../../../shared/ipc/queries";
import { baseName } from "../../../shared/lib/paths";
import { plural } from "../../../shared/lib/plural";
import { processFolder } from "../../../shared/stores/processing";
import { Button, buttonClasses, ErrorState, Skeleton, scrollBehavior } from "../../../shared/ui";
import { VideoGridSkeleton } from "../../../shared/video";
import { breadcrumbs } from "../lib/breadcrumbs";
import { useFolderContents, useFolderSummary } from "../queries";
import { Breadcrumbs } from "./Breadcrumbs";
import { useFolderActionDialogs } from "./FolderActionDialog";
import { FolderActionsDropdown } from "./FolderActionMenus";
import { FolderContentsView, OTHER_FILES_HEADING_ID } from "./FolderContentsView";
import { ViewModeMenu } from "./ViewModeMenu";

type FolderPageProps = {
    path: string;
    /** Replaces the folder contents, e.g. with search results, keeping the header. */
    content?: ReactNode;
};

export function FolderPage({ path, content }: FolderPageProps) {
    const folders = useLibraryFolders();
    const contents = useFolderContents(path);
    const summary = useFolderSummary(path);
    const tools = useMediaTools();
    const actions = useFolderActionDialogs();
    const toolsReady = tools.data?.ffmpeg === true && tools.data.ffprobe;
    const name = baseName(path);
    // Other files are listed after every video, so the header says they exist (not over search results).
    const otherFiles = content ? 0 : (contents.data?.otherFiles.length ?? 0);

    // Like the legacy app, opening a folder reads its new videos in the background (once per session).
    useEffect(() => {
        if (toolsReady) {
            void processFolder(path);
        }
    }, [path, toolsReady]);

    return (
        <div className="flex flex-col gap-8 px-8 py-8">
            <header className="flex flex-col gap-3">
                <Breadcrumbs crumbs={breadcrumbs(path, folders.data ?? [])} />
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="flex min-w-0 flex-col gap-1">
                        <h1 className="truncate text-display font-semibold text-text" title={path}>
                            {name}
                        </h1>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {summary.data ? (
                                <p className="text-body text-text-muted tabular-nums">
                                    {summary.data.totalVideos} videos, {summary.data.watchedVideos} watched
                                </p>
                            ) : (
                                <Skeleton className="h-5 w-40" />
                            )}
                            {otherFiles > 0 && (
                                <Button variant="secondary" size="sm" icon={<File />} onClick={jumpToOtherFiles}>
                                    {plural(otherFiles, "other file")}
                                    {/* The arrow says the button jumps further down the page. */}
                                    <ArrowDown aria-hidden className="text-text-muted" />
                                </Button>
                            )}
                        </div>
                    </div>
                    {contents.data && (
                        <div className="flex items-center gap-2">
                            <ViewModeMenu path={path} viewMode={contents.data.viewMode} />
                            <FolderActionsDropdown target={{ path, name }} onAction={actions.request} />
                        </div>
                    )}
                </div>
            </header>

            {content ?? <FolderBody contents={contents} onFolderAction={actions.request} />}
            {actions.dialog}
        </div>
    );
}

function jumpToOtherFiles() {
    const heading = document.getElementById(OTHER_FILES_HEADING_ID);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
}

type FolderBodyProps = {
    contents: ReturnType<typeof useFolderContents>;
    onFolderAction: ReturnType<typeof useFolderActionDialogs>["request"];
};

function FolderBody({ contents, onFolderAction }: FolderBodyProps) {
    if (contents.isPending) {
        return <VideoGridSkeleton />;
    }
    if (contents.isError) {
        const outsideLibrary = isErrorKind(contents.error, "invalidInput");
        return (
            <ErrorState
                title={outsideLibrary ? "This folder is not in your library" : "Could not open the folder"}
                message={errorMessage(contents.error)}
                onRetry={outsideLibrary ? undefined : () => contents.refetch()}
            >
                {outsideLibrary && (
                    <Link to="/" className={buttonClasses("secondary", "md", "mt-2")}>
                        Go to home
                    </Link>
                )}
            </ErrorState>
        );
    }
    return <FolderContentsView contents={contents.data} onFolderAction={onFolderAction} />;
}
