import { ArrowDown, EyeOff, File, Folder, Play } from "lucide-react";
import type { ReactNode } from "react";
import type { FolderSummary } from "../../../shared/ipc/bindings";
import { formatTotalDuration } from "../../../shared/lib/formatTotalDuration";
import { plural } from "../../../shared/lib/plural";
import { Button, Skeleton } from "../../../shared/ui";
import { toEntry, usePlayVideo } from "../../../shared/video";

type FolderHeaderProps = {
    breadcrumbs: ReactNode;
    name: string;
    path: string;
    summary: FolderSummary | undefined;
    /** The name of the folder on disk, when the library folder was renamed in the app. */
    folderOnDisk: string | null;
    hiddenLabel: string | null;
    otherFiles: number;
    onJumpToOtherFiles: () => void;
    /** Sorting, view mode and the folder menu, aligned to the right. */
    actions: ReactNode;
};

const chipClasses = "inline-flex h-7 items-center gap-1.5 rounded-full bg-surface px-2.5 text-small text-text-muted";

/** Title of the folder screen, its numbers as chips and its actions, with "Continue" first. */
export function FolderHeader({
    breadcrumbs,
    name,
    path,
    summary,
    folderOnDisk,
    hiddenLabel,
    otherFiles,
    onJumpToOtherFiles,
    actions,
}: FolderHeaderProps) {
    return (
        <header className="flex flex-col gap-3">
            {breadcrumbs}
            <div className="flex flex-wrap items-end gap-4">
                <div className="flex min-w-0 grow basis-96 flex-col gap-3">
                    <h1 className="truncate text-display font-semibold text-text" title={path}>
                        {name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 tabular-nums">
                        {summary ? <SummaryChips summary={summary} /> : <Skeleton className="h-7 w-64 rounded-full" />}
                        {otherFiles > 0 && (
                            <Button variant="secondary" size="sm" icon={<File />} onClick={onJumpToOtherFiles}>
                                {plural(otherFiles, "other file")}
                                {/* The arrow says the button jumps further down the page. */}
                                <ArrowDown aria-hidden className="text-text-muted" />
                            </Button>
                        )}
                    </div>
                    {(folderOnDisk || hiddenLabel) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {folderOnDisk && (
                                <p className="flex items-center gap-1.5 text-small text-text-subtle">
                                    <Folder aria-hidden className="size-3.5" />
                                    Folder on disk: {folderOnDisk}
                                </p>
                            )}
                            {hiddenLabel && (
                                <p className="flex items-center gap-1.5 text-small text-text-subtle">
                                    <EyeOff aria-hidden className="size-3.5" />
                                    {hiddenLabel}
                                </p>
                            )}
                        </div>
                    )}
                </div>
                {/* `ml-auto` keeps the actions on the right even when they wrap below the title. */}
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {summary?.nextVideo && <ContinueButton summary={summary} />}
                    {actions}
                </div>
            </div>
        </header>
    );
}

function SummaryChips({ summary }: { summary: FolderSummary }) {
    const { totalVideos, watchedVideos, totalDurationSeconds } = summary;
    return (
        <>
            <span className={chipClasses}>{plural(totalVideos, "video")}</span>
            {totalVideos > 0 && <span className={chipClasses}>{formatTotalDuration(totalDurationSeconds)}</span>}
            {totalVideos > 0 && (
                <span className={chipClasses}>
                    <span aria-hidden className="h-1 w-9 overflow-hidden rounded-full bg-surface-hover">
                        <span
                            className="block h-full bg-accent"
                            style={{ width: `${(watchedVideos / totalVideos) * 100}%` }}
                        />
                    </span>
                    {watchedVideos} of {totalVideos} watched
                </span>
            )}
        </>
    );
}

/** Plays the folder's next video: "Continue" once something was watched, "Play" for a fresh folder. */
function ContinueButton({ summary }: { summary: FolderSummary }) {
    const playVideo = usePlayVideo();
    const video = summary.nextVideo;
    if (!video) {
        return null;
    }
    const started = summary.watchedVideos > 0 || video.watchProgressSeconds > 0;
    return (
        <Button variant="primary" icon={<Play className="fill-current" />} onClick={() => playVideo(toEntry(video))}>
            {started ? "Continue" : "Play"}
            <span className="sr-only">: {video.title}</span>
        </Button>
    );
}
