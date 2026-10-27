import { Link } from "@tanstack/react-router";
import { Check, Folder } from "lucide-react";
import type { ComponentProps } from "react";
import type { FolderStats, SubfolderEntry } from "../../../shared/ipc/bindings";
import { cx } from "../../../shared/lib/cx";
import { formatTotalDuration } from "../../../shared/lib/formatTotalDuration";
import { plural } from "../../../shared/lib/plural";
import { HiddenFolderMark, thumbnailLiftClasses, useFolderVisibility, VideoThumbnail } from "../../../shared/video";

type SubfolderCardProps = Omit<ComponentProps<"a">, "href" | "children"> & {
    folder: SubfolderEntry;
};

/**
 * A subfolder as a card: the thumbnail of its first video as a cover on a stack of sheets, how many videos it has and,
 * once started, its progress. Fully watched folders are dimmed so the remaining ones stand out, and hidden ones show an eye-off icon.
 * Extra props and the ref reach the link, so it can be the trigger of a context menu.
 */
export function SubfolderCard({ folder, className, ...props }: SubfolderCardProps) {
    const { totalVideos, watchedVideos } = folder.stats;
    const complete = totalVideos > 0 && watchedVideos === totalVideos;
    const visibility = useFolderVisibility(folder.path);

    return (
        <Link
            to="/folder"
            search={{ path: folder.path }}
            className={cx("group flex min-w-0 flex-col gap-2 rounded-card", className)}
            {...props}
        >
            {/* Two sheets peek out above the cover, so the card reads as a stack of videos rather than one. */}
            <span className="relative pt-3">
                <span aria-hidden className="absolute inset-x-5 top-0 h-5 rounded-t-card bg-border" />
                <span aria-hidden className="absolute inset-x-2.5 top-1.5 h-5 rounded-t-card bg-border-strong" />
                <VideoThumbnail
                    thumbnailPath={folder.coverThumbnailPath}
                    progress={totalVideos > 0 ? watchedVideos / totalVideos : 0}
                    watched={complete}
                    // The card used to have a border; in Windows high contrast mode this one keeps its edge.
                    className={cx("w-full border border-transparent", thumbnailLiftClasses)}
                >
                    {totalVideos > 0 && (
                        // The front of the folder: a tab in the color of the front sheet, in the corner a video uses
                        // for nothing, under the progress strip so the strip stays whole. The extra room at the
                        // bottom is only there for the strip, so every tab shows the same height above it.
                        <span
                            className={cx(
                                "absolute bottom-0 left-0 flex items-center gap-1 rounded-tr-card bg-border-strong pt-1 pr-2.5 pl-2",
                                "text-caption font-medium text-text tabular-nums",
                                watchedVideos > 0 ? "pb-2" : "pb-1"
                            )}
                        >
                            <Folder className="size-3" aria-hidden />
                            {plural(totalVideos, "video")}
                        </span>
                    )}
                </VideoThumbnail>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 px-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-body font-medium text-text" title={folder.name}>
                        {folder.name}
                    </span>
                    {/* Only where the folder was hidden: every folder inside it would repeat the mark. */}
                    {visibility.kind === "hidden" && <HiddenFolderMark visibility={visibility} />}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-small text-text-subtle tabular-nums">
                    {complete && <Check className="size-3.5 shrink-0 text-success" strokeWidth={3} aria-hidden />}
                    <span className="truncate">{progressLine(folder.stats)}</span>
                </span>
            </span>
        </Link>
    );
}

/** The line under the name: how long the folder lasts and, once started, how much of it was watched. */
function progressLine({ totalVideos, watchedVideos, totalDurationSeconds }: FolderStats): string {
    if (totalVideos === 0) {
        return "No videos read yet";
    }
    const duration = formatTotalDuration(totalDurationSeconds);
    if (watchedVideos === totalVideos) {
        return `${duration}, all watched`;
    }
    return watchedVideos > 0 ? `${duration}, ${watchedVideos} of ${totalVideos} watched` : duration;
}
