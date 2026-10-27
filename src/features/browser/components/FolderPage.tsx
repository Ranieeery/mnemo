import { Link } from "@tanstack/react-router";
import { FolderSearch, Unplug } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { errorMessage, isErrorKind } from "../../../shared/ipc/client";
import { useLibraryFolderStatus, useLibraryFolders, useMediaTools } from "../../../shared/ipc/queries";
import { folderName } from "../../../shared/lib/folderName";
import { openFolderRelocation } from "../../../shared/stores/dialogs";
import { processFolder } from "../../../shared/stores/processing";
import { Button, buttonClasses, EmptyState, ErrorState, scrollBehavior } from "../../../shared/ui";
import { hiddenFolderLabel, useFolderVisibility, VideoGridSkeleton } from "../../../shared/video";
import { breadcrumbs } from "../lib/breadcrumbs";
import { DEFAULT_ORDER, type VideoOrder } from "../lib/videoOrder";
import { useFolderContents, useFolderSummary } from "../queries";
import { Breadcrumbs } from "./Breadcrumbs";
import { useFolderActionDialogs } from "./FolderActionDialog";
import { FolderActionsDropdown } from "./FolderActionMenus";
import { FolderContentsView, OTHER_FILES_HEADING_ID } from "./FolderContentsView";
import { FolderHeader } from "./FolderHeader";
import { VideoOrderMenus } from "./VideoOrderMenus";
import { ViewModeMenu } from "./ViewModeMenu";

type FolderPageProps = {
    path: string;
    /** Replaces the folder contents, e.g. with search results, keeping the header. */
    content?: ReactNode;
    /** How the folder's videos are sorted and filtered; the route keeps it in the URL. */
    order?: VideoOrder;
    onOrderChange?: (order: VideoOrder) => void;
};

export function FolderPage({ path, content, order = DEFAULT_ORDER, onOrderChange }: FolderPageProps) {
    const folders = useLibraryFolders();
    const rootStatus = useLibraryFolderStatus(path);
    const contents = useFolderContents(path);
    const summary = useFolderSummary(path);
    const tools = useMediaTools();
    const actions = useFolderActionDialogs();
    const hiddenLabel = hiddenFolderLabel(useFolderVisibility(path));
    const toolsReady = tools.data?.ffmpeg === true && tools.data.ffprobe;
    const name = folderName(path, folders.data);
    // A library folder renamed in the app still tells which folder it is on disk.
    const renamedFolder = folders.data?.find((folder) => folder.path === path && folder.customName !== null);
    // Other files are listed after every video, so the header says they exist (not over search results).
    const otherFiles = content ? 0 : (contents.data?.otherFiles.length ?? 0);
    const hasVideos = contents.data?.groups.some((group) => group.entries.length > 0) ?? false;

    // Like the legacy app, opening a folder reads its new videos in the background (once per session).
    useEffect(() => {
        if (toolsReady) {
            void processFolder(path);
        }
    }, [path, toolsReady]);

    return (
        <div className="flex flex-col gap-8 px-8 py-8">
            <FolderHeader
                breadcrumbs={<Breadcrumbs crumbs={breadcrumbs(path, folders.data ?? [])} />}
                name={name}
                path={path}
                summary={summary.data}
                folderOnDisk={renamedFolder?.folderName ?? null}
                hiddenLabel={hiddenLabel}
                otherFiles={otherFiles}
                onJumpToOtherFiles={jumpToOtherFiles}
                actions={
                    contents.data && (
                        <>
                            {!content && hasVideos && onOrderChange && (
                                <VideoOrderMenus order={order} onChange={onOrderChange} />
                            )}
                            <ViewModeMenu path={path} viewMode={contents.data.viewMode} />
                            <FolderActionsDropdown target={{ path, name }} onAction={actions.request} />
                        </>
                    )
                }
            />

            {content ?? (
                <FolderBody
                    contents={contents}
                    unavailableRoot={
                        rootStatus?.watch === "unavailable"
                            ? { path: rootStatus.path, name: folderName(rootStatus.path, folders.data) }
                            : null
                    }
                    onFolderAction={actions.request}
                    order={order}
                    onShowAll={() => onOrderChange?.({ ...order, status: "all" })}
                />
            )}
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
    /** The library folder holding this one, when it cannot be reached. */
    unavailableRoot: { path: string; name: string } | null;
    onFolderAction: ReturnType<typeof useFolderActionDialogs>["request"];
    order: VideoOrder;
    onShowAll: () => void;
};

function FolderBody({ contents, unavailableRoot, onFolderAction, order, onShowAll }: FolderBodyProps) {
    if (contents.isPending) {
        return <VideoGridSkeleton />;
    }
    if (contents.isError) {
        if (unavailableRoot) {
            return (
                <EmptyState
                    icon={Unplug}
                    title="This folder is not connected"
                    description={`The drive or network location of ${unavailableRoot.name} cannot be reached. Its videos, progress and tags are kept; connect it and try again, or locate it if it was moved or renamed.`}
                    action={
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button
                                variant="primary"
                                icon={<FolderSearch />}
                                onClick={() => openFolderRelocation(unavailableRoot.path)}
                            >
                                Locate folder…
                            </Button>
                            <Button onClick={() => contents.refetch()}>Try again</Button>
                        </div>
                    }
                />
            );
        }
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
    return (
        <FolderContentsView
            contents={contents.data}
            onFolderAction={onFolderAction}
            order={order}
            onShowAll={onShowAll}
        />
    );
}
